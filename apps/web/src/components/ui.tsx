import type { ReactNode } from 'react';

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Card({ children, title, actions }: { children: ReactNode; title?: string; actions?: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="row between" style={{ marginBottom: 12 }}>
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'warning' | 'success'; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <span className="spinner" /> <span className="muted">{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  PENDING: 'badge-warning',
  CONFIRMED: 'badge-primary',
  PREPARING: 'badge-primary',
  READY: 'badge-primary',
  OUT_FOR_DELIVERY: 'badge-primary',
  DELIVERED: 'badge-success',
  CANCELLED: 'badge-danger',
  RETURN_REQUESTED: 'badge-warning',
  RETURNED: 'badge-danger',
  SUCCESSFUL: 'badge-success',
  FAILED: 'badge-danger',
  REFUNDED: 'badge-warning',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? '';
  return <span className={`badge ${tone}`}>{label ?? status}</span>;
}
