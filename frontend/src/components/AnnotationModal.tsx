import React, { useState } from 'react';
import { X, Edit3 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  targetType: 'claim' | 'relation';
  initialText?: string;
  onSubmit: (data: {
    target_type: 'claim' | 'relation';
    target_id: string;
    user_action: string;
    corrected_value?: string;
    comment?: string;
  }) => Promise<void>;
}

export const AnnotationModal: React.FC<Props> = ({
  isOpen, onClose, targetId, targetType, initialText = '', onSubmit
}) => {
  const [userAction, setUserAction] = useState<string>('correct');
  const [correctedValue, setCorrectedValue] = useState<string>(initialText);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        target_type: targetType,
        target_id: targetId,
        user_action: userAction,
        corrected_value: userAction === 'correct' ? correctedValue : undefined,
        comment: comment || undefined
      });
      onClose();
    } catch (err) {
      alert('Failed to save annotation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ background: '#ffffff', color: 'var(--text-main)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-modal)', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Edit3 size={18} color="var(--text-main)" />
            <h3 style={{ fontSize: '1.15rem', color: 'var(--text-main)', fontWeight: 700 }}>Human Review & Annotation</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          Verify, correct, or refine automatically extracted scientific propositions or relationships. Annotations are tracked in the provenance ledger.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Action Type:
            </label>
            <div className="segmented-control" style={{ width: '100%' }}>
              {[
                { id: 'verify', label: 'Verify Accurate' },
                { id: 'correct', label: 'Correct Proposition' },
                { id: 'reject', label: 'Reject / Flag' }
              ].map(act => (
                <button
                  type="button"
                  key={act.id}
                  className={`segmented-btn ${userAction === act.id ? 'active' : ''}`}
                  onClick={() => setUserAction(act.id)}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {act.label}
                </button>
              ))}
            </div>
          </div>

          {userAction === 'correct' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                Refined / Corrected Proposition:
              </label>
              <textarea 
                value={correctedValue}
                onChange={(e) => setCorrectedValue(e.target.value)}
                rows={3}
                className="input-field"
                style={{
                  width: '100%',
                  resize: 'vertical',
                  fontSize: '0.88rem'
                }}
                required
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Researcher Notes / Rationale:
            </label>
            <textarea 
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g., Clarified scope limitation based on empirical benchmarks in Section 4..."
              rows={2}
              className="input-field"
              style={{
                width: '100%',
                resize: 'vertical',
                fontSize: '0.88rem'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Annotation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AnnotationModal;
