/**
 * Rate limiting.
 *
 * A fixed-window counter in the database, keyed by a hash of the caller rather
 * than by a raw address, so the table never becomes a list of who visited.
 *
 * Where it is applied matters. Two limits exist:
 *
 *  - a **sign-in** limit, tight and keyed on the account as well as the caller,
 *    because credential stuffing is the abuse that actually threatens this app;
 *  - a **general** limit on the expensive endpoints, because report analysis
 *    runs OCR and a language model, and an unthrottled endpoint is a way to run
 *    up someone else's bill.
 *
 * The general limit is applied inside the server actions rather than in
 * middleware, because a server action is the only place the caller identity and
 * the endpoint cost are both known. Failures are permissive by design: if the
 * limiter itself is broken, requests are allowed rather than locked out.
 */
import { createHmac } from 'node:crypto';

import { sql } from 'kysely';

import { getDb } from '../database/client';
import { getEnv } from '../lib/env';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfterSeconds: number;
  limit: number;
}

const ALLOW_ALL: RateLimitDecision = { allowed: true, remaining: 0, retryAfterSeconds: 0, limit: 0 };

export interface RateLimitOptions {
  /** Namespaces the limit so `signin:alice` and `report:bob` never share a count. */
  bucket: string;
  /** Who is asking. Hashed before storage. */
  identity: string | null;
  limit?: number;
  windowSeconds?: number;
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitDecision> {
  const env = getEnv();
  if (!env.rateLimitEnabled) return ALLOW_ALL;

  const limit = options.limit ?? env.rateLimitRequests;
  const windowSeconds = options.windowSeconds ?? env.rateLimitWindowSeconds;

  // An anonymous caller still gets a bucket, so an unauthenticated flood is
  // throttled rather than given a free pass.
  const key = hashKey(`${options.bucket}:${options.identity ?? 'anonymous'}`);
  const now = new Date();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs);

  try {
    const db = await getDb();

    // Insert-or-increment in one statement. `count` is a primary key together
    // with the bucket, so the ON CONFLICT target is exact and the whole thing
    // is atomic without a transaction or a read-modify-write race.
    const row = await db
      .insertInto('rate_limits')
      .values({ bucket: key, window_started_at: windowStart, count: 1, expires_at: expiresAt })
      .onConflict((oc) =>
        oc.columns(['bucket', 'window_started_at']).doUpdateSet({ count: sql`${sql.ref('rate_limits.count')} + 1` }),
      )
      .returning('count')
      .executeTakeFirstOrThrow();

    const count = Number(row.count);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000)),
      limit,
    };
  } catch (error) {
    // A limiter outage must not take the product down with it. Log loudly and
    // let the request through: availability wins over perfect enforcement.
    console.error('[rate-limit] unavailable', error instanceof Error ? error.message : 'unknown');
    return ALLOW_ALL;
  }
}

function hashKey(value: string): string {
  return createHmac('sha256', getEnv().authSecret).update(value).digest('hex').slice(0, 32);
}

/** Clear expired rows. Safe to call on a schedule; nothing depends on it. */
export async function pruneRateLimits(): Promise<number> {
  const db = await getDb();
  const result = await db.deleteFrom('rate_limits').where('expires_at', '<', new Date()).executeTakeFirst();
  return Number(result.numDeletedRows ?? 0);
}
