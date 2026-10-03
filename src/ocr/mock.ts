/**
 * The provider used in tests and in local development with no OCR configured.
 *
 * It is deliberately not a stub that returns empty text: the pipeline around it
 * — the storage route, the parser, the safety engine — is only meaningfully
 * tested against text that looks like a real report, so the mock is given the
 * exact text under test. It never fabricates a result: with no text supplied it
 * says it cannot read the file rather than inventing a plausible one.
 */
import { OcrUnavailable } from './types';
import type { OcrProvider, OcrResult } from './types';
import type { UploadKind } from './file-validation';

export class MockOcrProvider implements OcrProvider {
  readonly name = 'mock';

  constructor(private readonly text: string = '') {}

  async extract(_bytes: Buffer, _kind: UploadKind, maxPages: number): Promise<OcrResult> {
    if (!this.text) {
      throw new OcrUnavailable(
        'No OCR provider is configured, so this file cannot be read. Set OCR_PROVIDER, or paste the report text instead.',
        this.name,
      );
    }
    const pages = this.text
      .split('\f')
      .slice(0, maxPages)
      .map((text, i) => ({ pageNumber: i + 1, text, confidence: 1 }));
    return {
      pages,
      text: pages.map((p) => p.text).join('\n'),
      confidence: 1,
      provider: this.name,
      method: 'mock',
    };
  }
}
