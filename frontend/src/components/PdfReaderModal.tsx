import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, ExternalLink, Copy, Check, 
  Target, ChevronLeft, ChevronRight, FileText
} from 'lucide-react';
import type { PdfViewerTarget } from '../types';
import { api } from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  target: PdfViewerTarget | null;
}

export const PdfReaderModal: React.FC<Props> = ({ isOpen, onClose, target }) => {
  const [copied, setCopied] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'annotated' | 'pdf'>('annotated');
  
  // Page Text State for direct highlighting
  const [pageData, setPageData] = useState<{
    text: string;
    total_pages: number;
  } | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  const highlightRef = useRef<HTMLDivElement>(null);

  // Extract page number from target
  const targetPage = useMemo(() => {
    if (!target) return 1;
    if (typeof target.page === 'number' && target.page > 0) return target.page;
    if (target.section) {
      const match = target.section.match(/page\s*(\d+)/i);
      if (match) return parseInt(match[1], 10);
    }
    return 1;
  }, [target]);

  const [activePage, setActivePage] = useState<number>(targetPage);

  // Sync active page when target changes
  useEffect(() => {
    setActivePage(targetPage);
    setViewMode('annotated');
  }, [targetPage, target]);

  // Load page text for direct in-text highlight indicator
  useEffect(() => {
    if (!isOpen || !target) return;
    let isCurrent = true;
    setLoadingText(true);

    api.getPageText(target.paperId, activePage)
      .then((data) => {
        if (isCurrent) {
          setPageData({
            text: data.text,
            total_pages: data.total_pages
          });
          setLoadingText(false);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setPageData(null);
          setLoadingText(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [isOpen, target, activePage]);

  // Auto-scroll to highlighted sentence when page text is loaded
  useEffect(() => {
    if (viewMode === 'annotated' && highlightRef.current) {
      const timer = setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [pageData, viewMode, activePage]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !target) return null;

  // Extract target search keywords for PDF browser search
  const sentenceToHighlight = (target.evidenceSnippet || target.claimText || '').trim();
  const searchWords = sentenceToHighlight
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 5)
    .join(' ');

  const pdfUrl = `/api/papers/${encodeURIComponent(String(target.paperId))}/pdf#page=${activePage}&search=${encodeURIComponent(searchWords)}&view=FitH`;
  const directPdfUrl = `/api/papers/${encodeURIComponent(String(target.paperId))}/pdf#page=${activePage}&search=${encodeURIComponent(searchWords)}`;

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJumpToGroundedPage = () => {
    setActivePage(targetPage);
  };

  // Render highlighted text passage
  const renderHighlightedContent = () => {
    if (loadingText) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '0.85rem' }}>Locating proposition on Page {activePage}...</div>
        </div>
      );
    }

    if (!pageData || !pageData.text.trim()) {
      return (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <p style={{ marginBottom: '1rem', fontSize: '0.88rem' }}>Text extraction layer is not available for this page. Switch to Original PDF view.</p>
          <button className="btn btn-secondary btn-sm" onClick={() => setViewMode('pdf')}>
            <FileText size={13} /> Open Original PDF View
          </button>
        </div>
      );
    }

    const rawText = pageData.text;
    const cleanRaw = rawText.replace(/\s+/g, ' ');
    const cleanTarget = sentenceToHighlight.replace(/\s+/g, ' ');

    let matchStart = -1;
    let matchEnd = -1;

    if (cleanTarget.length > 10) {
      const idx = cleanRaw.toLowerCase().indexOf(cleanTarget.toLowerCase());
      if (idx !== -1) {
        matchStart = idx;
        matchEnd = idx + cleanTarget.length;
      } else {
        const shortQuery = cleanTarget.slice(0, Math.min(35, cleanTarget.length)).toLowerCase();
        const shortIdx = cleanRaw.toLowerCase().indexOf(shortQuery);
        if (shortIdx !== -1) {
          matchStart = shortIdx;
          matchEnd = Math.min(cleanRaw.length, shortIdx + cleanTarget.length);
        }
      }
    }

    if (matchStart !== -1 && matchEnd !== -1) {
      const before = cleanRaw.slice(0, matchStart);
      const matched = cleanRaw.slice(matchStart, matchEnd);
      const after = cleanRaw.slice(matchEnd);

      return (
        <div style={{ lineHeight: 1.85, fontSize: '0.94rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <span>{before}</span>

          {/* Clean Evidence Highlight */}
          <span 
            ref={highlightRef}
            style={{
              backgroundColor: '#fef08a',
              color: '#1c1917',
              borderRadius: '3px',
              padding: '2px 4px',
              fontWeight: 600,
              display: 'inline'
            }}
          >
            {matched}
          </span>

          <span>{after}</span>
        </div>
      );
    }

    // Fallback if sentence occurred across boundary
    return (
      <div style={{ lineHeight: 1.85, fontSize: '0.94rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
        {sentenceToHighlight && (
          <div 
            ref={highlightRef}
            style={{
              background: '#fef9c3',
              border: '1px solid #fde047',
              borderRadius: 'var(--radius-md)',
              padding: '0.9rem 1.15rem',
              marginBottom: '1.5rem'
            }}
          >
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#854d0e',
              marginBottom: '0.35rem',
              textTransform: 'uppercase'
            }}>
              <Target size={11} /> Target Evidence (Page {targetPage})
            </div>
            <div style={{ fontWeight: 500, color: '#1c1917', fontSize: '0.9rem' }}>
              &ldquo;{sentenceToHighlight}&rdquo;
            </div>
          </div>
        )}
        <div>{rawText}</div>
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div 
        className="modal-content"
        style={{
          width: '95vw',
          maxWidth: '1440px',
          height: '92vh',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-modal)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: 0
        }}
      >
        {/* Top Header Bar */}
        <div style={{
          padding: '0.75rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-surface)',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          {/* Paper Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: '240px' }}>
            <FileText size={18} color="var(--text-secondary)" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-main)' }}>
                {target.paperTitle}
              </span>
              {target.paperYear && (
                <span className="mono-font" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  ({target.paperYear})
                </span>
              )}
              {targetPage && (
                <span 
                  onClick={handleJumpToGroundedPage}
                  className="badge badge-finding"
                  style={{ cursor: 'pointer', fontSize: '0.72rem' }}
                  title="Jump to target page"
                >
                  <Target size={11} /> Page {targetPage}
                </span>
              )}
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="segmented-control">
            <button
              className={`segmented-btn ${viewMode === 'annotated' ? 'active' : ''}`}
              onClick={() => setViewMode('annotated')}
            >
              <span>Evidence Text</span>
            </button>
            <button
              className={`segmented-btn ${viewMode === 'pdf' ? 'active' : ''}`}
              onClick={() => setViewMode('pdf')}
            >
              <span>Original PDF</span>
            </button>
          </div>

          {/* Right Header Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title={sidebarOpen ? "Hide metadata" : "Show metadata"}
            >
              {sidebarOpen ? 'Hide Metadata' : 'Show Metadata'}
            </button>

            <a
              href={directPdfUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
              title="Open raw PDF in new browser tab"
            >
              <span>New Tab</span>
              <ExternalLink size={11} />
            </a>

            <button
              onClick={onClose}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0.35rem 0.5rem' }}
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Page Navigation Strip */}
        <div style={{
          backgroundColor: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border)',
          padding: '0.45rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '680px' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-main)', marginRight: '6px' }}>Target:</span>
            &ldquo;{sentenceToHighlight}&rdquo;
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={activePage <= 1}
              onClick={() => setActivePage(p => Math.max(1, p - 1))}
              style={{ padding: '2px 7px', fontSize: '0.74rem' }}
            >
              <ChevronLeft size={12} /> Prev
            </button>
            <span className="mono-font" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', minWidth: '70px', textAlign: 'center' }}>
              P. {activePage} {pageData?.total_pages ? `of ${pageData.total_pages}` : ''}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={pageData?.total_pages ? activePage >= pageData.total_pages : false}
              onClick={() => setActivePage(p => p + 1)}
              style={{ padding: '2px 7px', fontSize: '0.74rem' }}
            >
              Next <ChevronRight size={12} />
            </button>
            {activePage !== targetPage && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleJumpToGroundedPage}
                style={{ padding: '2px 7px', fontSize: '0.72rem' }}
              >
                Reset to Target (P.{targetPage})
              </button>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ display: 'flex', flex: 1, height: 'calc(100% - 90px)', overflow: 'hidden' }}>
          {/* Metadata Drawer */}
          {sidebarOpen && (
            <div style={{
              width: '320px',
              minWidth: '280px',
              background: 'var(--bg-canvas)',
              borderRight: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              padding: '1.25rem',
              overflowY: 'auto'
            }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Provenance & Context
              </div>

              {/* Location Card */}
              <div className="modern-card flat" style={{ padding: '0.85rem', marginBottom: '0.85rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Anchor
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
                  Located on <strong>Page {targetPage}</strong> {target.section ? `(${target.section})` : ''}.
                </div>
              </div>

              {/* Claim Card */}
              {target.claimText && (
                <div className="modern-card flat" style={{ padding: '0.85rem', marginBottom: '0.85rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    Extracted Proposition
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', fontWeight: 500, lineHeight: 1.45, marginBottom: '0.5rem' }}>
                    &ldquo;{target.claimText}&rdquo;
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopyText(target.claimText || '')}
                    style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                  >
                    {copied ? <Check size={11} color="var(--color-supports)" /> : <Copy size={11} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}

              {/* Raw Passage Card */}
              {target.evidenceSnippet && target.evidenceSnippet !== target.claimText && (
                <div className="modern-card flat" style={{ padding: '0.85rem', marginBottom: '0.85rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    Source Text Snippet
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.45, marginBottom: '0.5rem' }}>
                    &ldquo;{target.evidenceSnippet}&rdquo;
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopyText(target.evidenceSnippet || '')}
                    style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                  >
                    {copied ? <Check size={11} color="var(--color-supports)" /> : <Copy size={11} />}
                    {copied ? 'Copied' : 'Copy Snippet'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Reading Pane */}
          <div style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden' }}>
            {viewMode === 'annotated' ? (
              <div style={{
                height: '100%',
                overflowY: 'auto',
                padding: '2.5rem 3rem',
                backgroundColor: 'var(--bg-surface)'
              }}>
                <div style={{ maxWidth: '820px', margin: '0 auto' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: '0.75rem',
                    marginBottom: '1.5rem',
                    borderBottom: '1px solid var(--border)'
                  }}>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Page {activePage} Text
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Isolated sentence highlighted in yellow
                    </span>
                  </div>

                  {renderHighlightedContent()}
                </div>
              </div>
            ) : (
              <iframe
                key={`${target.paperId}-${activePage}`}
                src={pdfUrl}
                title={`PDF Reader - ${target.paperTitle}`}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  display: 'block'
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfReaderModal;
