import React from 'react';
import type { DashboardStats } from '../types';
import { 
  FileText, Lightbulb, GitFork, AlertTriangle, 
  Compass, Upload, RefreshCw, Trash2,
  Globe, MessageSquare, ArrowRight, Check
} from 'lucide-react';

interface Props {
  stats: DashboardStats | null;
  onNavigate: (tab: string) => void;
  onResetCorpus?: () => void;
}

export const DashboardView: React.FC<Props> = ({ stats, onNavigate, onResetCorpus }) => {
  if (!stats) {
    return (
      <div style={{ padding: '5rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw className="spin-animation" size={20} style={{ margin: '0 auto 0.75rem auto', display: 'block' }} />
        <div style={{ fontSize: '0.88rem' }}>Loading corpus data...</div>
      </div>
    );
  }

  const totalRel = stats.total_relations || 1;
  const supportsPct = Math.round((stats.supports_count / totalRel) * 100);
  const contradictsPct = Math.round((stats.contradicts_count / totalRel) * 100);
  const extendsPct = Math.round((stats.extends_count / totalRel) * 100);

  return (
    <div>
      {/* Top Editorial Banner */}
      <div className="modern-card" style={{ padding: '1.75rem 2rem', marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                Smart Literature Claim Mapper
              </h1>
              <span className="badge badge-supports" style={{ fontSize: '0.72rem' }}>
                <Check size={12} strokeWidth={2.5} /> AI Engine Live
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '640px', lineHeight: 1.55 }}>
              Extracts structured scientific propositions, methodology parameters, and study limitations from research PDFs. Maps multi-study SUPPORTS, CONTRADICTS, and EXTENDS relationships with passage-level evidence grounding.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => onNavigate('papers')}>
              <Upload size={14} /> Ingest PDFs
            </button>
            <button className="btn btn-secondary" onClick={() => onNavigate('discovery')}>
              <Globe size={14} /> Search Literature
            </button>
            {onResetCorpus && stats.total_papers > 0 && (
              <button 
                className="btn btn-outline-danger btn-sm" 
                onClick={onResetCorpus}
                title="Clear all papers from corpus"
              >
                <Trash2 size={13} /> Reset Corpus
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="stats-grid">
        {/* Metric 1: Papers */}
        <div 
          className="stat-card" 
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('papers')}
          title="Click to view documents"
        >
          <div>
            <div className="stat-label">Documents</div>
            <div className="stat-value">{stats.total_papers}</div>
            <div className="stat-desc">Ingested research PDFs</div>
          </div>
          <FileText size={20} color="var(--text-muted)" />
        </div>

        {/* Metric 2: Claims */}
        <div 
          className="stat-card" 
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('claims')}
          title="Click to explore claims"
        >
          <div>
            <div className="stat-label">Scientific Claims</div>
            <div className="stat-value">{stats.total_claims}</div>
            <div className="stat-desc">Extracted propositions</div>
          </div>
          <Lightbulb size={20} color="var(--text-muted)" />
        </div>

        {/* Metric 3: Relations */}
        <div 
          className="stat-card" 
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('graph')}
          title="Click to view knowledge graph"
        >
          <div>
            <div className="stat-label">Semantic Relations</div>
            <div className="stat-value">{stats.total_relations}</div>
            <div className="stat-desc">Cross-study edges</div>
          </div>
          <GitFork size={20} color="var(--text-muted)" />
        </div>

        {/* Metric 4: Contradictions */}
        <div 
          className="stat-card" 
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('conflicts')}
          title="Click to inspect contradictions"
        >
          <div>
            <div className="stat-label">Contradictions</div>
            <div 
              className="stat-value" 
              style={{ color: stats.total_conflicts > 0 ? 'var(--color-contradicts)' : 'inherit' }}
            >
              {stats.total_conflicts}
            </div>
            <div className="stat-desc">Conflicting findings</div>
          </div>
          <AlertTriangle size={20} color={stats.total_conflicts > 0 ? 'var(--color-contradicts)' : 'var(--text-muted)'} />
        </div>

        {/* Metric 5: Gaps */}
        <div 
          className="stat-card" 
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate('conflicts')}
          title="Click to review research gaps"
        >
          <div>
            <div className="stat-label">Research Gaps</div>
            <div className="stat-value">{stats.total_gaps}</div>
            <div className="stat-desc">Identified white spaces</div>
          </div>
          <Compass size={20} color="var(--text-muted)" />
        </div>
      </div>

      {/* Two Column Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Left Column: Semantic Evidence Breakdown */}
        <div className="modern-card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Cross-Study Evidence Distribution
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Distribution of validated semantic edges discovered between propositions across literature.
          </p>

          {/* Distribution Bar */}
          <div style={{
            height: '10px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            overflow: 'hidden',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            marginBottom: '1.25rem'
          }}>
            <div title={`SUPPORTS: ${stats.supports_count}`} style={{ width: `${supportsPct}%`, background: 'var(--color-supports)' }} />
            <div title={`CONTRADICTS: ${stats.contradicts_count}`} style={{ width: `${contradictsPct}%`, background: 'var(--color-contradicts)' }} />
            <div title={`EXTENDS: ${stats.extends_count}`} style={{ width: `${extendsPct}%`, background: 'var(--color-extends)' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            <div style={{ 
              padding: '0.75rem', 
              background: 'var(--color-supports-bg)', 
              border: '1px solid var(--color-supports-border)', 
              borderRadius: 'var(--radius-md)' 
            }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-supports-text)', marginBottom: '0.2rem' }}>
                SUPPORTS
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-supports-text)' }}>
                {stats.supports_count}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {supportsPct}% of edges
              </div>
            </div>

            <div style={{ 
              padding: '0.75rem', 
              background: 'var(--color-contradicts-bg)', 
              border: '1px solid var(--color-contradicts-border)', 
              borderRadius: 'var(--radius-md)' 
            }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-contradicts-text)', marginBottom: '0.2rem' }}>
                CONTRADICTS
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-contradicts-text)' }}>
                {stats.contradicts_count}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {contradictsPct}% of edges
              </div>
            </div>

            <div style={{ 
              padding: '0.75rem', 
              background: 'var(--color-extends-bg)', 
              border: '1px solid var(--color-extends-border)', 
              borderRadius: 'var(--radius-md)' 
            }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-extends-text)', marginBottom: '0.2rem' }}>
                EXTENDS
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-extends-text)' }}>
                {stats.extends_count}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {extendsPct}% of edges
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
              Verification Pipeline Status
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Proposition Extraction</span>
                <span style={{ color: 'var(--color-supports)', fontWeight: 600 }}>Active (Rule-based & Heuristic)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Semantic Embeddings</span>
                <span style={{ color: 'var(--color-supports)', fontWeight: 600 }}>Active (BGE-M3 Dense + Sparse)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Evidence Grounding</span>
                <span style={{ color: 'var(--color-supports)', fontWeight: 600 }}>Active (Passage Provability)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Research Workflows & Direct Actions */}
        <div className="modern-card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Research Actions
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Jump directly into core literature intelligence workflows.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button 
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between', padding: '0.75rem 1rem', width: '100%' }}
              onClick={() => onNavigate('papers')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <FileText size={16} />
                <span style={{ fontWeight: 500 }}>Manage Documents</span>
              </span>
              <ArrowRight size={14} color="var(--text-dim)" />
            </button>

            <button 
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between', padding: '0.75rem 1rem', width: '100%' }}
              onClick={() => onNavigate('claims')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <Lightbulb size={16} />
                <span style={{ fontWeight: 500 }}>Explore Scientific Claims</span>
              </span>
              <ArrowRight size={14} color="var(--text-dim)" />
            </button>

            <button 
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between', padding: '0.75rem 1rem', width: '100%' }}
              onClick={() => onNavigate('conflicts')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <AlertTriangle size={16} color="var(--color-contradicts)" />
                <span style={{ fontWeight: 500 }}>Inspect Contradictions</span>
              </span>
              <span className="badge badge-contradicts" style={{ fontSize: '0.72rem' }}>
                {stats.total_conflicts} Flagged
              </span>
            </button>

            <button 
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between', padding: '0.75rem 1rem', width: '100%' }}
              onClick={() => onNavigate('graph')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <GitFork size={16} />
                <span style={{ fontWeight: 500 }}>Interactive Knowledge Graph</span>
              </span>
              <ArrowRight size={14} color="var(--text-dim)" />
            </button>

            <button 
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between', padding: '0.75rem 1rem', width: '100%' }}
              onClick={() => onNavigate('qa')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <MessageSquare size={16} />
                <span style={{ fontWeight: 500 }}>Grounded Literature Q&A</span>
              </span>
              <ArrowRight size={14} color="var(--text-dim)" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DashboardView;
