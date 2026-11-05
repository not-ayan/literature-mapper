import React, { useState } from 'react';
import { api } from '../api';

export const ClaimSearcherView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<string>('');
  const [useHybridToggle, setUseHybridToggle] = useState(true);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const res = await api.searchClaimsRAG(query);
    setResult(res.synthesis);
  };

  return (
    <div className="modern-card">
      <h2>Prototype Claim Searcher</h2>
      <label style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input type="checkbox" checked={useHybridToggle} onChange={() => setUseHybridToggle(!useHybridToggle)} />
        Enable Hybrid Mode (experimental)
      </label>
      <form onSubmit={runSearch} style={{ display: 'flex', gap: '0.5rem' }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Enter hypothesis..." />
        <button type="submit" className="btn btn-primary">Analyze</button>
      </form>
      {result && <pre style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>{result}</pre>}
    </div>
  );
};
