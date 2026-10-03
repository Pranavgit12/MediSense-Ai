/**
 * Object storage for uploaded reports.
 *
 * The interface is deliberately narrow — put, read, delete — because a report
 * image is write-once and read-once in practice, and a wider surface would be a
 * wider surface to get wrong.
 *
 * Two rules hold for every backend:
 *
 *  - The stored key is generated server-side. It is never derived from a
 *    filename, a user id, or anything else the client controls, so there is no
 *    traversal to defend against and no key to guess.
 *  - Stored bytes are never served back through the web root. The local backend
 *    writes outside `public/` and the S3 backend is expected to be private; the
 *    only path from a stored object back to a browser is a signed, authorised
 *    read, which this app does not currently offer.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { getEnv } from '../lib/env';
import { newUploadId } from '../ocr/file-validation';

export interface ObjectStorage {
  readonly name: string;
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

/** Guard against a key escaping the storage root, whatever produced it. */
function assertSafeKey(key: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(key)) {
    throw new Error('Refusing to use an unsafe storage key.');
  }
}

/**
 * Whether a storage read failed because the object is absent.
 *
 * Checks both the error code and the status, because the S3 API reports a
 * missing key as `NoSuchKey` on a GET but `NotFound` in some responses, and a
 * head request returns no body error name at all. Getting this wrong in the
 * permissive direction would turn an outage into silent data loss.
 */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return (
    candidate.name === 'NoSuchKey' ||
    candidate.name === 'NotFound' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

/**
 * Filesystem storage, for development and single-node deployments.
 *
 * Files are written 0600 and live outside the served directory. They are also
 * never executed: the extension is one this app generates, and nothing in the
 * codebase ever runs a stored object.
 */
export class LocalObjectStorage implements ObjectStorage {
  readonly name = 'local';
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    // Belt and braces: even with a validated key, confirm the resolved path is
    // still inside the root before touching the filesystem.
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error('Refusing to use an unsafe storage key.');
    }
    return full;
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await writeFile(full, bytes, { mode: 0o600 });
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

/**
 * S3-compatible object storage.
 *
 * Written against the S3 API rather than any one vendor's client, because the
 * three realistic free hosts all speak it: Supabase, Cloudflare R2, and
 * Backblaze B2. Moving between them is an endpoint and a region, not a rewrite.
 *
 * The bucket is expected to be private with public access blocked. Nothing here
 * produces a public URL: `get` returns bytes for server-side use only, and the
 * app has no route that streams a stored object to a browser. If the bucket is
 * ever made public, every report in it becomes world-readable, which for health
 * data is the same as a breach.
 */
export class S3ObjectStorage implements ObjectStorage {
  readonly name = 's3';
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(bucket: string) {
    if (!bucket) throw new Error('S3_BUCKET is required for S3 storage.');
    this.bucket = bucket;

    const env = getEnv();
    const { s3Region, s3Endpoint, s3AccessKeyId, s3SecretAccessKey, s3ForcePathStyle } = env.storage;

    // A partial credential set is a configuration mistake, and the resulting
    // error from the SDK would name an env var nobody would recognise. Failing
    // here points straight at the cause.
    if (!s3AccessKeyId || !s3SecretAccessKey) {
      throw new Error(
        'S3_BUCKET is set, so S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required too. Unset S3_BUCKET to use local storage.',
      );
    }
    if (!s3Region) {
      throw new Error('S3_REGION is required for S3 storage.');
    }

    this.client = new S3Client({
      region: s3Region,
      // Optional. AWS S3 works without one; Supabase, R2 and B2 all need it.
      endpoint: s3Endpoint ?? undefined,
      forcePathStyle: s3ForcePathStyle,
      credentials: { accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey },
    });
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        // Uploads are capped well below the single-request S3 limit, so this
        // never needs to become a multipart upload.
        ContentType: 'application/octet-stream',
        // Health data. Not a substitute for bucket-level encryption, but it
        // means a stray object listing is not plaintext, and it matters for
        // providers that honour the header.
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    assertSafeKey(key);
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return Buffer.from(await result.Body!.transformToByteArray());
    } catch (error) {
      // A missing key is an ordinary outcome, not a failure: callers ask for an
      // object that may never have been written. Every other error propagates,
      // because silently returning null for an auth or network fault would look
      // like deletion and hide a real outage.
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let cached: ObjectStorage | null = null;

export function getStorage(): ObjectStorage {
  if (cached) return cached;
  const { storage } = getEnv();
  cached = storage.s3Bucket ? new S3ObjectStorage(storage.s3Bucket) : new LocalObjectStorage(storage.localDir);
  return cached;
}

/** Test helper: forget the resolved backend. */
export function resetStorageCache(): void {
  cached = null;
}

/**
 * Store an upload and return the key to record on the report row.
 *
 * The key is a fresh random id, so two users uploading `report.pdf` cannot
 * collide and neither can overwrite the other's file.
 */
export async function storeUpload(bytes: Buffer, extension: string): Promise<string> {
  const key = `${newUploadId()}.${extension}`;
  await getStorage().put(key, bytes);
  return key;
}
