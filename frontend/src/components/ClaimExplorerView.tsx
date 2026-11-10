import React, { useState, useMemo, useEffect } from 'react';
import type { Claim, Paper, PdfViewerTarget } from '../types';
import { 
  Search, ChevronDown, ChevronUp, 
  CheckCircle, XCircle, GitCommit, Edit3, ShieldAlert, Globe,
  Quote, FileText, ChevronLeft, ChevronRight, ExternalLink, BookOpen,
  Layers, X, Filter
} from 'lucide-react';

interface Props {
  claims: Claim[];
  papers?: Paper[];
  selectedPaperId?: number | string | null;
  onSelectPaper?: (paperId: number | string | null) => void;
  onOpenAnnotation: (claimId: string, initialText?: string) => void;
  onSearchChange: (query: string) => void;
  searchQuery: string;
  onFindRelatedPapers?: (query: string) => void;
  onOpenPdf?: (target: PdfViewerTarget) => void;
}

export const ClaimExplorerView: React.FC<Props> = ({
  claims, papers = [], selectedPaperId = null, onSelectPaper,
  onOpenAnnotation, onSearchChange, searchQuery, onFindRelatedPapers, onOpenPdf
}) => {
  const [selectedType, setSelectedType] = useState<string>('all');
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 20;

  // Find active paper object if selectedPaperId is set
  const activePaper = useMemo(() => {
    if (!selectedPaperId || !papers) return null;
    return papers.find(p => p.id === selectedPaperId || p.paper_id === selectedPaperId) || null;
  }, [selectedPaperId, papers]);

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedType, searchQuery, selectedPaperId]);

  const filteredClaims = useMemo(() => {
    return claims.filter(c => {
      if (selectedType !== 'all' && c.claim_type !== selectedType) return false;
      if (selectedPaperId !== null && selectedPaperId !== undefined) {
        if (activePaper) {
          if (c.paper_id !== activePaper.id) return false;
        } else if (typeof selectedPaperId === 'number' && c.paper_id !== selectedPaperId) {
          return false;
        }
      }
      return true;
    });
  }, [claims, selectedType, selectedPaperId, activePaper]);

  const totalPages = Math.ceil(filteredClaims.length / pageSize) || 1;
  const paginatedClaims = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredClaims.slice(start, start + pageSize);
  }, [filteredClaims, currentPage, pageSize]);

  const getPaperUrl = (title?: string, doi?: string | null) => {
    if (doi) return doi.startsWith('http') ? doi : `https://doi.org/${doi}`;
    if (title) return `https://scholar.google.com/scholar?q=${encodeURIComponent(title)}`;
    return '#';
  };

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Scientific Claim Explorer & Evidence</h2>
          <p className="section-desc">
            Explore normalized propositions, verify passage-level grounding, and trace cross-paper consensus or disputes.
          </p>
        </div>
      </div>

      {/* Active Paper Filter Banner */}
      {activePaper && (
        <div style={{
          padding: '0.85rem 1.25rem',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--accent-indigo)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Layers size={18} color="var(--accent-indigo)" />
            <span style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>Filtered by Paper:</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {activePaper.title} {activePaper.year ? `(${activePaper.year})` : ''}
            </span>
            <span className="badge badge-finding" style={{ fontSize: '0.74rem' }}>
              {filteredClaims.length} Claims
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {onOpenPdf && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onOpenPdf({
                  paperId: activePaper.id,
                  paperTitle: activePaper.title,
                  page: 1,
                  paperYear: activePaper.year,
                  paperDoi: activePaper.doi
                })}
                style={{ fontSize: '0.78rem' }}
              >
                <BookOpen size={13} color="var(--accent-indigo)" /> Read PDF
              </button>
            )}
            {onSelectPaper && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onSelectPaper(null)}
                title="Clear paper filter"
                style={{ fontSize: '0.78rem' }}
              >
                <X size={13} /> Clear Filter
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="modern-card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Search Input */}
        <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          <input 
            type="text" 
            className="input-field"
            placeholder="Search claims, propositions, or empirical terms..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ paddingLeft: '2.25rem', height: '38px', fontSize: '0.86rem' }}
          />
        </div>

        {/* Paper Selector Dropdown */}
        {papers && papers.length > 0 && onSelectPaper && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '200px' }}>
            <Filter size={15} color="var(--text-muted)" />
            <select
              className="input-field"
              value={selectedPaperId !== null && selectedPaperId !== undefined ? String(selectedPaperId) : ''}
              onChange={(e) => onSelectPaper(e.target.value ? Number(e.target.value) || e.target.value : null)}
              style={{ height: '38px', fontSize: '0.84rem', cursor: 'pointer' }}
            >
              <option value="">All Papers ({papers.length})</option>
              {papers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title.length > 40 ? p.title.substring(0, 40) + '...' : p.title} ({p.claims_count || 0})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Type Filter Segmented Control */}
        <div className="segmented-control">
          {['all', 'finding', 'method', 'limitation', 'hypothesis'].map(t => (
            <button
              key={t}
              className={`segmented-btn ${selectedType === t ? 'active' : ''}`}
              onClick={() => setSelectedType(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Claims List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredClaims.length === 0 ? (
          <div className="modern-card" style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              No claims match your criteria
            </div>
            <div style={{ fontSize: '0.84rem' }}>
              Try searching with broader terms or upload more papers to expand the corpus.
            </div>
          </div>
        ) : (
          paginatedClaims.map((claim) => {
            const isExpanded = expandedClaimId === claim.claim_id;
            const hasContradictions = claim.contradicts_count && claim.contradicts_count > 0;

            return (
              <div 
                key={claim.id} 
                className="modern-card"
                style={{
                  borderLeft: hasContradictions 
                    ? '3px solid var(--color-contradicts)' 
                    : '3px solid var(--text-main)',
                  padding: '1.4rem 1.6rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '300px' }}>
                    {/* Top tags */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                      <span className={`badge badge-${claim.claim_type}`}>
                        {claim.claim_type}
                      </span>
                      <span className="mono-font" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Confidence: {Math.round(claim.confidence * 100)}%
                      </span>
                      {claim.paper_title && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <a 
                            href={getPaperUrl(claim.paper_title, claim.evidence_items?.[0]?.paper_doi)}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: '0.78rem',
                              color: 'var(--accent-indigo)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              textDecoration: 'none',
                              fontWeight: 600
                            }}
                            title="Open official publication in DOI registry or Google Scholar"
                          >
                            <FileText size={12} />
                            <span>{claim.paper_title} {claim.paper_year ? `(${claim.paper_year})` : ''}</span>
                            <ExternalLink size={10} />
                          </a>

                          {onOpenPdf && (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                color: 'var(--accent-indigo)'
                              }}
                              onClick={() => {
                                const match = claim.section_location?.match(/page\s*(\d+)/i);
                                const pageNum = match ? parseInt(match[1], 10) : 1;
                                onOpenPdf({
                                  paperId: claim.paper_id,
                                  paperTitle: claim.paper_title || 'Paper',
                                  page: pageNum,
                                  section: claim.section_location || undefined,
                                  claimText: claim.claim_text,
                                  paperYear: claim.paper_year
                                });
                              }}
                              title="Open PDF and jump straight to the grounded page"
                            >
                              <BookOpen size={11} />
                              <span>Read in PDF {claim.section_location ? `(${claim.section_location})` : ''}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Normalized canonical proposition */}
                    {claim.normalized_text && (
                      <div style={{
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        marginBottom: '0.35rem'
                      }}>
                        Proposition: {claim.normalized_text}
                      </div>
                    )}

                    {/* Raw Claim Text */}
                    <div style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: 500, lineHeight: 1.5, marginBottom: '0.85rem' }}>
                      &ldquo;{claim.claim_text}&rdquo;
                    </div>

                    {/* Relationship Counts Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span className="badge badge-supports">
                        <CheckCircle size={12} /> {claim.supports_count || 0} Supports
                      </span>
                      <span className="badge badge-contradicts">
                        <XCircle size={12} /> {claim.contradicts_count || 0} Contradicts
                      </span>
                      <span className="badge badge-extends">
                        <GitCommit size={12} /> {claim.extends_count || 0} Extends
                      </span>
                      {hasContradictions && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-contradicts-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <ShieldAlert size={13} /> Contested by peer literature
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions column */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button 
                      className="btn btn-secondary btn-sm"
                      onClick={() => setExpandedClaimId(isExpanded ? null : claim.claim_id)}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {isExpanded ? 'Hide Evidence' : 'View Evidence'}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onOpenAnnotation(claim.claim_id, claim.normalized_text || claim.claim_text)}
                      title="Annotate or add notes to this claim"
                    >
                      <Edit3 size={13} /> Annotate
                    </button>
                    {onFindRelatedPapers && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => onFindRelatedPapers(claim.normalized_text || claim.claim_text)}
                        title="Search online scholarly databases for papers related to this claim"
                      >
                        <Globe size={13} /> Find Papers
                      </button>
                    )}
                  </div>
                </div>

                {/* Evidence Drawer */}
                {isExpanded && (
                  <div style={{
                    marginTop: '1.25rem',
                    paddingTop: '1.25rem',
                    borderTop: '1px solid var(--border-subtle)',
                    animation: 'fadeIn 0.2s ease-in'
                  }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Quote size={13} /> Grounding Evidence Passages
                    </div>
                    {claim.evidence_items.length === 0 ? (
                      <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        No isolated excerpt stored; anchored directly to paper section context.
                      </div>
                    ) : (
                      claim.evidence_items.map((ev) => (
                        <div 
                          key={ev.id}
                          style={{
                            background: 'var(--bg-subtle)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            padding: '1rem',
                            marginBottom: '0.65rem'
                          }}
                        >
                          <div style={{ fontSize: '0.88rem', color: 'var(--text-main)', fontStyle: 'italic', marginBottom: '0.5rem', lineHeight: 1.6 }}>
                            &ldquo;{ev.text}&rdquo;
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                              <span>Location: <span className="mono-font" style={{ color: 'var(--text-secondary)' }}>{ev.page_section || 'Document body'}</span></span>
                              
                              {onOpenPdf && (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{
                                    fontSize: '0.72rem',
                                    padding: '2px 8px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    color: 'var(--accent-indigo)'
                                  }}
                                  onClick={() => {
                                    const match = (ev.page_section || claim.section_location)?.match(/page\s*(\d+)/i);
                                    const pageNum = match ? parseInt(match[1], 10) : 1;
                                    onOpenPdf({
                                      paperId: claim.paper_id,
                                      paperTitle: claim.paper_title || 'Paper',
                                      page: pageNum,
                                      section: ev.page_section || claim.section_location || undefined,
                                      claimText: claim.claim_text,
                                      evidenceSnippet: ev.text,
                                      paperYear: claim.paper_year,
                                      paperDoi: ev.paper_doi
                                    });
                                  }}
                                  title="Read PDF and highlight this exact sentence"
                                >
                                  <BookOpen size={11} />
                                  <span>Locate Sentence in PDF</span>
                                </button>
                              )}
                            </div>

                            {claim.paper_title && (
                              <a
                                href={getPaperUrl(claim.paper_title, ev.paper_doi)}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  color: 'var(--accent-indigo)',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  textDecoration: 'none'
                                }}
                                title="View paper in official registry or Google Scholar"
                              >
                                <FileText size={11} />
                                <span>{claim.paper_title}</span>
                                <ExternalLink size={10} />
                              </a>
                            )}

                            <span>Provenance Confidence: <span className="mono-font" style={{ color: 'var(--text-secondary)' }}>{Math.round(ev.extraction_confidence * 100)}%</span></span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Bar */}
      {filteredClaims.length > pageSize && (
        <div className="modern-card" style={{
          marginTop: '1.5rem',
          padding: '0.85rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Showing <strong style={{ color: 'var(--text-main)' }}>{(currentPage - 1) * pageSize + 1}</strong> &ndash; <strong style={{ color: 'var(--text-main)' }}>{Math.min(currentPage * pageSize, filteredClaims.length)}</strong> of <strong style={{ color: 'var(--text-main)' }}>{filteredClaims.length}</strong> claims
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={currentPage === 1}
              onClick={() => {
                setCurrentPage(p => Math.max(1, p - 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              style={{ opacity: currentPage === 1 ? 0.45 : 1 }}
            >
              <ChevronLeft size={14} /> Previous
            </button>

            <span style={{ fontSize: '0.82rem', padding: '0 0.5rem', color: 'var(--text-muted)' }}>
              Page <strong style={{ color: 'var(--text-main)' }}>{currentPage}</strong> of <strong style={{ color: 'var(--text-main)' }}>{totalPages}</strong>
            </span>

            <button
              className="btn btn-secondary btn-sm"
              disabled={currentPage === totalPages}
              onClick={() => {
                setCurrentPage(p => Math.min(totalPages, p + 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              style={{ opacity: currentPage === totalPages ? 0.45 : 1 }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClaimExplorerView;
