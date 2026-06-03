import { createContext, useContext, useCallback, useState } from 'react';

/* ── Status badge mapping (shared across campaigns + messages) ── */
const STATUS_STYLE = {
  // campaign
  draft: ['b-neutral', 'Draft'],
  scheduled: ['b-info', 'Scheduled'],
  queued: ['b-warn', 'Queued'],
  sending: ['b-brand', 'Sending'],
  completed: ['b-success', 'Completed'],
  cancelled: ['b-neutral', 'Cancelled'],
  // message
  pending: ['b-neutral', 'Pending'],
  sent: ['b-info', 'Sent'],
  delivered: ['b-brand', 'Delivered'],
  read: ['b-success', 'Read'],
  failed: ['b-danger', 'Failed'],
};

export function StatusBadge({ status }) {
  const [cls, label] = STATUS_STYLE[status] || ['b-neutral', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function StatCard({ label, value, meta, icon, tone = 'green' }) {
  return (
    <div className="card stat">
      <div className={`ic ic-${tone}`}>{icon}</div>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {meta && <div className="meta">{meta}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="center">
      <div className="spinner" />
    </div>
  );
}

export function Progress({ value }) {
  return (
    <div className="progress">
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Modal({ title, children, onClose, footer, width = 540 }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,21,37,0.45)',
        display: 'grid', placeItems: 'center', zIndex: 50, padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="card-pad">{children}</div>
        {footer && (
          <div className="card-pad" style={{ borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Toasts ─────────────────────────────────────────────────── */
const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, icon = '✅') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <span>{t.icon}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ── Formatting helpers ─────────────────────────────────────── */
export const fmt = (n) => (n ?? 0).toLocaleString('en-IN');
export const pct = (x) => `${((x || 0) * 100).toFixed(1)}%`;
export const dt = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
