/**
 * Small presentational primitives shared by the public and signed-in pages.
 * Server components only: no state, no effects.
 */
import type { ReactNode } from 'react';

import type { Provenance, SafetyLevel } from '../../types/medical';

export function Card({
  children,
  className = '',
  as: Tag = 'div',
  role,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
  role?: string;
}) {
  return (
    <Tag role={role} className={`ui-card rounded-2xl border border-ink-200/70 bg-white shadow-card ${className}`}>
      {children}
    </Tag>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = 'left',
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  align?: 'left' | 'center';
}) {
  const alignClass = align === 'center' ? 'text-center items-center' : '';
  return (
    <div className={`flex flex-col gap-3 ${alignClass}`}>
      {eyebrow ? (
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">
          {eyebrow}
        </span>
      ) : null}
      <h2 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">{title}</h2>
      {lede ? <p className="max-w-2xl text-base leading-relaxed text-ink-600">{lede}</p> : null}
    </div>
  );
}

/** The status pill colours are the same everywhere so they are learned once. */
const STATUS_STYLES: Record<string, string> = {
  normal: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  low: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  high: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  critical_low: 'bg-red-50 text-red-800 ring-red-600/25',
  critical_high: 'bg-red-50 text-red-800 ring-red-600/25',
  unknown: 'bg-ink-100 text-ink-600 ring-ink-500/20',
};

const STATUS_LABELS: Record<string, string> = {
  normal: 'In range',
  low: 'Below range',
  high: 'Above range',
  critical_low: 'Critically low',
  critical_high: 'Critically high',
  unknown: 'Not read',
};

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        STATUS_STYLES[status] ?? STATUS_STYLES.unknown
      } ${className}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

const LEVEL_STYLES: Record<SafetyLevel, { box: string; badge: string; label: string }> = {
  emergency: {
    box: 'border-red-300 bg-red-50',
    badge: 'bg-red-600 text-white',
    label: 'Emergency',
  },
  urgent: {
    box: 'border-orange-300 bg-orange-50',
    badge: 'bg-orange-600 text-white',
    label: 'Urgent',
  },
  soon: {
    box: 'border-amber-300 bg-amber-50',
    badge: 'bg-amber-600 text-white',
    label: 'See a doctor soon',
  },
  routine: {
    box: 'border-brand-200 bg-brand-50',
    badge: 'bg-brand-600 text-white',
    label: 'Routine',
  },
  unknown: {
    box: 'border-ink-200 bg-ink-50',
    badge: 'bg-ink-500 text-white',
    label: 'Not enough information',
  },
};

export function levelStyle(level: SafetyLevel) {
  return LEVEL_STYLES[level] ?? LEVEL_STYLES.unknown;
}

/**
 * Safety notices are the one thing on the page that must never be quiet, so they
 * are rendered above all other content and never suppressed.
 */
export function SafetyNoticeList({
  level,
  title,
  notices,
}: {
  level: SafetyLevel;
  title: string;
  notices: { id: string; title: string; body: string }[];
}) {
  if (!notices.length) return null;
  const style = levelStyle(level);

  return (
    <section
      className={`rounded-2xl border-2 p-5 ${style.box}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}>
          {style.label}
        </span>
      </div>
      <h2 className="mt-3 text-lg font-semibold text-ink-900">{title}</h2>
      <ul className="mt-3 space-y-3">
        {notices.map((n) => (
          <li key={n.id}>
            <p className="text-sm font-semibold text-ink-900">{n.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">{n.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const PROVENANCE_LABELS: Record<Provenance, string> = {
  user_report: 'From your report',
  report_reference_range: 'Range printed on your report',
  knowledge_base: 'Reviewed reference',
  computed: 'Calculated',
  ai_generated: 'Written by a language model',
  user_reported: 'You told us this',
};

export function ProvenanceNote({ provenance }: { provenance: Provenance }) {
  return (
    <span className="text-[11px] uppercase tracking-wide text-ink-500">
      {PROVENANCE_LABELS[provenance] ?? provenance}
    </span>
  );
}

export function Disclaimer({ children }: { children: string }) {
  return (
    <p className="rounded-xl border border-ink-200 bg-ink-50 p-4 text-xs leading-relaxed text-ink-600">
      {children}
    </p>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-300 bg-white/60 p-8 text-center">
      <p className="text-sm font-semibold text-ink-900">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-600">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function SubmitButton({
  children,
  pending,
  disabled,
  className = '',
}: {
  children: ReactNode;
  pending?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const isDisabled = Boolean(pending || disabled);
  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending ? 'Working…' : children}
    </button>
  );
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {error}
    </p>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-800">
        {label}
      </label>
      {hint ? <p className="text-xs leading-relaxed text-ink-500">{hint}</p> : null}
      {children}
    </div>
  );
}

export const inputClass =
  'w-full rounded-xl border border-ink-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-sm outline-none transition placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';
