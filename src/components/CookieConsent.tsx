'use client';

/**
 * The storage notice.
 *
 * The app sets no cookies at all — there is no session to keep and no analytics,
 * no advertising, no third-party script and no cross-site tracking. The notice
 * says that plainly rather than presenting a list of categories to tick, because a
 * consent dialog full of options implies a choice that does not exist here.
 *
 * The decision is stored in localStorage so the banner does not reappear on
 * every navigation. Nothing about a person's health is put in it.
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'medisense.essential-acknowledged';
const VERSION = '1';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  // Read after mount rather than during render: this is a client component
  // inside a server-rendered tree, and touching localStorage would differ
  // between the two passes.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== VERSION) setVisible(true);
    } catch {
      // Private browsing or a blocked storage partition. Showing the notice is
      // harmless; failing to hide it is only a small amount of repetition.
      setVisible(true);
    }
  }, []);

  function acknowledge() {
    try {
      window.localStorage.setItem(STORAGE_KEY, VERSION);
    } catch {
      // Non-fatal: the notice will show again next time.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Storage notice"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white shadow-lift"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-3xl text-xs leading-relaxed text-ink-600">
          <span className="font-semibold text-ink-900">We keep storage to the minimum.</span> MediSense
          sets no cookies, and there is no analytics, no advertising and no third-party tracking.
          Nothing you enter is used to build a profile, and health information you give us is never
          written into a cookie or a URL.
        </p>
        <button
          type="button"
          onClick={acknowledge}
          className="shrink-0 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Understood
        </button>
      </div>
    </div>
  );
}
