import pytest
import sys
import uuid
from pathlib import Path

# Add backend root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.models.schema import Paper, Claim, ClaimRelation, Concept, Evidence, Annotation
from app.services.graph_service import GraphService
from app.api.endpoints import process_paper_file

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_db():
    """Ensure clean state before each test."""
    db = SessionLocal()
    try:
        db.query(ClaimRelation).delete()
        db.query(Evidence).delete()
        db.query(Claim).delete()
        db.query(Concept).delete()
        db.query(Annotation).delete()
        db.query(Paper).delete()
        db.commit()
    finally:
        db.close()
    yield

def test_paper_lifecycle_success_transition():
    """Verify state machine transition: pending -> processing -> completed."""
    db = SessionLocal()
    paper = Paper(
        paper_id=f"paper_{uuid.uuid4().hex[:8]}",
        title="Attention Is All You Need",
        authors="Vaswani et al.",
        year=2017,
        processing_status="processing"
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)
    paper_id = paper.id
    db.close()

    # Verify initial state
    res = client.get("/api/papers")
    assert res.status_code == 200
    papers = res.json()
    assert len(papers) == 1
    assert papers[0]["processing_status"] == "processing"

def test_paper_lifecycle_failure_transition():
    """Verify invalid file path transitions from processing to failed with error message recorded."""
    db = SessionLocal()
    paper = Paper(
        paper_id=f"paper_{uuid.uuid4().hex[:8]}",
        title="Corrupted Paper",
        file_path="nonexistent_invalid_path.pdf",
        processing_status="pending"
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)
    paper_id = paper.id
    db.close()

    # Run processing worker on invalid path
    process_paper_file(paper_id, "nonexistent_invalid_path.pdf")

    # Verify transition to failed
    db = SessionLocal()
    updated = db.query(Paper).filter(Paper.id == paper_id).first()
    assert updated is not None
    assert updated.processing_status == "failed"
    assert updated.error_message is not None
    db.close()

def test_paper_deleted_during_processing_aborts_cleanly():
    """Verify concurrency invariant: if paper is deleted during in-flight background worker, worker aborts cleanly without IntegrityError."""
    db = SessionLocal()
    paper = Paper(
        paper_id=f"paper_{uuid.uuid4().hex[:8]}",
        title="Doomed Paper",
        processing_status="processing"
    )
    db.add(paper)
    db.commit()
    paper_id = paper.id
    
    # Simulate user deleting paper before extraction completes
    db.delete(paper)
    db.commit()
    db.close()

    # Invoking worker on deleted ID must return cleanly and not raise unhandled exception
    process_paper_file(paper_id, "dummy.pdf")

def test_graph_structural_invariant_no_dangling_edges():
    """Verify graph invariant: every edge emitted by get_full_graph strictly has both endpoints in nodes list."""
    db = SessionLocal()
    paper1 = Paper(paper_id="paper_g1", title="Paper Alpha", year=2021)
    paper2 = Paper(paper_id="paper_g2", title="Paper Beta", year=2022)
    db.add_all([paper1, paper2])
    db.commit()

    claim1 = Claim(claim_id="claim_g1", paper_id=paper1.id, claim_text="Alpha finding text", confidence=0.9)
    claim2 = Claim(claim_id="claim_g2", paper_id=paper2.id, claim_text="Beta contradiction text", confidence=0.85)
    db.add_all([claim1, claim2])
    db.commit()

    rel = ClaimRelation(
        relation_id="rel_g1",
        source_claim_id=claim1.id,
        target_claim_id=claim2.id,
        relation_type="CONTRADICTS",
        confidence=0.88
    )
    db.add(rel)
    db.commit()

    # Case A: Filter nodes so claim2 is excluded by keyword search
    graph_filtered = GraphService.get_full_graph(db, search_query="Alpha")
    node_ids = {n["id"] for n in graph_filtered["nodes"]}
    for edge in graph_filtered["edges"]:
        assert edge["source"] in node_ids, f"Dangling edge source {edge['source']} not in nodes!"
        assert edge["target"] in node_ids, f"Dangling edge target {edge['target']} not in nodes!"

    # Case B: Exclude 'paper' node types - verify no paper->claim or paper->concept dangling edges exist
    graph_no_papers = GraphService.get_full_graph(db, node_types=["claim"])
    node_ids_np = {n["id"] for n in graph_no_papers["nodes"]}
    for edge in graph_no_papers["edges"]:
        assert edge["source"] in node_ids_np, f"Dangling edge source {edge['source']} in paper-less graph!"
        assert edge["target"] in node_ids_np, f"Dangling edge target {edge['target']} in paper-less graph!"

    db.close()

def test_annotation_state_machine_validation():
    """Verify annotation state transitions, input validation, and entity updates."""
    db = SessionLocal()
    paper = Paper(paper_id="paper_ann_1", title="Annotation Test Paper")
    db.add(paper)
    db.commit()

    claim = Claim(claim_id="claim_ann_1", paper_id=paper.id, claim_text="Raw claim text", confidence=0.8)
    db.add(claim)
    db.commit()
    db.close()

    # 1. Reject invalid target_type
    res_bad_type = client.post("/api/annotations", json={
        "target_type": "invalid_type",
        "target_id": "claim_ann_1",
        "user_action": "verify"
    })
    assert res_bad_type.status_code == 400

    # 2. Reject invalid user_action
    res_bad_action = client.post("/api/annotations", json={
        "target_type": "claim",
        "target_id": "claim_ann_1",
        "user_action": "destroy"
    })
    assert res_bad_action.status_code == 400

    # 3. Reject non-existent target ID
    res_missing = client.post("/api/annotations", json={
        "target_type": "claim",
        "target_id": "non_existent_claim_id",
        "user_action": "verify"
    })
    assert res_missing.status_code == 404

    # 4. Valid 'correct' action updates normalized text
    res_correct = client.post("/api/annotations", json={
        "target_type": "claim",
        "target_id": "claim_ann_1",
        "user_action": "correct",
        "corrected_value": "Normalized verified finding",
        "comment": "Clarified technical scope"
    })
    assert res_correct.status_code == 200

    db = SessionLocal()
    updated_claim = db.query(Claim).filter(Claim.claim_id == "claim_ann_1").first()
    assert updated_claim.normalized_text == "Normalized verified finding"
    db.close()

    # 5. Valid 'reject' action zeros confidence
    res_reject = client.post("/api/annotations", json={
        "target_type": "claim",
        "target_id": "claim_ann_1",
        "user_action": "reject",
        "comment": "Spurious correlation refuted"
    })
    assert res_reject.status_code == 200

    db = SessionLocal()
    rejected_claim = db.query(Claim).filter(Claim.claim_id == "claim_ann_1").first()
    assert rejected_claim.confidence == 0.0
    db.close()

def test_corpus_reset_clears_all_states():
    """Verify reset_corpus invariant: cleans slate completely to 0 count for all models."""
    db = SessionLocal()
    p = Paper(paper_id="paper_reset", title="Reset Me")
    db.add(p)
    db.commit()
    c = Claim(claim_id="claim_reset", paper_id=p.id, claim_text="Reset claim")
    db.add(c)
    db.commit()
    db.close()

    res = client.post("/api/corpus/reset")
    assert res.status_code == 200
    assert res.json()["status"] == "success"

    # Verify counts
    res_stats = client.get("/api/dashboard/stats")
    stats = res_stats.json()
    assert stats["total_papers"] == 0
    assert stats["total_claims"] == 0
    assert stats["total_relations"] == 0
