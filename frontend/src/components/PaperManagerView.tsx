import React, { useState, useRef } from 'react';
import type { Paper, Claim, PdfViewerTarget } from '../types';
import { api } from '../api';
import { 
  Upload, CheckCircle2, Clock, AlertCircle, 
  Trash2, RefreshCw, Globe, FileText,
  Search, BookOpen, Layers, ChevronDown, ChevronUp,
  ArrowRight, ExternalLink
} from 'lucide-react';

interface Props {
  papers: Paper[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (paperId: string) => Promise<void>;
  onRefresh: () => void;
  onResetCorpus: () => Promise<void>;
  onNavigateToDiscovery?: () => void;
  onOpenPdf?: (target: PdfViewerTarget) => void;
  onViewClaims?: (paper: Paper) => void;
}

export const PaperManagerView: React.FC<Props> = ({
  papers, onUpload, onDelete, onRefresh, onResetCorpus, onNavigateToDiscovery, onOpenPdf, onViewClaims
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'completed' | 'processing'>('all');
  const [expandedPaperId, setExpandedPaperId] = useState<number | null>(null);
  const [paperClaimsCache, setPaperClaimsCache] = useState<Record<number, Claim[]>>({});
  const [loadingClaimsId, setLoadingClaimsId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleInlineClaims = async (paper: Paper) => {
    if (expandedPaperId === paper.id) {
      setExpandedPaperId(null);
      return;
    }
    setExpandedPaperId(paper.id);
    if (!paperClaimsCache[paper.id]) {
      setLoadingClaimsId(paper.id);
      try {
        const claims = await api.getPaperClaims(paper.id);
        setPaperClaimsCache(prev => ({ ...prev, [paper.id]: claims }));
      } catch (err) {
        console.error("Failed to load paper claims:", err);
      } finally {
        setLoadingClaimsId(null);
      }
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF files are supported for academic document processing.');
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      await onUpload(file);
      onRefresh();
    } catch (err: any) {
      setUploadError(err.message || 'Error uploading file.');
    } finally {
      setUploading(false);
    }
  };

  const filteredPapers = papers.filter((p) => {
    const matchesText = filterText === '' || 
      p.title.toLowerCase().includes(filterText.toLowerCase()) ||
      (p.authors && p.authors.toLowerCase().includes(filterText.toLowerCase()));
    
    if (selectedFilter === 'completed') return matchesText && p.processing_status === 'completed';
    if (selectedFilter === 'processing') return matchesText && p.processing_status === 'processing';
    return matchesText;
  });

  const getDoiUrl = (doi?: string | null) => {
    if (!doi) return null;
    return doi.startsWith('http') ? doi : `https://doi.org/${doi}`;
  };

  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <div>
          <h2 className="section-title">Document Library</h2>
          <p className="section-desc">
            Manage your ingested research papers, extract verifiable scientific claims, and inspect document provenance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {onNavigateToDiscovery && (
            <button className="btn btn-primary" onClick={onNavigateToDiscovery}>
              <Globe size={14} /> Search Literature
            </button>
          )}
          <button className="btn btn-secondary" onClick={onRefresh} title="Refresh Document List">
            <RefreshCw size={14} /> Refresh
          </button>
          {papers.length > 0 && (
            <button 
              className="btn btn-outline-danger btn-sm" 
              onClick={onResetCorpus} 
              title="Clear all papers from corpus"
            >
              <Trash2 size={13} /> Clear Library
            </button>
          )}
        </div>
      </div>

      {/* Upload Dropzone */}
      <div 
        className={`dropzone-container ${dragOver ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{ marginBottom: '1.75rem' }}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          accept=".pdf" 
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)} 
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <Upload size={22} color="var(--text-secondary)" />
          <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-main)' }}>
            {uploading ? 'Processing PDF structure & extracting propositions...' : 'Upload academic PDF documents'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Drag and drop peer-reviewed research papers or click to select a file
          </div>
        </div>
      </div>

      {uploadError && (
        <div style={{
          padding: '0.75rem 1rem',
          background: 'var(--color-contradicts-bg)',
          border: '1px solid var(--color-contradicts-border)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-contradicts-text)',
          fontSize: '0.82rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertCircle size={15} /> {uploadError}
        </div>
      )}

      {/* Documents Table */}
      <div className="modern-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          background: 'var(--bg-surface)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Ingested Documents ({filteredPapers.length})
            </span>
            
            {/* Filter Pills */}
            <div className="segmented-control">
              <button 
                className={`segmented-btn ${selectedFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedFilter('all')}
              >
                All
              </button>
              <button 
                className={`segmented-btn ${selectedFilter === 'completed' ? 'active' : ''}`}
                onClick={() => setSelectedFilter('completed')}
              >
                Ready
              </button>
              <button 
                className={`segmented-btn ${selectedFilter === 'processing' ? 'active' : ''}`}
                onClick={() => setSelectedFilter('processing')}
              >
                Processing
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: '260px' }}>
            <Search 
              size={14} 
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} 
            />
            <input 
              type="text" 
              className="input-field" 
              placeholder="Filter by title or author..." 
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{ paddingLeft: '2rem', height: '34px', fontSize: '0.8rem' }}
            />
          </div>
        </div>

        {/* Files Data Table */}
        <div className="data-table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Document Title & Authors</th>
                <th style={{ width: '80px' }}>Year</th>
                <th style={{ width: '150px' }}>Identifier / DOI</th>
                <th style={{ width: '110px' }}>Claims</th>
                <th style={{ width: '100px' }}>Status</th>
                <th style={{ textAlign: 'right', width: '200px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPapers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      No documents found
                    </div>
                    <div style={{ fontSize: '0.82rem', marginBottom: '1rem' }}>
                      Upload an academic PDF or discover literature online to populate your library.
                    </div>
                    {onNavigateToDiscovery && (
                      <button 
                        type="button" 
                        className="btn btn-secondary btn-sm"
                        onClick={onNavigateToDiscovery}
                      >
                        <Globe size={13} /> Search Online Literature
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredPapers.map((p) => {
                  const isExpanded = expandedPaperId === p.id;
                  const paperClaims = paperClaimsCache[p.id] || [];
                  const isLoadingClaims = loadingClaimsId === p.id;
                  const doiUrl = getDoiUrl(p.doi);

                  return (
                    <React.Fragment key={p.id}>
                      <tr style={{ background: isExpanded ? 'var(--bg-subtle)' : undefined }}>
                        <td style={{ maxWidth: '400px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <FileText size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.88rem', marginBottom: '0.15rem' }}>
                                {p.title}
                              </div>
                              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                {p.authors || 'Unknown Authors'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="mono-font" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {p.year || '—'}
                        </td>
                        <td className="mono-font" style={{ fontSize: '0.78rem' }}>
                          {doiUrl ? (
                            <a 
                              href={doiUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              style={{ 
                                color: 'var(--text-secondary)', 
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title={p.doi || ''}
                            >
                              <span>{p.doi && p.doi.length > 18 ? p.doi.substring(0, 18) + '...' : p.doi}</span>
                              <ExternalLink size={10} color="var(--text-dim)" />
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-dim)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="badge badge-finding"
                            onClick={() => toggleInlineClaims(p)}
                            style={{
                              cursor: 'pointer',
                              border: '1px solid var(--border)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 7px'
                            }}
                            title="Preview extracted claims"
                          >
                            <span>{p.claims_count} claims</span>
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        </td>
                        <td>
                          {p.processing_status === 'completed' && (
                            <span className="badge badge-supports">
                              <CheckCircle2 size={11} /> Ready
                            </span>
                          )}
                          {p.processing_status === 'processing' && (
                            <span className="badge badge-method">
                              <Clock size={11} /> Processing
                            </span>
                          )}
                          {p.processing_status === 'failed' && (
                            <span className="badge badge-contradicts" title={p.error_message || 'Processing failed'}>
                              <AlertCircle size={11} /> Failed
                            </span>
                          )}
                          {p.processing_status === 'pending' && (
                            <span className="badge" style={{ background: 'var(--bg-subtle)' }}>
                              Pending
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            {/* View Claims */}
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                if (onViewClaims) {
                                  onViewClaims(p);
                                } else {
                                  toggleInlineClaims(p);
                                }
                              }}
                              title="Explore claims extracted from this document"
                            >
                              <Layers size={12} />
                              <span>Claims</span>
                            </button>

                            {/* Read PDF */}
                            {onOpenPdf && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => onOpenPdf({
                                  paperId: p.id,
                                  paperTitle: p.title,
                                  page: 1,
                                  paperYear: p.year,
                                  paperDoi: p.doi
                                })}
                                title="Open original PDF with text grounding"
                              >
                                <BookOpen size={12} />
                                <span>PDF</span>
                              </button>
                            )}

                            {/* Delete */}
                            <button 
                              className="btn btn-secondary btn-sm"
                              style={{ color: 'var(--color-contradicts)' }}
                              onClick={() => onDelete(p.paper_id)}
                              title="Remove document from library"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Claims Drawer */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} style={{ padding: '0', background: 'var(--bg-subtle)' }}>
                            <div style={{
                              padding: '1.25rem 1.5rem',
                              borderTop: '1px solid var(--border)',
                              borderBottom: '1px solid var(--border)'
                            }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '0.85rem',
                                flexWrap: 'wrap',
                                gap: '0.5rem'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <Layers size={15} color="var(--text-secondary)" />
                                  <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                                    Propositions from "{p.title}"
                                  </span>
                                  <span className="badge badge-finding" style={{ fontSize: '0.72rem' }}>
                                    {paperClaims.length} Claims
                                  </span>
                                </div>

                                {onViewClaims && (
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => onViewClaims(p)}
                                    style={{ fontSize: '0.76rem' }}
                                  >
                                    <span>Open in Claim Explorer</span>
                                    <ArrowRight size={12} />
                                  </button>
                                )}
                              </div>

                              {isLoadingClaims ? (
                                <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                  <Clock size={14} className="spin-animation" style={{ display: 'inline-block', marginRight: '6px', verticalAlign: 'middle' }} />
                                  Loading extracted propositions...
                                </div>
                              ) : paperClaims.length === 0 ? (
                                <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                  No propositions extracted yet for this document.
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '340px', overflowY: 'auto' }}>
                                  {paperClaims.map((c) => (
                                    <div
                                      key={c.id}
                                      style={{
                                        padding: '0.75rem 0.95rem',
                                        background: 'var(--bg-surface)',
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid var(--border)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.35rem'
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                          <span className={`badge badge-${c.claim_type}`} style={{ fontSize: '0.7rem' }}>
                                            {c.claim_type}
                                          </span>
                                          <span className="mono-font" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                            Confidence: {Math.round(c.confidence * 100)}%
                                          </span>
                                          {c.section_location && (
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                              📍 {c.section_location}
                                            </span>
                                          )}
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                          {(c.supports_count ?? 0) > 0 && (
                                            <span className="badge badge-supports" style={{ fontSize: '0.68rem' }}>
                                              +{c.supports_count} supports
                                            </span>
                                          )}
                                          {(c.contradicts_count ?? 0) > 0 && (
                                            <span className="badge badge-contradicts" style={{ fontSize: '0.68rem' }}>
                                              -{c.contradicts_count} conflicts
                                            </span>
                                          )}
                                          {onOpenPdf && (
                                            <button
                                              className="btn btn-secondary btn-sm"
                                              style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                                              onClick={() => {
                                                const match = c.section_location?.match(/page\s*(\d+)/i);
                                                const pageNum = match ? parseInt(match[1], 10) : 1;
                                                onOpenPdf({
                                                  paperId: p.id,
                                                  paperTitle: p.title,
                                                  page: pageNum,
                                                  section: c.section_location || undefined,
                                                  claimText: c.claim_text,
                                                  paperYear: p.year
                                                });
                                              }}
                                              title="Locate claim in PDF"
                                            >
                                              <BookOpen size={10} /> PDF
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: '1.45' }}>
                                        {c.claim_text}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PaperManagerView;
