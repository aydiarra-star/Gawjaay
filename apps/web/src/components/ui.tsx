import type { ReactNode } from 'react';
import { IconInbox, IconSearch } from './icons';

/* ------------------------------------------------------------------ */
/* En-tête de page                                                     */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */
export function SectionHead({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <div className="section-title">{title}</div>
        {subtitle && <div className="section-sub">{subtitle}</div>}
      </div>
      {actions}
    </div>
  );
}

export function Section({ title, subtitle, actions, children }: { title?: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      {title && <SectionHead title={title} subtitle={subtitle} actions={actions} />}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Carte                                                               */
/* ------------------------------------------------------------------ */
export function Card({ children, title, actions, flush }: { children: ReactNode; title?: string; actions?: ReactNode; flush?: boolean }) {
  return (
    <section className={`card${flush ? ' card-flush' : ''}`}>
      {(title || actions) && (
        <div className="card-head" style={flush ? { padding: '20px 20px 0' } : undefined}>
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Indicateurs                                                         */
/* ------------------------------------------------------------------ */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'positive' | 'negative' | 'muted';
}) {
  const valueStyle =
    tone === 'positive'
      ? { color: 'var(--ok)' }
      : tone === 'negative'
        ? { color: 'var(--danger)' }
        : tone === 'muted'
          ? { color: 'var(--muted)' }
          : undefined;
  return (
    <div className="kpi-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={valueStyle}>
        {value}
      </div>
      {hint && <div className="stat-trend">{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */
export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'warning' | 'success'; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chargement                                                          */
/* ------------------------------------------------------------------ */
export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <span className="spinner" />
      <span className="muted small">{label}</span>
    </div>
  );
}

export function SkeletonGrid({ count = 8, height = 210 }: { count?: number; height?: number }) {
  return (
    <div className="product-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* États vides                                                         */
/* ------------------------------------------------------------------ */
export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon ?? <IconInbox size={22} />}</span>
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recherche                                                           */
/* ------------------------------------------------------------------ */
export function SearchField({
  value,
  onChange,
  placeholder = 'Rechercher…',
  label,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  onSubmit?: () => void;
}) {
  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <IconSearch size={18} />
      <input
        aria-label={label ?? placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type="search"
      />
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Pastilles de statut                                                 */
/* ------------------------------------------------------------------ */
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
  ASSIGNED: 'badge-info',
  IN_TRANSIT: 'badge-primary',
  FAILED: 'badge-danger',
  SUCCESSFUL: 'badge-success',
  REFUNDED: 'badge-warning',
  RECEIVED: 'badge-success',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? '';
  return <span className={`badge ${tone}`}>{label ?? status}</span>;
}

/* ------------------------------------------------------------------ */
/* Avatars                                                             */
/* ------------------------------------------------------------------ */
export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Chips (filtres)                                                     */
/* ------------------------------------------------------------------ */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  allLabel,
}: {
  options: Array<{ value: T; label: string }>;
  value: T | '';
  onChange: (v: T | '') => void;
  allLabel?: string;
}) {
  return (
    <div className="chips" role="tablist">
      {allLabel && (
        <button type="button" role="tab" aria-selected={value === ''} className={`chip${value === '' ? ' active' : ''}`} onClick={() => onChange('')}>
          {allLabel}
        </button>
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`chip${value === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
