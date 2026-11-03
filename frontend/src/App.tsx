import React, { useState, useEffect } from 'react';
import { api } from './api';
import type { DashboardStats, Paper, Claim } from './types';
import { DashboardView } from './components/DashboardView';
import { PaperManagerView } from './components/PaperManagerView';
import { ClaimSearcherView } from './components/ClaimSearcherView';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    const [s, p, c] = await Promise.all([
      api.getDashboardStats().catch(() => null),
      api.getPapers().catch(() => []),
      api.getClaims().catch(() => [])
    ]);
    setStats(s); setPapers(p); setClaims(c);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h3>Claim Mapper</h3>
        <button onClick={() => setActiveTab('dashboard')}>Overview</button>
        <button onClick={() => setActiveTab('papers')}>Documents ({papers.length})</button>
        <button onClick={() => setActiveTab('searcher')}>AI Claim Searcher</button>
      </aside>
      <div className="workspace-wrapper">
        {activeTab === 'dashboard' && <DashboardView stats={stats} onNavigate={setActiveTab} />}
        {activeTab === 'papers' && <PaperManagerView papers={papers} onUpload={async (f) => { await api.uploadPaper(f); await loadAllData(); }} onDelete={async (id) => { await api.deletePaper(id); await loadAllData(); }} onRefresh={loadAllData} onResetCorpus={async () => { await api.resetCorpus(); await loadAllData(); }} />}
        {activeTab === 'searcher' && <ClaimSearcherView />}
        <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Claims: {claims.length}</div>
      </div>
    </div>
  );
};
export default App;
