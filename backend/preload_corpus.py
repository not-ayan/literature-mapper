import sys
import os
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal, init_db
from app.core.config import UPLOADS_DIR
from app.models.schema import Paper, Claim, ClaimRelation
from app.api.endpoints import process_paper_file
import uuid

def preload_all_pdfs():
    init_db()
    db = SessionLocal()
    
    pdf_files = list(UPLOADS_DIR.glob("*.pdf"))
    print(f"[Preloader] Found {len(pdf_files)} PDFs in {UPLOADS_DIR}")
    
    processed_count = 0
    for pdf_path in pdf_files:
        # Check if already in DB by file_path or title
        existing = db.query(Paper).filter(Paper.file_path == str(pdf_path)).first()
        if existing and existing.processing_status == "completed":
            print(f"[Preloader] Skipping already processed: {pdf_path.name}")
            continue

        print(f"[Preloader] Processing PDF: {pdf_path.name}...")
        paper_id = f"paper_{uuid.uuid4().hex[:10]}"
        paper = Paper(
            paper_id=paper_id,
            title=pdf_path.stem.replace("_", " ").title(),
            file_path=str(pdf_path),
            processing_status="pending"
        )
        db.add(paper)
        db.commit()
        db.refresh(paper)

        # Process the paper (extracts metadata, claims, evidence, concepts, relations)
        process_paper_file(paper.id, str(pdf_path))
        processed_count += 1
        print(f"[Preloader] Finished: {pdf_path.name}")

    total_papers = db.query(Paper).count()
    total_claims = db.query(Claim).count()
    total_relations = db.query(ClaimRelation).count()
    db.close()

    print(f"\n[Preloader Summary]")
    print(f"Total Papers in Corpus: {total_papers}")
    print(f"Total Claims Extracted: {total_claims}")
    print(f"Total Relations Inferred: {total_relations}")

if __name__ == "__main__":
    preload_all_pdfs()
