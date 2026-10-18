import re
import uuid
from typing import Tuple
from sqlalchemy.orm import Session
from ..models.schema import Claim, ClaimRelation, Evidence
from .embedding_service import EmbeddingService


class RelationEngine:
    @staticmethod
    def _token_set(text: str) -> set:
        stopwords = {"the", "a", "an", "is", "are", "in", "on", "to", "for", "with", "that", "this", "and", "or", "of"}
        words = re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())
        return {w for w in words if w not in stopwords}

    @classmethod
    def compute_similarity(cls, text_a: str, text_b: str) -> float:
        dense_sim = EmbeddingService.compute_similarity(text_a, text_b)
        set_a, set_b = cls._token_set(text_a), cls._token_set(text_b)
        jaccard = len(set_a & set_b) / len(set_a | set_b) if (set_a and set_b) else 0.0
        return float((dense_sim * 0.70) + (jaccard * 0.30))

    @classmethod
    def classify_relation(cls, claim_a_text: str, claim_b_text: str) -> Tuple[str, float, str]:
        sim = cls.compute_similarity(claim_a_text, claim_b_text)
        neg_terms = ["not", "fails", "contradicts", "disproves", "cannot", "inferior"]
        has_neg_a = any(t in claim_a_text.lower() for t in neg_terms)
        has_neg_b = any(t in claim_b_text.lower() for t in neg_terms)

        if 0.15 <= sim < 0.85 and (has_neg_a != has_neg_b):
            return ("CONTRADICTS", round(min(0.95, 0.70 + sim * 0.5), 2), "Opposing polarity detected.")
        if sim >= 0.22:
            return ("SUPPORTS", round(min(0.95, 0.70 + sim * 0.5), 2), "Concordant scientific findings.")
        return ("", 0.0, "")

    @classmethod
    def analyze_corpus_relations(cls, db: Session, target_paper_id: int = None) -> int:
        new_claims = db.query(Claim).filter(Claim.paper_id == target_paper_id).all() if target_paper_id else db.query(Claim).all()
        all_claims = db.query(Claim).all()
        created = 0
        for ca in new_claims:
            for cb in all_claims:
                if ca.id == cb.id or ca.paper_id == cb.paper_id:
                    continue
                rel_type, conf, reasoning = cls.classify_relation(ca.normalized_text or ca.claim_text, cb.normalized_text or cb.claim_text)
                if rel_type and conf >= 0.60:
                    ev = db.query(Evidence).filter(Evidence.claim_id == ca.id).first()
                    db.add(ClaimRelation(
                        relation_id=f"rel_{uuid.uuid4().hex[:10]}",
                        source_claim_id=ca.id,
                        target_claim_id=cb.id,
                        relation_type=rel_type,
                        confidence=conf,
                        evidence_id=ev.id if ev else None,
                        reasoning=reasoning,
                    ))
                    created += 1
        db.commit()
        return created
