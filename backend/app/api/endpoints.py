import os
import re
import io
import uuid
import shutil
import hashlib
from pathlib import Path
from pypdf import PdfReader
from typing import List, Optional
from collections import defaultdict
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query, BackgroundTasks, Header
from fastapi.responses import JSONResponse, FileResponse, Response
import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..core.database import get_db
from ..core.config import UPLOADS_DIR, EXPORT_DIR, VERIFIED_CACHE_DIR
from ..models.schema import Paper, Claim, Evidence, ClaimRelation, Concept, Citation, Annotation
from ..schemas.pydantic_models import (
    PaperResponse, ClaimResponse, ClaimRelationResponse, EvidenceResponse,
    GraphDataResponse, ConflictItem, ResearchGapItem, QARequest, QAResponse,
    AnnotationCreate, AnnotationResponse, DashboardStatsResponse,
    SystemConfigRequest, SystemConfigResponse,
    ClaimSearchRequest, ClaimSearchResponse, ClaimSearchMatch
)
from ..services.pdf_service import PDFService
from ..services.claim_extractor import ClaimExtractor
from ..services.relation_engine import RelationEngine
from ..services.graph_service import GraphService
from ..services.gap_analyzer import GapAnalyzer
from ..services.qa_service import QAService
from ..services.embedding_service import EmbeddingService
from ..services.gemini_service import GeminiService
from ..services.hybrid_retriever import HybridRetriever

router = APIRouter()

# -------------------------------------------------------------
# 1. Dashboard Statistics
# -------------------------------------------------------------
@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db)):
    total_papers = db.query(Paper).count()
    total_claims = db.query(Claim).count()
    total_relations = db.query(ClaimRelation).count()
    
    # Single aggregation for relation types
    rel_type_counts = dict(
        db.query(ClaimRelation.relation_type, func.count(ClaimRelation.id))
        .group_by(ClaimRelation.relation_type)
        .all()
    )
    supports_count = rel_type_counts.get("SUPPORTS", 0)
    contradicts_count = rel_type_counts.get("CONTRADICTS", 0)
    extends_count = rel_type_counts.get("EXTENDS", 0)

    conflicts = RelationEngine.detect_conflicts(db)
    gaps = GapAnalyzer.identify_research_gaps(db)

    # Single aggregation for paper processing status
    status_counts_raw = dict(
        db.query(Paper.processing_status, func.count(Paper.id))
        .group_by(Paper.processing_status)
        .all()
    )
    status_counts = {
        s: status_counts_raw.get(s, 0)
        for s in ["pending", "processing", "completed", "failed"]
    }

    return {
        "total_papers": total_papers,
        "total_claims": total_claims,
        "total_relations": total_relations,
        "supports_count": supports_count,
        "contradicts_count": contradicts_count,
        "extends_count": extends_count,
        "total_conflicts": len(conflicts),
        "total_gaps": len(gaps),
        "processing_status": status_counts
    }


# -------------------------------------------------------------
# 2. Paper Management & Ingestion
# -------------------------------------------------------------
@router.get("/papers", response_model=List[PaperResponse])
def list_papers(db: Session = Depends(get_db)):
    papers = db.query(Paper).order_by(Paper.created_at.desc()).all()
    claim_counts = dict(
        db.query(Claim.paper_id, func.count(Claim.id))
        .group_by(Claim.paper_id)
        .all()
    )
    return [
        {
            "id": p.id,
            "paper_id": p.paper_id,
            "title": p.title,
            "authors": p.authors,
            "year": p.year,
            "doi": p.doi,
            "abstract": p.abstract,
            "file_path": p.file_path,
            "processing_status": p.processing_status,
            "error_message": p.error_message,
            "created_at": p.created_at,
            "claims_count": claim_counts.get(p.id, 0)
        }
        for p in papers
    ]


def process_paper_file(paper_db_id: int, file_path: str):
    """Worker function to process paper text, claims, evidence, and relations."""
    from ..core.database import SessionLocal
    db = SessionLocal()
    try:
        paper = db.query(Paper).filter(Paper.id == paper_db_id).first()
        if not paper:
            # Paper deleted prior to worker execution
            return

        paper.processing_status = "processing"
        db.commit()

        # Step 1: PDF extraction
        extracted = PDFService.extract_text_and_metadata(file_path)

        # Check if paper still exists (not deleted or reset in the meantime)
        paper = db.query(Paper).filter(Paper.id == paper_db_id).first()
        if not paper:
            return

        paper.title = str(extracted["title"])[:500] if extracted.get("title") else (paper.title or "Untitled")
        paper.authors = str(extracted["authors"])[:500] if extracted.get("authors") else "Unknown Authors"
        paper.year = extracted.get("year") or 2024
        paper.doi = str(extracted["doi"])[:120] if extracted.get("doi") else None
        paper.abstract = extracted.get("abstract") or ""

        # Step 2: Claim, Concept, and Evidence extraction
        analysis = ClaimExtractor.extract_claims_and_evidence(
            extracted["full_text"], extracted["pages"]
        )

        # Re-check paper existence before persisting children
        paper = db.query(Paper).filter(Paper.id == paper_db_id).first()
        if not paper:
            return

        for c_data in analysis["claims"]:
            claim = Claim(
                claim_id=c_data["claim_id"],
                paper_id=paper.id,
                claim_text=c_data["claim_text"],
                normalized_text=c_data["normalized_text"],
                claim_type=c_data["claim_type"],
                confidence=c_data["confidence"],
                section_location=c_data["section_location"]
            )
            db.add(claim)
            db.flush()

            ev_data = c_data["evidence"]
            evidence = Evidence(
                evidence_id=ev_data["evidence_id"],
                claim_id=claim.id,
                paper_id=paper.id,
                text=ev_data["text"],
                page_section=ev_data["page_section"],
                extraction_confidence=ev_data["extraction_confidence"]
            )
            db.add(evidence)

        for conc_data in analysis["concepts"]:
            concept = Concept(
                concept_id=conc_data["concept_id"],
                name=conc_data["name"],
                category=conc_data["category"],
                confidence=conc_data["confidence"],
                paper_id=paper.id
            )
            db.add(concept)

        db.flush()

        # Step 3: Analyze semantic relations across corpus BEFORE setting status to completed
        RelationEngine.analyze_corpus_relations(db, target_paper_id=paper.id)

        # Re-check paper existence before finalizing completed state
        paper = db.query(Paper).filter(Paper.id == paper_db_id).first()
        if paper:
            paper.processing_status = "completed"
            db.commit()

    except Exception as e:
        db.rollback()
        paper = db.query(Paper).filter(Paper.id == paper_db_id).first()
        if paper:
            paper.processing_status = "failed"
            paper.error_message = str(e)
            db.commit()
    finally:
        db.close()


@router.post("/papers/upload", response_model=PaperResponse)
async def upload_paper(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    paper_id = f"paper_{uuid.uuid4().hex[:10]}"
    saved_filename = f"{paper_id}_{file.filename}"
    saved_path = UPLOADS_DIR / saved_filename

    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    paper = Paper(
        paper_id=paper_id,
        title=file.filename.replace(".pdf", "").replace("_", " ").title(),
        file_path=str(saved_path),
        processing_status="processing"
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)

    # Process immediately or via background task
    background_tasks.add_task(process_paper_file, paper.id, str(saved_path))

    return {
        "id": paper.id,
        "paper_id": paper.paper_id,
        "title": paper.title,
        "authors": paper.authors,
        "year": paper.year,
        "doi": paper.doi,
        "abstract": paper.abstract,
        "file_path": paper.file_path,
        "processing_status": paper.processing_status,
        "error_message": paper.error_message,
        "created_at": paper.created_at,
        "claims_count": 0
    }


@router.get("/papers/{paper_identifier}/pdf")
def get_paper_pdf(paper_identifier: str, db: Session = Depends(get_db)):
    """
    Streams the raw PDF file for inline reading in the browser or embedded viewer.
    Accepts integer ID (e.g. 1) or paper_id string (e.g. paper_bc08f1f789).
    """
    paper = None
    if paper_identifier.isdigit():
        paper = db.query(Paper).filter(Paper.id == int(paper_identifier)).first()
    if not paper:
        paper = db.query(Paper).filter(Paper.paper_id == paper_identifier).first()

    if not paper or not paper.file_path:
        raise HTTPException(status_code=404, detail="Paper not found")

    pdf_path = Path(paper.file_path)
    if not pdf_path.exists():
        fallback = UPLOADS_DIR / pdf_path.name
        if fallback.exists():
            pdf_path = fallback
        else:
            raise HTTPException(status_code=404, detail="PDF file not found on disk")

    safe_title = re.sub(r'[^a-zA-Z0-9_\- ]', '', paper.title[:60].strip()).replace(' ', '_')
    filename = f"{safe_title or 'paper'}.pdf"

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=filename,
        content_disposition_type="inline"
    )


@router.get("/papers/{paper_identifier}/pages/{page_number}/text")
def get_paper_page_text(paper_identifier: str, page_number: int, db: Session = Depends(get_db)):
    """
    Extracts and returns the text of a specific page from the paper PDF.
    Enables direct in-text sentence highlighting and visual locator indicators.
    """
    paper = None
    if paper_identifier.isdigit():
        paper = db.query(Paper).filter(Paper.id == int(paper_identifier)).first()
    if not paper:
        paper = db.query(Paper).filter(Paper.paper_id == paper_identifier).first()

    if not paper or not paper.file_path:
        raise HTTPException(status_code=404, detail="Paper not found")

    pdf_path = Path(paper.file_path)
    if not pdf_path.exists():
        fallback = UPLOADS_DIR / pdf_path.name
        if fallback.exists():
            pdf_path = fallback
        else:
            raise HTTPException(status_code=404, detail="PDF file not found on disk")

    from pypdf import PdfReader
    try:
        reader = PdfReader(str(pdf_path))
        total_pages = len(reader.pages)
        if page_number < 1 or page_number > total_pages:
            page_number = max(1, min(page_number, total_pages))

        page = reader.pages[page_number - 1]
        text = page.extract_text() or ""
        return {
            "paper_id": paper.id,
            "paper_custom_id": paper.paper_id,
            "title": paper.title,
            "page": page_number,
            "total_pages": total_pages,
            "text": text
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read page text: {str(e)}")


@router.get("/papers/{paper_identifier}/claims", response_model=List[ClaimResponse])
def get_paper_claims(paper_identifier: str, db: Session = Depends(get_db)):
    """
    Returns all extracted scientific claims with evidence items for a specific paper.
    Accepts integer DB ID (e.g. 1) or paper_id string (e.g. paper_bc08f1f789).
    """
    paper = None
    if paper_identifier.isdigit():
        paper = db.query(Paper).filter(Paper.id == int(paper_identifier)).first()
    if not paper:
        paper = db.query(Paper).filter(Paper.paper_id == paper_identifier).first()

    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    claims = db.query(Claim).filter(Claim.paper_id == paper.id).all()
    if not claims:
        return []

    evidence_map = defaultdict(list)
    for ev in db.query(Evidence).filter(Evidence.paper_id == paper.id).all():
        evidence_map[ev.claim_id].append(ev)

    # Aggregate relations for these claims
    claim_db_ids = [c.id for c in claims]
    sup_counts = defaultdict(int)
    contra_counts = defaultdict(int)
    ext_counts = defaultdict(int)

    src_counts = db.query(
        ClaimRelation.source_claim_id, ClaimRelation.relation_type, func.count(ClaimRelation.id)
    ).filter(ClaimRelation.source_claim_id.in_(claim_db_ids)).group_by(ClaimRelation.source_claim_id, ClaimRelation.relation_type).all()
    for cid, rtype, cnt in src_counts:
        if rtype == "SUPPORTS": sup_counts[cid] += cnt
        elif rtype == "CONTRADICTS": contra_counts[cid] += cnt
        elif rtype == "EXTENDS": ext_counts[cid] += cnt

    tgt_counts = db.query(
        ClaimRelation.target_claim_id, ClaimRelation.relation_type, func.count(ClaimRelation.id)
    ).filter(ClaimRelation.target_claim_id.in_(claim_db_ids)).group_by(ClaimRelation.target_claim_id, ClaimRelation.relation_type).all()
    for cid, rtype, cnt in tgt_counts:
        if rtype == "SUPPORTS": sup_counts[cid] += cnt
        elif rtype == "CONTRADICTS": contra_counts[cid] += cnt
        elif rtype == "EXTENDS": ext_counts[cid] += cnt

    results = []
    for c in claims:
        ev_items = evidence_map.get(c.id, [])
        results.append({
            "id": c.id,
            "claim_id": c.claim_id,
            "paper_id": c.paper_id,
            "claim_text": c.claim_text,
            "normalized_text": c.normalized_text,
            "claim_type": c.claim_type,
            "confidence": c.confidence,
            "section_location": c.section_location,
            "paper_title": paper.title,
            "paper_year": paper.year,
            "created_at": c.created_at,
            "evidence_items": [
                {
                    "id": ev.id,
                    "evidence_id": ev.evidence_id,
                    "claim_id": ev.claim_id,
                    "paper_id": ev.paper_id,
                    "text": ev.text,
                    "page_section": ev.page_section,
                    "extraction_confidence": ev.extraction_confidence,
                    "paper_title": paper.title,
                    "paper_doi": paper.doi,
                    "paper_year": paper.year,
                    "paper_custom_id": paper.paper_id
                }
                for ev in ev_items
            ],
            "supports_count": sup_counts[c.id],
            "contradicts_count": contra_counts[c.id],
            "extends_count": ext_counts[c.id]
        })
    return results


@router.post("/corpus/reset")
def reset_corpus(db: Session = Depends(get_db)):
    """
    Completely clears all papers, claims, evidence, relations, and annotations,
    giving the user a 100% clean slate to upload their own research PDFs.
    """
    db.query(ClaimRelation).delete()
    db.query(Evidence).delete()
    db.query(Claim).delete()
    db.query(Concept).delete()
    db.query(Citation).delete()
    db.query(Annotation).delete()
    db.query(Paper).delete()
    db.commit()

    # Clear uploaded files
    if UPLOADS_DIR.exists():
        for f in UPLOADS_DIR.glob("*"):
            try:
                if f.is_file():
                    f.unlink()
            except OSError:
                pass

    return {"status": "success", "message": "Corpus completely reset. Ready for user PDF uploads."}


@router.delete("/papers/{paper_id}")
def delete_paper(paper_id: str, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.paper_id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    if paper.file_path and os.path.exists(paper.file_path):
        try:
            os.remove(paper.file_path)
        except OSError:
            pass

    db.delete(paper)
    db.commit()
    return {"message": f"Paper {paper_id} and associated claims successfully removed"}


# -------------------------------------------------------------
# 3. Claim Exploration & Search
# -------------------------------------------------------------
@router.get("/claims", response_model=List[ClaimResponse])
def get_claims(
    query: Optional[str] = Query(None, description="Search keyword in claim or normalized text"),
    claim_type: Optional[str] = Query(None, description="Filter by finding, method, limitation"),
    min_confidence: float = Query(0.0, ge=0.0, le=1.0),
    paper_id: Optional[str] = Query(None, description="Filter by paper ID (DB int or string paper_id)"),
    db: Session = Depends(get_db)
):
    claims_q = db.query(Claim)
    if paper_id:
        target_paper = None
        if str(paper_id).isdigit():
            target_paper = db.query(Paper).filter(Paper.id == int(paper_id)).first()
        if not target_paper:
            target_paper = db.query(Paper).filter(Paper.paper_id == str(paper_id)).first()
        if target_paper:
            claims_q = claims_q.filter(Claim.paper_id == target_paper.id)
        else:
            return []

    if claim_type:
        claims_q = claims_q.filter(Claim.claim_type == claim_type)
    if min_confidence > 0:
        claims_q = claims_q.filter(Claim.confidence >= min_confidence)

    claims = claims_q.all()
    if query:
        q_lower = query.lower()
        claims = [
            c for c in claims 
            if q_lower in c.claim_text.lower() or (c.normalized_text and q_lower in c.normalized_text.lower())
        ]

    if not claims:
        return []

    # 1. Bulk pre-fetch papers
    papers_map = {p.id: p for p in db.query(Paper).all()}

    # 2. Bulk pre-fetch evidence
    evidence_map = defaultdict(list)
    for ev in db.query(Evidence).all():
        evidence_map[ev.claim_id].append(ev)

    # 3. Bulk aggregate relation counts (SUPPORTS, CONTRADICTS, EXTENDS) in two fast group by queries
    sup_counts = defaultdict(int)
    contra_counts = defaultdict(int)
    ext_counts = defaultdict(int)

    src_counts = db.query(
        ClaimRelation.source_claim_id, ClaimRelation.relation_type, func.count(ClaimRelation.id)
    ).group_by(ClaimRelation.source_claim_id, ClaimRelation.relation_type).all()
    for cid, rtype, cnt in src_counts:
        if rtype == "SUPPORTS": sup_counts[cid] += cnt
        elif rtype == "CONTRADICTS": contra_counts[cid] += cnt
        elif rtype == "EXTENDS": ext_counts[cid] += cnt

    tgt_counts = db.query(
        ClaimRelation.target_claim_id, ClaimRelation.relation_type, func.count(ClaimRelation.id)
    ).group_by(ClaimRelation.target_claim_id, ClaimRelation.relation_type).all()
    for cid, rtype, cnt in tgt_counts:
        if rtype == "SUPPORTS": sup_counts[cid] += cnt
        elif rtype == "CONTRADICTS": contra_counts[cid] += cnt
        elif rtype == "EXTENDS": ext_counts[cid] += cnt

    results = []
    for c in claims:
        paper = papers_map.get(c.paper_id)
        ev_items = evidence_map.get(c.id, [])

        results.append({
            "id": c.id,
            "claim_id": c.claim_id,
            "paper_id": c.paper_id,
            "claim_text": c.claim_text,
            "normalized_text": c.normalized_text,
            "claim_type": c.claim_type,
            "confidence": c.confidence,
            "section_location": c.section_location,
            "paper_title": paper.title if paper else "Unknown",
            "paper_year": paper.year if paper else None,
            "created_at": c.created_at,
            "evidence_items": [
                {
                    "id": ev.id,
                    "evidence_id": ev.evidence_id,
                    "claim_id": ev.claim_id,
                    "paper_id": ev.paper_id,
                    "text": ev.text,
                    "page_section": ev.page_section,
                    "extraction_confidence": ev.extraction_confidence,
                    "paper_title": paper.title if paper else None,
                    "paper_doi": paper.doi if paper else None,
                    "paper_year": paper.year if paper else None,
                    "paper_custom_id": paper.paper_id if paper else None
                }
                for ev in ev_items
            ],
            "supports_count": sup_counts[c.id],
            "contradicts_count": contra_counts[c.id],
            "extends_count": ext_counts[c.id]
        })

    return results


@router.get("/claims/{claim_id}", response_model=ClaimResponse)
def get_claim_detail(claim_id: str, db: Session = Depends(get_db)):
    claim = db.query(Claim).filter(Claim.claim_id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    paper = db.query(Paper).filter(Paper.id == claim.paper_id).first()
    ev_items = db.query(Evidence).filter(Evidence.claim_id == claim.id).all()

    sup_count = db.query(ClaimRelation).filter(
        ((ClaimRelation.source_claim_id == claim.id) | (ClaimRelation.target_claim_id == claim.id)),
        ClaimRelation.relation_type == "SUPPORTS"
    ).count()
    contra_count = db.query(ClaimRelation).filter(
        ((ClaimRelation.source_claim_id == claim.id) | (ClaimRelation.target_claim_id == claim.id)),
        ClaimRelation.relation_type == "CONTRADICTS"
    ).count()
    ext_count = db.query(ClaimRelation).filter(
        ((ClaimRelation.source_claim_id == claim.id) | (ClaimRelation.target_claim_id == claim.id)),
        ClaimRelation.relation_type == "EXTENDS"
    ).count()

    return {
        "id": claim.id,
        "claim_id": claim.claim_id,
        "paper_id": claim.paper_id,
        "claim_text": claim.claim_text,
        "normalized_text": claim.normalized_text,
        "claim_type": claim.claim_type,
        "confidence": claim.confidence,
        "section_location": claim.section_location,
        "paper_title": paper.title if paper else "Unknown",
        "paper_year": paper.year if paper else None,
        "created_at": claim.created_at,
        "evidence_items": [
            {
                "id": ev.id,
                "evidence_id": ev.evidence_id,
                "claim_id": ev.claim_id,
                "paper_id": ev.paper_id,
                "text": ev.text,
                "page_section": ev.page_section,
                "extraction_confidence": ev.extraction_confidence,
                "paper_title": paper.title if paper else None
            }
            for ev in ev_items
        ],
        "supports_count": sup_count,
        "contradicts_count": contra_count,
        "extends_count": ext_count
    }


# -------------------------------------------------------------
# 4. Evidence Viewer
# -------------------------------------------------------------
@router.get("/evidence", response_model=List[EvidenceResponse])
def get_evidence_list(
    claim_id: Optional[str] = None,
    paper_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Evidence)
    if claim_id:
        c = db.query(Claim).filter(Claim.claim_id == claim_id).first()
        if c:
            query = query.filter(Evidence.claim_id == c.id)
    if paper_id:
        p = db.query(Paper).filter(Paper.paper_id == paper_id).first()
        if p:
            query = query.filter(Evidence.paper_id == p.id)

    items = query.all()
    out = []
    for ev in items:
        p = db.query(Paper).filter(Paper.id == ev.paper_id).first()
        out.append({
            "id": ev.id,
            "evidence_id": ev.evidence_id,
            "claim_id": ev.claim_id,
            "paper_id": ev.paper_id,
            "text": ev.text,
            "page_section": ev.page_section,
            "extraction_confidence": ev.extraction_confidence,
            "paper_title": p.title if p else None
        })
    return out


# -------------------------------------------------------------
# 5. Interactive Graph Data
# -------------------------------------------------------------
@router.get("/graph", response_model=GraphDataResponse)
def get_graph_data(
    relation_types: Optional[str] = Query(None, description="Comma-separated: SUPPORTS,CONTRADICTS,EXTENDS"),
    node_types: Optional[str] = Query(None, description="Comma-separated: paper,claim,concept"),
    min_confidence: float = Query(0.0, ge=0.0, le=1.0),
    year_min: Optional[int] = Query(None),
    year_max: Optional[int] = Query(None),
    query: Optional[str] = Query(None),
    limit: int = Query(500, ge=10, le=5000),
    db: Session = Depends(get_db)
):
    rel_list = [r.strip().upper() for r in relation_types.split(",")] if relation_types else None
    node_list = [n.strip().lower() for n in node_types.split(",")] if node_types else None

    return GraphService.get_full_graph(
        db=db,
        relation_types=rel_list,
        min_confidence=min_confidence,
        node_types=node_list,
        year_min=year_min,
        year_max=year_max,
        search_query=query,
        edge_limit=limit
    )


# -------------------------------------------------------------
# 6. Semantic Relations
# -------------------------------------------------------------
@router.get("/relations", response_model=List[ClaimRelationResponse])
def get_relations(
    relation_type: Optional[str] = None,
    claim_id: Optional[str] = None,
    limit: int = Query(250, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    q = db.query(ClaimRelation)
    if relation_type:
        q = q.filter(ClaimRelation.relation_type == relation_type.upper())
    
    if claim_id:
        c = db.query(Claim).filter(Claim.claim_id == claim_id).first()
        if c:
            q = q.filter((ClaimRelation.source_claim_id == c.id) | (ClaimRelation.target_claim_id == c.id))

    relations = q.order_by(ClaimRelation.confidence.desc()).offset(offset).limit(limit).all()
    if not relations:
        return []

    # Pre-fetch relevant claims and papers in bulk
    claim_ids = set()
    for r in relations:
        claim_ids.add(r.source_claim_id)
        claim_ids.add(r.target_claim_id)

    claims = db.query(Claim).filter(Claim.id.in_(claim_ids)).all() if claim_ids else []
    claim_map = {c.id: c for c in claims}
    paper_ids = {c.paper_id for c in claims}
    papers = db.query(Paper).filter(Paper.id.in_(paper_ids)).all() if paper_ids else []
    paper_map = {p.id: p for p in papers}

    results = []
    for r in relations:
        source_c = claim_map.get(r.source_claim_id)
        target_c = claim_map.get(r.target_claim_id)
        source_p = paper_map.get(source_c.paper_id) if source_c else None
        target_p = paper_map.get(target_c.paper_id) if target_c else None

        results.append({
            "id": r.id,
            "relation_id": r.relation_id,
            "source_claim_id": r.source_claim_id,
            "target_claim_id": r.target_claim_id,
            "relation_type": r.relation_type,
            "confidence": r.confidence,
            "evidence_id": r.evidence_id,
            "reasoning": r.reasoning,
            "source_claim_text": source_c.claim_text if source_c else "",
            "target_claim_text": target_c.claim_text if target_c else "",
            "source_paper_title": source_p.title if source_p else "",
            "target_paper_title": target_p.title if target_p else "",
            "source_paper_doi": source_p.doi if source_p else None,
            "target_paper_doi": target_p.doi if target_p else None,
            "source_paper_id": source_p.paper_id if source_p else None,
            "target_paper_id": target_p.paper_id if target_p else None,
            "source_paper_year": source_p.year if source_p else None,
            "target_paper_year": target_p.year if target_p else None,
            "created_at": r.created_at
        })
    return results


# -------------------------------------------------------------
# 7. Conflict Detection
# -------------------------------------------------------------
@router.get("/conflicts", response_model=List[ConflictItem])
def get_conflicts(db: Session = Depends(get_db)):
    raw_conflicts = RelationEngine.detect_conflicts(db)
    results = []
    for c in raw_conflicts:
        results.append({
            "claim_id": c["claim_id"],
            "claim_text": c["claim_text"],
            "paper_title": c["paper_title"],
            "paper_id": c.get("paper_id"),
            "paper_db_id": c.get("paper_db_id"),
            "paper_doi": c.get("paper_doi"),
            "paper_year": c.get("paper_year"),
            "section_location": c.get("section_location"),
            "supporting_relations": c["supporting_relations"],
            "contradicting_relations": c["contradicting_relations"],
            "severity": c["severity"]
        })
    return results


# -------------------------------------------------------------
# 8. Research Gap Analysis
# -------------------------------------------------------------
@router.get("/gaps", response_model=List[ResearchGapItem])
def get_research_gaps(db: Session = Depends(get_db)):
    return GapAnalyzer.identify_research_gaps(db)


# -------------------------------------------------------------
# 9. Grounded Literature Q&A
# -------------------------------------------------------------
@router.post("/qa", response_model=QAResponse)
def ask_literature_question(payload: QARequest, db: Session = Depends(get_db)):
    return QAService.answer_question(db, question=payload.question, top_k=payload.top_k)


# -------------------------------------------------------------
# 10. Human Review & Annotations
# -------------------------------------------------------------
@router.post("/annotations", response_model=AnnotationResponse)
def create_annotation(payload: AnnotationCreate, db: Session = Depends(get_db)):
    if payload.target_type not in ["claim", "relation"]:
        raise HTTPException(status_code=400, detail="Invalid target_type. Must be 'claim' or 'relation'.")

    valid_actions = ["verify", "correct", "reject", "note"]
    if payload.user_action not in valid_actions:
        raise HTTPException(status_code=400, detail=f"Invalid user_action. Must be one of {valid_actions}.")

    # Verify target existence to prevent dangling state
    if payload.target_type == "claim":
        claim = db.query(Claim).filter(Claim.claim_id == payload.target_id).first()
        if not claim and payload.target_id.isdigit():
            claim = db.query(Claim).filter(Claim.id == int(payload.target_id)).first()
        if not claim:
            raise HTTPException(status_code=404, detail=f"Claim '{payload.target_id}' not found.")
        
        if payload.user_action == "correct" and payload.corrected_value:
            claim.normalized_text = payload.corrected_value
        elif payload.user_action == "reject":
            claim.confidence = 0.0

    elif payload.target_type == "relation":
        rel = db.query(ClaimRelation).filter(ClaimRelation.relation_id == payload.target_id).first()
        if not rel and payload.target_id.isdigit():
            rel = db.query(ClaimRelation).filter(ClaimRelation.id == int(payload.target_id)).first()
        if not rel:
            raise HTTPException(status_code=404, detail=f"Relation '{payload.target_id}' not found.")
        
        if payload.user_action == "correct" and payload.corrected_value:
            if payload.corrected_value.upper() in ["SUPPORTS", "CONTRADICTS", "EXTENDS"]:
                rel.relation_type = payload.corrected_value.upper()
        elif payload.user_action == "reject":
            rel.confidence = 0.0

    annotation = Annotation(
        annotation_id=f"ann_{uuid.uuid4().hex[:10]}",
        target_type=payload.target_type,
        target_id=payload.target_id,
        user_action=payload.user_action,
        corrected_value=payload.corrected_value,
        comment=payload.comment
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


@router.get("/annotations", response_model=List[AnnotationResponse])
def get_annotations(db: Session = Depends(get_db)):
    return db.query(Annotation).order_by(Annotation.created_at.desc()).all()


# -------------------------------------------------------------
# 11. Export Graph & Corpus Data
# -------------------------------------------------------------
@router.get("/export")
def export_corpus_data(format: str = Query("json", pattern="^(json|gexf)$"), db: Session = Depends(get_db)):
    graph = GraphService.get_full_graph(db)
    if format == "json":
        return JSONResponse(
            content={
                "project": "Smart Literature Claim Mapper",
                "version": "1.0",
                "graph": graph,
                "papers_count": db.query(Paper).count(),
                "claims_count": db.query(Claim).count(),
                "relations_count": db.query(ClaimRelation).count()
            },
            headers={"Content-Disposition": "attachment; filename=claim_mapper_graph.json"}
        )
    else:
        # Generate basic GEXF XML representation
        xml_lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">',
            '  <graph defaultedgetype="directed">',
            '    <nodes>'
        ]
        for n in graph["nodes"]:
            xml_lines.append(f'      <node id="{n["id"]}" label="{n["label"]}" />')
        xml_lines.append('    </nodes>')
        xml_lines.append('    <edges>')
        for e in graph["edges"]:
            xml_lines.append(f'      <edge id="{e["id"]}" source="{e["source"]}" target="{e["target"]}" label="{e["label"]}" />')
        xml_lines.append('    </edges>')
        xml_lines.append('  </graph>')
        xml_lines.append('</gexf>')
        return JSONResponse(
            content="\n".join(xml_lines),
            media_type="application/xml",
            headers={"Content-Disposition": "attachment; filename=claim_mapper_graph.gexf"}
        )


# -------------------------------------------------------------
# 12. System & AI RAG Configuration
# -------------------------------------------------------------
@router.get("/system/config", response_model=SystemConfigResponse)
def get_system_config():
    gemini_active = GeminiService.is_configured()
    scraper_key = (os.getenv("SCRAPER_API_KEY") or os.getenv("SCHOLAR_API_KEY") or "").strip()
    masked_key = (scraper_key[:4] + "..." + scraper_key[-4:]) if len(scraper_key) > 8 else ("***" if scraper_key else None)
    return {
        "embedding_model": os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3"),
        "retrieval_strategy": "Tri-Hybrid: BGE-M3 Dense + BM25 Sparse Lexical + Reciprocal Rank Fusion (RRF) + Re-ranking",
        "llm_provider": "Google Gemini Flash (Grounded Synthesis)" if gemini_active else "Local Multi-Pass Provenance Engine",
        "gemini_configured": gemini_active,
        "scraper_configured": bool(scraper_key),
        "scraper_api_key_masked": masked_key,
    }


@router.post("/system/config", response_model=SystemConfigResponse)
def update_system_config(payload: SystemConfigRequest):
    if payload.gemini_api_key is not None:
        os.environ["GEMINI_API_KEY"] = payload.gemini_api_key.strip()
        GeminiService._client = None  # Reset client to use new key
    if payload.scraper_api_key is not None:
        os.environ["SCRAPER_API_KEY"] = payload.scraper_api_key.strip()
    if payload.scholar_api_key is not None:
        os.environ["SCHOLAR_API_KEY"] = payload.scholar_api_key.strip()
        if not payload.scraper_api_key:
            os.environ["SCRAPER_API_KEY"] = payload.scholar_api_key.strip()
    if payload.embedding_model:
        os.environ["EMBEDDING_MODEL"] = payload.embedding_model.strip()

    return get_system_config()


# -------------------------------------------------------------
# 13. ScholarAPI.net Proxy Gateway (CORS-Free Native Endpoints)
# -------------------------------------------------------------
@router.get("/scholarapi/search")
async def scholarapi_proxy_search(
    q: str = Query(...),
    limit: int = Query(10),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key")
):
    api_key = x_api_key or os.getenv("SCHOLAR_API_KEY", "")
    if not api_key:
        return {"count": 0, "results": [], "error": "No ScholarAPI key configured."}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                "https://scholarapi.net/api/v1/search",
                params={"q": q, "limit": limit},
                headers={"X-API-Key": api_key, "Accept": "application/json"}
            )
            return JSONResponse(status_code=resp.status_code, content=resp.json())
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "results": []})


@router.get("/scholarapi/pdf/{paper_id}")
async def scholarapi_proxy_pdf(
    paper_id: str,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key")
):
    api_key = x_api_key or os.getenv("SCHOLAR_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="No ScholarAPI key configured.")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"https://scholarapi.net/api/v1/pdf/{paper_id}",
                headers={"X-API-Key": api_key}
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="ScholarAPI returned error downloading PDF")

            return Response(
                content=resp.content,
                media_type="application/pdf",
                headers={"Content-Disposition": f'inline; filename="{paper_id}.pdf"'}
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch PDF from ScholarAPI: {str(e)}")


# -------------------------------------------------------------
# 14. Crawler Paper Verification & Cached Ingestion Pipeline
# -------------------------------------------------------------
@router.post("/crawler/verify-paper")
async def verify_candidate_paper(payload: dict):
    """
    Downloads and rigorously verifies that a candidate research paper:
    1. Returns a genuine binary PDF (%PDF)
    2. Contains a valid text layer with readable characters
    3. Has valid page structure
    Caches the verified PDF locally on success for instant zero-latency ingestion.
    """
    paper_dict = payload.get("paper") if isinstance(payload.get("paper"), dict) else payload
    title = (paper_dict.get("title") or payload.get("title") or "Untitled Paper").strip()
    paper_id = str(paper_dict.get("id") or paper_dict.get("scholar_id") or payload.get("id") or title)
    doi = (paper_dict.get("doi") or payload.get("doi") or "").strip()
    pdf_url = (
        paper_dict.get("best_oa_location", {}).get("pdf_url")
        if isinstance(paper_dict.get("best_oa_location"), dict)
        else (paper_dict.get("pdf_url") or payload.get("pdf_url"))
    )
    scholar_id = paper_dict.get("scholar_id") or payload.get("scholar_id")
    source = paper_dict.get("source") or payload.get("source", "")
    custom_scraper_key = payload.get("scraper_api_key") or os.getenv("SCRAPER_API_KEY", "")
    custom_scholar_key = payload.get("scholar_api_key") or os.getenv("SCHOLAR_API_KEY", "")

    # Generate deterministic cache key
    safe_hash = hashlib.sha256(f"{title}_{doi}_{paper_id}".encode("utf-8")).hexdigest()[:16]
    clean_slug = re.sub(r'[^a-zA-Z0-9_\-]', '_', title)[:60].strip('_') or "paper"
    cached_pdf_path = VERIFIED_CACHE_DIR / f"{safe_hash}.pdf"

    # Fast path: already verified & cached
    if cached_pdf_path.exists() and cached_pdf_path.stat().st_size > 2000:
        try:
            reader = PdfReader(str(cached_pdf_path))
            num_pages = len(reader.pages)
            if num_pages > 0:
                first_page_text = reader.pages[0].extract_text() or ""
                if len(first_page_text.strip()) > 30:
                    return {
                        "valid": True,
                        "readable": True,
                        "pages": num_pages,
                        "verified_id": safe_hash,
                        "title": title,
                        "filename": f"{clean_slug}.pdf",
                        "size_bytes": cached_pdf_path.stat().st_size,
                        "preview": first_page_text.strip()[:240],
                        "source": source
                    }
        except Exception:
            pass

    content = None

    # Step 1: ScholarAPI direct fetch if source is ScholarAPI or scholar_id exists
    if (scholar_id or source == "ScholarAPI.net" or (pdf_url and "scholarapi.net" in pdf_url)) and custom_scholar_key:
        sid = scholar_id or paper_id.replace("scholarapi_", "").replace("scholarapi-", "")
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                r = await client.get(
                    f"https://scholarapi.net/api/v1/pdf/{sid}",
                    headers={"X-API-Key": custom_scholar_key}
                )
                if r.status_code == 200 and r.content.startswith(b"%PDF"):
                    content = r.content
        except Exception:
            pass

    # Step 2: Direct HTTP/HTTPS download if pdf_url available
    if not content and pdf_url:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Accept": "application/pdf,application/octet-stream,*/*"
        }
        try:
            async with httpx.AsyncClient(timeout=18.0, follow_redirects=True) as client:
                r = await client.get(pdf_url, headers=headers)
                if r.status_code == 200 and r.content.startswith(b"%PDF"):
                    content = r.content
        except Exception:
            pass

    # Step 3: Unpaywall DOI Open Access resolution
    if not content and doi and not doi.startswith("#"):
        clean_doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi)
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                unp_r = await client.get(f"https://api.unpaywall.org/v2/{clean_doi}?email=verifier@claim-mapper.org")
                if unp_r.status_code == 200:
                    unp_data = unp_r.json()
                    oa_url = unp_data.get("best_oa_location", {}).get("url_for_pdf")
                    if oa_url:
                        pdf_resp = await client.get(oa_url, headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True)
                        if pdf_resp.status_code == 200 and pdf_resp.content.startswith(b"%PDF"):
                            content = pdf_resp.content
        except Exception:
            pass

    # Step 4: ScraperAPI Proxy fallback for Google Scholar or paywalled publisher links
    if not content and pdf_url and custom_scraper_key:
        scraper_url = f"https://api.scraperapi.com/?api_key={custom_scraper_key}&url={pdf_url}"
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                r = await client.get(scraper_url)
                if r.status_code == 200 and r.content.startswith(b"%PDF"):
                    content = r.content
        except Exception:
            pass

    # If all download channels failed
    if not content:
        return {
            "valid": False,
            "readable": False,
            "reason": "Download failed or paywalled (no open PDF stream accessible)"
        }

    # Step 5: Rigorous Readability & Text Extraction Verification
    try:
        reader = PdfReader(io.BytesIO(content))
        total_pages = len(reader.pages)
        if total_pages == 0:
            return {"valid": False, "readable": False, "reason": "Corrupt PDF (0 pages)"}

        # Check for extracted text across initial pages
        total_text = ""
        for page in reader.pages[:min(total_pages, 5)]:
            extracted = page.extract_text() or ""
            total_text += " " + extracted.strip()

        clean_text = total_text.strip()
        if len(clean_text) < 100:
            return {
                "valid": False,
                "readable": False,
                "reason": "Scanned or image-only PDF (no extractable text layer)"
            }

        # Save to verified cache
        cached_pdf_path.write_bytes(content)

        return {
            "valid": True,
            "readable": True,
            "pages": total_pages,
            "verified_id": safe_hash,
            "title": title,
            "filename": f"{clean_slug}.pdf",
            "size_bytes": len(content),
            "preview": clean_text[:240],
            "source": source
        }
    except Exception as e:
        return {
            "valid": False,
            "readable": False,
            "reason": f"PDF parse error: {str(e)}"
        }


@router.post("/crawler/ingest-verified/{verified_id}", response_model=PaperResponse)
def ingest_verified_paper(
    verified_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Instantly ingests an already downloaded and verified PDF into the knowledge graph.
    Extracts text, metadata, claims, evidence, and cross-paper relations.
    """
    cached_path = VERIFIED_CACHE_DIR / f"{verified_id}.pdf"
    if not cached_path.exists():
        raise HTTPException(status_code=404, detail="Verified paper file not found or expired from cache.")

    paper_id = f"paper_{verified_id}"
    existing = db.query(Paper).filter(Paper.paper_id == paper_id).first()
    if existing:
        claims_cnt = db.query(Claim).filter(Claim.paper_id == existing.id).count()
        # If paper failed or was never extracted, re-trigger processing
        if existing.processing_status == "failed" or (existing.processing_status != "processing" and claims_cnt == 0):
            existing.processing_status = "processing"
            existing.error_message = None
            db.commit()
            background_tasks.add_task(process_paper_file, existing.id, existing.file_path)
        return {
            "id": existing.id,
            "paper_id": existing.paper_id,
            "title": existing.title,
            "authors": existing.authors,
            "year": existing.year,
            "doi": existing.doi,
            "abstract": existing.abstract,
            "file_path": existing.file_path,
            "processing_status": existing.processing_status,
            "error_message": existing.error_message,
            "created_at": existing.created_at,
            "claims_count": claims_cnt
        }

    # Copy to permanent uploads directory
    target_filename = f"verified_{verified_id}_{cached_path.name}"
    dest_path = UPLOADS_DIR / target_filename
    if not dest_path.exists():
        shutil.copyfile(str(cached_path), str(dest_path))

    paper = Paper(
        paper_id=paper_id,
        title=cached_path.stem.replace("_", " ").title(),
        file_path=str(dest_path),
        processing_status="processing"
    )
    try:
        db.add(paper)
        db.commit()
        db.refresh(paper)
    except Exception:
        db.rollback()
        # Handle concurrent insertion race condition: return existing paper
        existing = db.query(Paper).filter(Paper.paper_id == paper_id).first()
        if existing:
            claims_cnt = db.query(Claim).filter(Claim.paper_id == existing.id).count()
            return {
                "id": existing.id,
                "paper_id": existing.paper_id,
                "title": existing.title,
                "authors": existing.authors,
                "year": existing.year,
                "doi": existing.doi,
                "abstract": existing.abstract,
                "file_path": existing.file_path,
                "processing_status": existing.processing_status,
                "error_message": existing.error_message,
                "created_at": existing.created_at,
                "claims_count": claims_cnt
            }
        raise

    # Dispatch extraction and relation inference in background for immediate responsiveness
    background_tasks.add_task(process_paper_file, paper.id, str(dest_path))

    return {
        "id": paper.id,
        "paper_id": paper.paper_id,
        "title": paper.title,
        "authors": paper.authors,
        "year": paper.year,
        "doi": paper.doi,
        "abstract": paper.abstract,
        "file_path": paper.file_path,
        "processing_status": paper.processing_status,
        "error_message": paper.error_message,
        "created_at": paper.created_at,
        "claims_count": 0
    }


@router.get("/crawler/download-verified/{verified_id}")
def download_verified_file(verified_id: str):
    """
    Directly downloads the confirmed readable PDF to the browser.
    """
    cached_path = VERIFIED_CACHE_DIR / f"{verified_id}.pdf"
    if not cached_path.exists():
        raise HTTPException(status_code=404, detail="Verified PDF not found.")

    return FileResponse(
        path=str(cached_path),
        media_type="application/pdf",
        filename=f"verified_{verified_id}.pdf"
    )


# -------------------------------------------------------------
# 14. Gemini Claim Searcher (RAG)
# -------------------------------------------------------------
@router.post("/claims/search", response_model=ClaimSearchResponse)
def search_claims_rag(payload: ClaimSearchRequest, db: Session = Depends(get_db)):
    """
    RAG-powered claim search:
    1. Encodes user claim via Hybrid Retriever (dense + BM25 + RRF)
    2. Retrieves top-k most relevant corpus claims with evidence passages
    3. Classifies each match's relation to query (SUPPORTS / CONTRADICTS / EXTENDS / RELATED)
    4. Sends matches to Gemini Flash Lite for a synthesized research context summary
    """
    query_claim = payload.claim.strip()
    if not query_claim:
        raise HTTPException(status_code=400, detail="Claim query cannot be empty.")

    all_claims = db.query(Claim).all()
    total_corpus = len(all_claims)

    if not all_claims:
        return ClaimSearchResponse(
            query_claim=query_claim,
            matches=[],
            synthesis="Your research corpus is empty. Upload PDFs or discover papers to enable claim search.",
            synthesis_confidence=0.0,
            model_used="none",
            total_corpus_claims=0
        )

    # Pre-fetch papers and evidence for efficient lookups
    papers_map = {p.id: p for p in db.query(Paper).all()}
    evidence_list = db.query(Evidence).all()
    evidence_map = {}
    for ev in evidence_list:
        if ev.claim_id not in evidence_map:
            evidence_map[ev.claim_id] = ev

    # Build candidate pool for hybrid retrieval
    candidates = []
    for c in all_claims:
        ev = evidence_map.get(c.id)
        paper = papers_map.get(c.paper_id)
        candidates.append({
            "claim": c,
            "paper": paper,
            "evidence": ev,
            "text": f"{c.claim_text} {c.normalized_text or ''} {ev.text if ev else ''}"
        })

    # Hybrid Retrieval (Dense + BM25 + RRF + Re-ranking)
    ranked_results = HybridRetriever.retrieve(
        query=query_claim,
        candidate_items=candidates,
        text_key="text",
        top_k=payload.top_k
    )

    # Build matches with relation classification
    matches = []
    provenance_for_synthesis = []

    for score, item in ranked_results:
        claim_obj: Claim = item["claim"]
        paper_obj: Paper = item.get("paper")
        ev_obj: Evidence = item.get("evidence")

        # Lightweight relation hinting via keyword + polarity analysis
        relation_hint = _classify_relation_hint(query_claim, claim_obj.claim_text)

        match = ClaimSearchMatch(
            claim_id=claim_obj.claim_id,
            claim_text=claim_obj.claim_text,
            claim_type=claim_obj.claim_type or "finding",
            confidence=float(claim_obj.confidence),
            paper_title=paper_obj.title if paper_obj else "Unknown",
            paper_year=paper_obj.year if paper_obj else None,
            paper_doi=paper_obj.doi if paper_obj else None,
            section_location=claim_obj.section_location or (ev_obj.page_section if ev_obj else None),
            evidence_passage=ev_obj.text if ev_obj else None,
            relevance_score=float(score),
            relation_hint=relation_hint
        )
        matches.append(match)

        provenance_for_synthesis.append({
            "claim_text": claim_obj.claim_text,
            "paper_title": paper_obj.title if paper_obj else "Unknown",
            "paper_year": paper_obj.year if paper_obj else None,
            "evidence_passage": ev_obj.text if ev_obj else claim_obj.claim_text,
            "section": claim_obj.section_location or (ev_obj.page_section if ev_obj else "General"),
            "relation_hint": relation_hint,
            "relevance_score": float(score)
        })

    # Generate RAG synthesis using Gemini Flash Lite
    synthesis_result = _gemini_claim_synthesis(query_claim, provenance_for_synthesis)

    return ClaimSearchResponse(
        query_claim=query_claim,
        matches=matches,
        synthesis=synthesis_result["synthesis"],
        synthesis_confidence=synthesis_result["confidence"],
        model_used=synthesis_result["model_used"],
        total_corpus_claims=total_corpus
    )


def _classify_relation_hint(query: str, candidate: str) -> str:
    """
    Lightweight heuristic relation classification between query claim and a candidate.
    Uses polarity keywords and negation detection for fast categorization.
    """
    query_lower = query.lower()
    cand_lower = candidate.lower()

    negation_words = {"not", "no", "never", "neither", "nor", "doesn't", "don't",
                      "isn't", "aren't", "wasn't", "weren't", "cannot", "can't",
                      "won't", "wouldn't", "shouldn't", "couldn't", "hardly",
                      "unlikely", "fail", "failed", "disagree", "contrary",
                      "refute", "refuted", "disprove", "challenge", "contradict"}
    support_words = {"confirm", "confirmed", "support", "supports", "corroborate",
                     "consistent", "agree", "aligned", "validate", "verified",
                     "replicate", "replicated", "demonstrate", "demonstrated"}
    extend_words = {"extend", "extends", "build", "furthermore", "additionally",
                    "moreover", "complement", "enhance", "expand", "augment",
                    "generalize", "novel", "beyond"}

    query_tokens = set(query_lower.split())
    cand_tokens = set(cand_lower.split())

    # Check for contradicting polarity
    query_has_neg = bool(query_tokens & negation_words)
    cand_has_neg = bool(cand_tokens & negation_words)
    if query_has_neg != cand_has_neg:
        return "CONTRADICTS"

    # Check for explicit extend keywords
    if cand_tokens & extend_words:
        return "EXTENDS"

    # Check for explicit support keywords
    if cand_tokens & support_words:
        return "SUPPORTS"

    # Default: topically related
    overlap = len(query_tokens & cand_tokens)
    if overlap > 3:
        return "SUPPORTS"

    return "RELATED"


def _gemini_claim_synthesis(
    query_claim: str,
    provenance: list
) -> dict:
    """
    Sends retrieved corpus claims to Gemini Flash Lite (or fast fallback) for 
    RAG synthesis summarizing the research landscape around the user's claim.
    """
    if not provenance:
        return {
            "synthesis": "No matching claims found in the corpus for this query.",
            "confidence": 0.0,
            "model_used": "none"
        }

    # Build context document
    context_blocks = []
    for idx, src in enumerate(provenance, start=1):
        rel_tag = f"[{src.get('relation_hint', 'RELATED')}]"
        paper_info = f"{src.get('paper_title', 'Unknown')} ({src.get('paper_year', 'N/A')})"
        context_blocks.append(
            f"Match [{idx}] {rel_tag} from {paper_info}:\n"
            f"  Claim: \"{src.get('claim_text')}\"\n"
            f"  Evidence: \"{src.get('evidence_passage', 'N/A')}\"\n"
            f"  Section: {src.get('section', 'General')}\n"
            f"  Relevance: {round(src.get('relevance_score', 0) * 100)}%"
        )

    context_text = "\n---\n".join(context_blocks)

    if GeminiService.is_configured():
        prompt = f"""You are an expert research analyst. A user is investigating the following scientific claim:

QUERY CLAIM: "{query_claim}"

The following {len(provenance)} related findings were retrieved from the research corpus:

{context_text}

INSTRUCTIONS:
1. Provide a comprehensive research landscape summary showing how existing literature relates to this claim.
2. Group findings into: (a) Supporting evidence, (b) Contradicting evidence, (c) Extending/complementary findings.
3. For EVERY finding you reference, cite it as [Match N] with the paper name.
4. Highlight key methodological differences or boundary conditions that explain any apparent contradictions.
5. End with a "Research Verdict" — a 2-3 sentence conclusion about what the current evidence says about this claim.
6. If evidence is insufficient, explicitly note which aspects need further investigation.
"""
        result = GeminiService._call_gemini(prompt)
        if result:
            synthesis_text, model_name = result
            return {
                "synthesis": synthesis_text,
                "confidence": 0.94,
                "model_used": f"Google {model_name}"
            }

    # Local fallback synthesis
    supports = [s for s in provenance if s.get("relation_hint") == "SUPPORTS"]
    contradicts = [s for s in provenance if s.get("relation_hint") == "CONTRADICTS"]
    extends = [s for s in provenance if s.get("relation_hint") == "EXTENDS"]
    related = [s for s in provenance if s.get("relation_hint") == "RELATED"]

    synthesis_parts = [f"Research Landscape for: \"{query_claim}\"\n"]

    if supports:
        synthesis_parts.append(f"✓ SUPPORTING EVIDENCE ({len(supports)} findings):")
        for s in supports:
            synthesis_parts.append(f"  • {s['claim_text']} — {s['paper_title']} ({s.get('paper_year', 'N/A')})")

    if contradicts:
        synthesis_parts.append(f"\n✗ CONTRADICTING EVIDENCE ({len(contradicts)} findings):")
        for s in contradicts:
            synthesis_parts.append(f"  • {s['claim_text']} — {s['paper_title']} ({s.get('paper_year', 'N/A')})")

    if extends:
        synthesis_parts.append(f"\n↗ EXTENDING FINDINGS ({len(extends)} findings):")
        for s in extends:
            synthesis_parts.append(f"  • {s['claim_text']} — {s['paper_title']} ({s.get('paper_year', 'N/A')})")

    if related:
        synthesis_parts.append(f"\n◇ RELATED FINDINGS ({len(related)} findings):")
        for s in related:
            synthesis_parts.append(f"  • {s['claim_text']} — {s['paper_title']} ({s.get('paper_year', 'N/A')})")

    synthesis_parts.append(f"\nResearch Verdict: {len(provenance)} corpus matches analyzed — "
                          f"{len(supports)} supporting, {len(contradicts)} contradicting, "
                          f"{len(extends)} extending, {len(related)} topically related.")

    return {
        "synthesis": "\n".join(synthesis_parts),
        "confidence": 0.82 if len(provenance) >= 3 else 0.65,
        "model_used": "Local Hybrid Retriever (BGE-M3 + BM25)"
    }


