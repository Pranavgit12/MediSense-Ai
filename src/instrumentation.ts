import { assertProductionSafety } from './lib/env';

export function register(): void {
  assertProductionSafety();
}
