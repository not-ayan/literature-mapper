import React, { useState } from 'react';
import type { QAResponse } from '../types';
import { MessageSquare, Send, ShieldCheck, BookOpen, Quote, ArrowRight } from 'lucide-react';

interface Props {
  onAsk: (question: string) => Promise<QAResponse>;
}

export const QAView: React.FC<Props> = ({ onAsk }) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [qaResult, setQaResult] = useState<QAResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await onAsk(question);
      setQaResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to synthesize grounded answer.');
    } finally {
      setLoading(false);
    }
  };

  const sampleQuestions = [
    "What empirical benchmarks demonstrate Transformer superiority over RNNs?",
    "What are the reported computational resource limitations?",
    "How does sparse attention compare to dense multi-head attention?"
  ];

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Corpus Synthesis & Grounded Q&A</h2>
          <p className="section-desc">
            Synthesize answers strictly anchored in findings, parameter tables, and methodologies from your ingested research papers.
          </p>
        </div>
      </div>

      {/* Question Form */}
      <form 
        onSubmit={(e) => { e.preventDefault(); handleAsk(); }}
        className="modern-card"
        style={{
          display: 'flex',
          gap: '0.65rem',
          marginBottom: '1rem',
          padding: '0.85rem 1rem'
        }}
      >
        <div style={{ position: 'relative', flex: 1 }}>
          <MessageSquare size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          <input 
            type="text"
            className="input-field"
            placeholder="Ask a scientific research question across your corpus..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            style={{ paddingLeft: '2.2rem', height: '38px', fontSize: '0.86rem' }}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading || !question.trim()}>
          {loading ? 'Synthesizing...' : <><Send size={13} /> Ask Literature</>}
        </button>
      </form>

      {/* Suggested Queries */}
      {!qaResult && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Suggested queries:</span>
          {sampleQuestions.map((q, i) => (
            <button
              key={i}
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setQuestion(q)}
              style={{ fontSize: '0.74rem', padding: '2px 8px' }}
            >
              <span>{q}</span>
              <ArrowRight size={10} color="var(--text-dim)" />
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{
          padding: '0.85rem 1.15rem',
          background: 'var(--color-contradicts-bg)',
          border: '1px solid var(--color-contradicts-border)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-contradicts-text)',
          marginBottom: '1.5rem',
          fontSize: '0.84rem'
        }}>
          {error}
        </div>
      )}

      {/* Result Display */}
      {qaResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Synthesized Answer Note (Styled like Anastasia's Cabinet Note Card) */}
          <div className="modern-card" style={{ padding: '1.75rem 2rem', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="badge badge-supports">
                  <ShieldCheck size={12} /> Grounded Synthesis
                </span>
                {qaResult.model_used && (
                  <span className="badge badge-finding" style={{ fontSize: '0.7rem' }}>
                    {qaResult.model_used}
                  </span>
                )}
              </div>
              <div className="mono-font" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Confidence: <strong style={{ color: 'var(--text-main)' }}>{Math.round(qaResult.confidence * 100)}%</strong>
              </div>
            </div>

            <div style={{
              fontSize: '0.96rem',
              color: 'var(--text-main)',
              lineHeight: 1.75,
              whiteSpace: 'pre-line'
            }}>
              {qaResult.answer}
            </div>
          </div>

          {/* Source Provenance Evidence Passages */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
              <BookOpen size={16} color="var(--text-secondary)" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Evidence Provenance Sources ({qaResult.provenance_sources.length})
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
              {qaResult.provenance_sources.map((src, idx) => (
                <div 
                  key={idx}
                  className="modern-card flat"
                  style={{
                    padding: '1.15rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {src.paper_title} {src.paper_year ? `(${src.paper_year})` : ''}
                      </span>
                      <span className="mono-font" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Score: {Math.round(src.relevance_score * 100)}%
                      </span>
                    </div>

                    <div style={{ fontSize: '0.88rem', color: 'var(--text-main)', fontWeight: 600, marginBottom: '0.65rem', lineHeight: 1.45 }}>
                      &ldquo;{src.claim_text}&rdquo;
                    </div>

                    <div style={{
                      padding: '0.75rem 0.85rem',
                      background: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      fontStyle: 'italic',
                      lineHeight: 1.5,
                      borderLeft: '2px solid var(--text-main)'
                    }}>
                      <Quote size={11} style={{ display: 'inline', marginRight: '4px' }} />
                      {src.evidence_passage}
                    </div>
                  </div>

                  <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Section: <span className="mono-font" style={{ color: 'var(--text-secondary)' }}>{src.section || 'General'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QAView;
