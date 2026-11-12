import os
import sys
import uuid
import httpx
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal, init_db
from app.core.config import UPLOADS_DIR
from app.models.schema import Paper, Claim, Evidence, Concept, ClaimRelation
from app.api.endpoints import process_paper_file

PAPERS_TO_PREBUILD = [
    {
        "genre": "Computer Science - AI & Architecture",
        "title": "Attention Is All You Need",
        "filename": "Vaswani2017_Attention_Is_All_You_Need.pdf",
        "url": "https://arxiv.org/pdf/1706.03762.pdf"
    },
    {
        "genre": "Computer Science - RAG & Information Retrieval",
        "title": "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
        "filename": "Lewis2020_Retrieval_Augmented_Generation.pdf",
        "url": "https://arxiv.org/pdf/2005.11401.pdf"
    },
    {
        "genre": "Computer Science - Model Optimization",
        "title": "LoRA: Low-Rank Adaptation of Large Language Models",
        "filename": "Hu2021_LoRA_Low_Rank_Adaptation.pdf",
        "url": "https://arxiv.org/pdf/2106.09685.pdf"
    },
    {
        "genre": "Biomedicine & Health Informatics",
        "title": "BioBERT: Pre-trained Biomedical Language Representation Model",
        "filename": "Lee2019_BioBERT_Biomedical_Text_Mining.pdf",
        "url": "https://arxiv.org/pdf/1901.08746.pdf"
    },
    {
        "genre": "Cognitive Science & Neuroscience",
        "title": "A Deep Learning Framework for Neuroscience",
        "filename": "Richards2019_Deep_Learning_Neuroscience.pdf",
        "url": "https://arxiv.org/pdf/1904.08985.pdf"
    },
    {
        "genre": "Climate Science & Sustainability",
        "title": "Tackling Climate Change with Machine Learning",
        "filename": "Rolnick2019_Tackling_Climate_Change_ML.pdf",
        "url": "https://arxiv.org/pdf/1906.05433.pdf"
    },
    {
        "genre": "Quantum Physics & Computing",
        "title": "Quantum Computing in the NISQ Era and Beyond",
        "filename": "Preskill2018_Quantum_Computing_NISQ.pdf",
        "url": "https://arxiv.org/pdf/1801.00862.pdf"
    },
    {
        "genre": "AI Ethics & Algorithmic Fairness",
        "title": "A Survey on Bias and Fairness in Machine Learning",
        "filename": "Mehrabi2019_Bias_and_Fairness_in_ML.pdf",
        "url": "https://arxiv.org/pdf/1908.09635.pdf"
    }
]

def download_and_prebuild():
    init_db()
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    db = SessionLocal()

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SmartLiteratureClaimMapper/1.0"
    }

    print("=" * 70)
    print("Prebuilding Multi-Genre Academic Knowledge Base")
    print("=" * 70)

    for item in PAPERS_TO_PREBUILD:
        dest_path = UPLOADS_DIR / item["filename"]
        print(f"\n[{item['genre']}]")
        print(f"Paper: {item['title']}")

        # 1. Download if not already on disk
        if not dest_path.exists() or dest_path.stat().st_size < 1000:
            print(f"Downloading from {item['url']}...")
            try:
                with httpx.Client(timeout=45.0, follow_redirects=True, headers=headers) as client:
                    resp = client.get(item["url"])
                    resp.raise_for_status()
                    with open(dest_path, "wb") as f:
                        f.write(resp.content)
                print(f"Saved: {item['filename']} ({dest_path.stat().st_size // 1024} KB)")
            except Exception as e:
                print(f"Download failed for {item['filename']}: {e}")
                continue
        else:
            print(f"Found existing PDF: {item['filename']} ({dest_path.stat().st_size // 1024} KB)")

        # 2. Ingest into Database if not already processed
        existing = db.query(Paper).filter(Paper.file_path == str(dest_path)).first()
        if existing and existing.processing_status == "completed":
            print(f"Already ingested in knowledge base (Paper ID: {existing.paper_id})")
            continue

        paper_id = f"paper_{uuid.uuid4().hex[:10]}"
        paper = Paper(
            paper_id=paper_id,
            title=item["title"],
            file_path=str(dest_path),
            processing_status="pending"
        )
        db.add(paper)
        db.commit()
        db.refresh(paper)

        print("Extracting propositions, methodology, limitations, and cross-study relations...")
        process_paper_file(paper.id, str(dest_path))
        print(f"Successfully indexed into knowledge base!")

    total_p = db.query(Paper).count()
    total_c = db.query(Claim).count()
    total_r = db.query(ClaimRelation).count()
    db.close()

    print("\n" + "=" * 70)
    print("Prebuilt Knowledge Base Ready!")
    print(f"Total Academic Papers:   {total_p}")
    print(f"Total Extracted Claims:  {total_c}")
    print(f"Total Semantic Edges:    {total_r}")
    print("=" * 70)

if __name__ == "__main__":
    download_and_prebuild()
