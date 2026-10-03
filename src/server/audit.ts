/**
 * Audit logging.
 *
 * The log records *that* an action happened, by whom, to which resource, and how
 * it ended. It deliberately records nothing about the content: no report text, no
 * symptom answers, no filenames, no email addresses. An audit trail that could
 * leak a patient's blood results is itself a health-data store, and the table
 * grants no UPDATE or DELETE to the application role precisely so it cannot
 * become one.
 *
 * Every write is fire-and-forget with respect to the caller's success: a failure
 * to audit must never fail the action being audited, or an attacker could deny
 * service by exhausting the log. Failures are surfaced on the server console
 * only, never to the client.
 */
import { createHmac, randomUUID } from 'node:crypto';

import { getDb } from '../database/client';
import { getEnv } from '../lib/env';

/** Coarse, stable action names. Never interpolate user data into one. */
export type AuditAction =
  | 'account.delete'
  | 'report.upload'
  | 'report.analyze'
  | 'report.view'
  | 'report.delete'
  | 'consultation.start'
  | 'consultation.answer'
  | 'consultation.complete'
  | 'consent.grant'
  | 'consent.revoke'
  | 'rate_limit.blocked';

export type AuditOutcome = 'success' | 'failure' | 'denied' | 'error';

export interface AuditEvent {
  action: AuditAction;
  outcome: AuditOutcome;
  actorUserId?: string | null;
  actorRole?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  /** Raw IP and user agent. Hashed before they are stored. */
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  /**
   * Non-identifying context. Every value is truncated; never put free text from a
   * user, a report or a symptom answer in here.
   */
  metadata?: Record<string, string | number | boolean | null>;
}

export function logAudit(event: AuditEvent): void {
  // Fire-and-forget by design: see the module comment.
  void writeAudit(event).catch((error: unknown) => {
    console.error('[audit] write failed', {
      action: event.action,
      error: error instanceof Error ? error.message : 'unknown',
    });
  });
}

async function writeAudit(event: AuditEvent): Promise<void> {
  const db = await getDb();
  await db
    .insertInto('audit_logs')
    .values({
      id: randomUUID(),
      occurred_at: new Date(),
      actor_user_id: event.actorUserId ?? null,
      actor_role: event.actorRole ?? null,
      action: event.action,
      resource_type: event.resourceType ?? null,
      resource_id: event.resourceId ?? null,
      outcome: event.outcome,
      // A keyed hash, not a plain one: a plain SHA-256 of an IP is trivially
      // reversible over the whole IPv4 space, which would defeat the point of
      // not storing the address. The key is server-side, so the mapping is not
      // recoverable from the database alone.
      ip_hash: event.ip ? keyedHash(event.ip) : null,
      user_agent_hash: event.userAgent ? keyedHash(event.userAgent) : null,
      request_id: event.requestId ?? null,
      metadata: event.metadata ? sanitiseMetadata(event.metadata) : null,
    })
    .execute();
}

function keyedHash(value: string): string {
  return createHmac('sha256', getEnv().authSecret).update(value).digest('hex');
}

const MAX_METADATA_VALUE = 120;

function sanitiseMetadata(
  metadata: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata).slice(0, 20)) {
    if (!/^[a-z0-9_]{1,40}$/.test(key)) continue;
    if (typeof value === 'string') {
      out[key] = value.slice(0, MAX_METADATA_VALUE);
    } else {
      out[key] = value;
    }
  }
  return out;
}
