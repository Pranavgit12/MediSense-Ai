import type { ReactNode } from 'react';

import { SiteHeader } from '@/components/SiteHeader';
import { Footer } from '@/components/Footer';

export const metadata = {
  title: 'Your dashboard · MediSense',
  robots: { index: false, follow: false },
};

/**
 * These pages read the local profile out of the database on every render, so
 * nothing here can be prerendered. Without this Next would treat the whole /app
 * tree as static and try to resolve the profile at build time — which fails, and
 * would serve one visitor's saved reports to the next regardless.
 *
 * The layout guard used to imply this by calling `cookies()`; there is no cookie
 * now, so it has to be stated.
 */
export const dynamic = 'force-dynamic';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
