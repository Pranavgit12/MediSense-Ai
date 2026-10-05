import { assertProductionSafety } from './lib/env';

export function register(): void {
  assertProductionSafety();
}

export function onRequestError(
  error: unknown,
  request: Readonly<{ method: string }>,
  context: Readonly<{ routePath: string; routeType: string }>,
): void {
  console.error('[request-error]', {
    name: error instanceof Error ? error.name : 'UnknownError',
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
  });
}
