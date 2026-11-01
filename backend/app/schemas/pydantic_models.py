from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime

# --- Paper Schemas ---
class PaperBase(BaseModel):
    title: str
    authors: Optional[str] = None
    year: Optional[int] = None
    doi: Optional[str] = None
    abstract: Optional[str] = None

class PaperCreate(PaperBase):
    paper_id: Optional[str] = None
    file_path: Optional[str] = None

class PaperResponse(PaperBase):
    id: int
    paper_id: str
    file_path: Optional[str] = None
    processing_status: str
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    claims_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)

# --- Evidence Schemas ---
class EvidenceResponse(BaseModel):
    id: int
    evidence_id: str
    claim_id: int
    paper_id: int
    text: str
    page_section: Optional[str] = None
    extraction_confidence: float
    paper_title: Optional[str] = None
    paper_doi: Optional[str] = None
    paper_year: Optional[int] = None
    paper_custom_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

# --- Claim Schemas ---
class ClaimBase(BaseModel):
    claim_text: str
    normalized_text: Optional[str] = None
    claim_type: str = "finding"
    confidence: float = 1.0
    section_location: Optional[str] = None

class ClaimCreate(ClaimBase):
    paper_id: int
    evidence_text: Optional[str] = None

class ClaimResponse(ClaimBase):
    id: int
    claim_id: str
    paper_id: int
    paper_title: Optional[str] = None
    paper_year: Optional[int] = None
    created_at: Optional[datetime] = None
    evidence_items: List[EvidenceResponse] = []
    supports_count: Optional[int] = 0
    contradicts_count: Optional[int] = 0
    extends_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)

# --- Relation Schemas ---
class ClaimRelationBase(BaseModel):
    source_claim_id: int
    target_claim_id: int
    relation_type: str  # SUPPORTS, CONTRADICTS, EXTENDS
    confidence: float = 0.85
    reasoning: Optional[str] = None

class ClaimRelationCreate(ClaimRelationBase):
    evidence_id: Optional[int] = None

class ClaimRelationResponse(ClaimRelationBase):
    id: int
    relation_id: str
    evidence_id: Optional[int] = None
    source_claim_text: Optional[str] = None
    target_claim_text: Optional[str] = None
    source_paper_title: Optional[str] = None
    target_paper_title: Optional[str] = None
    source_paper_doi: Optional[str] = None
    target_paper_doi: Optional[str] = None
    source_paper_id: Optional[str] = None
    target_paper_id: Optional[str] = None
    source_paper_year: Optional[int] = None
    target_paper_year: Optional[int] = None
    opposing_claim_text: Optional[str] = None
    opposing_paper_title: Optional[str] = None
    opposing_paper_doi: Optional[str] = None
    opposing_paper_id: Optional[str] = None
    opposing_paper_db_id: Optional[int] = None
    opposing_paper_year: Optional[int] = None
    opposing_section_location: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

# --- Concept Schemas ---
class ConceptResponse(BaseModel):
    id: int
    concept_id: str
    name: str
    category: str
    confidence: float
    paper_id: int

    model_config = ConfigDict(from_attributes=True)

# --- Graph Visualization Schema ---
class GraphNode(BaseModel):
    id: str
    label: str
    type: str # 'claim', 'paper', 'concept'
    data: Dict[str, Any] = {}

class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str # 'SUPPORTS', 'CONTRADICTS', 'EXTENDS', 'CITES', 'CONTAINS_CLAIM'
    type: str
    confidence: Optional[float] = 1.0
    data: Dict[str, Any] = {}

class GraphDataResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]

# --- Conflict Detection Schema ---
class ConflictItem(BaseModel):
    claim_id: str
    claim_text: str
    paper_title: str
    paper_id: Optional[str] = None
    paper_db_id: Optional[int] = None
    paper_doi: Optional[str] = None
    paper_year: Optional[int] = None
    section_location: Optional[str] = None
    supporting_relations: List[ClaimRelationResponse]
    contradicting_relations: List[ClaimRelationResponse]
    severity: str # high, medium, low

# --- Research Gap Schema ---
class ResearchGapItem(BaseModel):
    gap_id: str
    title: str
    description: str
    category: str # 'isolated_claim', 'unverified_finding', 'disconnected_concept', 'conflicted_consensus'
    supporting_context: Optional[str] = None
    associated_claims: List[str] = []

# --- Q&A / Synthesis Schema ---
class QARequest(BaseModel):
    question: str
    top_k: int = 5

class QAResponse(BaseModel):
    question: str
    answer: str
    confidence: float
    provenance_sources: List[Dict[str, Any]] = []

# --- Annotation Schema ---
class AnnotationCreate(BaseModel):
    target_type: str # 'claim', 'relation'
    target_id: str
    user_action: str # 'verify', 'correct', 'reject', 'note'
    corrected_value: Optional[str] = None
    comment: Optional[str] = None

class AnnotationResponse(BaseModel):
    id: int
    annotation_id: str
    target_type: str
    target_id: str
    user_action: str
    corrected_value: Optional[str] = None
    comment: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

# --- Dashboard Stats ---
class DashboardStatsResponse(BaseModel):
    total_papers: int
    total_claims: int
    total_relations: int
    supports_count: int
    contradicts_count: int
    extends_count: int
    total_conflicts: int
    total_gaps: int
    processing_status: Dict[str, int]

# --- System / AI Configuration ---
class SystemConfigRequest(BaseModel):
    gemini_api_key: Optional[str] = None
    scraper_api_key: Optional[str] = None
    scholar_api_key: Optional[str] = None
    embedding_model: Optional[str] = None


class SystemConfigResponse(BaseModel):
    embedding_model: str
    retrieval_strategy: str
    llm_provider: str
    gemini_configured: bool
    scraper_configured: bool = False
    scraper_api_key_masked: Optional[str] = None


# --- Gemini Claim Searcher Schemas ---
class ClaimSearchRequest(BaseModel):
    claim: str
    top_k: int = 8

class ClaimSearchMatch(BaseModel):
    claim_id: str
    claim_text: str
    claim_type: str
    confidence: float
    paper_title: str
    paper_year: Optional[int] = None
    paper_doi: Optional[str] = None
    section_location: Optional[str] = None
    evidence_passage: Optional[str] = None
    relevance_score: float
    relation_hint: Optional[str] = None  # SUPPORTS / CONTRADICTS / EXTENDS / RELATED

class ClaimSearchResponse(BaseModel):
    query_claim: str
    matches: List[ClaimSearchMatch]
    synthesis: str
    synthesis_confidence: float
    model_used: str
    total_corpus_claims: int

