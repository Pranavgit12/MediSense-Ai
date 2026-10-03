import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { CookieConsent } from '@/components/CookieConsent';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'MediSense — Understand your health',
    template: '%s · MediSense',
  },
  description:
    'MediSense helps you understand symptoms and medical reports in simple language, so you know what to discuss with a healthcare professional.',
  applicationName: 'MediSense',
  openGraph: {
    type: 'website',
    siteName: 'MediSense',
    title: 'MediSense — Understand your health',
    description:
      'Understand symptoms and medical reports in simple language, and know what to discuss with a healthcare professional.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#255941',
  width: 'device-width',
  initialScale: 1,
  // Never cap zoom: capping it breaks the WCAG 1.4.4 requirement and hurts the
  // older users who are the most likely to be reading a symptom questionnaire.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white font-sans">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
