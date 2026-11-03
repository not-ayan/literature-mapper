import type {
  DashboardStats, Paper, Claim, GraphData,
  ConflictItem, ResearchGapItem, QAResponse, Annotation,
  ClaimSearchResponse
} from './types';

const API_BASE = 'http://localhost:8000/api';

export const api = {
  async getDashboardStats(): Promise<DashboardStats> {
    const res = await fetch(`${API_BASE}/dashboard/stats`);
    if (!res.ok) throw new Error('Failed to fetch dashboard statistics');
    return res.json();
  },

  async getPapers(): Promise<Paper[]> {
    const res = await fetch(`${API_BASE}/papers`);
    if (!res.ok) throw new Error('Failed to fetch papers');
    return res.json();
  },

  async uploadPaper(file: File): Promise<Paper> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/papers/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to upload paper');
    }
    return res.json();
  },

  async deletePaper(paperId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/papers/${paperId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete paper');
  },

  async resetCorpus(): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/corpus/reset`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to reset corpus');
    return res.json();
  },

  async getClaims(query?: string, claimType?: string, minConfidence?: number, paperId?: string | number): Promise<Claim[]> {
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    if (claimType) params.append('claim_type', claimType);
    if (minConfidence !== undefined) params.append('min_confidence', minConfidence.toString());
    if (paperId !== undefined && paperId !== null && paperId !== '') params.append('paper_id', paperId.toString());

    const res = await fetch(`${API_BASE}/claims?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch claims');
    return res.json();
  },

  async getPaperClaims(paperIdentifier: string | number): Promise<Claim[]> {
    const res = await fetch(`${API_BASE}/papers/${paperIdentifier}/claims`);
    if (!res.ok) throw new Error('Failed to fetch claims for paper');
    return res.json();
  },

  async getClaimDetail(claimId: string): Promise<Claim> {
    const res = await fetch(`${API_BASE}/claims/${claimId}`);
    if (!res.ok) throw new Error('Failed to fetch claim detail');
    return res.json();
  },

  async getGraphData(params?: {
    relationTypes?: string[];
    nodeTypes?: string[];
    minConfidence?: number;
    query?: string;
  }): Promise<GraphData> {
    const urlParams = new URLSearchParams();
    if (params?.relationTypes?.length) urlParams.append('relation_types', params.relationTypes.join(','));
    if (params?.nodeTypes?.length) urlParams.append('node_types', params.nodeTypes.join(','));
    if (params?.minConfidence !== undefined) urlParams.append('min_confidence', params.minConfidence.toString());
    if (params?.query) urlParams.append('query', params.query);

    const res = await fetch(`${API_BASE}/graph?${urlParams.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch graph data');
    return res.json();
  },

  async getConflicts(): Promise<ConflictItem[]> {
    const res = await fetch(`${API_BASE}/conflicts`);
    if (!res.ok) throw new Error('Failed to fetch conflicts');
    return res.json();
  },

  async getResearchGaps(): Promise<ResearchGapItem[]> {
    const res = await fetch(`${API_BASE}/gaps`);
    if (!res.ok) throw new Error('Failed to fetch research gaps');
    return res.json();
  },

  async askQuestion(question: string, topK: number = 5): Promise<QAResponse> {
    const res = await fetch(`${API_BASE}/qa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, top_k: topK }),
    });
    if (!res.ok) throw new Error('Failed to synthesize literature answer');
    return res.json();
  },

  async createAnnotation(annotation: {
    target_type: 'claim' | 'relation';
    target_id: string;
    user_action: string;
    corrected_value?: string;
    comment?: string;
  }): Promise<Annotation> {
    const res = await fetch(`${API_BASE}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(annotation),
    });
    if (!res.ok) throw new Error('Failed to submit annotation');
    return res.json();
  },

  async getAnnotations(): Promise<Annotation[]> {
    const res = await fetch(`${API_BASE}/annotations`);
    if (!res.ok) throw new Error('Failed to fetch annotations');
    return res.json();
  },

  getExportUrl(format: 'json' | 'gexf'): string {
    return `${API_BASE}/export?format=${format}`;
  },

  async getPageText(paperIdentifier: string | number, page: number): Promise<{
    paper_id: number;
    paper_custom_id: string;
    title: string;
    page: number;
    total_pages: number;
    text: string;
  }> {
    const res = await fetch(`${API_BASE}/papers/${encodeURIComponent(String(paperIdentifier))}/pages/${page}/text`);
    if (!res.ok) throw new Error('Failed to fetch page text');
    return res.json();
  },

  async getSystemConfig(): Promise<{
    embedding_model: string;
    retrieval_strategy: string;
    llm_provider: string;
    gemini_configured: boolean;
    scraper_configured: boolean;
    scraper_api_key_masked?: string;
  }> {
    const res = await fetch(`${API_BASE}/system/config`);
    if (!res.ok) throw new Error('Failed to fetch system config');
    return res.json();
  },

  async updateSystemConfig(config: {
    gemini_api_key?: string;
    scraper_api_key?: string;
    scholar_api_key?: string;
    embedding_model?: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/system/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    if (!res.ok) throw new Error('Failed to update system config');
    return res.json();
  },

  async verifyPaper(paper: any, keys?: { scraperApiKey?: string; scholarApiKey?: string }): Promise<{
    valid: boolean;
    readable: boolean;
    pages?: number;
    verified_id?: string;
    title?: string;
    filename?: string;
    size_bytes?: number;
    preview?: string;
    reason?: string;
    source?: string;
  }> {
    const res = await fetch(`${API_BASE}/crawler/verify-paper`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...paper,
        scraper_api_key: keys?.scraperApiKey,
        scholar_api_key: keys?.scholarApiKey
      })
    });
    if (!res.ok) return { valid: false, readable: false, reason: `HTTP error ${res.status}` };
    return res.json();
  },

  async ingestVerifiedPaper(verifiedId: string): Promise<Paper> {
    const res = await fetch(`${API_BASE}/crawler/ingest-verified/${verifiedId}`, {
      method: 'POST'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to ingest verified paper');
    }
    return res.json();
  },

  getVerifiedDownloadUrl(verifiedId: string): string {
    return `${API_BASE}/crawler/download-verified/${verifiedId}`;
  },

  async searchClaims(claim: string, topK: number = 8): Promise<ClaimSearchResponse> {
    const res = await fetch(`${API_BASE}/claims/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim, top_k: topK }),
    });
    if (!res.ok) throw new Error('Failed to search claims');
    return res.json();
  }
};

