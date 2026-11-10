import React, { useEffect, useState } from 'react';
import type { Annotation } from '../types';
import { api } from '../api';
import { Download, FileJson, FileCode, UserCheck } from 'lucide-react';

export const ExportView: React.FC = () => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAnnotations();
  }, []);

  const loadAnnotations = async () => {
    setLoading(true);
    try {
      const data = await api.getAnnotations();
      setAnnotations(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Data Export & Human Annotations</h2>
          <p className="section-desc">
            Export knowledge graph and claim intelligence datasets in standard formats and review human verification history.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1.75rem', alignItems: 'start' }}>
        {/* Export Cards */}
        <div>
          <div className="modern-card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', color: 'var(--text-main)', fontWeight: 700, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Download size={18} color="var(--text-main)" /> Export Knowledge Graph Data
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Download the complete claim-and-evidence graph with all typed nodes (Papers, Claims, Concepts) and semantic edges (SUPPORTS, CONTRADICTS, EXTENDS).
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <a 
                href={api.getExportUrl('json')} 
                download="claim_mapper_graph.json"
                className="btn btn-secondary"
                style={{ justifyContent: 'space-between', padding: '0.85rem 1.25rem', width: '100%' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <FileJson size={18} color="var(--accent-cyan)" />
                  <span style={{ fontWeight: 600 }}>JSON Graph Format</span>
                </span>
                <span className="badge badge-finding">JSON</span>
              </a>

              <a 
                href={api.getExportUrl('gexf')} 
                download="claim_mapper_graph.gexf"
                className="btn btn-secondary"
                style={{ justifyContent: 'space-between', padding: '0.85rem 1.25rem', width: '100%' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <FileCode size={18} color="var(--color-extends)" />
                  <span style={{ fontWeight: 600 }}>Gephi / NetworkX Format</span>
                </span>
                <span className="badge badge-extends">GEXF</span>
              </a>
            </div>
          </div>
        </div>

        {/* Human Annotations Log */}
        <div className="modern-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.05rem', color: 'var(--text-main)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UserCheck size={18} color="var(--color-supports)" /> Human Verification Ledger
            </h3>
            <span className="badge badge-supports">{annotations.length} recorded</span>
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Auditable record of human researcher corrections, validations, and notes ensuring traceability.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Loading verification records...
              </div>
            ) : annotations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No manual annotations recorded yet. You can annotate claims directly from the Claim Explorer.
              </div>
            ) : (
              annotations.map((ann) => (
                <div 
                  key={ann.id}
                  style={{
                    padding: '0.85rem 1rem',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.84rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span className="badge badge-concept">{ann.user_action.toUpperCase()}</span>
                    <span className="mono-font" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      {ann.created_at ? new Date(ann.created_at).toLocaleString() : 'Recent'}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-main)', fontWeight: 500, marginBottom: '0.25rem' }}>
                    {ann.comment || 'No comment provided.'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Target ID: <span className="mono-font">{ann.target_id}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportView;
