/**
 * Report persistence.
 *
 * Everything except the language model's summary is deterministic, so only the
 * summary needs storing as prose: the safety notices and the clinician questions
 * are recomputed from the stored rows on read. That keeps one source of truth and
 * means a rule change applies to previously stored reports too.
 */
import { randomUUID } from 'node:crypto';

import { getDb } from '../database/client';
import { ANALYSIS_VERSION, buildDoctorQuestions, buildSafetyNotices } from '../medical/analyze';
import { PARSER_VERSION, TERMINOLOGY_VERSION } from '../medical/report-parser';
import { TRIAGE_RULE_SET_VERSION } from '../medical/triage';
import { encryptStringForText } from '../utils/crypto';
import { isUuid } from './ids';
import type {
  LabAnalysis,
  LabExplanation,
  LabResult,
  ParsedReport,
  ReportHeader,
} from '../types/medical';

/** Severity order used to roll many results up into one report status. */
const STATUS_RANK: Record<LabResult['status'], number> = {
  unknown: 0,
  normal: 1,
  low: 2,
  high: 2,
  critical_low: 3,
  critical_high: 3,
};

function overallStatus(results: LabResult[]): LabResult['status'] {
  return results.reduce<LabResult['status']>(
    (acc, r) => (STATUS_RANK[r.status] > STATUS_RANK[acc] ? r.status : acc),
    'normal',
  );
}

function toRow(reportId: string, r: LabResult, explanation: LabExplanation | undefined) {
  return {
    report_id: reportId,
    result_key: r.normalizedName,
    name: r.name,
    normalized_name: r.normalizedName,
    code: r.code,
    value: r.value === null ? null : String(r.value),
    raw_value: r.rawValue,
    unit: r.unit,
    unit_raw: null,
    reference_low: r.referenceLow === null ? null : String(r.referenceLow),
    reference_high: r.referenceHigh === null ? null : String(r.referenceHigh),
    reference_raw: r.referenceRaw,
    reference_source: r.referenceSource,
    status: r.status,
    reported_flag: r.reportedFlag,
    deviation: r.deviation === null ? null : String(r.deviation),
    note: r.note,
    explanation_json: explanation ?? null,
    created_at: new Date(),
  };
}

export interface SaveReportInput {
  userId: string;
  report: ParsedReport;
  /** The overview as shown to the user, whether written by a model or not. */
  summary: string;
  explanations: LabExplanation[];
  /** Present when the report arrived as an uploaded file rather than pasted text. */
  upload?: {
    storageKey: string;
    displayName: string;
    mime: string;
    sizeBytes: number;
    sha256: string;
    /** Encrypted extracted text, kept so the read can be audited. */
    ocrText: Buffer;
    provider: string;
    confidence: number | null;
  };
  /** Per-page text, stored so a page can be re-read without the original file. */
  pages?: { pageNumber: number; text: string; confidence: number | null }[];
}

export async function saveReport(input: SaveReportInput): Promise<string> {
  const db = await getDb();
  const byName = new Map(input.explanations.map((e) => [e.testName.toLowerCase(), e]));
  const h = input.report.header;
  const now = new Date();
  const pages = input.pages ?? [];

  return db.transaction().execute(async (tx) => {
    const inserted = await tx
      .insertInto('reports')
      .values({
        user_id: input.userId,
        title: h.title || 'Lab report',
        report_type: h.reportType,
        report_date: h.reportDate,
        collected_at: h.collectedAt,
        laboratory: h.laboratory,
        patient_age_years: h.patientAgeYears === null ? null : String(h.patientAgeYears),
        patient_sex: h.patientSex,
        referring_doctor: h.referringDoctor,
        page_count: pages.length || 1,
        ocr_text_encrypted: input.upload?.ocrText ?? null,
        ocr_provider: input.upload?.provider ?? null,
        ocr_confidence:
          input.upload?.confidence === null || input.upload?.confidence === undefined
            ? null
            : String(input.upload.confidence),
        storage_key: input.upload?.storageKey ?? null,
        original_filename: input.upload?.displayName ?? null,
        mime_type: input.upload?.mime ?? null,
        size_bytes: input.upload === undefined ? null : String(input.upload.sizeBytes),
        sha256: input.upload?.sha256 ?? null,
        pipeline_version: {
          parser: PARSER_VERSION,
          terminology: TERMINOLOGY_VERSION,
          safety: TRIAGE_RULE_SET_VERSION,
          analysis: ANALYSIS_VERSION,
        },
        overall_status: overallStatus(input.report.results),
        summary: input.summary,
        created_at: now,
        updated_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    if (pages.length) {
      await tx
        .insertInto('report_pages')
        .values(
          pages.map((p) => ({
            id: randomUUID(),
            report_id: inserted.id,
            page_number: p.pageNumber,
            storage_key: null,
            ocr_text: encryptStringForText(p.text),
            confidence: p.confidence === null ? null : String(p.confidence),
            created_at: now,
          })),
        )
        .execute();
    }

    if (input.report.results.length) {
      await tx
        .insertInto('lab_results')
        .values(
          input.report.results.map((r) =>
            toRow(inserted.id, r, byName.get(r.normalizedName.toLowerCase())),
          ),
        )
        .execute();
    }
    return inserted.id;
  });
}

export interface StoredReport {
  reportId: string;
  analysis: LabAnalysis;
}

/** Rebuild the full analysis for the results page, scoped to the owner. */
export async function getReportForUser(userId: string, reportId: string): Promise<StoredReport | null> {
  if (!isUuid(reportId)) return null;
  const db = await getDb();

  const meta = await db
    .selectFrom('reports')
    .selectAll()
    .where('id', '=', reportId)
    .where('user_id', '=', userId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  if (!meta) return null;

  const rows = await db
    .selectFrom('lab_results')
    .selectAll()
    .where('report_id', '=', reportId)
    .orderBy('created_at', 'asc')
    .execute();

  const results: LabResult[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    code: row.code,
    rawValue: row.raw_value,
    value: row.value === null ? null : Number(row.value),
    unit: row.unit,
    referenceLow: row.reference_low === null ? null : Number(row.reference_low),
    referenceHigh: row.reference_high === null ? null : Number(row.reference_high),
    referenceRaw: row.reference_raw,
    referenceSource: row.reference_source,
    status: row.status,
    reportedFlag: row.reported_flag as LabResult['reportedFlag'],
    deviation: row.deviation === null ? null : Number(row.deviation),
    note: row.note,
  }));

  const explanations = rows
    .map((r) => r.explanation_json as LabExplanation | null)
    .filter((e): e is LabExplanation => e !== null && typeof e === 'object');

  const header: ReportHeader = {
    title: meta.title,
    reportType: meta.report_type as ReportHeader['reportType'],
    reportTypeConfidence: 1,
    reportDate: meta.report_date,
    collectedAt: meta.collected_at,
    laboratory: meta.laboratory,
    patientAgeYears: meta.patient_age_years === null ? null : Number(meta.patient_age_years),
    patientSex: meta.patient_sex as ReportHeader['patientSex'],
    referringDoctor: meta.referring_doctor,
  };

  // Only the parts the deterministic derivations read are reconstructed here.
  const parsed = {
    header,
    results,
    unparsed: [],
    pipeline: {
      parser: PARSER_VERSION,
      terminology: TERMINOLOGY_VERSION,
      safety: TRIAGE_RULE_SET_VERSION,
    },
  } satisfies ParsedReport;

  return {
    reportId: meta.id,
    analysis: {
      header,
      results,
      abnormal: results.filter((r) => r.status !== 'normal' && r.status !== 'unknown'),
      overview: meta.summary ?? 'No summary was stored for this report.',
      explanations,
      doctorQuestions: buildDoctorQuestions(parsed, explanations),
      safetyNotices: buildSafetyNotices(parsed),
      disclaimer:
        'This explains what the numbers on your report say. It is not a diagnosis, and it does not replace advice from a clinician who can examine you.',
    },
  };
}

export interface ReportListItem {
  id: string;
  title: string;
  reportDate: string | null;
  overallStatus: LabResult['status'];
  abnormalCount: number;
  createdAt: Date;
}

export async function listReportsForUser(userId: string, limit = 20): Promise<ReportListItem[]> {
  const db = await getDb();

  const rows = await db
    .selectFrom('reports')
    .select(['id', 'title', 'report_date', 'overall_status', 'created_at'])
    .where('user_id', '=', userId)
    .where('deleted_at', 'is', null)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();

  if (!rows.length) return [];

  const counts = await db
    .selectFrom('lab_results')
    .select('report_id')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('status', 'in', ['low', 'high', 'critical_low', 'critical_high'])
    .where(
      'report_id',
      'in',
      rows.map((r) => r.id),
    )
    .groupBy('report_id')
    .execute();

  const countByReport = new Map(counts.map((c) => [c.report_id, Number(c.n)]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    reportDate: r.report_date,
    overallStatus: r.overall_status as LabResult['status'],
    abnormalCount: countByReport.get(r.id) ?? 0,
    createdAt: r.created_at,
  }));
}
