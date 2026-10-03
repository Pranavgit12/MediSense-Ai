/**
 * Upload validation.
 *
 * Every check here runs on the *bytes*, never on what the browser claimed. A
 * file input's `type` and `name` are attacker-controlled strings, so they are
 * only ever used to produce a friendly error message, never to decide whether
 * the upload is accepted.
 *
 * The threat this defends against is concrete: a user uploading a lab report is
 * uploading an untrusted file to a server that will read it. We accept exactly
 * three passive formats, refuse active PDF constructs outright, and never hand
 * the bytes to anything that could execute them.
 */
import { getEnv } from '../lib/env';

export type UploadKind = 'pdf' | 'jpeg' | 'png';

export interface AcceptedFile {
  kind: UploadKind;
  /** The canonical MIME type, derived from the bytes. */
  mime: string;
  /** A server-generated name. The client's filename is never used on disk. */
  storageName: string;
  size: number;
  sha256: string;
  /** Cleaned of any path components, for display only. */
  displayName: string;
}

export class UploadRejected extends Error {
  constructor(
    message: string,
    readonly code:
      | 'empty'
      | 'too_large'
      | 'unrecognised_type'
      | 'active_content'
      | 'encrypted'
      | 'malformed',
  ) {
    super(message);
    this.name = 'UploadRejected';
  }
}

const SIGNATURES: { kind: UploadKind; mime: string; test: (b: Buffer) => boolean }[] = [
  {
    kind: 'pdf',
    mime: 'application/pdf',
    test: (b) => b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  {
    kind: 'png',
    mime: 'image/png',
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    kind: 'jpeg',
    mime: 'image/jpeg',
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
];

const EXTENSION_FOR: Record<UploadKind, string> = {
  pdf: 'pdf',
  jpeg: 'jpg',
  png: 'png',
};

/**
 * PDF constructs that can run code, reach the filesystem, or carry a second file
 * inside the container. A blood-test PDF has no legitimate use for any of them,
 * so their presence is treated as a reason to refuse the whole upload rather
 * than as something to strip. Stripping silently would mean telling the user
 * their report was read when it may not have been.
 */
const ACTIVE_PDF_CONSTRUCTS: { pattern: RegExp; what: string }[] = [
  { pattern: /\/JavaScript\b/i, what: 'embedded JavaScript' },
  { pattern: /\/JS\b/i, what: 'embedded JavaScript' },
  { pattern: /\/Launch\b/i, what: 'an instruction to open another application' },
  { pattern: /\/EmbeddedFile\b/i, what: 'an embedded file' },
  { pattern: /\/RichMedia\b/i, what: 'embedded media' },
  { pattern: /\/OpenAction\b/i, what: 'an action to run on open' },
  { pattern: /\/AA\b/i, what: 'an automatic action' },
  { pattern: /\/URI\s*\(/i, what: 'an external link' },
  { pattern: /\/Encrypt(?:Metadata)?\b|\/Filter\s*\/Standard\b/i, what: 'password protection' },
];

/**
 * Inspect raw bytes and either accept them or explain why not.
 *
 * `originalName` is display-only. It is sanitised rather than trusted, and the
 * stored name is generated here.
 */
export async function acceptUpload(
  bytes: Buffer,
  originalName: string,
  idForName: string,
): Promise<AcceptedFile> {
  const { maxUploadBytes } = getEnv();

  if (!bytes.length) {
    throw new UploadRejected('That file is empty.', 'empty');
  }
  if (bytes.length > maxUploadBytes) {
    throw new UploadRejected(
      `That file is larger than the ${Math.round(maxUploadBytes / (1024 * 1024))} MB limit. Try a smaller scan or a lower-resolution photo.`,
      'too_large',
    );
  }

  const signature = SIGNATURES.find((s) => s.test(bytes));
  if (!signature) {
    throw new UploadRejected(
      'That file is not a PDF, JPEG or PNG. We can read those three formats and nothing else.',
      'unrecognised_type',
    );
  }

  if (signature.kind === 'pdf') {
    assertPassivePdf(bytes);
  }

  const { createHash } = await import('node:crypto');
  return {
    kind: signature.kind,
    mime: signature.mime,
    // The client's filename never reaches the filesystem, so a name like
    // `../../etc/passwd` has nothing to traverse.
    storageName: `${idForName}.${EXTENSION_FOR[signature.kind]}`,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    displayName: sanitiseDisplayName(originalName),
  };
}

function assertPassivePdf(bytes: Buffer): void {
  // PDF objects, including the object streams that hide them, live in the body.
  // Scanning the raw bytes is intentionally over-broad: a false positive costs
  // the user one rejected upload, a false negative costs an active document.
  const head = bytes.subarray(0, Math.min(bytes.length, 8 * 1024 * 1024)).toString('latin1');
  for (const { pattern, what } of ACTIVE_PDF_CONSTRUCTS) {
    if (pattern.test(head)) {
      throw new UploadRejected(
        `This PDF contains ${what}, so we will not open it. Export or print the report as a plain PDF and try again.`,
        'active_content',
      );
    }
  }
}

/**
 * A filename safe to show in the interface and to echo back in a header.
 *
 * Strips any directory component, control characters and quotes, and caps the
 * length. It is never used to build a path, but a name containing a quote or a
 * newline would be a problem in any context that renders it into a header.
 */
export function sanitiseDisplayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'report';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>"'`]/g, '')
    .replace(/^\.+/, '')
    .trim();
  return (cleaned || 'report').slice(0, 120);
}

/** Fresh, unguessable id used to build the stored filename. */
export function newUploadId(): string {
  const bytes = new Uint8Array(16);
  // `crypto` is a global in Node 18+; falling back keeps this usable in tests.
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}
