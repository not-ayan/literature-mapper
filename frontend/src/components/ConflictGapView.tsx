import React, { useState } from 'react';
import type { ConflictItem, ResearchGapItem, PdfViewerTarget } from '../types';
import { 
  AlertTriangle, Compass, CheckCircle, XCircle, 
  ArrowRight, ShieldCheck, Globe, ExternalLink, FileText, BookOpen
} from 'lucide-react';

interface Props {
  conflicts: ConflictItem[];
  gaps: ResearchGapItem[];
  onExploreClaim: (claimId: string) => void;
  onFindRelatedPapers?: (query: string) => void;
  onOpenPdf?: (target: PdfViewerTarget) => void;
}

export const ConflictGapView: React.FC<Props> = ({ conflicts, gaps, onExploreClaim, onFindRelatedPapers, onOpenPdf }) => {
  const [activeSubTab, setActiveSubTab] = useState<'conflicts' | 'gaps'>('conflicts');

  const getPaperUrl = (title?: string | null, doi?: string | null) => {
    if (doi) {
      return doi.startsWith('http') ? doi : `https://doi.org/${doi}`;
    }
    if (title) {
      return `https://scholar.google.com/scholar?q=${encodeURIComponent(title)}`;
    }
    return '#';
  };

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Contradictions & Research Gaps</h2>
          <p className="section-desc">
            Detect competing scientific evidence across studies and surface unaddressed research gaps with direct literature links.
          </p>
        </div>

        {/* Segmented Pill Navigation */}
        <div className="segmented-control">
          <button 
            className={`segmented-btn ${activeSubTab === 'conflicts' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('conflicts')}
          >
            <AlertTriangle size={14} /> Contradictions ({conflicts.length})
          </button>
          <button 
            className={`segmented-btn ${activeSubTab === 'gaps' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('gaps')}
          >
            <Compass size={14} /> Research Gaps ({gaps.length})
          </button>
        </div>
      </div>

      {activeSubTab === 'conflicts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {conflicts.length === 0 ? (
            <div className="modern-card" style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
              <ShieldCheck size={40} color="var(--color-supports)" style={{ margin: '0 auto 1rem auto' }} />
              <h3 style={{ color: 'var(--text-main)', marginBottom: '0.4rem', fontSize: '1.15rem' }}>No Direct Scientific Contradictions Flagged</h3>
              <p style={{ maxWidth: '500px', margin: '0 auto', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                All extracted claims in the current corpus show concordant evidence without conflicting polarities.
              </p>
            </div>
          ) : (
            conflicts.map((conflict, idx) => (
              <div 
                key={idx}
                className="modern-card"
                style={{
                  borderLeft: '4px solid var(--color-contradicts)',
                  padding: '1.5rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <span className="badge badge-contradicts">
                      <AlertTriangle size={12} /> {conflict.severity.toUpperCase()} SEVERITY CONFLICT
                    </span>

                    {/* Central Origin Paper Link */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <a
                        href={getPaperUrl(conflict.paper_title, conflict.paper_doi)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: '0.82rem',
                          color: 'var(--accent-indigo)',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          background: 'var(--bg-subtle)',
                          padding: '3px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-subtle)'
                        }}
                        title="Open publication in DOI registry or Google Scholar"
                      >
                        <FileText size={13} />
                        <span>Origin: {conflict.paper_title} {conflict.paper_year ? `(${conflict.paper_year})` : ''}</span>
                        <ExternalLink size={11} />
                      </a>

                      {onOpenPdf && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            const match = conflict.section_location?.match(/page\s*(\d+)/i);
                            const pageNum = match ? parseInt(match[1], 10) : 1;
                            onOpenPdf({
                              paperId: conflict.paper_db_id || conflict.paper_id || 1,
                              paperTitle: conflict.paper_title,
                              page: pageNum,
                              section: conflict.section_location || undefined,
                              claimText: conflict.claim_text,
                              paperYear: conflict.paper_year,
                              paperDoi: conflict.paper_doi
                            });
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}
                          title="Open PDF and locate proposition sentence on its source page"
                        >
                          <BookOpen size={12} color="var(--accent-indigo)" />
                          <span>Read in PDF {conflict.section_location ? `(${conflict.section_location})` : ''}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => onExploreClaim(conflict.claim_id)}
                  >
                    View in Claim Explorer <ArrowRight size={13} />
                  </button>
                </div>

                {/* Central Contested Claim */}
                <div style={{
                  background: 'var(--bg-subtle)',
                  padding: '1rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  marginBottom: '1.25rem'
                }}>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.35rem' }}>
                    Contested Proposition / Finding
                  </div>
                  <div style={{ fontSize: '1.02rem', color: 'var(--text-main)', fontWeight: 600, lineHeight: 1.5 }}>
                    &ldquo;{conflict.claim_text}&rdquo;
                  </div>
                </div>

                {/* Side-by-Side Comparison with Direct Paper Links */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                  {/* Supporting Evidence Column */}
                  <div style={{
                    padding: '1.2rem',
                    background: 'var(--color-supports-bg)',
                    border: '1px solid var(--color-supports-border)',
                    borderRadius: 'var(--radius-md)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-supports-text)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                      <CheckCircle size={15} /> Supporting Evidence ({conflict.supporting_relations.length})
                    </div>
                    {conflict.supporting_relations.length === 0 ? (
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        No direct supporting relations currently registered.
                      </div>
                    ) : (
                      conflict.supporting_relations.map((r) => {
                        const opposingText = r.opposing_claim_text || 
                          (r.source_claim_text === conflict.claim_text ? r.target_claim_text : r.source_claim_text) ||
                          r.target_claim_text || r.source_claim_text;
                        const paperTitle = r.opposing_paper_title || 
                          (r.source_claim_text === conflict.claim_text ? (r.target_paper_title || 'Supporting Study') : (r.source_paper_title || 'Supporting Study'));
                        const paperDoi = r.opposing_paper_doi ?? 
                          (r.source_claim_text === conflict.claim_text ? r.target_paper_doi : r.source_paper_doi);
                        const paperYear = r.opposing_paper_year ?? 
                          (r.source_claim_text === conflict.claim_text ? r.target_paper_year : r.source_paper_year);
                        const url = getPaperUrl(paperTitle, paperDoi);

                        return (
                          <div 
                            key={r.id} 
                            style={{
                              marginBottom: '0.85rem',
                              padding: '0.85rem 1rem',
                              background: '#ffffff',
                              border: '1px solid var(--color-supports-border)',
                              borderRadius: 'var(--radius-sm)',
                              boxShadow: 'var(--shadow-xs)'
                            }}
                          >
                            <div style={{ color: 'var(--text-main)', lineHeight: 1.45, marginBottom: '0.45rem', fontWeight: 500, fontSize: '0.86rem' }}>
                              &ldquo;{opposingText}&rdquo;
                            </div>

                            {/* Direct Clickable Paper Link Pill */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: '0.4rem',
                              paddingTop: '0.4rem',
                              borderTop: '1px dashed var(--border-subtle)'
                            }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    color: 'var(--color-supports-text)',
                                    fontSize: '0.76rem',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    textDecoration: 'none',
                                    background: 'var(--color-supports-bg)',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid var(--color-supports-border)'
                                  }}
                                  title="Open publication in DOI registry or Google Scholar"
                                >
                                  <FileText size={11} />
                                  <span>Paper: {paperTitle.length > 36 ? paperTitle.slice(0, 34) + '...' : paperTitle} {paperYear ? `(${paperYear})` : ''}</span>
                                  <ExternalLink size={10} />
                                </a>

                                {onOpenPdf && (
                                  <button
                                    onClick={() => {
                                      const sec = r.opposing_section_location || (r.source_claim_text === conflict.claim_text ? r.target_section_location : r.source_section_location);
                                      const match = sec?.match(/page\s*(\d+)/i);
                                      const pageNum = match ? parseInt(match[1], 10) : 1;
                                      const pId = r.opposing_paper_db_id || (r.source_claim_text === conflict.claim_text ? (r.target_paper_db_id || r.target_claim_id) : (r.source_paper_db_id || r.source_claim_id)) || 1;
                                      onOpenPdf({
                                        paperId: pId,
                                        paperTitle: paperTitle,
                                        page: pageNum,
                                        section: sec || undefined,
                                        claimText: opposingText,
                                        paperYear: paperYear,
                                        paperDoi: paperDoi
                                      });
                                    }}
                                    style={{
                                      background: 'none',
                                      border: '1px solid var(--color-supports-border)',
                                      borderRadius: '4px',
                                      padding: '2px 7px',
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                      color: 'var(--color-supports-text)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                      cursor: 'pointer'
                                    }}
                                    title="Open original PDF and locate supporting claim sentence"
                                  >
                                    <BookOpen size={10} />
                                    <span>Read PDF</span>
                                  </button>
                                )}
                              </div>

                              <span className="mono-font" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                Conf: {Math.round(r.confidence * 100)}%
                              </span>
                            </div>

                            {r.reasoning && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem', fontStyle: 'italic' }}>
                                Analysis: {r.reasoning}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Contradicting Evidence Column */}
                  <div style={{
                    padding: '1.2rem',
                    background: 'var(--color-contradicts-bg)',
                    border: '1px solid var(--color-contradicts-border)',
                    borderRadius: 'var(--radius-md)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-contradicts-text)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                      <XCircle size={15} /> Contradicting Challenges ({conflict.contradicting_relations.length})
                    </div>
                    {conflict.contradicting_relations.map((r) => {
                      const opposingText = r.opposing_claim_text || 
                        (r.source_claim_text === conflict.claim_text ? r.target_claim_text : r.source_claim_text) ||
                        r.target_claim_text || r.source_claim_text;
                      const paperTitle = r.opposing_paper_title || 
                        (r.source_claim_text === conflict.claim_text ? (r.target_paper_title || 'Challenging Study') : (r.source_paper_title || 'Challenging Study'));
                      const paperDoi = r.opposing_paper_doi ?? 
                        (r.source_claim_text === conflict.claim_text ? r.target_paper_doi : r.source_paper_doi);
                      const paperYear = r.opposing_paper_year ?? 
                        (r.source_claim_text === conflict.claim_text ? r.target_paper_year : r.source_paper_year);
                      const url = getPaperUrl(paperTitle, paperDoi);

                      return (
                        <div 
                          key={r.id} 
                          style={{
                            marginBottom: '0.85rem',
                            padding: '0.85rem 1rem',
                            background: '#ffffff',
                            border: '1px solid var(--color-contradicts-border)',
                            borderRadius: 'var(--radius-sm)',
                            boxShadow: 'var(--shadow-xs)'
                          }}
                        >
                          <div style={{ color: 'var(--text-main)', lineHeight: 1.45, marginBottom: '0.45rem', fontWeight: 500, fontSize: '0.86rem' }}>
                            &ldquo;{opposingText}&rdquo;
                          </div>

                          {/* Direct Clickable Paper Link Pill */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '0.4rem',
                            paddingTop: '0.4rem',
                            borderTop: '1px dashed var(--border-subtle)'
                          }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  color: 'var(--color-contradicts-text)',
                                  fontSize: '0.76rem',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  textDecoration: 'none',
                                  background: 'var(--color-contradicts-bg)',
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  border: '1px solid var(--color-contradicts-border)'
                                }}
                                title="Open publication in DOI registry or Google Scholar"
                              >
                                <FileText size={11} />
                                <span>Paper: {paperTitle.length > 36 ? paperTitle.slice(0, 34) + '...' : paperTitle} {paperYear ? `(${paperYear})` : ''}</span>
                                <ExternalLink size={10} />
                              </a>

                              {onOpenPdf && (
                                <button
                                  onClick={() => {
                                    const sec = r.opposing_section_location || (r.source_claim_text === conflict.claim_text ? r.target_section_location : r.source_section_location);
                                    const match = sec?.match(/page\s*(\d+)/i);
                                    const pageNum = match ? parseInt(match[1], 10) : 1;
                                    const pId = r.opposing_paper_db_id || (r.source_claim_text === conflict.claim_text ? (r.target_paper_db_id || r.target_claim_id) : (r.source_paper_db_id || r.source_claim_id)) || 1;
                                    onOpenPdf({
                                      paperId: pId,
                                      paperTitle: paperTitle,
                                      page: pageNum,
                                      section: sec || undefined,
                                      claimText: opposingText,
                                      paperYear: paperYear,
                                      paperDoi: paperDoi
                                    });
                                  }}
                                  style={{
                                    background: 'none',
                                    border: '1px solid var(--color-contradicts-border)',
                                    borderRadius: '4px',
                                    padding: '2px 7px',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    color: 'var(--color-contradicts-text)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    cursor: 'pointer'
                                  }}
                                  title="Open original PDF and locate challenging claim sentence"
                                >
                                  <BookOpen size={10} />
                                  <span>Read PDF</span>
                                </button>
                              )}
                            </div>

                            <span className="mono-font" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              Conf: {Math.round(r.confidence * 100)}%
                            </span>
                          </div>

                          {r.reasoning && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem', fontStyle: 'italic' }}>
                              Analysis: {r.reasoning}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeSubTab === 'gaps' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {gaps.length === 0 ? (
            <div className="modern-card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
              No research gap indicators flagged in this corpus.
            </div>
          ) : (
            gaps.map((gap) => (
              <div 
                key={gap.gap_id}
                className="modern-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderTop: '3px solid var(--color-concept)',
                  padding: '1.4rem'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                    <span className="badge badge-concept">
                      <Compass size={12} /> {gap.category.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.05rem', color: 'var(--text-main)', marginBottom: '0.5rem', lineHeight: 1.35, fontWeight: 700 }}>
                    {gap.title}
                  </h3>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                    {gap.description}
                  </p>

                  {onFindRelatedPapers && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onFindRelatedPapers(gap.title)}
                      style={{ marginBottom: '1rem', width: 'fit-content' }}
                    >
                      <Globe size={13} /> Find Literature for this Gap
                    </button>
                  )}
                </div>

                {gap.supporting_context && (
                  <div style={{
                    padding: '0.75rem',
                    background: 'var(--bg-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.78rem',
                    color: 'var(--text-muted)',
                    borderLeft: '2px solid var(--border-medium)'
                  }}>
                    {gap.supporting_context}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ConflictGapView;
