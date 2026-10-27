from typing import Dict, Any, List
from sqlalchemy.orm import Session
from ..models.schema import Claim, Evidence, Paper
from .hybrid_retriever import HybridRetriever
from .gemini_service import GeminiService

class QAService:
    @staticmethod
    def answer_question(db: Session, question: str, top_k: int = 5) -> Dict[str, Any]:
        """
        Synthesizes corpus-grounded literature answers using:
        1. Dense + BM25 Hybrid Retrieval (BGE-M3 + BM25 + Reciprocal Rank Fusion)
        2. Deduplication across duplicate papers/claims
        3. Gemini Flash Cloud Synthesis with strict citation attribution
        """
        all_claims = db.query(Claim).all()
        if not all_claims:
            return {
                "question": question,
                "answer": "The research corpus is currently empty. Upload academic PDFs or discover papers online to begin asking literature questions.",
                "confidence": 0.0,
                "provenance_sources": []
            }

        # Prepare candidate items for hybrid retrieval with bulk pre-fetch
        papers_map = {p.id: p for p in db.query(Paper).all()}
        evidence_list = db.query(Evidence).all()
        evidence_map = {}
        for ev in evidence_list:
            if ev.claim_id not in evidence_map:
                evidence_map[ev.claim_id] = ev

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

        # Run Tri-Hybrid Retrieval + Re-ranking over candidate pool
        # Request more candidates (top_k * 4) to allow deduplication of identical claims/papers
        ranked_results = HybridRetriever.retrieve(
            query=question,
            candidate_items=candidates,
            text_key="text",
            top_k=min(len(candidates), top_k * 4)
        )

        provenance = []
        seen_claim_texts = set()

        for score, item in ranked_results:
            claim: Claim = item["claim"]
            paper: Paper = item.get("paper")
            ev: Evidence = item.get("evidence")

            # Clean & normalize text for deduplication
            norm_key = (claim.claim_text or "").strip().lower()[:80]
            if norm_key in seen_claim_texts:
                continue
            seen_claim_texts.add(norm_key)

            prov_item = {
                "claim_id": claim.claim_id,
                "claim_text": claim.claim_text,
                "paper_title": paper.title if paper else "Unknown Paper",
                "paper_year": paper.year if paper else None,
                "doi": paper.doi if paper else None,
                "evidence_passage": ev.text if ev else claim.claim_text,
                "section": ev.page_section if ev else claim.section_location,
                "relevance_score": float(score)
            }
            provenance.append(prov_item)
            if len(provenance) >= top_k:
                break

        # Synthesize via Gemini Flash or Local Synthesis
        synthesis = GeminiService.synthesize_answer(
            question=question,
            provenance_sources=provenance
        )

        return {
            "question": question,
            "answer": synthesis["answer"],
            "confidence": float(synthesis["confidence"]),
            "provenance_sources": provenance,
            "model_used": synthesis.get("model_used", "Google Gemini Flash (Cloud)")
        }
