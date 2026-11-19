from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from ..models.schema import Paper, Claim, ClaimRelation, Concept, Citation

class GraphService:
    @staticmethod
    def get_full_graph(
        db: Session,
        relation_types: Optional[List[str]] = None,
        min_confidence: float = 0.0,
        node_types: Optional[List[str]] = None,
        year_min: Optional[int] = None,
        year_max: Optional[int] = None,
        search_query: Optional[str] = None,
        edge_limit: int = 500
    ) -> Dict[str, Any]:
        """
        Builds a Cytoscape/React Flow compatible knowledge graph with typed nodes and edges.
        Allows multi-criteria filtering by confidence, relation type, year, and search keywords.
        """
        nodes = []
        edges = []

        allowed_node_types = set(node_types or ["paper", "claim", "concept"])
        allowed_rel_types = set(relation_types or ["SUPPORTS", "CONTRADICTS", "EXTENDS"])

        # 1. Fetch Papers
        papers_query = db.query(Paper)
        if year_min:
            papers_query = papers_query.filter(Paper.year >= year_min)
        if year_max:
            papers_query = papers_query.filter(Paper.year <= year_max)
        papers = papers_query.all()
        paper_id_map = {p.id: p for p in papers}

        if "paper" in allowed_node_types:
            for p in papers:
                nodes.append({
                    "id": f"paper_{p.id}",
                    "label": p.title[:45] + "..." if len(p.title) > 45 else p.title,
                    "type": "paper",
                    "data": {
                        "paper_id": p.paper_id,
                        "title": p.title,
                        "year": p.year,
                        "authors": p.authors,
                        "abstract": p.abstract[:200] if p.abstract else "",
                        "doi": p.doi,
                        "status": p.processing_status
                    }
                })

        # 2. Fetch Claims
        claims_query = db.query(Claim)
        if min_confidence > 0:
            claims_query = claims_query.filter(Claim.confidence >= min_confidence)
        claims = claims_query.all()
        claim_id_map = {c.id: c for c in claims if c.paper_id in paper_id_map}

        if "claim" in allowed_node_types:
            for c in claims:
                if c.paper_id not in paper_id_map:
                    continue

                # Filter by keyword if search_query provided
                if search_query:
                    sq = search_query.lower()
                    if sq not in c.claim_text.lower() and sq not in (c.normalized_text or "").lower():
                        continue

                paper = paper_id_map[c.paper_id]
                nodes.append({
                    "id": f"claim_{c.id}",
                    "label": c.normalized_text[:40] + "..." if c.normalized_text and len(c.normalized_text) > 40 else c.claim_text[:40] + "...",
                    "type": "claim",
                    "data": {
                        "claim_id": c.claim_id,
                        "claim_text": c.claim_text,
                        "normalized_text": c.normalized_text,
                        "claim_type": c.claim_type,
                        "confidence": c.confidence,
                        "section": c.section_location,
                        "paper_title": paper.title,
                        "paper_year": paper.year
                    }
                })

                # Connect Paper -> Claim if both are active
                if "paper" in allowed_node_types:
                    edges.append({
                        "id": f"edge_pc_{paper.id}_{c.id}",
                        "source": f"paper_{paper.id}",
                        "target": f"claim_{c.id}",
                        "label": "CONTAINS_CLAIM",
                        "type": "contains",
                        "confidence": 1.0,
                        "data": {"relation": "CONTAINS"}
                    })

        # 3. Fetch Concepts
        if "concept" in allowed_node_types:
            concepts = db.query(Concept).all()
            for conc in concepts:
                if conc.paper_id in paper_id_map:
                    node_id = f"concept_{conc.name.lower().replace(' ', '_')}"
                    if not any(n["id"] == node_id for n in nodes):
                        nodes.append({
                            "id": node_id,
                            "label": conc.name,
                            "type": "concept",
                            "data": {
                                "name": conc.name,
                                "category": conc.category,
                                "confidence": conc.confidence
                            }
                        })
                    # Edge from paper to concept only if paper node exists
                    if "paper" in allowed_node_types:
                        edges.append({
                            "id": f"edge_concept_{conc.paper_id}_{node_id}",
                            "source": f"paper_{conc.paper_id}",
                            "target": node_id,
                            "label": "COVERS_CONCEPT",
                            "type": "concept_rel",
                            "confidence": conc.confidence,
                            "data": {"category": conc.category}
                        })

        # Set of active node IDs for edge connectivity invariants
        active_node_ids = {n["id"] for n in nodes}

        # 4. Fetch Claim Relations (SUPPORTS, CONTRADICTS, EXTENDS)
        # Prioritize all CONTRADICTS (scientific tensions), then top-confidence SUPPORTS and EXTENDS
        rel_q = db.query(ClaimRelation).filter(ClaimRelation.relation_type.in_(allowed_rel_types))
        if min_confidence > 0:
            rel_q = rel_q.filter(ClaimRelation.confidence >= min_confidence)

        contradicts_list = rel_q.filter(ClaimRelation.relation_type == "CONTRADICTS").order_by(ClaimRelation.confidence.desc()).limit(250).all()
        others_list = rel_q.filter(ClaimRelation.relation_type != "CONTRADICTS").order_by(ClaimRelation.confidence.desc()).limit(edge_limit).all()
        relations = contradicts_list + others_list

        for r in relations:
            src_node_id = f"claim_{r.source_claim_id}"
            tgt_node_id = f"claim_{r.target_claim_id}"

            # Strict Invariant: both endpoints must be active in the rendered nodes list
            if src_node_id in active_node_ids and tgt_node_id in active_node_ids:
                src_c = claim_id_map.get(r.source_claim_id)
                tgt_c = claim_id_map.get(r.target_claim_id)
                if not src_c or not tgt_c:
                    continue

                src_p = paper_id_map.get(src_c.paper_id)
                tgt_p = paper_id_map.get(tgt_c.paper_id)

                edges.append({
                    "id": f"rel_{r.id}",
                    "source": src_node_id,
                    "target": tgt_node_id,
                    "label": r.relation_type,
                    "type": r.relation_type.lower(),
                    "confidence": r.confidence,
                    "data": {
                        "relation_type": r.relation_type,
                        "confidence": r.confidence,
                        "reasoning": r.reasoning,
                        "source_claim_text": src_c.claim_text,
                        "target_claim_text": tgt_c.claim_text,
                        "source_paper_title": src_p.title if src_p else "Unknown Paper",
                        "target_paper_title": tgt_p.title if tgt_p else "Unknown Paper",
                        "source_paper_doi": src_p.doi if src_p else None,
                        "target_paper_doi": tgt_p.doi if tgt_p else None,
                        "source_paper_id": src_p.paper_id if src_p else None,
                        "target_paper_id": tgt_p.paper_id if tgt_p else None,
                        "source_paper_year": src_p.year if src_p else None,
                        "target_paper_year": tgt_p.year if tgt_p else None
                    }
                })

        # 5. Fetch Citations
        citations = db.query(Citation).all()
        for cit in citations:
            src_node_id = f"paper_{cit.source_paper_id}"
            tgt_node_id = f"paper_{cit.target_paper_id}"
            if src_node_id in active_node_ids and tgt_node_id in active_node_ids:
                if "paper" in allowed_node_types:
                    edges.append({
                        "id": f"cit_{cit.id}",
                        "source": src_node_id,
                        "target": tgt_node_id,
                        "label": "CITES",
                        "type": "citation",
                        "confidence": 1.0,
                        "data": {"metadata": cit.citation_metadata}
                    })

        # Final structural invariant filter: eliminate any dangling edges
        final_node_ids = {n["id"] for n in nodes}
        valid_edges = [
            e for e in edges
            if e["source"] in final_node_ids and e["target"] in final_node_ids
        ]

        return {"nodes": nodes, "edges": valid_edges}
