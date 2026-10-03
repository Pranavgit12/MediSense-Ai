/**
 * The OCR contract.
 *
 * Everything upstream of the parser — the upload route, the storage layer, the
 * report page — talks to this interface and never to a vendor. Swapping Tesseract
 * for a cloud vision API is a one-line change to the factory in `index.ts`.
 *
 * Two properties are non-negotiable for any implementation:
 *
 *  1. It must never invent text. A provider that cannot read a page returns
 *     empty pages and a low confidence; it does not guess at numbers.
 *  2. It must report how sure it is. A lab report is a table of numbers, and a
 *     single misread digit changes a result from "in range" to "needs review".
 *     The interface makes confidence part of the result so the interface layer
 *     can refuse to present a low-confidence read as fact.
 */
import type { UploadKind } from './file-validation';

export interface OcrPage {
  pageNumber: number;
  text: string;
  /** 0-1. Null when the provider cannot estimate it. */
  confidence: number | null;
}

export interface OcrResult {
  pages: OcrPage[];
  /** All page text joined in page order. */
  text: string;
  /** Lowest per-page confidence, or null when the provider gives none. */
  confidence: number | null;
  provider: string;
  /** How the text was obtained, for the provenance line on the results page. */
  method: 'pdf_text_layer' | 'ocr' | 'mock';
}

export class OcrUnavailable extends Error {
  constructor(
    message: string,
    readonly provider: string,
  ) {
    super(message);
    this.name = 'OcrUnavailable';
  }
}

export interface OcrProvider {
  readonly name: string;
  /**
   * Read an accepted upload.
   *
   * `maxPages` bounds the work so a 500-page document cannot pin a worker; the
   * caller is told when content was dropped rather than silently truncated.
   */
  extract(bytes: Buffer, kind: UploadKind, maxPages: number): Promise<OcrResult>;
}
