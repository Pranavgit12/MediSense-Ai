/**
 * PDF text-layer extraction.
 *
 * A lab PDF from a clinic or a results app almost always carries a real text
 * layer, and when it does, that text is *exactly* what the laboratory printed.
 * Reading it is both more accurate and more faithful than OCR, which is why
 * this path is tried first and the image fallback is only reached when it fails.
 *
 * A PDF with no usable text layer is a scan. That is not an error, but it is a
 * materially different reading, so the caller is told which path produced the
 * text.
 */
import { OcrUnavailable } from './types';
import type { OcrResult } from './types';

/**
 * Below this many characters across the whole document, the PDF is treated as a
 * scan rather than as a text PDF.
 *
 * A one-page lab report is a few thousand characters. 400 is far below any
 * genuine report and far above the handful of glyphs some scanners leave in a
 * header, which is the false positive this threshold exists to absorb.
 */
const MIN_TEXT_LAYER_CHARS = 400;

export async function extractPdfText(bytes: Buffer, maxPages: number): Promise<OcrResult | null> {
  // Imported lazily so a build that never touches a PDF does not pay for it.
  const { PDFParse } = await import('pdf-parse');

  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText({ partial: [1, maxPages] });
    const text = normalise(result.text);
    if (text.length < MIN_TEXT_LAYER_CHARS) {
      // Almost certainly a scan. Signal "no text layer" rather than returning a
      // near-empty string the parser would then fail to make sense of.
      return null;
    }
    return {
      pages: result.pages.map((p) => ({
        pageNumber: p.num,
        text: normalise(p.text),
        confidence: null,
      })),
      text,
      confidence: null,
      provider: 'pdf-text-layer',
      method: 'pdf_text_layer',
    };
  } catch (error) {
    // An encrypted or structurally broken PDF is a different failure from a
    // scanned one, and the user needs to be told which.
    if (isPasswordError(error)) {
      throw new OcrUnavailable(
        'This PDF is password-protected, so its text cannot be read. Remove the password and upload it again.',
        'pdf-text-layer',
      );
    }
    return null;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function isPasswordError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /password|encrypt/i.test(message);
}

/**
 * Tidy extracted text without changing any character that could be a digit.
 *
 * The parser needs real tabs and single spaces to find the name/value/unit
 * columns. Joining everything onto one line would destroy that structure, so
 * line breaks are kept and only the ragged intra-line spacing is collapsed.
 */
function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]{2,}/g, '  ').replace(/[^\S\n]+$/, ''))
    .filter((line, i, all) => line.length > 0 || (i > 0 && all[i - 1]!.length > 0))
    .join('\n')
    .trim();
}
