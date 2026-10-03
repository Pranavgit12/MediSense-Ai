/**
 * S3-compatible object storage.
 *
 * The S3 client is mocked at the command boundary: real command objects are
 * used, so these tests assert on exactly what would go over the wire (bucket,
 * key, content type, encryption) rather than on a hand-written double. What
 * this does *not* cover is the wire protocol itself — a genuine end-to-end check
 * needs a running S3-compatible server, and there is no Docker in this
 * environment. So the provider contract (endpoint shape, path style, region) is
 * verified by hand once against the provider, not here.
 *
 * The cases that are covered are the ones where a mistake would be silent:
 * a missing object reported as an error, or worse, an outage reported as a
 * missing object.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sent, sendImpl, clientConfig } = vi.hoisted(() => ({
  sent: [] as { constructor: { name: string }; input: Record<string, unknown> }[],
  sendImpl: vi.fn(),
  clientConfig: [] as Record<string, unknown>[],
}));

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  // Keep the real command classes so assertions see the genuine shape that
  // would be serialised, and replace only the client, which is what talks to
  // the network.
  class S3Client {
    constructor(config: Record<string, unknown>) {
      clientConfig.push(config);
    }
    send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      sent.push(command);
      return sendImpl(command);
    }
  }
  return { ...actual, S3Client };
});

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import { resetEnvCache } from '../src/lib/env';
import {
  getStorage,
  resetStorageCache,
  S3ObjectStorage,
  storeUpload,
} from '../src/server/storage';

const env = process.env as Record<string, string | undefined>;

function withS3Env(overrides: Record<string, string | undefined> = {}): void {
  env.S3_BUCKET = 'reports';
  env.S3_REGION = 'ap-south-1';
  env.S3_ENDPOINT = 'https://xyzproject.supabase.co/storage/v1/s3';
  env.S3_ACCESS_KEY_ID = 'test-key-id';
  env.S3_SECRET_ACCESS_KEY = 'test-secret-key';
  env.S3_FORCE_PATH_STYLE = 'true';
  for (const [k, v] of Object.entries(overrides)) {
    // Assigning undefined to process.env stores the literal string "undefined",
    // which is truthy and would defeat a test that means "unset this".
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  resetEnvCache();
  resetStorageCache();
}

beforeEach(() => {
  sent.length = 0;
  clientConfig.length = 0;
  sendImpl.mockReset();
  // Default: a successful read returning these bytes.
  sendImpl.mockResolvedValue({
    Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
  });
});

afterEach(() => {
  delete env.S3_BUCKET;
  delete env.S3_REGION;
  delete env.S3_ENDPOINT;
  delete env.S3_ACCESS_KEY_ID;
  delete env.S3_SECRET_ACCESS_KEY;
  delete env.S3_FORCE_PATH_STYLE;
  resetEnvCache();
  resetStorageCache();
});

describe('S3ObjectStorage', () => {
  it('sends the endpoint, region and path style the provider needs', () => {
    withS3Env();
    new S3ObjectStorage('reports');

    expect(clientConfig).toHaveLength(1);
    const config = clientConfig[0]!;
    expect(config.region).toBe('ap-south-1');
    expect(config.endpoint).toBe('https://xyzproject.supabase.co/storage/v1/s3');
    expect(config.forcePathStyle).toBe(true);
    expect(config.credentials).toEqual({
      accessKeyId: 'test-key-id',
      secretAccessKey: 'test-secret-key',
    });
  });

  it('writes the key, content type and encryption header', async () => {
    withS3Env();
    const storage = new S3ObjectStorage('reports');

    await storage.put('abc123.pdf', Buffer.from('hello'));

    expect(sent).toHaveLength(1);
    const command = sent[0]!;
    expect(command.constructor.name).toBe(PutObjectCommand.name);
    expect(command.input).toMatchObject({
      Bucket: 'reports',
      Key: 'abc123.pdf',
      ServerSideEncryption: 'AES256',
    });
    expect(Buffer.from(command.input.Body as Buffer).toString()).toBe('hello');
  });

  it('returns the stored bytes', async () => {
    withS3Env();
    const storage = new S3ObjectStorage('reports');

    const bytes = await storage.get('abc123.pdf');
    expect(bytes).toEqual(Buffer.from([1, 2, 3]));
    expect(sent[0]!.constructor.name).toBe(GetObjectCommand.name);
  });

  it('treats a missing object as null, not an error', async () => {
    withS3Env();
    const storage = new S3ObjectStorage('reports');

    // All three shapes a provider can use to say "no such key".
    for (const error of [
      Object.assign(new Error('gone'), { name: 'NoSuchKey' }),
      Object.assign(new Error('gone'), { name: 'NotFound' }),
      Object.assign(new Error('gone'), { $metadata: { httpStatusCode: 404 } }),
    ]) {
      sendImpl.mockRejectedValueOnce(error);
      await expect(storage.get('missing.pdf')).resolves.toBeNull();
    }
  });

  it('propagates a denied or failed read instead of reporting it missing', async () => {
    withS3Env();
    const storage = new S3ObjectStorage('reports');

    // This is the important one. Returning null for a 403 or a network fault
    // would be indistinguishable from deletion, and an expired or mis-scoped
    // credential would look like every report had silently vanished.
    for (const error of [
      Object.assign(new Error('denied'), { name: 'AccessDenied' }),
      Object.assign(new Error('boom'), { name: 'InternalError' }),
    ]) {
      sendImpl.mockRejectedValueOnce(error);
      await expect(storage.get('abc123.pdf')).rejects.toThrow();
    }
  });

  it('deletes the named key', async () => {
    withS3Env();
    const storage = new S3ObjectStorage('reports');

    await storage.delete('abc123.pdf');
    expect(sent[0]!.constructor.name).toBe(DeleteObjectCommand.name);
    expect(sent[0]!.input).toMatchObject({ Bucket: 'reports', Key: 'abc123.pdf' });
  });

  it('refuses a key that could escape the bucket', async () => {
    withS3Env();
    const storage = new S3ObjectStorage('reports');

    // Traversal, absolute paths, embedded separators and empty input. None may
    // reach the SDK, whatever produced the key.
    for (const key of ['../secret', 'a/b', '/abs', '..', '', 'x'.repeat(200), 'a b', '%2e%2e']) {
      await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow(/unsafe storage key/);
      await expect(storage.get(key)).rejects.toThrow(/unsafe storage key/);
      await expect(storage.delete(key)).rejects.toThrow(/unsafe storage key/);
    }
    expect(sent).toHaveLength(0);
  });

  it('rejects a half-configured bucket instead of failing at the first upload', () => {
    withS3Env({ S3_ACCESS_KEY_ID: undefined, S3_SECRET_ACCESS_KEY: undefined });
    expect(() => new S3ObjectStorage('reports')).toThrow(/S3_ACCESS_KEY_ID/);

    withS3Env({ S3_REGION: undefined });
    expect(() => new S3ObjectStorage('reports')).toThrow(/S3_REGION/);

    expect(() => new S3ObjectStorage('')).toThrow(/S3_BUCKET/);
  });
});

describe('backend selection', () => {
  it('uses S3 only when a bucket is configured', () => {
    withS3Env();
    expect(getStorage().name).toBe('s3');

    resetEnvCache();
    resetStorageCache();
    env.S3_BUCKET = '';
    resetEnvCache();
    resetStorageCache();
    expect(getStorage().name).toBe('local');
  });
});

describe('storeUpload', () => {
  it('gives every upload its own key, derived from nothing the client controls', async () => {
    withS3Env();
    sendImpl.mockResolvedValue(undefined);

    const first = await storeUpload(Buffer.from('one'), 'pdf');
    const second = await storeUpload(Buffer.from('two'), 'pdf');

    expect(first).not.toBe(second);
    expect(first.endsWith('.pdf')).toBe(true);
    expect(first).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
    // Neither key may encode anything about the file the client uploaded.
    expect(first).not.toContain('one');
    expect(sent.map((c) => c.input.Key)).toEqual([first, second]);
  });
});
