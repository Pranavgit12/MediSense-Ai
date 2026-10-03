/**
 * Turning an uploaded file into text the report parser can read.
 *
 * The order matters, and it is a safety decision as much as a quality one:
 *
 *  1. A PDF's own text layer is the laboratory's own characters, uncorrupted.
 *     That is always the best available reading, so it is always tried first.
 *  2. Only if a PDF has no usable text is it treated as a scan and sent to OCR,
 *     and the result is labelled as an OCR read so the user is told to check the
 *     numbers against the paper report.
 *  3. A low-confidence read is reported as low-confidence rather than quietly
 *     presented as fact. A lab report is a table of numbers, and one misread
 *     digit is the difference between "in range" and "see a doctor".
 *
 * Nothing in this module decides whether a number is normal. It only produces
 * text and an honest statement of how much to trust it.
 */
import { getEnv } from '../lib/env';
import { MockOcrProvider } from './mock';
import { extractPdfText } from './pdf';
import { TesseractProvider, LOW_CONFIDENCE_THRESHOLD } from './tesseract';
import { OcrUnavailable } from './types';
import type { OcrProvider, OcrResult } from './types';
import type { UploadKind } from './file-validation';

export { OcrUnavailable } from './types';
export type { OcrProvider, OcrResult, OcrPage } from './types';
export { LOW_CONFIDENCE_THRESHOLD } from './tesseract';

export function createOcrProvider(): OcrProvider {
  switch (getEnv().ocr.provider) {
    case 'tesseract':
      return new TesseractProvider();
    case 'mock':
    default:
      return new MockOcrProvider();
  }
}

export interface ExtractedReport {
  text: string;
  pages: { pageNumber: number; text: string; confidence: number | null }[];
  provider: string;
  method: OcrResult['method'];
  /** 0-1, or null when the source cannot estimate confidence. */
  confidence: number | null;
  /** True when the read is good enough to present without a caveat. */
  reliable: boolean;
  /** Set when the file was longer than the page limit. */
  truncatedNotice: string | null;
  /** Explains the read to the user in one sentence. */
  notice: string;
}

/**
 * Fewer characters than this means the file was not a readable report, and the
 * honest answer is to say so rather than to run the parser over noise and
 * present whatever few numbers it happens to find.
 */
const MIN_USABLE_CHARS = 120;

export async function extractReportText(
  bytes: Buffer,
  kind: UploadKind,
  provider: OcrProvider = createOcrProvider(),
): Promise<ExtractedReport> {
  const { ocr } = getEnv();
  const maxPages = ocr.maxPages;

  let result: OcrResult;
  let truncatedNotice: string | null = null;

  if (kind === 'pdf') {
    const fromLayer = await extractPdfText(bytes, maxPages);
    if (fromLayer) {
      result = fromLayer;
    } else {
      // No text layer: the file is a scan. OCR may still be able to read it.
      result = await provider.extract(bytes, kind, maxPages);
    }
  } else {
    result = await provider.extract(bytes, kind, maxPages);
  }

  const text = result.text.trim();

  if (text.length < MIN_USABLE_CHARS) {
    throw new OcrUnavailable(
      'Very little text could be read from that file, so there is not enough to explain. A clearer scan, a straight-on photo in good light, or pasting the text directly will all work better.',
      result.provider,
    );
  }

  if (result.pages.length >= maxPages) {
    truncatedNotice = `Only the first ${maxPages} pages were read. If the report continues past that, the later pages are missing from this summary.`;
  }

  // A PDF text layer has no confidence estimate, and that is fine: it is the
  // laboratory's own characters. Only an OCR read can be low-confidence.
  const isOcr = result.method === 'ocr';
  const confidence = result.confidence;
  const reliable = !isOcr || confidence === null || confidence >= LOW_CONFIDENCE_THRESHOLD;

  return {
    text,
    pages: result.pages,
    provider: result.provider,
    method: result.method,
    confidence,
    reliable,
    truncatedNotice,
    notice: buildNotice({ method: result.method, confidence, reliable, truncatedNotice }),
  };
}

function buildNotice(input: {
  method: OcrResult['method'];
  confidence: number | null;
  reliable: boolean;
  truncatedNotice: string | null;
}): string {
  const parts: string[] = [];
  if (input.method === 'pdf_text_layer') {
    parts.push('Read from the PDF’s own text, so these are the exact characters your laboratory printed.');
  } else if (input.reliable) {
    parts.push('Read from your file by optical character recognition.');
  } else {
    const pct = input.confidence === null ? null : Math.round(input.confidence * 100);
    parts.push(
      `Read by optical character recognition${
        pct === null ? '' : `, and the reader was only ${pct}% confident in it`
      }. Optical character recognition can misread digits, so please check any number here against your paper report before acting on it.`,
    );
  }
  if (input.truncatedNotice) parts.push(input.truncatedNotice);
  return parts.join(' ');
}
