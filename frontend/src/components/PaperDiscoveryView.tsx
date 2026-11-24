import React, { useState, useEffect } from 'react';
import { searchResearchPapers, fetchPaperPdfBlob } from '../downloader';
import type { DiscoveredPaper } from '../downloader';
import { api } from '../api';
import { 
  Search, Download, ExternalLink, Terminal, CheckCircle2, 
  AlertCircle, Loader2, BookOpen, FileDown, PlusCircle,
  Key, Eye, EyeOff, Check, ChevronDown, ChevronUp, FileText, CheckCheck
} from 'lucide-react';

interface Props {
  onUploadToCorpus: (file: File) => Promise<void>;
  onNavigateToCorpus: () => void;
  onCorpusUpdated?: () => void;
  initialQuery?: string;
}

interface LogEntry {
  text: string;
  isGreen?: boolean;
}

export const PaperDiscoveryView: React.FC<Props> = ({
  onUploadToCorpus,
  onNavigateToCorpus,
  onCorpusUpdated,
  initialQuery = ''
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [maxResults, setMaxResults] = useState<number>(10);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [papers, setPapers] = useState<DiscoveredPaper[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});
  const [batchIngesting, setBatchIngesting] = useState<boolean>(false);

  // ScraperAPI / ScholarAPI Key State
  const [scraperApiKey, setScraperApiKey] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('scraper_api_key') 
        || window.localStorage.getItem('scholar_api_key') 
        || window.localStorage.getItem('atlas_scraper_api_key') 
        || '';
    }
    return '';
  });

  const [tempKeyInput, setTempKeyInput] = useState<string>(scraperApiKey);
  const [showKeyCard, setShowKeyCard] = useState<boolean>(false);
  const [showSecret, setShowSecret] = useState<boolean>(false);
  const [keySavedMessage, setKeySavedMessage] = useState<string | null>(null);
  const [backendConfigured, setBackendConfigured] = useState<boolean>(false);
  const [backendMaskedKey, setBackendMaskedKey] = useState<string | null>(null);

  useEffect(() => {
    api.getSystemConfig().then(cfg => {
      if (cfg.scraper_configured) {
        setBackendConfigured(true);
        if (cfg.scraper_api_key_masked) setBackendMaskedKey(cfg.scraper_api_key_masked);
      }
    }).catch(() => {
      // Backend may be offline if user runs manually
    });
  }, []);

  const handleSaveApiKey = async () => {
    const trimmed = tempKeyInput.trim();
    setScraperApiKey(trimmed);
    if (typeof window !== 'undefined' && window.localStorage) {
      if (trimmed) {
        window.localStorage.setItem('scraper_api_key', trimmed);
        window.localStorage.setItem('scholar_api_key', trimmed);
      } else {
        window.localStorage.removeItem('scraper_api_key');
        window.localStorage.removeItem('scholar_api_key');
      }
    }

    try {
      await api.updateSystemConfig({ scraper_api_key: trimmed, scholar_api_key: trimmed });
      setBackendConfigured(Boolean(trimmed));
    } catch {
      // Ignore if backend isn't up right now
    }

    setKeySavedMessage(trimmed ? 'API key saved successfully!' : 'API key cleared. Reverted to default fallback.');
    setTimeout(() => setKeySavedMessage(null), 3500);
  };

  // Track download/ingestion states per paper
  const [actionStatuses, setActionStatuses] = useState<Record<string, 'idle' | 'downloading' | 'ingesting' | 'completed' | 'failed'>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setError(null);
    setProgress(5);
    setLogs([{ text: `[${new Date().toLocaleTimeString()}] Initiating scholarly literature search for: "${trimmed}"...`, isGreen: true }]);
    setShowLogs(true);
    setPapers([]);

    try {
      const keywords = trimmed.split(/[\s,]+/).filter(k => k.length > 2);
      const activeKey = scraperApiKey.trim() || undefined;

      // Stage 1: Query registers for candidate papers pool
      const candidates = await searchResearchPapers(
        {
          topic: trimmed,
          keywords: keywords.length > 0 ? keywords : [trimmed],
          downloadLimit: Math.max(maxResults * 4, 30),
          scraperApiKey: activeKey,
          scholarApiKey: activeKey
        },
        (msg: string, isGreen?: boolean) => {
          setLogs(prev => [...prev, { text: msg, isGreen }]);
        },
        (pct: number) => {
          setProgress(Math.round(5 + (pct * 0.35)));
        }
      );

      if (!candidates || candidates.length === 0) {
        setError('No research papers found for the given keywords. Try broader academic terms.');
        return;
      }

      setLogs(prev => [...prev, {
        text: `[Verification Engine] Candidate pool of ${candidates.length} papers gathered. Running backend readability & download verification until Target Limit (${maxResults} papers) is met...`,
        isGreen: true
      }]);
      setProgress(40);

      // Stage 2: Verification Loop — test candidates until target limit of verified readable papers is reached
      const verifiedList: DiscoveredPaper[] = [];
      let checkedIdx = 0;

      for (const candidate of candidates) {
        if (verifiedList.length >= maxResults) break;
        checkedIdx++;

        setLogs(prev => [...prev, {
          text: `[Verification] (${checkedIdx}/${candidates.length}) Checking readability: "${candidate.title.slice(0, 48)}..." via ${candidate.source}...`
        }]);

        try {
          const checkRes = await api.verifyPaper(candidate, {
            scraperApiKey: activeKey,
            scholarApiKey: activeKey
          });

          if (checkRes.valid && checkRes.readable) {
            const verifiedPaper: DiscoveredPaper = {
              ...candidate,
              isVerified: true,
              verified_id: checkRes.verified_id,
              pages: checkRes.pages,
              size_bytes: checkRes.size_bytes,
              preview: checkRes.preview,
              verified_filename: checkRes.filename
            };
            verifiedList.push(verifiedPaper);
            setPapers([...verifiedList]); // Real-time UI population

            setLogs(prev => [...prev, {
              text: `[Verification] [${verifiedList.length}/${maxResults}] ✓ Verified Readable: "${candidate.title.slice(0, 48)}..." (${checkRes.pages} pages, text confirmed)!`,
              isGreen: true
            }]);

            const currentPct = 40 + Math.round((verifiedList.length / maxResults) * 60);
            setProgress(currentPct);
          } else {
            setLogs(prev => [...prev, {
              text: `[Verification] [x] Skipped: "${candidate.title.slice(0, 40)}..." (${checkRes.reason || 'No text layer'})`,
              isGreen: false
            }]);
          }
        } catch (vErr: any) {
          setLogs(prev => [...prev, {
            text: `[Verification] [x] Check error on "${candidate.title.slice(0, 30)}...": ${vErr.message}`,
            isGreen: false
          }]);
        }
      }

      if (verifiedList.length === 0) {
        setPapers(candidates.slice(0, maxResults));
        setError(`Could not verify open readable PDFs among candidates. Displaying top ${maxResults} references.`);
      } else {
        setPapers(verifiedList);
        setLogs(prev => [...prev, {
          text: `[Verification Engine] Successfully finalized ${verifiedList.length} verified, readable papers matching target limit (${maxResults})!`,
          isGreen: true
        }]);
      }
    } catch (err: any) {
      setError(err.message || 'Scholarly register query failed.');
    } finally {
      setSearching(false);
      setProgress(100);
    }
  };

  const handleDownloadOnly = async (paper: DiscoveredPaper) => {
    const paperKey = paper.id;
    setActionStatuses(prev => ({ ...prev, [paperKey]: 'downloading' }));
    setActionErrors(prev => {
      const next = { ...prev };
      delete next[paperKey];
      return next;
    });

    try {
      if (paper.verified_id) {
        const downloadUrl = api.getVerifiedDownloadUrl(paper.verified_id);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = paper.verified_filename || `${paper.title.replace(/[^a-zA-Z0-9_\-]/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setActionStatuses(prev => ({ ...prev, [paperKey]: 'completed' }));
        setLogs(prev => [...prev, { text: `[PDF Downloader] Successfully downloaded "${paper.title}"!`, isGreen: true }]);
        return;
      }

      setLogs(prev => [...prev, { text: `[PDF Downloader] Resolving and fetching PDF for "${paper.title}"...`, isGreen: true }]);
      const activeKey = scraperApiKey.trim() || undefined;
      const { blob, filename } = await fetchPaperPdfBlob(
        paper,
        (msg: string, isGreen?: boolean) => setLogs(p => [...p, { text: msg, isGreen }]),
        activeKey
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setActionStatuses(prev => ({ ...prev, [paperKey]: 'completed' }));
      setLogs(prev => [...prev, { text: `[PDF Downloader] Successfully downloaded "${filename}"!`, isGreen: true }]);
    } catch (err: any) {
      setActionStatuses(prev => ({ ...prev, [paperKey]: 'failed' }));
      setActionErrors(prev => ({ ...prev, [paperKey]: err.message || 'Download failed' }));
      setLogs(prev => [...prev, { text: `[PDF Downloader] Download failed: ${err.message}`, isGreen: false }]);
    }
  };

  const handleDownloadAndIngest = async (paper: DiscoveredPaper) => {
    if (batchIngesting) return;
    const paperKey = paper.id;
    setActionStatuses(prev => ({ ...prev, [paperKey]: 'ingesting' }));
    setActionErrors(prev => {
      const next = { ...prev };
      delete next[paperKey];
      return next;
    });

    try {
      if (paper.verified_id) {
        setLogs(prev => [...prev, { text: `[Ingestion Pipeline] Instantly ingesting pre-verified PDF for "${paper.title}"...`, isGreen: true }]);
        await api.ingestVerifiedPaper(paper.verified_id);
        setActionStatuses(prev => ({ ...prev, [paperKey]: 'completed' }));
        setLogs(prev => [...prev, { text: `[Ingestion Pipeline] Successfully ingested "${paper.title}"! Claims and evidence extracted into graph.`, isGreen: true }]);
        if (onCorpusUpdated) onCorpusUpdated();
        return;
      }

      setLogs(prev => [...prev, { text: `[Ingestion Pipeline] Downloading PDF blob for "${paper.title}"...`, isGreen: true }]);
      const activeKey = scraperApiKey.trim() || undefined;
      const { blob, filename } = await fetchPaperPdfBlob(
        paper,
        (msg: string, isGreen?: boolean) => setLogs(p => [...p, { text: msg, isGreen }]),
        activeKey
      );

      setLogs(prev => [...prev, { text: `[Ingestion Pipeline] Uploading "${filename}" to literature claim mapper backend...`, isGreen: true }]);
      const file = new File([blob], filename, { type: 'application/pdf' });
      await onUploadToCorpus(file);

      setActionStatuses(prev => ({ ...prev, [paperKey]: 'completed' }));
      setLogs(prev => [...prev, { text: `[Ingestion Pipeline] Successfully ingested "${filename}"! Claims and evidence extracted into corpus graph.`, isGreen: true }]);
    } catch (err: any) {
      setActionStatuses(prev => ({ ...prev, [paperKey]: 'failed' }));
      setActionErrors(prev => ({ ...prev, [paperKey]: err.message || 'Ingestion failed' }));
      setLogs(prev => [...prev, { text: `[Ingestion Pipeline] Ingestion failed: ${err.message}`, isGreen: false }]);
    }
  };

  const handleBatchIngestAll = async () => {
    if (papers.length === 0 || batchIngesting) return;
    setBatchIngesting(true);
    let ingestedCount = 0;

    for (const paper of papers) {
      if (actionStatuses[paper.id] === 'completed') continue;
      setActionStatuses(prev => ({ ...prev, [paper.id]: 'ingesting' }));

      try {
        if (paper.verified_id) {
          await api.ingestVerifiedPaper(paper.verified_id);
        } else {
          const { blob, filename } = await fetchPaperPdfBlob(
            paper,
            undefined,
            scraperApiKey.trim() || undefined
          );
          const file = new File([blob], filename, { type: 'application/pdf' });
          await onUploadToCorpus(file);
        }
        setActionStatuses(prev => ({ ...prev, [paper.id]: 'completed' }));
        ingestedCount++;
      } catch (err: any) {
        setActionStatuses(prev => ({ ...prev, [paper.id]: 'failed' }));
        setActionErrors(prev => ({ ...prev, [paper.id]: err.message || 'Ingest failed' }));
      }
    }

    setBatchIngesting(false);
    if (onCorpusUpdated) onCorpusUpdated();
    setLogs(prev => [...prev, { text: `[Batch Ingestion] Completed! Ingested ${ingestedCount} papers into corpus.`, isGreen: true }]);
  };



  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Discover & Download Related Literature</h2>
          <p className="section-desc">
            Search OpenAlex, arXiv, Crossref, PubMed Central, Google Scholar, Semantic Scholar, CORE, PapersWithCode, DOAJ, and Sci-Hub. Download PDFs directly or ingest them straight into your claim knowledge graph.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button 
            type="button" 
            className="btn btn-secondary"
            style={{
              borderColor: (scraperApiKey || backendConfigured) ? 'var(--color-supports)' : 'var(--border-subtle)',
              color: (scraperApiKey || backendConfigured) ? 'var(--color-supports-text)' : 'inherit'
            }}
            onClick={() => setShowKeyCard(!showKeyCard)}
            title="Configure ScraperAPI / ScholarAPI Key"
          >
            <Key size={15} /> 
            {scraperApiKey ? 'Scraper Key (Active)' : backendConfigured ? 'Scraper Key (.env)' : 'Set Scraper API Key'}
          </button>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => setShowLogs(!showLogs)}
            title="Toggle Live Crawler Console"
          >
            <Terminal size={15} /> {showLogs ? 'Hide Crawler Logs' : `View Crawler Logs (${logs.length})`}
          </button>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={onNavigateToCorpus}
            title="View Ingested Papers in Corpus"
          >
            <BookOpen size={15} /> View Corpus
          </button>
        </div>
      </div>

      {/* Scraper / Scholar API Key Configuration Panel */}
      {showKeyCard && (
        <div className="modern-card" style={{ marginBottom: '1.5rem', padding: '1.25rem', border: '1px solid var(--border-focus)', background: 'var(--bg-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Key size={18} style={{ color: 'var(--accent-primary)' }} />
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
                ScraperAPI / ScholarAPI Key
              </h4>
              <span className={`badge ${scraperApiKey || backendConfigured ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.72rem' }}>
                {scraperApiKey ? 'Browser Key Active' : backendConfigured ? `Configured in .env (${backendMaskedKey || 'Active'})` : 'Default Fallback Active'}
              </span>
            </div>
            <a 
              href="https://www.scraperapi.com/" 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{ fontSize: '0.78rem', color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              Get Free Key (5,000 requests) <ExternalLink size={12} />
            </a>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
            ScraperAPI is used by <code style={{ color: 'var(--text-main)' }}>downloader.js</code> to query <strong>Google Scholar</strong> without bot blocks and bypass CORS restrictions on paywalled research PDFs.
            You can enter your API key here, or define <code style={{ color: 'var(--text-main)' }}>SCRAPER_API_KEY</code> or <code style={{ color: 'var(--text-main)' }}>SCHOLAR_API_KEY</code> in your <code style={{ color: 'var(--text-main)' }}>.env</code> file.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
              <input
                type={showSecret ? 'text' : 'password'}
                className="input-field"
                placeholder={backendConfigured ? `Using .env key (${backendMaskedKey || 'Configured'}). Enter new key to override...` : 'Paste ScraperAPI key (e.g. e8722902abdf...)'}
                value={tempKeyInput}
                onChange={(e) => setTempKeyInput(e.target.value)}
                style={{ paddingRight: '2.5rem', fontSize: '0.85rem', height: '38px' }}
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
                title={showSecret ? 'Hide key' : 'Show key'}
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveApiKey}
              style={{ height: '38px', fontSize: '0.82rem' }}
            >
              <Check size={14} /> Save Key
            </button>

            {scraperApiKey && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setTempKeyInput('');
                  handleSaveApiKey();
                }}
                style={{ height: '38px', fontSize: '0.82rem' }}
                title="Remove custom key and revert to fallback"
              >
                Reset to Fallback
              </button>
            )}
          </div>

          {keySavedMessage && (
            <div style={{ marginTop: '0.65rem', fontSize: '0.78rem', color: 'var(--color-supports-text)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <CheckCircle2 size={14} /> {keySavedMessage}
            </div>
          )}
        </div>
      )}

      {/* Search Input Box */}
      <form onSubmit={handleSearch} className="modern-card" style={{ marginBottom: '1.75rem', padding: '1.5rem' }}>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '320px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input 
              type="text"
              className="input-field"
              placeholder="Search by topic, hypothesis, or keywords (e.g. self-attention complexity, graph contrastive learning)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={searching}
              style={{ paddingLeft: '2.25rem', height: '42px', fontSize: '0.88rem' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Target Limit:</label>
            <select 
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              disabled={searching}
              className="input-field"
              style={{
                padding: '0.45rem 0.75rem',
                fontSize: '0.85rem',
                height: '42px'
              }}
            >
              <option value={5}>5 Papers</option>
              <option value={10}>10 Papers</option>
              <option value={20}>20 Papers</option>
              <option value={30}>30 Papers</option>
            </select>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={searching || !query.trim()}
            style={{ height: '42px' }}
          >
            {searching ? (
              <>
                <Loader2 size={15} className="spin-animation" /> Searching Registers...
              </>
            ) : (
              <>
                <Search size={15} /> Search Literature
              </>
            )}
          </button>
        </div>

        {/* Progress Bar when searching */}
        {searching && (
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              <span>Multi-Register Scholarly Query in Progress...</span>
              <span className="mono-font">{progress}%</span>
            </div>
            <div style={{ height: '6px', width: '100%', background: 'var(--bg-subtle)', borderRadius: '999px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${progress}%`, 
                  background: 'var(--text-main)', 
                  transition: 'width 0.3s ease' 
                }} 
              />
            </div>
          </div>
        )}
      </form>

      {/* Collapsible Crawler Terminal Logs */}
      {showLogs && (
        <div className="modern-card" style={{ marginBottom: '1.5rem', background: '#0f172a', border: '1px solid #1e293b', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', fontWeight: 600, color: '#38bdf8' }}>
              <Terminal size={15} /> Multi-Register Crawler Live Console
            </div>
            <button 
              type="button" 
              onClick={() => setLogs([])}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}
            >
              Clear Logs
            </button>
          </div>

          <div style={{
            maxHeight: '220px',
            overflowY: 'auto',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.78rem',
            lineHeight: 1.6,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.2rem'
          }}>
            {logs.length === 0 ? (
              <div style={{ color: '#64748b' }}>[Idle] Ready for scholarly register search queries.</div>
            ) : (
              logs.map((log, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    color: log.isGreen ? '#34d399' : log.text.includes('Error') || log.text.includes('failed') ? '#f87171' : '#94a3b8' 
                  }}
                >
                  {log.text}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: '1rem',
          background: 'var(--color-contradicts-bg)',
          border: '1px solid var(--color-contradicts-border)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-contradicts-text)',
          fontSize: '0.88rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem'
        }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {/* Discovered & Verified Papers List */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', color: 'var(--text-main)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <FileDown size={19} color="var(--accent-indigo)" /> Discovered &amp; Verified Papers ({papers.length}{maxResults ? ` / ${maxResults} Target` : ''})
            </h3>
            {papers.length > 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                All displayed papers have been downloaded &amp; verified readable by the backend.
              </p>
            )}
          </div>

          {papers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBatchIngestAll}
                disabled={batchIngesting || searching}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                title="Ingest all verified papers into the knowledge graph simultaneously"
              >
                {batchIngesting ? (
                  <>
                    <Loader2 size={14} className="spin-animation" /> Ingesting Papers...
                  </>
                ) : (
                  <>
                    <PlusCircle size={14} /> Ingest All Verified ({papers.length})
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {papers.length === 0 ? (
          <div className="modern-card" style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
            <Search size={36} color="var(--border-medium)" style={{ margin: '0 auto 1rem auto' }} />
            <h4 style={{ color: 'var(--text-main)', marginBottom: '0.4rem', fontSize: '1.1rem', fontWeight: 600 }}>No Papers Queried Yet</h4>
            <p style={{ maxWidth: '480px', margin: '0 auto', fontSize: '0.88rem' }}>
              Select your Target Limit (5, 10, 20, 30) and type research topics above. The multi-register crawler will search scholarly registers and download &amp; verify readable PDFs in the backend until your target count is met.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {papers.map((p) => {
              const authors = p.authorships && p.authorships.length > 0
                ? p.authorships.map((a: any) => a.author.display_name).slice(0, 3).join(', ') + (p.authorships.length > 3 ? ' et al.' : '')
                : 'Authors unlisted';
              const status = actionStatuses[p.id] || 'idle';
              const actionErr = actionErrors[p.id];
              const hasPdf = Boolean(p.best_oa_location?.pdf_url || p.verified_id);
              const doiUrl = p.doi && p.doi.startsWith('http') ? p.doi : p.doi ? `https://doi.org/${p.doi}` : null;
              const isPreviewShowing = Boolean(previewOpen[p.id]);

              return (
                <div 
                  key={p.id} 
                  className="modern-card"
                  style={{
                    padding: '1.4rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem',
                    borderLeft: p.isVerified ? '4px solid #10b981' : hasPdf ? '3px solid var(--color-supports)' : '3px solid var(--text-main)',
                    background: p.isVerified ? 'linear-gradient(180deg, rgba(16, 185, 129, 0.02) 0%, rgba(0,0,0,0) 100%)' : undefined
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '300px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                        <span className="badge badge-finding">
                          {p.source || 'Open Access'}
                        </span>
                        <span className="mono-font" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {p.publication_year || 'N/A'}
                        </span>
                        {p.isVerified ? (
                          <>
                            <span className="badge badge-supports" style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                              <CheckCircle2 size={11} /> Verified Readable ({p.pages} Pages)
                            </span>
                            {p.size_bytes && (
                              <span className="mono-font" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                {(p.size_bytes / 1024 / 1024) >= 1 ? `${(p.size_bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(p.size_bytes / 1024)} KB`}
                              </span>
                            )}
                          </>
                        ) : hasPdf ? (
                          <span className="badge badge-supports" style={{ fontSize: '0.72rem' }}>
                            <CheckCircle2 size={11} /> Open Access PDF
                          </span>
                        ) : null}
                      </div>

                      <h4 style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.35rem', lineHeight: 1.4 }}>
                        {p.title}
                      </h4>

                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {authors}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                      {/* Button: Download & Ingest into Corpus */}
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={status === 'ingesting' || status === 'downloading' || batchIngesting}
                        onClick={() => handleDownloadAndIngest(p)}
                        title="Download PDF and immediately extract claims & evidence into your corpus"
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {status === 'ingesting' ? (
                          <>
                            <Loader2 size={13} className="spin-animation" /> Ingesting...
                          </>
                        ) : status === 'completed' ? (
                          <>
                            <CheckCheck size={13} color="#10b981" /> Ingested
                          </>
                        ) : (
                          <>
                            <PlusCircle size={13} /> {p.isVerified ? 'Ingest into Graph' : 'Download & Ingest'}
                          </>
                        )}
                      </button>

                      {/* Button: Download PDF to machine */}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={status === 'ingesting' || status === 'downloading' || batchIngesting}
                        onClick={() => handleDownloadOnly(p)}
                        title="Download raw PDF file to your local computer"
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {status === 'downloading' ? (
                          <>
                            <Loader2 size={13} className="spin-animation" /> Fetching...
                          </>
                        ) : (
                          <>
                            <Download size={13} /> Download PDF
                          </>
                        )}
                      </button>

                      {/* Button: External DOI / Web Link */}
                      {doiUrl && (
                        <a
                          href={doiUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary btn-sm"
                          title="Open publisher / DOI page in new tab"
                          style={{ padding: '0.4rem 0.6rem' }}
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Collapsible Text Preview if Verified */}
                  {p.preview && (
                    <div style={{ marginTop: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={() => setPreviewOpen(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          textDecoration: 'underline'
                        }}
                      >
                        <FileText size={12} />
                        {isPreviewShowing ? 'Hide extracted text preview' : 'View extracted readable text sample'}
                        {isPreviewShowing ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      {isPreviewShowing && (
                        <div style={{
                          marginTop: '0.5rem',
                          padding: '0.75rem 1rem',
                          background: 'var(--bg-subtle, #f8fafc)',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle, #e2e8f0)',
                          fontSize: '0.78rem',
                          fontFamily: 'var(--font-mono, monospace)',
                          color: 'var(--text-secondary)',
                          lineHeight: 1.5,
                          maxHeight: '140px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {p.preview}
                        </div>
                      )}
                    </div>
                  )}

                  {actionErr && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-contradicts)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <AlertCircle size={13} /> {actionErr}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PaperDiscoveryView;
