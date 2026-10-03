/**
 * ReportPreview — a decorative illustration of a lab report summary.
 *
 * This is not a screenshot and not a photo. It is drawn so that it can show the
 * one thing the product actually does: put a result next to the reference
 * range printed on the reader's own report and mark where it sits.
 *
 * The values are invented. That is deliberate, but it is also why nothing here
 * is selectable text and the whole figure is aria-hidden: a decorative graphic
 * must never be the only place a clinical-looking number appears, because a
 * screen-reader user would otherwise hear a fabricated result presented as
 * real. The real numbers live in the report view, inside the reader's own
 * account, labelled with their provenance.
 */
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

type Row = {
  name: string;
  value: string;
  range: string;
  /** Position of the marker on the 0-100 track, as a percentage. */
  at: number;
  /** Start and end of the printed reference range on the same track. */
  from: number;
  to: number;
  state: 'low' | 'normal' | 'high';
};

const ROWS: Row[] = [
  { name: 'Haemoglobin', value: '11.8 g/dL', range: '12.0 – 15.5', at: 30, from: 32, to: 88, state: 'low' },
  { name: 'White cells', value: '7.4 ×10⁹/L', range: '4.0 – 11.0', at: 46, from: 12, to: 80, state: 'normal' },
  { name: 'Platelets', value: '312 ×10⁹/L', range: '150 – 400', at: 52, from: 20, to: 92, state: 'normal' },
];

const MARKER: Record<Row['state'], string> = {
  low: 'text-amber-300',
  normal: 'text-brand-300',
  high: 'text-amber-300',
};

const ICON: Record<Row['state'], typeof ArrowDown> = {
  low: ArrowDown,
  normal: Minus,
  high: ArrowUp,
};

export function ReportPreview() {
  return (
    <figure
      aria-hidden
      className="glass glass-sheen glass-rim select-none rounded-[1.75rem] p-4 sm:p-5"
    >
      {/* Grain sits above the content. Decorative only. */}
      <span aria-hidden className="glass-grain pointer-events-none absolute inset-0 rounded-[inherit]" />
      {/* Pane header */}
      <div className="relative mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
            Full blood count
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-white">Your results, at a glance</p>
        </div>
        <span className="glass-subtle shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-white/80">
          3 tests
        </span>
      </div>

      <ul className="relative space-y-3.5">
        {ROWS.map((row) => {
          const Icon = ICON[row.state];
          return (
            <li key={row.name}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-medium text-white/90">{row.name}</span>
                <span className="shrink-0 font-numeric text-[13px] font-semibold tabular-nums text-white">
                  {row.value}
                </span>
              </div>

              {/* Track: the printed reference range, with the result marked. */}
              <div className="relative mt-2 h-1.5 w-full rounded-full bg-white/12">
                <div
                  className="absolute inset-y-0 rounded-full bg-white/25"
                  style={{ left: `${row.from}%`, width: `${row.to - row.from}%` }}
                />
                <div
                  className={`absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-current shadow-[0_0_0_3px_rgba(255,255,255,0.12)] ${MARKER[row.state]}`}
                  style={{ left: `${row.at}%` }}
                />
              </div>

              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-white/45">Ref {row.range}</span>
                <span className="flex shrink-0 items-center gap-1 text-white/70">
                  <Icon className="h-3 w-3" strokeWidth={2.5} />
                  {row.state === 'normal' ? 'In range' : row.state === 'low' ? 'Below' : 'Above'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Callout: the "so what", which is the actual product. */}
      <div className="glass-subtle relative mt-5 rounded-2xl p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
          What to ask
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/90">
          &ldquo;My haemoglobin is just under the range on my report. Is that worth following up,
          or is it normal for me?&rdquo;
        </p>
      </div>
    </figure>
  );
}
