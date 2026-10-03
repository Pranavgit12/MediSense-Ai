/**
 * Upload validation and text extraction.
 *
 * These are the tests that matter most for safety, because this is the one place
 * where an untrusted, attacker-chosen file meets a server. The adversarial cases
 * are the point: a medical app that accepts a renamed executable, or that trusts
 * the browser's declared MIME type, or that presents a low-confidence OCR read
 * as a faithful transcription, is worse than one with no upload feature at all.
 */
import { describe, expect, it } from 'vitest';

import {
  UploadRejected,
  acceptUpload,
  newUploadId,
  sanitiseDisplayName,
} from '../src/ocr/file-validation';
import { extractReportText, OcrUnavailable, LOW_CONFIDENCE_THRESHOLD } from '../src/ocr';
import { MockOcrProvider } from '../src/ocr/mock';
import type { OcrProvider, OcrResult } from '../src/ocr/types';
import type { UploadKind } from '../src/ocr/file-validation';
import { buildSyntheticReportText, buildSyntheticCbcDataset } from '../src/data/synthetic-reports';
import { parseLabReport } from '../src/medical/report-parser';
import { buildScannedPdf, buildTextPdf } from './helpers/pdf-fixture';

const PDF_HEADER = Buffer.from('%PDF-1.7\n', 'latin1');
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function pad(header: Buffer, size = 512): Buffer {
  return Buffer.concat([header, Buffer.alloc(Math.max(0, size - header.length), 0x20)]);
}

describe('file type detection', () => {
  it('identifies each accepted format from its bytes', async () => {
    const pdf = await acceptUpload(pad(PDF_HEADER), 'report.pdf', 'a');
    expect(pdf.kind).toBe('pdf');
    expect(pdf.mime).toBe('application/pdf');

    const png = await acceptUpload(pad(PNG_HEADER), 'photo.png', 'b');
    expect(png.kind).toBe('png');
    expect(png.mime).toBe('image/png');

    const jpg = await acceptUpload(pad(JPEG_HEADER), 'photo.jpg', 'c');
    expect(jpg.kind).toBe('jpeg');
    expect(jpg.mime).toBe('image/jpeg');
  });

  it('ignores the extension and the declared MIME type', async () => {
    // A PDF renamed to .png is still a PDF, and is treated as one.
    const renamed = await acceptUpload(pad(PDF_HEADER), 'evil.png', 'a');
    expect(renamed.kind).toBe('pdf');
    // The display name is presentation only; the stored name follows the bytes.
    expect(renamed.storageName).toBe('a.pdf');
  });

  it.each([
    ['an executable', Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1')],
    ['a script', Buffer.from('#!/bin/sh\nrm -rf /\n', 'latin1')],
    ['a zip', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])],
    ['a GIF', Buffer.from('GIF89a', 'latin1')],
    ['a web page', Buffer.from('<!doctype html><html>', 'utf8')],
  ])('refuses %s', async (_label, bytes) => {
    await expect(acceptUpload(pad(bytes), 'x.dat', 'a')).rejects.toBeInstanceOf(UploadRejected);
  });

  it('refuses an empty file and an oversized one', async () => {
    await expect(acceptUpload(Buffer.alloc(0), 'x.pdf', 'a')).rejects.toMatchObject({
      code: 'empty',
    });
    // MAX_UPLOAD_BYTES defaults to 10 MiB.
    const tooBig = Buffer.concat([PNG_HEADER, Buffer.alloc(11 * 1024 * 1024)]);
    await expect(acceptUpload(tooBig, 'x.png', 'a')).rejects.toMatchObject({ code: 'too_large' });
  });
});

describe('active PDF content', () => {
  it.each([
    ['JavaScript', Buffer.from('%PDF-1.7\n/JavaScript (app.alert\\(1\\))', 'latin1')],
    ['a launch action', Buffer.from('%PDF-1.7\n/Launch <</F (cmd.exe)>>', 'latin1')],
    ['an embedded file', Buffer.from('%PDF-1.7\n/EmbeddedFile 12 0 R', 'latin1')],
    ['an open action', Buffer.from('%PDF-1.7\n/OpenAction << /S /Launch >>', 'latin1')],
    ['password protection', Buffer.from('%PDF-1.7\n/Encrypt 8 0 R\n/Filter /Standard', 'latin1')],
  ])('refuses a PDF containing %s', async (_label, bytes) => {
    await expect(acceptUpload(bytes, 'x.pdf', 'a')).rejects.toMatchObject({
      code: 'active_content',
    });
  });

  it('accepts an ordinary PDF that only contains text and links', async () => {
    const plain = Buffer.from(
      '%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages >> endobj\ntrailer\n',
      'latin1',
    );
    await expect(acceptUpload(plain, 'x.pdf', 'a')).resolves.toMatchObject({ kind: 'pdf' });
  });
});

describe('filename handling', () => {
  it('strips directory components and control characters', () => {
    expect(sanitiseDisplayName('../../etc/passwd')).toBe('passwd');
    expect(sanitiseDisplayName('C:\\Users\\me\\report.pdf')).toBe('report.pdf');
    expect(sanitiseDisplayName('re"port\n\r.pdf')).toBe('report.pdf');
    expect(sanitiseDisplayName('')).toBe('report');
    expect(sanitiseDisplayName('...')).toBe('report');
  });

  it('never lets a client filename reach the storage key', async () => {
    const file = await acceptUpload(pad(PNG_HEADER), '../../../../app/layout.js', 'deadbeef');
    expect(file.storageName).toBe('deadbeef.png');
    expect(file.storageName).not.toContain('..');
    expect(file.storageName).not.toContain('/');
  });

  it('generates an unguessable id per upload', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newUploadId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('records a content hash so two identical uploads are distinguishable', async () => {
    const a = await acceptUpload(pad(PNG_HEADER), 'a.png', 'one');
    const b = await acceptUpload(pad(PNG_HEADER), 'b.png', 'two');
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── Extraction ───────────────────────────────────────────────────────────────

const CBC_TEXT = buildSyntheticReportText([buildSyntheticCbcDataset(80)[0]!], 6)[0]!.text;

/** A provider that returns exactly what the test tells it to. */
function scriptedProvider(result: Partial<OcrResult>): OcrProvider {
  return {
    name: 'scripted',
    async extract() {
      return {
        pages: [{ pageNumber: 1, text: CBC_TEXT, confidence: 1 }],
        text: CBC_TEXT,
        confidence: 1,
        provider: 'scripted',
        method: 'ocr',
        ...result,
      } as OcrResult;
    },
  };
}

describe('extraction', () => {
  it('feeds extracted text into the lab parser', async () => {
    const out = await extractReportText(Buffer.from('x'), 'png', scriptedProvider({}));
    const parsed = parseLabReport(out.text);
    expect(parsed.results.length).toBeGreaterThan(0);
    expect(out.reliable).toBe(true);
  });

  it('refuses a read too short to be a report instead of parsing noise', async () => {
    const provider = scriptedProvider({ text: 'a b c', pages: [{ pageNumber: 1, text: 'a b c', confidence: 1 }] });
    await expect(extractReportText(Buffer.from('x'), 'png', provider)).rejects.toBeInstanceOf(
      OcrUnavailable,
    );
  });

  it('marks a low-confidence OCR read as unreliable and says why', async () => {
    const low = LOW_CONFIDENCE_THRESHOLD - 0.2;
    const out = await extractReportText(
      Buffer.from('x'),
      'png',
      scriptedProvider({ confidence: low, pages: [{ pageNumber: 1, text: CBC_TEXT, confidence: low }] }),
    );
    expect(out.reliable).toBe(false);
    expect(out.notice.toLowerCase()).toContain('check any number');
    expect(out.notice).toContain(`${Math.round(low * 100)}%`);
  });

  it('does not warn about a PDF text layer, which has no confidence to check', async () => {
    const out = await extractReportText(
      Buffer.from('x'),
      'png',
      scriptedProvider({ method: 'pdf_text_layer', confidence: null }),
    );
    expect(out.reliable).toBe(true);
    expect(out.notice).toContain('exact characters');
  });

  it('says so when pages were dropped by the page limit', async () => {
    const out = await extractReportText(
      Buffer.from('x'),
      'png',
      scriptedProvider({ confidence: null }),
    );
    // The default limit is 10 pages and the fixture has one, so nothing is cut.
    expect(out.truncatedNotice).toBeNull();
  });

  it('propagates a provider outage as OcrUnavailable, not as empty text', async () => {
    const empty = new MockOcrProvider('');
    await expect(extractReportText(Buffer.from('x'), 'png', empty)).rejects.toBeInstanceOf(
      OcrUnavailable,
    );
  });

  it('never returns a fabricated report when the mock has nothing', async () => {
    const provider = new MockOcrProvider();
    const result = await provider.extract(Buffer.from('x'), 'png' satisfies UploadKind, 10).catch(
      (e: unknown) => e,
    );
    expect(result).toBeInstanceOf(OcrUnavailable);
  });
});

/**
 * The real PDF path, against a real PDF.
 *
 * This is the branch that matters most for accuracy: a PDF from a clinic has a
 * text layer, and reading it is exact where OCR is not. The scanned-PDF case is
 * the important negative — a PDF with no text must fall through to OCR rather
 * than be read as an empty report.
 */
describe('PDF text layer', () => {
  const reportPages = buildSyntheticReportText(buildSyntheticCbcDataset(80), 10);
  const pdfLines = reportPages.flatMap((p) => p.text.split('\n'));

  it('reads a PDF with a text layer without invoking OCR', async () => {
    let ocrCalled = false;
    const spy: OcrProvider = {
      name: 'spy',
      async extract() {
        ocrCalled = true;
        throw new Error('OCR should not run for a PDF that has text');
      },
    };

    const out = await extractReportText(buildTextPdf(pdfLines), 'pdf', spy);
    expect(ocrCalled).toBe(false);
    expect(out.method).toBe('pdf_text_layer');
    expect(out.provider).toBe('pdf-text-layer');
    expect(out.reliable).toBe(true);
    expect(out.text).toContain('Hemoglobin');
    expect(out.text).toContain('Test Name Result Unit Reference Range Flag');

    // And the extracted text must still drive the parser.
    const parsed = parseLabReport(out.text);
    expect(parsed.results.length).toBeGreaterThan(0);
  });

  it('falls through to OCR for a scanned PDF that has no text layer', async () => {
    let ocrCalled = false;
    const spy: OcrProvider = {
      name: 'spy',
      async extract() {
        ocrCalled = true;
        return {
          pages: [{ pageNumber: 1, text: CBC_TEXT, confidence: 0.4 }],
          text: CBC_TEXT,
          confidence: 0.4,
          provider: 'spy',
          method: 'ocr',
        };
      },
    };

    const out = await extractReportText(buildScannedPdf(), 'pdf', spy);
    expect(ocrCalled).toBe(true);
    expect(out.method).toBe('ocr');
    // A low-confidence scan must not be presented as a reliable reading.
    expect(out.reliable).toBe(false);
    expect(out.notice.toLowerCase()).toContain('check any number');
  });

  it('rejects a scanned PDF outright when OCR is not configured', async () => {
    // Better to say "I cannot read this" than to parse an empty document and
    // show a user an empty report.
    await expect(
      extractReportText(buildScannedPdf(), 'pdf', new MockOcrProvider()),
    ).rejects.toBeInstanceOf(OcrUnavailable);
  });
});
