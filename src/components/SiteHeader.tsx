import Link from 'next/link';

import { SiteHeaderFrame } from '@/components/SiteHeaderFrame';

export function SiteHeader() {
  return (
    <SiteHeaderFrame>
      <div className="site-header-inner">
        <Link href="/" className="site-brand" aria-label="MediSense home">
          <span aria-hidden className="site-brand-mark">M</span>
          <span>MediSense<span className="site-brand-ai"> AI</span></span>
        </Link>

        <nav aria-label="Main navigation" className="site-nav">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#features">Features</Link>
          <Link href="/#safety">Safety</Link>
          <Link href="/#technology">Technology</Link>
          <Link href="/#about">About</Link>
        </nav>

        <div className="site-header-actions">
          <Link href="/app/report" className="site-signin">Explain a report</Link>
          <Link href="/app/consult" className="site-header-cta">Check symptoms <span aria-hidden>→</span></Link>
        </div>
        <details className="mobile-navigation">
          <summary aria-label="Open navigation menu">
            <span />
            <span />
            <span />
          </summary>
          <nav aria-label="Mobile navigation">
            <Link href="/#how-it-works">How it works</Link>
            <Link href="/#features">Features</Link>
            <Link href="/#safety">Safety</Link>
            <Link href="/#technology">Technology</Link>
            <Link href="/#about">About</Link>
            <Link href="/app/report">Explain a report</Link>
            <Link href="/app/consult">Check symptoms <span aria-hidden="true">→</span></Link>
          </nav>
        </details>
      </div>
    </SiteHeaderFrame>
  );
}
