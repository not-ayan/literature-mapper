import os
import uuid
import shutil
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..core.database import get_db
from ..core.config import UPLOADS_DIR
from ..models.schema import Paper, Claim, Evidence, ClaimRelation, Concept, Citation, Annotation
from ..schemas.pydantic_models import PaperResponse, DashboardStatsResponse
from ..services.pdf_service import PDFService
from ..services.claim_extractor import ClaimExtractor
from ..services.relation_engine import RelationEngine

router = APIRouter()


@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db)):
    total_papers = db.query(Paper).count()
    total_claims = db.query(Claim).count()
    total_relations = db.query(ClaimRelation).count()
    rel_counts = dict(db.query(ClaimRelation.relation_type, func.count(ClaimRelation.id)).group_by(ClaimRelation.relation_type).all())
    status_raw = dict(db.query(Paper.processing_status, func.count(Paper.id)).group_by(Paper.processing_status).all())
    return {
        "total_papers": total_papers,
        "total_claims": total_claims,
        "total_relations": total_relations,
        "supports_count": rel_counts.get("SUPPORTS", 0),
        "contradicts_count": rel_counts.get("CONTRADICTS", 0),
        "extends_count": rel_counts.get("EXTENDS", 0),
        "total_conflicts": 0,
        "total_gaps": 0,
        "processing_status": {s: status_raw.get(s, 0) for s in ["pending", "processing", "completed", "failed"]},
    }


@router.get("/papers", response_model=List[PaperResponse])
def list_papers(db: Session = Depends(get_db)):
    papers = db.query(Paper).order_by(Paper.created_at.desc()).all()
    claim_counts = dict(db.query(Claim.paper_id, func.count(Claim.id)).group_by(Claim.paper_id).all())
    return [
        {
            "id": p.id, "paper_id": p.paper_id, "title": p.title, "authors": p.authors,
            "year": p.year, "doi": p.doi, "abstract": p.abstract, "file_path": p.file_path,
            "processing_status": p.processing_status, "error_message": p.error_message,
            "created_at": p.created_at, "claims_count": claim_counts.get(p.id, 0),
        }
        for p in papers
    ]


def process_paper_file(paper_db_id: int, file_path: str):
    from ..core.database import SessionLocal
    db = SessionLocal()
    try:
        paper = db.query(Paper).filter(Paper.id == paper_db_id).first()
        if not paper:
            return
        paper.processing_status = "processing"
        db.commit()

        extracted = PDFService.extract_text_and_metadata(file_path)
        paper.title = extracted["title"]
        paper.authors = extracted["authors"]
        paper.year = extracted["year"]
        paper.doi = extracted["doi"]
        paper.abstract = extracted["abstract"]

        analysis = ClaimExtractor.extract_claims_and_evidence(extracted["full_text"], extracted["pages"])
        for c_data in analysis["claims"]:
            claim = Claim(
                claim_id=c_data["claim_id"], paper_id=paper.id, claim_text=c_data["claim_text"],
                normalized_text=c_data["normalized_text"], claim_type=c_data["claim_type"],
                confidence=c_data["confidence"], section_location=c_data["section_location"],
            )
            db.add(claim)
            db.flush()
            ev_data = c_data["evidence"]
            db.add(Evidence(
                evidence_id=ev_data["evidence_id"], claim_id=claim.id, paper_id=paper.id,
                text=ev_data["text"], page_section=ev_data["page_section"],
                extraction_confidence=ev_data["extraction_confidence"],
            ))

        for conc_data in analysis["concepts"]:
            db.add(Concept(
                concept_id=conc_data["concept_id"], name=conc_data["name"],
                category=conc_data["category"], confidence=conc_data["confidence"], paper_id=paper.id,
            ))

        paper.processing_status = "completed"
        db.commit()
        RelationEngine.analyze_corpus_relations(db, target_paper_id=paper.id)
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
async def upload_paper(background_tasks: BackgroundTasks, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    paper_id = f"paper_{uuid.uuid4().hex[:10]}"
    saved_path = UPLOADS_DIR / f"{paper_id}_{file.filename}"
    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    paper = Paper(
        paper_id=paper_id,
        title=file.filename.replace(".pdf", "").replace("_", " ").title(),
        file_path=str(saved_path),
        processing_status="processing",
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)
    background_tasks.add_task(process_paper_file, paper.id, str(saved_path))
    return {
        "id": paper.id, "paper_id": paper.paper_id, "title": paper.title, "authors": paper.authors,
        "year": paper.year, "doi": paper.doi, "abstract": paper.abstract, "file_path": paper.file_path,
        "processing_status": paper.processing_status, "error_message": paper.error_message,
        "created_at": paper.created_at, "claims_count": 0,
    }


@router.post("/corpus/reset")
def reset_corpus(db: Session = Depends(get_db)):
    for model in [ClaimRelation, Evidence, Claim, Concept, Citation, Annotation, Paper]:
        db.query(model).delete()
    db.commit()
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
    return {"message": f"Paper {paper_id} removed"}
