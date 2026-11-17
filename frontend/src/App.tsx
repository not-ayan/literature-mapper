import React, { useState, useEffect, useRef } from 'react';
import { api } from './api';
import type { 
  DashboardStats, Paper, Claim, GraphData, 
  ConflictItem, ResearchGapItem, PdfViewerTarget 
} from './types';
import { DashboardView } from './components/DashboardView';
import { PaperManagerView } from './components/PaperManagerView';
import { ClaimExplorerView } from './components/ClaimExplorerView';
import { GraphVisualizationView } from './components/GraphVisualizationView';
import { ConflictGapView } from './components/ConflictGapView';
import { QAView } from './components/QAView';
import { ExportView } from './components/ExportView';
import { AnnotationModal } from './components/AnnotationModal';
import { PdfReaderModal } from './components/PdfReaderModal';
import { PaperDiscoveryView } from './components/PaperDiscoveryView';
import { 
  LayoutDashboard, FileText, Search, 
  GitFork, MessageSquare, Download, Globe,
  AlertTriangle, Layers
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  
  // Data states
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [gaps, setGaps] = useState<ResearchGapItem[]>([]);

  // Search & Filter state
  const [claimSearch, setClaimSearch] = useState<string>('');
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);
  const [discoveryQuery, setDiscoveryQuery] = useState<string>('');

  // Annotation Modal state
  const [annotationModal, setAnnotationModal] = useState<{
    isOpen: boolean;
    targetId: string;
    targetType: 'claim' | 'relation';
    initialText?: string;
  }>({
    isOpen: false,
    targetId: '',
    targetType: 'claim',
    initialText: ''
  });

  // PDF Viewer Modal state
  const [pdfTarget, setPdfTarget] = useState<PdfViewerTarget | null>(null);

  // Load initial data
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const [s, p, c, g, conf, gp] = await Promise.all([
        api.getDashboardStats().catch(() => null),
        api.getPapers().catch(() => []),
        api.getClaims().catch(() => []),
        api.getGraphData().catch(() => ({ nodes: [], edges: [] })),
        api.getConflicts().catch(() => []),
        api.getResearchGaps().catch(() => [])
      ]);
      setStats(s);
      setPapers(p);
      setClaims(c);
      setGraphData(g);
      setConflicts(conf);
      setGaps(gp);
    } catch (err) {
      console.error("Error loading application data:", err);
    }
  };

  const handleUploadPaper = async (file: File) => {
    await api.uploadPaper(file);
    await loadAllData();
  };

  const handleDeletePaper = async (paperId: string) => {
    if (!confirm('Are you sure you want to remove this paper and all its associated claims?')) return;
    await api.deletePaper(paperId);
    await loadAllData();
  };

  const handleResetCorpus = async () => {
    if (!confirm('Are you sure you want to clear all papers and claims from the corpus? This gives you a fresh blank slate.')) return;
    try {
      await api.resetCorpus();
      await loadAllData();
    } catch (err: any) {
      alert("Failed to reset corpus: " + (err.message || 'Unknown error'));
    }
  };

  const handleGraphFilterChange = async (filters: {
    relationTypes: string[];
    nodeTypes: string[];
    minConfidence: number;
    query?: string;
  }) => {
    try {
      const newGraph = await api.getGraphData({
        relationTypes: filters.relationTypes,
        nodeTypes: filters.nodeTypes,
        minConfidence: filters.minConfidence,
        query: filters.query
      });
      setGraphData(newGraph);
    } catch (e) {
      console.error(e);
    }
  };

  const latestSearchIdRef = useRef<number>(0);

  const handleClaimSearchChange = async (query: string) => {
    setClaimSearch(query);
    const searchId = ++latestSearchIdRef.current;
    try {
      const filtered = await api.getClaims(query);
      if (searchId === latestSearchIdRef.current) {
        setClaims(filtered);
      }
    } catch (e) {
      if (searchId === latestSearchIdRef.current) {
        console.error(e);
      }
    }
  };

  const handleOpenAnnotation = (claimId: string, initialText?: string) => {
    setAnnotationModal({
      isOpen: true,
      targetId: claimId,
      targetType: 'claim',
      initialText
    });
  };

  const handleAnnotationSubmit = async (data: any) => {
    await api.createAnnotation(data);
    await loadAllData();
  };

  const tabTitles: Record<string, string> = {
    dashboard: 'Corpus Overview',
    papers: 'Document Library',
    discovery: 'Literature Search',
    claims: 'Claim Explorer',
    graph: 'Knowledge Graph',
    conflicts: 'Contradictions & Gaps',
    qa: 'Synthesis Q&A',
    export: 'Data Export'
  };

  return (
    <div className="app-shell">
      {/* Editorial Structured Sidebar */}
      <aside className="sidebar" aria-label="Sidebar Navigation">
        {/* Header Branding */}
        <div 
          className="sidebar-header" 
          onClick={() => setActiveTab('dashboard')}
          title="Return to Corpus Overview"
        >
          <div className="sidebar-brand-icon">
            <Layers size={18} strokeWidth={2.2} />
          </div>
          <div>
            <div className="sidebar-brand-title">Claim Mapper</div>
            <div className="sidebar-brand-sub">Literature Intelligence</div>
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="sidebar-nav">
          {/* Section: Corpus */}
          <div>
            <div className="nav-group-title">Corpus</div>
            <div className="nav-group-items">
              <button 
                className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                <span className="nav-link-left">
                  <LayoutDashboard size={16} />
                  <span>Overview</span>
                </span>
              </button>

              <button 
                className={`nav-link ${activeTab === 'papers' ? 'active' : ''}`}
                onClick={() => setActiveTab('papers')}
              >
                <span className="nav-link-left">
                  <FileText size={16} />
                  <span>Documents</span>
                </span>
                <span className="nav-badge">{papers.length}</span>
              </button>

              <button 
                className={`nav-link ${activeTab === 'discovery' ? 'active' : ''}`}
                onClick={() => setActiveTab('discovery')}
              >
                <span className="nav-link-left">
                  <Globe size={16} />
                  <span>Literature Search</span>
                </span>
              </button>
            </div>
          </div>

          {/* Section: Claim Intelligence */}
          <div>
            <div className="nav-group-title">Evidence & Claims</div>
            <div className="nav-group-items">
              <button 
                className={`nav-link ${activeTab === 'claims' ? 'active' : ''}`}
                onClick={() => setActiveTab('claims')}
              >
                <span className="nav-link-left">
                  <Search size={16} />
                  <span>Claim Explorer</span>
                </span>
                <span className="nav-badge">{claims.length}</span>
              </button>

              <button 
                className={`nav-link ${activeTab === 'graph' ? 'active' : ''}`}
                onClick={() => setActiveTab('graph')}
              >
                <span className="nav-link-left">
                  <GitFork size={16} />
                  <span>Knowledge Graph</span>
                </span>
              </button>

              <button 
                className={`nav-link ${activeTab === 'conflicts' ? 'active' : ''}`}
                onClick={() => setActiveTab('conflicts')}
              >
                <span className="nav-link-left">
                  <AlertTriangle size={16} />
                  <span>Contradictions & Gaps</span>
                </span>
                {conflicts.length > 0 && (
                  <span className="nav-badge danger">{conflicts.length}</span>
                )}
              </button>

              <button 
                className={`nav-link ${activeTab === 'qa' ? 'active' : ''}`}
                onClick={() => setActiveTab('qa')}
              >
                <span className="nav-link-left">
                  <MessageSquare size={16} />
                  <span>Synthesis Q&A</span>
                </span>
              </button>
            </div>
          </div>

          {/* Section: Output */}
          <div>
            <div className="nav-group-title">Export</div>
            <div className="nav-group-items">
              <button 
                className={`nav-link ${activeTab === 'export' ? 'active' : ''}`}
                onClick={() => setActiveTab('export')}
              >
                <span className="nav-link-left">
                  <Download size={16} />
                  <span>Export & Verification</span>
                </span>
              </button>
            </div>
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span className="status-dot online" />
            <span>Corpus Online</span>
          </div>
          {papers.length > 0 && (
            <button 
              onClick={handleResetCorpus}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                fontSize: '0.72rem',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
              title="Clear all papers"
            >
              Reset
            </button>
          )}
        </div>
      </aside>

      {/* Main Workspace Canvas */}
      <div className="workspace-wrapper">
        {/* Top Header */}
        <header className="top-header">
          <div className="breadcrumb-nav">
            <span>Research Workbench</span>
            <span className="breadcrumb-separator">/</span>
            <span className="active-crumb">{tabTitles[activeTab] || 'Workspace'}</span>
          </div>

          <div className="top-header-right">
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                background: 'var(--bg-subtle)',
                padding: '0.3rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)'
              }}
            >
              <span>{papers.length} Papers</span>
              <span style={{ color: 'var(--border-strong)' }}>•</span>
              <span>{claims.length} Claims</span>
              {conflicts.length > 0 && (
                <>
                  <span style={{ color: 'var(--border-strong)' }}>•</span>
                  <span style={{ color: 'var(--color-contradicts)', fontWeight: 600 }}>
                    {conflicts.length} Contradictions
                  </span>
                </>
              )}
            </div>

            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => setActiveTab('papers')}
            >
              <FileText size={13} /> Manage Documents
            </button>
          </div>
        </header>

        {/* Main Content View Container */}
        <main className="app-container">
          {activeTab === 'dashboard' && (
            <DashboardView 
              stats={stats} 
              onNavigate={(tab) => setActiveTab(tab)}
              onResetCorpus={handleResetCorpus}
            />
          )}

          {activeTab === 'papers' && (
            <PaperManagerView 
              papers={papers}
              onUpload={handleUploadPaper}
              onDelete={handleDeletePaper}
              onRefresh={loadAllData}
              onResetCorpus={handleResetCorpus}
              onNavigateToDiscovery={() => setActiveTab('discovery')}
              onOpenPdf={(t) => setPdfTarget(t)}
              onViewClaims={(p) => {
                setSelectedPaperId(p.id);
                setActiveTab('claims');
              }}
            />
          )}

          {activeTab === 'discovery' && (
            <PaperDiscoveryView 
              onUploadToCorpus={handleUploadPaper}
              onNavigateToCorpus={() => setActiveTab('papers')}
              initialQuery={discoveryQuery}
            />
          )}

          {activeTab === 'claims' && (
            <ClaimExplorerView 
              claims={claims}
              papers={papers}
              selectedPaperId={selectedPaperId}
              onSelectPaper={(id) => setSelectedPaperId(typeof id === 'number' ? id : id ? Number(id) || null : null)}
              onOpenAnnotation={handleOpenAnnotation}
              onSearchChange={handleClaimSearchChange}
              searchQuery={claimSearch}
              onFindRelatedPapers={(q) => {
                setDiscoveryQuery(q);
                setActiveTab('discovery');
              }}
              onOpenPdf={(t) => setPdfTarget(t)}
            />
          )}

          {activeTab === 'graph' && (
            <GraphVisualizationView 
              graphData={graphData}
              onFilterChange={handleGraphFilterChange}
              onExploreClaim={(claimId) => {
                setClaimSearch(claimId);
                setActiveTab('claims');
              }}
              onAskLiteratureQA={() => {
                setActiveTab('qa');
              }}
            />
          )}

          {activeTab === 'conflicts' && (
            <ConflictGapView 
              conflicts={conflicts}
              gaps={gaps}
              onExploreClaim={(claimId) => {
                setClaimSearch(claimId);
                setActiveTab('claims');
              }}
              onFindRelatedPapers={(q) => {
                setDiscoveryQuery(q);
                setActiveTab('discovery');
              }}
              onOpenPdf={(t) => setPdfTarget(t)}
            />
          )}

          {activeTab === 'qa' && (
            <QAView onAsk={(q) => api.askQuestion(q)} />
          )}

          {activeTab === 'export' && (
            <ExportView />
          )}
        </main>
      </div>

      {/* Annotation Modal */}
      <AnnotationModal 
        isOpen={annotationModal.isOpen}
        onClose={() => setAnnotationModal({ ...annotationModal, isOpen: false })}
        targetId={annotationModal.targetId}
        targetType={annotationModal.targetType}
        initialText={annotationModal.initialText}
        onSubmit={handleAnnotationSubmit}
      />

      {/* PDF Reader & Grounding Modal */}
      <PdfReaderModal
        isOpen={!!pdfTarget}
        target={pdfTarget}
        onClose={() => setPdfTarget(null)}
      />
    </div>
  );
};

export default App;
