export interface Paper {
  id: number;
  paper_id: string;
  title: string;
  authors: string | null;
  year: number | null;
  doi: string | null;
  abstract: string | null;
  file_path: string | null;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string | null;
  claims_count: number;
}

export interface EvidenceItem {
  id: number;
  evidence_id: string;
  claim_id: number;
  paper_id: number;
  text: string;
  page_section: string | null;
  extraction_confidence: number;
  paper_title: string | null;
  paper_doi?: string | null;
  paper_year?: number | null;
  paper_custom_id?: string | null;
}

export interface Claim {
  id: number;
  claim_id: string;
  paper_id: number;
  paper_title?: string;
  paper_year?: number;
  claim_text: string;
  normalized_text: string | null;
  claim_type: 'finding' | 'method' | 'limitation' | 'hypothesis';
  confidence: number;
  section_location: string | null;
  created_at?: string;
  evidence_items: EvidenceItem[];
  supports_count?: number;
  contradicts_count?: number;
  extends_count?: number;
}

export interface ClaimRelation {
  id: number;
  relation_id: string;
  source_claim_id: number;
  target_claim_id: number;
  relation_type: 'SUPPORTS' | 'CONTRADICTS' | 'EXTENDS';
  confidence: number;
  evidence_id: number | null;
  reasoning: string | null;
  source_claim_text?: string;
  target_claim_text?: string;
  source_paper_title?: string;
  target_paper_title?: string;
  source_paper_doi?: string | null;
  target_paper_doi?: string | null;
  source_paper_id?: string | null;
  target_paper_id?: string | null;
  source_paper_year?: number | null;
  target_paper_year?: number | null;
  source_paper_db_id?: number | null;
  target_paper_db_id?: number | null;
  opposing_claim_text?: string;
  opposing_paper_title?: string;
  opposing_paper_doi?: string | null;
  opposing_paper_id?: string | null;
  opposing_paper_db_id?: number | null;
  opposing_paper_year?: number | null;
  source_section_location?: string | null;
  target_section_location?: string | null;
  opposing_section_location?: string | null;
  created_at?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'claim' | 'paper' | 'concept';
  data: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: string;
  confidence?: number;
  data: Record<string, any>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ConflictItem {
  claim_id: string;
  claim_text: string;
  paper_title: string;
  paper_id?: string | null;
  paper_db_id?: number | null;
  paper_doi?: string | null;
  paper_year?: number | null;
  section_location?: string | null;
  severity: 'high' | 'medium' | 'low';
  supporting_relations: ClaimRelation[];
  contradicting_relations: ClaimRelation[];
}

export interface PdfViewerTarget {
  paperId: string | number;
  paperTitle: string;
  page?: number;
  section?: string;
  claimText?: string;
  evidenceSnippet?: string;
  paperDoi?: string | null;
  paperYear?: number | null;
}

export interface ResearchGapItem {
  gap_id: string;
  title: string;
  description: string;
  category: 'isolated_claim' | 'unverified_finding' | 'disconnected_concept' | 'unresolved_limitation';
  supporting_context?: string;
  associated_claims: string[];
}

export interface DashboardStats {
  total_papers: number;
  total_claims: number;
  total_relations: number;
  supports_count: number;
  contradicts_count: number;
  extends_count: number;
  total_conflicts: number;
  total_gaps: number;
  processing_status: Record<string, number>;
}

export interface QAResponse {
  question: string;
  answer: string;
  confidence: number;
  model_used?: string;
  provenance_sources: Array<{
    claim_id: string;
    claim_text: string;
    paper_title: string;
    paper_year: number | null;
    doi: string | null;
    evidence_passage: string;
    section: string | null;
    relevance_score: number;
  }>;
}

export interface Annotation {
  id: number;
  annotation_id: string;
  target_type: 'claim' | 'relation';
  target_id: string;
  user_action: 'verify' | 'correct' | 'reject' | 'note';
  corrected_value?: string;
  comment?: string;
  created_at?: string;
}

export interface ClaimSearchMatch {
  claim_id: string;
  claim_text: string;
  claim_type: string;
  confidence: number;
  paper_title: string;
  paper_year: number | null;
  paper_doi: string | null;
  section_location: string | null;
  evidence_passage: string | null;
  relevance_score: number;
  relation_hint: string | null; // SUPPORTS / CONTRADICTS / EXTENDS / RELATED
}

export interface ClaimSearchResponse {
  query_claim: string;
  matches: ClaimSearchMatch[];
  synthesis: string;
  synthesis_confidence: number;
  model_used: string;
  total_corpus_claims: number;
}
