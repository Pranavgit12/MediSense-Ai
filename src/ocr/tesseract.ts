/**
 * Local OCR via Tesseract, running in-process as WebAssembly.
 *
 * Chosen as the default because a lab report is health data: keeping the image
 * on the machine that received it avoids sending it to a third party, and
 * avoids putting an API key anywhere near a medical upload.
 *
 * The trade-off is stated plainly on the results page: OCR misreads digits, and
 * the confidence reported here is the reason the interface can warn a user that
 * a number is worth checking against their paper report.
 */
import { getEnv } from '../lib/env';
import { OcrUnavailable } from './types';
import type { OcrPage, OcrProvider, OcrResult } from './types';
import type { UploadKind } from './file-validation';

/**
 * Below this confidence the read is shown with a warning rather than as a
 * reliable transcription.
 *
 * Tesseract is markedly worse on dense numeric tables than on prose, so 75 is
 * set at the point where a misread is genuinely likely rather than merely
 * possible.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export class TesseractProvider implements OcrProvider {
  readonly name = 'tesseract';

  async extract(bytes: Buffer, kind: UploadKind, maxPages: number): Promise<OcrResult> {
    const { ocr } = getEnv();
    // A still image is a single page by definition, so the page budget is a
    // guard rather than a loop bound. A scanned PDF would need rasterising
    // first, which is a different provider's job.
    if (kind === 'pdf' || maxPages < 1) {
      throw new OcrUnavailable(
        kind === 'pdf'
          ? 'This PDF has no text layer, so it is a scan. Reading a scanned PDF needs a renderer that is not enabled in this deployment.'
          : 'No pages are allowed to be read, so there is nothing to do.',
        this.name,
      );
    }

    const { createWorker, PSM } = await import('tesseract.js');
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    try {
      worker = await createWorker(ocr.languages.join('+'));
      // SINGLE_BLOCK. Lab reports are tabular, and the page-layout heuristics
      // that help for prose actively hurt here by reordering columns.
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
      });

      const { data } = await worker.recognize(bytes);
      const page: OcrPage = {
        pageNumber: 1,
        text: tidy(data.text ?? ''),
        confidence: typeof data.confidence === 'number' ? data.confidence / 100 : null,
      };
      return {
        pages: [page],
        text: page.text,
        confidence: page.confidence,
        provider: this.name,
        method: 'ocr',
      };
    } catch (error) {
      throw new OcrUnavailable(
        `Text could not be read from that image (${error instanceof Error ? error.message : 'unknown error'}).`,
        this.name,
      );
    } finally {
      await worker?.terminate().catch(() => undefined);
    }
  }
}

/**
 * Clean up OCR output so the lab parser can read it.
 *
 * Tesseract is character-accurate but whitespace-hostile: it likes to insert
 * spaces into numbers and to break a row across lines. Fixing the first is safe
 * because a space between digits is never meaningful. Fixing the second is not
 * possible without the column positions, so it is left to the parser, which
 * already handles ragged rows.
 */
function tidy(text: string): string {
  return (
    text
      .replace(/\r\n?/g, '\n')
      // "1 0 . 2" -> "10.2", but leave a lone sign or separator alone.
      .replace(/(?<=\d)\s+(?=[.,]?\d)/g, '')
      // A decimal point separated from its digits by a stray space.
      .replace(/(?<=\d)\s*\.\s*(?=\d)/g, '.')
      .split('\n')
      .map((line) => line.replace(/[^\S\n]{2,}/g, '  ').replace(/[^\S\n]+$/, ''))
      .join('\n')
      .trim()
  );
}
