'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] route failed', error.name, error.digest ?? '(no digest)');
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
        Something went wrong
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-600">
        This page could not load. Please try again.
      </p>
      {error.digest ? (
        <p className="mt-4 text-xs text-ink-500">
          Error reference: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        Try again
      </button>
    </main>
  );
}
