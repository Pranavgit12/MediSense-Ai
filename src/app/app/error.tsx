'use client';

/**
 * Error boundary for the whole /app tree.
 *
 * Every page under /app reads the local profile out of the database before it can
 * render anything, so a database that is unreachable, unmigrated or out of
 * connections takes out the entire feature area at once. Without this boundary
 * that surfaces as a bare "500 Internal Server Error" with nothing to act on.
 *
 * What it must not do is print the error. These failures carry a connection string
 * or a driver message that names the host, the role and sometimes the password, so
 * the message here is fixed text and the detail goes to the server log, where the
 * `digest` below is the key that ties the two together.
 */
import { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side detail. Safe to log: it is the server console, not the response.
    console.error('[app] route failed', error.message, error.digest ?? '(no digest)');
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
        Something went wrong on our side
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-600">
        This page could not load. The most common cause is a problem reaching the
        database — it may need its migrations run, or it may have run out of
        available connections.
      </p>
      {error.digest ? (
        <p className="mt-4 text-xs text-ink-500">
          Quote this reference when reporting it: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
      <div className="mt-8">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
