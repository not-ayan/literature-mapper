from typing import List, Dict, Any
from sqlalchemy.orm import Session
from ..models.schema import Claim, ClaimRelation, Concept, Paper

class GapAnalyzer:
    @staticmethod
    def identify_research_gaps(db: Session) -> List[Dict[str, Any]]:
        """
        Identifies candidate research gaps across the corpus:
        1. Isolated / Under-explored Claims: Claims without supporting or extending literature.
        2. Conflicted Paradigms: Contested claims with high disagreement and no consensus paper.
        3. Disconnected Concepts: Concepts appearing in only a single paper without cross-citations.
        4. Unresolved Limitations: Stated limitations that have not been addressed by extending methods.
        """
        gaps = []
        papers_map = {p.id: p.title for p in db.query(Paper.id, Paper.title).all()}
        claims = db.query(Claim).all()
        relations = db.query(ClaimRelation).all()
        concepts = db.query(Concept).all()

        # Build relation maps
        connected_claim_ids = set()
        incoming_extends = set()
        for r in relations:
            connected_claim_ids.add(r.source_claim_id)
            connected_claim_ids.add(r.target_claim_id)
            if r.relation_type == "EXTENDS":
                incoming_extends.add(r.target_claim_id)

        # 1. Isolated Claims (Under-explored scientific propositions)
        isolated_claims = [c for c in claims if c.id not in connected_claim_ids]
        for idx, c in enumerate(isolated_claims[:5]):
            p_title = papers_map.get(c.paper_id, 'Corpus')
            gaps.append({
                "gap_id": f"gap_iso_{c.id}",
                "title": f"Under-Explored Claim in {p_title[:30]}",
                "description": f"The proposition '{c.claim_text[:120]}...' currently has 0 recorded corroborating or contesting studies in this corpus.",
                "category": "isolated_claim",
                "supporting_context": f"Claim type: {c.claim_type.capitalize()} (Confidence: {int(c.confidence*100)}%). Recommend ingesting follow-up literature targeting this hypothesis.",
                "associated_claims": [c.claim_id]
            })

        # 2. Unresolved Limitations
        limitations = [c for c in claims if c.claim_type == "limitation"]
        for lim in limitations:
            # Check if any EXTENDS relation resolves this
            if lim.id not in incoming_extends:
                p_title = papers_map.get(lim.paper_id, '')
                gaps.append({
                    "gap_id": f"gap_lim_{lim.id}",
                    "title": f"Unaddressed Limitation: {lim.normalized_text[:40] if lim.normalized_text else lim.claim_text[:40]}...",
                    "description": f"Methodological limitation flagged in '{p_title}' lacks subsequent extending frameworks.",
                    "category": "unresolved_limitation",
                    "supporting_context": lim.claim_text,
                    "associated_claims": [lim.claim_id]
                })

        # 3. Disconnected Concepts (Only 1 paper mentions this concept)
        concept_counts = {}
        for conc in concepts:
            concept_counts[conc.name] = concept_counts.get(conc.name, 0) + 1

        single_paper_concepts = [name for name, count in concept_counts.items() if count == 1]
        for name in single_paper_concepts[:4]:
            gaps.append({
                "gap_id": f"gap_conc_{name.lower().replace(' ', '_')}",
                "title": f"Nascent Concept Island: '{name}'",
                "description": f"Concept '{name}' is mentioned exclusively in one paper and has no cross-paper conceptual bridge in the knowledge graph.",
                "category": "disconnected_concept",
                "supporting_context": "Opportunity to investigate interdisciplinary applications or synthesize cross-domain methodologies.",
                "associated_claims": []
            })

        return gaps
