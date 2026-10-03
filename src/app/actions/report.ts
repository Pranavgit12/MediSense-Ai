'use server';

import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/local-user';
import { analyzeReport } from '@/medical/analyze';
import { parseLabReport } from '@/medical/report-parser';
import { extractReportText, OcrUnavailable } from '@/ocr';
import { UploadRejected, acceptUpload, newUploadId } from '@/ocr/file-validation';
import { logAudit } from '@/server/audit';
import { checkRateLimit } from '@/server/rate-limit';
import { saveReport } from '@/server/report-store';
import { getStorage, storeUpload } from '@/server/storage';
import { encryptString } from '@/utils/crypto';

export interface ReportFormState {
  error: string | null;
  text: string;
}

const MAX_TEXT = 40_000;

/**
 * Report analysis runs OCR and a language model, so it is the endpoint most
 * worth throttling. Ten an hour is well above what a person actually does and
 * far below what a script would use to spend someone else's inference budget.
 */
const REPORT_LIMIT = { limit: 10, windowSeconds: 3600 };

/** True when the caller has run out of report allowance. */
async function outOfAllowance(userId: string): Promise<boolean> {
  const decision = await checkRateLimit({
    bucket: 'report',
    identity: userId,
    ...REPORT_LIMIT,
  });
  if (decision.allowed) return false;
  logAudit({ action: 'rate_limit.blocked', outcome: 'denied', actorUserId: userId });
  return true;
}

/**
 * Analyse a report the user pasted as text.
 *
 * Text is the more reliable of the two inputs, so it is offered first and the
 * upload path is the alternative rather than the default.
 */
export async function analyzeReportAction(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const user = await getCurrentUser();

  if (await outOfAllowance(user.id)) {
    return {
      error: 'You have analysed a lot of reports in a short time. Try again later, or paste the text to keep going.',
      text: '',
    };
  }

  const raw = formData.get('text');
  const text = typeof raw === 'string' ? raw.trim() : '';
  // Only needed for fully ambiguous dates such as 03/04/2026.
  const dayFirstDates = formData.get('dayFirstDates') === 'on';

  if (!text) {
    return { error: 'Paste the text of your report first.', text };
  }
  if (text.length < 20) {
    return {
      error:
        'That looks too short to be a report. Paste the whole report, including the reference ranges.',
      text,
    };
  }
  if (text.length > MAX_TEXT) {
    return {
      error: 'That report is too long to process. Paste a single report at a time.',
      text: '',
    };
  }

  const parsed = parseLabReport(text, { dayFirstDates });
  const { analysis, warning } = await analyzeReport(parsed);

  const reportId = await saveReport({
    userId: user.id,
    report: parsed,
    summary: analysis.overview,
    explanations: analysis.explanations,
    pages: [{ pageNumber: 1, text, confidence: null }],
  });

  // Say so when the model was unavailable and the reader is getting the reviewed
  // fallback text, rather than silently substituting it.
  logAudit({
    action: 'report.analyze',
    outcome: 'success',
    actorUserId: user.id,
    resourceType: 'report',
    resourceId: reportId,
    metadata: { source: 'pasted_text', results: parsed.results.length },
  });
  if (warning) redirect(`/app/report/${reportId}?notice=${encodeURIComponent(warning)}`);
  redirect(`/app/report/${reportId}`);
}

/**
 * Analyse an uploaded PDF or image.
 *
 * The order here is a safety order. The file is validated on its bytes before
 * anything reads it, the text is extracted by a provider that is told to report
 * how sure it is, and a low-confidence read is surfaced on the results page
 * rather than being presented as a transcription.
 */
export async function uploadReportAction(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const user = await getCurrentUser();
  const dayFirstDates = formData.get('dayFirstDates') === 'on';

  if (await outOfAllowance(user.id)) {
    return {
      error: 'You have analysed a lot of reports in a short time. Try again later, or paste the text to keep going.',
      text: '',
    };
  }

  const entry = formData.get('file');
  if (!(entry instanceof File) || entry.size === 0) {
    return { error: 'Choose a file first.', text: '' };
  }

  // Read once. The bytes are used for validation, extraction and storage, and a
  // lab report is small enough that holding it for the length of one request is
  // fine; reading it three times is not.
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await entry.arrayBuffer());
  } catch {
    return { error: 'That file could not be read. Try a different copy of it.', text: '' };
  }

  let accepted;
  try {
    accepted = await acceptUpload(bytes, entry.name, newUploadId());
  } catch (error) {
    if (error instanceof UploadRejected) return { error: error.message, text: '' };
    return { error: 'That file could not be read. Try a different copy of it.', text: '' };
  }

  let extracted;
  try {
    extracted = await extractReportText(bytes, accepted.kind);
  } catch (error) {
    if (error instanceof OcrUnavailable) return { error: error.message, text: '' };
    return {
      error: 'Something went wrong while reading that file. Pasting the report text will still work.',
      text: '',
    };
  }

  if (extracted.text.length > MAX_TEXT) {
    return {
      error: 'That file contains more text than a single report needs. Upload one report at a time.',
      text: '',
    };
  }

  const parsed = parseLabReport(extracted.text, { dayFirstDates });
  if (!parsed.results.length) {
    return {
      error:
        'No test results could be read from that file. A clearer, straight-on photo works best, or paste the text instead.',
      text: '',
    };
  }

  const { analysis, warning } = await analyzeReport(parsed);

  // The stored file is a random key under a non-served directory; it is never
  // referenced by the path the browser sees.
  const storageKey = await storeUpload(
    bytes,
    accepted.kind === 'pdf' ? 'pdf' : accepted.kind === 'png' ? 'png' : 'jpg',
  );

  let reportId: string;
  try {
    reportId = await saveReport({
      userId: user.id,
      report: parsed,
      summary: analysis.overview,
      explanations: analysis.explanations,
      upload: {
        storageKey,
        displayName: accepted.displayName,
        mime: accepted.mime,
        sizeBytes: accepted.size,
        sha256: accepted.sha256,
        // The extracted text is health data in its own right, so it is encrypted
        // at rest rather than stored as plain text.
        ocrText: encryptString(extracted.text),
        provider: extracted.provider,
        confidence: extracted.confidence,
      },
      pages: extracted.pages,
    });
  } catch (error) {
    try {
      await getStorage().delete(storageKey);
    } catch (cleanupError) {
      console.error(
        '[report] failed to remove upload after report save failed',
        cleanupError instanceof Error ? cleanupError.message : 'unknown',
      );
    }
    throw error;
  }

  const notices = [extracted.notice, warning].filter(Boolean);
  const query = notices.length ? `?notice=${encodeURIComponent(notices.join(' '))}` : '';
  logAudit({
    action: 'report.upload',
    outcome: 'success',
    actorUserId: user.id,
    resourceType: 'report',
    resourceId: reportId,
    // Counts and method only. The filename is not logged: it is user-supplied
    // and can contain a name.
    metadata: {
      source: extracted.method,
      bytes: accepted.size,
      results: parsed.results.length,
      reliable: extracted.reliable,
    },
  });
  redirect(`/app/report/${reportId}${query}`);
}
