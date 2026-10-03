/**
 * Typed, validated environment access.
 *
 * Rules:
 *  - Never throws at import time in a way that breaks `next build`.
 *  - Secrets are only readable on the server.
 *  - `getEnv()` throws a clear error when a required value is missing.
 */

const bool = (v: string | undefined, dflt: boolean): boolean => {
  if (v === undefined || v === '') return dflt;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};

const int = (v: string | undefined, dflt: number): number => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
};

const list = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export interface AppEnv {
  nodeEnv: 'development' | 'test' | 'production';
  appUrl: string;
  appName: string;
  isTest: boolean;
  isProd: boolean;

  databaseUrl: string | null;
  /**
   * Postgres pool size per process. Null means "choose for the host": 10 on a
   * long-lived server, 1 on a serverless host. See `database/client.ts` for why
   * the second number is the one that matters in production.
   */
  databasePoolMax: number | null;
  pgliteDataDir: string;
  migrationsDir: string;

  /**
   * Server-side HMAC key. Not a login secret any more: it keys the rate-limit
   * buckets and the IP/user-agent hashes in the audit log, and is the fallback
   * encryption key for report text when DATA_ENCRYPTION_KEY is unset.
   */
  authSecret: string;

  /**
   * Argon2id cost parameters, read by `hashPassword` in `utils/crypto`. No part of
   * the app authenticates anyone any more, so these are only exercised by tests
   * that need to write a user row.
   */
  argon2MemoryKib: number;
  argon2Iterations: number;
  argon2Parallelism: number;

  allowedOrigins: string[];
  maxUploadBytes: number;
  rateLimitEnabled: boolean;
  rateLimitRequests: number;
  rateLimitWindowSeconds: number;

  dataEncryptionKey: string | null;

  storage: {
    s3Bucket: string | null;
    s3Region: string | null;
    s3Endpoint: string | null;
    s3AccessKeyId: string | null;
    s3SecretAccessKey: string | null;
    s3ForcePathStyle: boolean;
    localDir: string;
  };

  llm: {
    provider: string;
    model: string;
    apiKey: string | null;
    baseUrl: string | null;
    timeoutMs: number;
    maxOutputTokens: number;
    temperature: number;
  };

  embedding: {
    provider: string;
    model: string;
    apiKey: string | null;
    baseUrl: string | null;
    dimensions: number;
  };

  ocr: {
    provider: string;
    apiKey: string | null;
    languages: string[];
    maxPages: number;
  };

  safetyEngineEnabled: boolean;
  clinicalRulesMode: 'enforce' | 'warn' | 'off';
}

const raw = (key: string): string | undefined => {
  // Works for both Next.js server runtime and plain node (scripts, vitest).
  const fromProcess = process.env[key];
  if (fromProcess !== undefined) return fromProcess;
  const req = process.env.__NEXT_RUNTIME_UNDEFINED__;
  void req;
  return undefined;
};

let cached: AppEnv | null = null;

function build(): AppEnv {
  const nodeEnv = (raw('NODE_ENV') ?? 'development') as AppEnv['nodeEnv'];
  const devAuthSecret = 'dev-only-insecure-secret-do-not-use-in-production-0000000000';

  return {
    nodeEnv,
    appUrl: raw('APP_URL') ?? 'http://localhost:3000',
    appName: raw('APP_NAME') ?? 'MediSense',
    isTest: nodeEnv === 'test',
    isProd: nodeEnv === 'production',

    databaseUrl: raw('DATABASE_URL') ?? null,
    databasePoolMax: raw('DATABASE_POOL_MAX') ? int(raw('DATABASE_POOL_MAX'), 10) : null,
    pgliteDataDir: raw('PGLITE_DATA_DIR') ?? './.pgdata',
    migrationsDir: raw('MIGRATIONS_DIR') ?? './src/database/migrations',

    authSecret: raw('AUTH_SECRET') || (nodeEnv === 'production' ? '' : devAuthSecret),

    argon2MemoryKib: int(raw('ARGON2_MEMORY_KIB'), 65536),
    argon2Iterations: int(raw('ARGON2_ITERATIONS'), 3),
    argon2Parallelism: int(raw('ARGON2_PARALLELISM'), 1),

    allowedOrigins: list(raw('ALLOWED_ORIGINS')).length
      ? list(raw('ALLOWED_ORIGINS'))
      : ['http://localhost:3000'],
    maxUploadBytes: int(raw('MAX_UPLOAD_BYTES'), 10 * 1024 * 1024),
    rateLimitEnabled: bool(raw('RATE_LIMIT_ENABLED'), true),
    rateLimitRequests: int(raw('RATE_LIMIT_REQUESTS'), 60),
    rateLimitWindowSeconds: int(raw('RATE_LIMIT_WINDOW_SECONDS'), 60),

    dataEncryptionKey: raw('DATA_ENCRYPTION_KEY') ?? null,

    storage: {
      s3Bucket: raw('S3_BUCKET') ?? null,
      s3Region: raw('S3_REGION') ?? null,
      s3Endpoint: raw('S3_ENDPOINT') ?? null,
      s3AccessKeyId: raw('S3_ACCESS_KEY_ID') ?? null,
      s3SecretAccessKey: raw('S3_SECRET_ACCESS_KEY') ?? null,
      s3ForcePathStyle: bool(raw('S3_FORCE_PATH_STYLE'), false),
      localDir: raw('STORAGE_LOCAL_DIR') ?? './.uploads',
    },

    llm: {
      provider: raw('LLM_PROVIDER') ?? 'mock',
      model: raw('LLM_MODEL') ?? 'gpt-4o-mini',
      apiKey: raw('LLM_API_KEY') ?? null,
      baseUrl: raw('LLM_BASE_URL') ?? null,
      timeoutMs: int(raw('LLM_TIMEOUT_MS'), 30_000),
      maxOutputTokens: int(raw('LLM_MAX_OUTPUT_TOKENS'), 1200),
      temperature: Number.parseFloat(raw('LLM_TEMPERATURE') ?? '0.2'),
    },

    embedding: {
      provider: raw('EMBEDDING_PROVIDER') ?? 'mock',
      model: raw('EMBEDDING_MODEL') ?? 'text-embedding-3-small',
      apiKey: raw('EMBEDDING_API_KEY') ?? null,
      baseUrl: raw('EMBEDDING_BASE_URL') ?? null,
      dimensions: int(raw('EMBEDDING_DIMENSIONS'), 384),
    },

    ocr: {
      provider: raw('OCR_PROVIDER') ?? 'mock',
      apiKey: raw('OCR_API_KEY') ?? null,
      languages: list(raw('OCR_LANGUAGES')).length ? list(raw('OCR_LANGUAGES')) : ['eng'],
      maxPages: int(raw('OCR_MAX_PAGES'), 10),
    },

    safetyEngineEnabled: bool(raw('SAFETY_ENGINE_ENABLED'), true),
    clinicalRulesMode: (raw('CLINICAL_RULES_MODE') ?? 'enforce') as AppEnv['clinicalRulesMode'],
  };
}

export function getEnv(): AppEnv {
  if (!cached) cached = build();
  return cached;
}

/** Test helper: rebuild the env from the current process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export function assertProductionSafety(env: AppEnv = getEnv()): void {
  if (!env.isProd) return;
  const problems: string[] = [];
  if (!env.authSecret || env.authSecret.length < 32) problems.push('AUTH_SECRET must be set (>=32 chars)');
  if (!env.databaseUrl) problems.push('DATABASE_URL must be set in production');
  if (!env.dataEncryptionKey) problems.push('DATA_ENCRYPTION_KEY must be set in production');
  else if (Buffer.from(env.dataEncryptionKey, 'base64url').length !== 32) {
    problems.push('DATA_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  if (env.llm.provider === 'mock') problems.push('LLM_PROVIDER=mock is not allowed in production');
  if (!env.safetyEngineEnabled) problems.push('SAFETY_ENGINE_ENABLED must be true in production');
  if (env.clinicalRulesMode !== 'enforce') problems.push('CLINICAL_RULES_MODE must be "enforce"');
  if (problems.length) {
    throw new Error(`Unsafe production configuration:\n - ${problems.join('\n - ')}`);
  }
}
