/**
 * Report analysis: parsed results in, plain-language analysis out.
 *
 * The deterministic text is always produced first. The language model, if one is
 * configured, is then asked to rewrite that same text for the reader. It never
 * sees a raw report and never adds facts, so a model that hallucinates or is
 * unavailable degrades to the reviewed text rather than to something invented.
 */
import { canBackExplanation, getSource } from '../data/source-registry';
import { explainDeterministically } from './concepts';
import { CLINICAL_SYSTEM_PROMPT, completeOrFallback } from './llm';
import { formatReference, formatResultValue } from './report-parser';
import { describeUnit } from './units';
import type {
  LabAnalysis,
  LabExplanation,
  LabResult,
  MedicalSource,
  ParsedReport,
  SafetyNotice,
} from '../types/medical';

export const ANALYSIS_VERSION = 'analysis/1.0.0';

const DISCLAIMER =
  'This explains what the numbers on your report say. It is not a diagnosis, and it does not replace advice from a clinician who can examine you.';

/** Deterministic "overview" built only from the report's own numbers. */
function buildDeterministicOverview(report: ParsedReport): string {
  const total = report.results.length;
  if (total === 0) {
    return 'No results could be read from this report. That usually means the text was not laid out the way the parser expects, so nothing should be concluded from it.';
  }

  const abnormal = report.results.filter((r) => r.status !== 'normal' && r.status !== 'unknown');
  const unknown = report.results.filter((r) => r.status === 'unknown');

  const parts: string[] = [];
  parts.push(
    `This is a ${report.header.title || 'blood test'} report with ${total} result${total === 1 ? '' : 's'} on it.`,
  );

  if (abnormal.length === 0) {
    parts.push('Every result sits inside the reference range printed on your own report.');
  } else {
    const lines = abnormal.map((r) => {
      const direction =
        r.status === 'low' || r.status === 'critical_low'
          ? 'below the range'
          : 'above the range';
      return `${r.name} is ${formatResultValue(r)}, ${direction} (reference ${formatReference(r)})`;
    });
    parts.push(`${abnormal.length} result${abnormal.length === 1 ? ' is' : 's are'} outside that range: ${lines.join('; ')}.`);
  }

  if (unknown.length) {
    parts.push(
      `${unknown.length} line${unknown.length === 1 ? '' : 's'} could not be read confidently and ${unknown.length === 1 ? 'is' : 'are'} not included above.`,
    );
  }

  if (report.unparsed.length) {
    parts.push(
      `${report.unparsed.length} line${report.unparsed.length === 1 ? '' : 's'} in the text were not recognised as results and are listed at the bottom for you to check against the original.`,
    );
  }

  parts.push('A clinician reads these numbers alongside your history and examination, which this cannot do.');
  return parts.join(' ');
}

/**
 * Critical-value notices, derived only from the report's own status flags.
 *
 * Exported because this is deterministic: the results page recomputes it from
 * the stored rows instead of duplicating the logic.
 */
export function buildSafetyNotices(report: ParsedReport): SafetyNotice[] {
  const notices: SafetyNotice[] = [];
  for (const r of report.results) {
    if (r.status !== 'critical_low' && r.status !== 'critical_high') continue;
    const which = r.status === 'critical_low' ? 'critically low' : 'critically high';
    notices.push({
      id: `critical_${r.id}`,
      level: 'urgent',
      action: 'urgent_same_day_care',
      title: `${r.name} is ${which}`,
      body: `Your report shows ${r.name} at ${formatResultValue(r)}, which the lab marked outside the range printed on the report (${formatReference(r)}). A result at this level is normally acted on the same day. Please contact a clinician today, and mention that you have this report in front of you.`,
      triggers: [`critical_${r.status}`],
      ruleId: `lab_critical_${r.status}`,
      ruleVersion: ANALYSIS_VERSION,
      source: null,
      suppressNarrative: false,
    });
  }
  return notices;
}

export function buildDoctorQuestions(report: ParsedReport, explanations: LabExplanation[]): string[] {
  const questions: string[] = [];
  const abnormal = report.results.filter((r) => r.status !== 'normal' && r.status !== 'unknown');

  if (abnormal.length) {
    questions.push(
      `You have ${abnormal.length} result${abnormal.length === 1 ? '' : 's'} outside the range printed on the report. What do you make of ${abnormal.map((r) => r.name).join(', ')}?`,
    );
    questions.push('Given these results, is there anything you would want to recheck or monitor?');
  } else {
    questions.push('Everything on this report is inside its range. Is there anything you would still like to check?');
  }

  const ungrounded = explanations.filter((e) => !e.grounded);
  if (ungrounded.length) {
    questions.push(
      `I could not find a plain-language explanation for ${ungrounded.map((e) => e.testName).join(', ')}. What do these measure?`,
    );
  }

  questions.push('Could any medication or supplement I take be affecting these results?');
  questions.push('Is there anything I should do differently while we wait to see if things change?');
  return questions;
}

/**
 * Attach curated sources to the explanations we can actually vouch for.
 *
 * A source is only cited when the registry says it may back a user-facing
 * clinical statement, so a draft or unapproved source can never appear next to
 * an explanation.
 */
function attachSources(explanations: LabExplanation[]): LabExplanation[] {
  const record = getSource('medlineplus-nlm');
  const usable = record && canBackExplanation(record.slug) ? toMedicalSource(record) : null;
  return explanations.map((e) => (usable ? { ...e, sources: [usable] } : e));
}

/** `SourceRecord` carries review metadata; `MedicalSource` is the citing shape. */
function toMedicalSource(record: NonNullable<ReturnType<typeof getSource>>): MedicalSource {
  return {
    id: record.slug,
    title: record.title,
    publisher: record.publisher,
    url: record.url,
    publicationDate: null,
    lastReviewed: record.lastReviewed,
    license: record.license,
    authorityNote: `Reviewed by ${record.lastReviewedBy}. Quality tier: ${record.quality.qualityTier}.`,
  };
}

export interface AnalysisOutcome {
  analysis: LabAnalysis;
  /** True when a language model produced the overview text. */
  overviewFromModel: boolean;
  warning: string | null;
}

export async function analyzeReport(report: ParsedReport): Promise<AnalysisOutcome> {
  const explanations = attachSources(
    report.results.map((r) => explainDeterministically(r.normalizedName || r.name)),
  );

  const deterministicOverview = buildDeterministicOverview(report);
  const safetyNotices = buildSafetyNotices(report);

  const facts = report.results
    .map(
      (r) =>
        `- ${r.name}: ${formatResultValue(r)}, reference ${formatReference(r)}, status ${r.status}${r.unit ? `, unit ${describeUnit(r.unit)}` : ''}`,
    )
    .join('\n');

  const prompt = [
    'Here is a blood test report that has already been parsed. Every number and reference range below comes from the report itself.',
    '',
    'Results:',
    facts,
    '',
    'Reviewed plain-language notes for the tests we recognise:',
    ...explanations
      .filter((e) => e.grounded)
      .map((e) => `${e.testName}: ${e.whatItMeasures}`),
    '',
    `Write two or three short paragraphs for the patient. First, say what the report is and how many results it has. Then describe which results are outside the range printed on the report and what those tests measure in simple words. Do not give an overall verdict, do not name a condition, and do not suggest treatment. If every result is in range, say so plainly.`,
  ].join('\n');

  const outcome = await completeOrFallback(
    [
      { role: 'system', content: CLINICAL_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    deterministicOverview,
    { maxOutputTokens: 500, temperature: 0.2 },
  );

  const analysis: LabAnalysis = {
    header: report.header,
    results: report.results,
    abnormal: report.results.filter((r) => r.status !== 'normal' && r.status !== 'unknown'),
    overview: outcome.text,
    explanations,
    doctorQuestions: buildDoctorQuestions(report, explanations),
    safetyNotices,
    disclaimer: DISCLAIMER,
  };

  return {
    analysis,
    overviewFromModel: outcome.fromModel,
    warning: outcome.warning,
  };
}

/** Result rows formatted for a table, kept here so the UI stays declarative. */
export interface ResultRow {
  id: string;
  name: string;
  value: string;
  reference: string;
  status: LabResult['status'];
  unitPhrase: string;
  hasExplanation: boolean;
}

export function toResultRows(report: ParsedReport, explanations: LabExplanation[]): ResultRow[] {
  const byName = new Map(explanations.map((e) => [e.testName.toLowerCase(), e]));
  return report.results.map((r) => {
    const explanation = byName.get((r.normalizedName || r.name).toLowerCase());
    return {
      id: r.id,
      name: r.name,
      value: formatResultValue(r),
      reference: formatReference(r),
      status: r.status,
      unitPhrase: describeUnit(r.unit),
      hasExplanation: explanation?.grounded ?? false,
    };
  });
}
