'use client';

/**
 * GlyphPortalSection — the MediSense framing section on the public landing page.
 *
 * Wraps the vendored Glyph Portal component (see ./glyph-portal.tsx for its MIT
 * notice) in a self-contained scroll region.
 *
 * Three deliberate departures from the upstream demo, all recorded here so a
 * later editor does not "fix" them back:
 *
 * 1. No remote webfont. The demo pulls a .woff2 from a third-party CDN. This app
 *    tells every visitor in its storage notice that it makes no third-party
 *    requests, and a font fetch would contradict that in the first second on the
 *    page. A system stack keeps the promise and costs nothing.
 * 2. The scroll region is bounded and self-contained. The animation must not
 *    hijack page scroll: a visitor looking for urgent guidance has to be able to
 *    scroll past this to the rest of the page at any time.
 * 3. The section sits below the primary calls to action, never above them, and
 *    never between the visitor and the two things they can actually do.
 */
import { ArrowDownRight, FileText, HeartPulse, Stethoscope } from 'lucide-react';
import Image from 'next/image';

import GlyphPortal from './ui/glyph-portal';

const WORD = 'CLARITY';

/** Only already-loaded faces. No network request is made for this. */
const SYSTEM_STACK = '"Arial Black", "Helvetica Neue", Arial, system-ui, sans-serif';

const FEATURES = [
  {
    Icon: FileText,
    no: '01',
    title: 'Your own numbers, your own ranges',
    body: 'Paste or upload a lab report. Every value is read from that report and compared against the reference range printed on it. Nothing is estimated.',
  },
  {
    Icon: Stethoscope,
    no: '02',
    title: 'Written to hand to a doctor',
    body: 'You get a plain-English summary of what each test measures, plus the specific questions worth asking at your appointment.',
  },
  {
    Icon: HeartPulse,
    no: '03',
    title: 'Warning signs stated first',
    body: 'If a result or a symptom needs urgent attention, that comes before anything else on the page. It is never softened and never buried.',
  },
];

export function GlyphPortalSection() {
  return (
    <div
      data-glyph-portal-demo
      tabIndex={0}
      role="region"
      aria-label="MediSense. Scroll within this panel to step inside."
      className="relative h-[min(720px,80svh)] w-full overflow-y-auto bg-brand-900 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
    >
      <style>{`
        [data-glyph-portal-demo] [data-gp-caption]{inset:calc(var(--gp-word-bottom,50%) + 82px) 24px auto;justify-content:center;}
        [data-glyph-portal-demo] [data-gp-hint]{display:none;}
        [data-glyph-portal-demo] [data-gp-enter]{min-height:46px;padding:0 20px;gap:12px;background:#fbfbfa;border:1px solid #d4d9e3;border-radius:10px;color:#1c3b3a;font-size:13px;font-weight:600;box-shadow:0 1px 2px #0a21211a;transition:background .18s,box-shadow .18s;}
        [data-glyph-portal-demo] [data-gp-enter]:hover{background:#eef7f6;box-shadow:0 3px 8px #0a212118;}
        [data-glyph-portal-demo] [data-gp-touch-picker]{top:auto;bottom:18px;left:50%;}
        [data-glyph-portal-demo] [data-gp-select]{border-color:transparent;border-radius:8px;font-size:12px;color:#4b5872;}
        [data-ms-header]{position:absolute;inset:clamp(24px,4.5cqw,48px) clamp(24px,5cqw,64px) auto;display:flex;align-items:center;justify-content:space-between;gap:20px;}
        [data-ms-logo]{display:inline-flex;align-items:center;gap:8px;font-size:19px;font-weight:600;letter-spacing:-.02em;color:#fbfbfa;}
        [data-ms-category]{font-size:12px;line-height:1.5;color:rgba(251,251,250,.7);text-align:right;}
        [data-ms-eyebrow]{position:absolute;inset:auto 24px calc(100% - var(--gp-word-top,35%) + 32px);margin:0;text-align:center;font-size:13px;line-height:1.5;color:rgba(251,251,250,.75);}
        [data-ms-support]{position:absolute;inset:calc(var(--gp-word-bottom,50%) + 32px) 24px auto;margin:0;text-align:center;font-size:16px;line-height:1.5;color:rgba(251,251,250,.85);}
        [data-ms-scroll]{position:absolute;inset:auto 24px 7%;text-align:center;color:rgba(251,251,250,.55);font-size:11px;letter-spacing:.01em;}
        @container(max-width:450px){[data-ms-category]{max-width:14ch;}[data-ms-eyebrow]{font-size:12px;}[data-ms-support]{font-size:14px;}[data-glyph-portal-demo] [data-gp-caption]{top:calc(var(--gp-word-bottom,50%) + 76px);}}
        @container(max-height:479px){[data-ms-header]{top:18px;}[data-ms-support]{top:calc(var(--gp-word-bottom,50%) + 16px);}[data-glyph-portal-demo] [data-gp-caption]{top:calc(var(--gp-word-bottom,50%) + 60px);}[data-ms-scroll]{display:none;}}
        [data-glyph-portal-demo] [data-gp-content]{padding:4.5rem clamp(1.25rem,5cqw,5rem) 5.5rem;font-family:var(--font-sans);}
        [data-glyph-portal-demo] section,[data-glyph-portal-demo] [data-gp-caption]{font-family:var(--font-sans);}
        [data-ms-copy]{display:flex;width:min(100%,72rem);margin:auto;flex-direction:column;align-items:flex-start;gap:clamp(2rem,5svh,3rem);}
        [data-ms-copy] h2{max-width:44rem;margin:0;color:#fbfbfa;font-size:clamp(1.5rem,1rem + 1.8cqw,2.125rem);font-weight:600;line-height:1.25;letter-spacing:-.02em;text-wrap:balance;}
        [data-ms-features]{display:grid;width:100%;grid-template-columns:1fr;gap:1.75rem;}
        [data-ms-feature]{border-top:1px solid rgba(251,251,250,.22);padding-top:1.1rem;}
        [data-ms-feature] h3{margin:0;display:flex;align-items:center;gap:.6rem;color:#fbfbfa;font-size:1.0625rem;font-weight:600;line-height:1.3;}
        [data-ms-feature] p{margin:.6rem 0 0;color:rgba(251,251,250,.85);font-size:.9375rem;line-height:1.6;}
        [data-ms-no]{font-family:var(--font-sans);font-size:.75rem;font-weight:700;letter-spacing:.08em;color:rgba(251,251,250,.6);font-variant-numeric:tabular-nums;}
        [data-ms-disclaimer]{margin:0;display:flex;align-items:center;gap:.35rem;color:rgba(251,251,250,.6);font-size:.8125rem;line-height:1.5;}
        @container(min-width:768px){[data-ms-features]{grid-template-columns:repeat(3,minmax(0,1fr));gap:3rem;}}
      `}</style>

      <GlyphPortal
        word={WORD}
        fontFamily={SYSTEM_STACK}
        fontWeight={900}
        scrollLength={2.2}
        interactive
        enterLabel="Step inside"
        background={
          <div className="absolute inset-0" style={{ transform: 'scale(var(--gp-field-scale,1))' }}>
            <Image
              src="https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1800&q=70"
              alt=""
              fill
              priority={false}
              sizes="100vw"
              className="object-cover"
            />
            {/* Keeps type legible over any photograph and restores the brand green. */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(135deg, rgba(10,33,33,.88) 0%, rgba(28,59,58,.72) 48%, rgba(8,45,34,.9) 100%)',
              }}
            />
          </div>
        }
        front={
          <>
            <div data-ms-header>
              <span data-ms-logo>
                <HeartPulse aria-hidden className="h-5 w-5" strokeWidth={2.2} />
                MediSense
              </span>
              <span data-ms-category>Understand your health</span>
            </div>
            <p data-ms-eyebrow>Results mean more once they make sense.</p>
            <p data-ms-support>Start with clarity.</p>
            <span data-ms-scroll>Scroll for a closer look ↓</span>
          </>
        }
      >
        <div data-ms-copy>
          <h2>Your results, without the guesswork.</h2>
          <div data-ms-features>
            {FEATURES.map(({ Icon, no, title, body }) => (
              <div data-ms-feature key={no}>
                <h3>
                  <span data-ms-no>{no}</span>
                  <Icon aria-hidden className="h-4 w-4 shrink-0 text-brand-300" strokeWidth={2.2} />
                  {title}
                </h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
          <p data-ms-disclaimer>
            <ArrowDownRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
            Not a diagnosis. Not a replacement for a clinician.
          </p>
        </div>
      </GlyphPortal>
    </div>
  );
}
