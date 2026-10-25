import pytest
from fastapi.testclient import TestClient
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app
from app.services.claim_extractor import ClaimExtractor
from app.services.relation_engine import RelationEngine

client = TestClient(app)

def test_claim_normalization():
    raw_text = "In this paper, we demonstrate that sparse attention reduces memory complexity to linear scale."
    normalized = ClaimExtractor.normalize_claim(raw_text)
    assert "in this paper, we demonstrate that" not in normalized.lower()
    assert "sparse attention reduces memory complexity to linear scale" in normalized

def test_relation_classification_supports():
    claim_a = "sparse attention scales linearly with sequence length"
    claim_b = "sparse attention enables linear sequence processing"
    rel_type, conf, reasoning = RelationEngine.classify_relation(claim_a, claim_b)
    assert rel_type == "SUPPORTS"
    assert conf >= 0.70

def test_relation_classification_contradicts():
    claim_a = "retrieval augmented generation prevents model hallucination"
    claim_b = "retrieval augmented generation does not prevent hallucination under conflicting priors"
    rel_type, conf, reasoning = RelationEngine.classify_relation(claim_a, claim_b)
    assert rel_type == "CONTRADICTS"
    assert conf >= 0.70

def test_api_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

def test_reset_corpus():
    res = client.post("/api/corpus/reset")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"

def test_dashboard_stats():
    res = client.get("/api/dashboard/stats")
    assert res.status_code == 200
    stats = res.json()
    assert "total_papers" in stats
    assert "total_claims" in stats

