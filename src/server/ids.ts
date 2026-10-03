/**
 * Identifier validation for route parameters.
 *
 * Every id column is `uuid`. Postgres answers a non-uuid string with error
 * 22P02, so an unvalidated route parameter turns a mistyped URL into a 500.
 * Checking here lets the pages call `notFound()` and answer 404 instead.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}
