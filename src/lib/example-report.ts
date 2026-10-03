/**
 * A demo report for the "try an example" button.
 *
 * Generated from the existing synthetic-report generator rather than hand-typed,
 * so the example is a real report shape the parser is known to handle.
 */
import {
  buildSyntheticCbcDataset,
  buildSyntheticReportText,
  type SyntheticCbcRecord,
} from '../data/synthetic-reports';

let cached: string | null = null;

function pick(): SyntheticCbcRecord {
  const records = buildSyntheticCbcDataset(80);
  const low = records.find((r) => r.scenario === 'low_hb') ?? records[0];
  if (!low) throw new Error('Synthetic report generator produced no records.');
  return low;
}

export function exampleReportText(): string {
  cached ??= buildSyntheticReportText([pick()], 7)[0]?.text ?? '';
  return cached;
}
