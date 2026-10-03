/**
 * The local user.
 *
 * Sign-in was removed so every feature is reachable without an account. The rest
 * of the app is still scoped by `user_id` — reports, consultations and consents
 * all belong to a user row, and those columns are NOT NULL — so rather than
 * reshaping that model, the app resolves one local profile and writes everything
 * to it.
 *
 * Consequence, stated plainly: this is a single-profile app. Everyone using this
 * deployment sees the same reports and consultations. Putting identity back is a
 * prerequisite for any hosted or multi-user use.
 *
 * There is no cookie and no session. The profile is found by a fixed internal
 * address, so the resolver is a plain read on every request and the only write is
 * the one-off insert on a database that has never been used.
 */
import { cache } from 'react';

import { getDb, isUniqueViolation } from '../database/client';

/**
 * A reserved address under the `.invalid` TLD, which by RFC 2606 can never be
 * registered. Nothing can be delivered to it and nothing can claim it, so this
 * row can never collide with a real person.
 */
const LOCAL_EMAIL = 'local@medisense.invalid';

/**
 * The user shape exposed to the UI.
 *
 * Declared explicitly rather than as a `Pick` of `UsersTable`, because that
 * would carry Kysely's `Generated<>` insert marker into a read-only type.
 */
export interface PublicUser {
  id: string;
  email: string;
  full_name: string | null;
  role: 'patient' | 'clinician' | 'reviewer' | 'admin';
  created_at: Date;
}

const USER_COLUMNS = ['id', 'email', 'full_name', 'role', 'created_at'] as const;

async function findLocalUser(): Promise<PublicUser | undefined> {
  const db = await getDb();
  return db
    .selectFrom('users')
    .select([...USER_COLUMNS])
    .where((eb) => eb(eb.fn('lower', ['email']), '=', LOCAL_EMAIL))
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}

async function resolveLocalUser(): Promise<PublicUser> {
  const existing = await findLocalUser();
  if (existing) return existing;

  const db = await getDb();
  const now = new Date();

  try {
    const inserted = await db
      .insertInto('users')
      .values({
        email: LOCAL_EMAIL,
        email_verified_at: now,
        password_hash: null,
        full_name: null,
        role: 'patient',
        auth_method: 'local',
        is_active: true,
        failed_login_count: 0,
        created_at: now,
        updated_at: now,
      })
      .returning([...USER_COLUMNS])
      .executeTakeFirst();
    if (!inserted) throw new Error('Local profile insert returned no row.');
    return inserted;
  } catch (error) {
    // Two requests against a fresh database can both find nothing and both try to
    // create the profile. The unique index on lower(email) refuses the second, and
    // the row the first one wrote is the correct answer, so the loser re-reads
    // rather than failing. Without this, a cold start would surface a 500 on the
    // first page load whenever two requests landed together.
    if (!isUniqueViolation(error)) throw error;

    const winner = await findLocalUser();
    if (!winner) throw error;
    return winner;
  }
}

/**
 * The local profile. Memoised per request so a page that needs the id in several
 * places pays for one query.
 *
 * A database error is allowed to propagate. The previous version returned null on
 * failure so that a blip logged the caller out instead of 500ing; with no session
 * there is nothing to fail closed to, and every caller of this needs the database
 * for its own work anyway, so a swallowed error would only move the failure to a
 * less obvious place.
 */
export const getCurrentUser = cache(resolveLocalUser);
