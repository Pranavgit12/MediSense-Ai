/**
 * Provider factory.
 *
 * `getLlm()` never throws and never returns a client that will explode at
 * request time when the provider is not configured. Callers check
 * `isConfigured()` first and fall back to the deterministic explainer, so the
 * app is fully usable with no API key set.
 */
import { getEnv } from '../../lib/env';
import { AnthropicClient } from './anthropic';
import { OllamaClient } from './ollama';
import { OpenAiCompatibleClient } from './openai';
import { LlmError, type LlmClient, type LlmCompletion, type LlmMessage, type LlmOptions } from './types';

export * from './types';

let cached: LlmClient | null = null;
let cachedKey: string | null = null;

function build(): LlmClient {
  const env = getEnv();
  const p = env.llm.provider.toLowerCase();

  if (p === 'anthropic') {
    return new AnthropicClient({ model: env.llm.model, baseUrl: env.llm.baseUrl, apiKey: env.llm.apiKey });
  }
  if (p === 'ollama') {
    return new OllamaClient({ model: env.llm.model, baseUrl: env.llm.baseUrl });
  }
  if (p === 'openai') {
    return new OpenAiCompatibleClient({
      provider: 'openai',
      model: env.llm.model,
      baseUrl: env.llm.baseUrl,
      apiKey: env.llm.apiKey,
    });
  }
  if (p === 'mock') {
    // An unconfigured placeholder. Never called, because isConfigured() is false.
    return new OpenAiCompatibleClient({ provider: 'mock', model: env.llm.model, apiKey: null });
  }
  throw new LlmError('config', `Unknown LLM_PROVIDER "${env.llm.provider}"`);
}

export function getLlm(): LlmClient {
  const env = getEnv();
  const key = `${env.llm.provider}:${env.llm.model}:${env.llm.baseUrl ?? ''}:${env.llm.apiKey ? 'k' : ''}`;
  if (!cached || cachedKey !== key) {
    cached = build();
    cachedKey = key;
  }
  return cached;
}

export function isLlmConfigured(): boolean {
  try {
    return getLlm().isConfigured();
  } catch {
    return false;
  }
}

export interface LlmOutcome {
  text: string;
  /** False when the deterministic explainer produced the text instead. */
  fromModel: boolean;
  provider: string | null;
  /** Present when a model was asked and failed; the caller decides how loudly to say so. */
  warning: string | null;
}

/**
 * Ask the model, degrading to `fallback` on any failure.
 *
 * A provider outage must never take down report interpretation, so every error
 * path returns the deterministic text plus a warning the UI can display.
 */
export async function completeOrFallback(
  messages: LlmMessage[],
  fallback: string,
  opts: LlmOptions = {},
): Promise<LlmOutcome> {
  let client: LlmClient;
  try {
    client = getLlm();
  } catch (err) {
    return {
      text: fallback,
      fromModel: false,
      provider: null,
      warning: err instanceof Error ? err.message : 'Language model is not configured.',
    };
  }

  if (!client.isConfigured()) {
    return { text: fallback, fromModel: false, provider: null, warning: null };
  }

  try {
    const done: LlmCompletion = await client.complete(messages, opts);
    return { text: done.text, fromModel: true, provider: client.provider, warning: null };
  } catch (err) {
    return {
      text: fallback,
      fromModel: false,
      provider: client.provider,
      warning:
        err instanceof LlmError
          ? `The language model was unavailable (${err.message}). Showing the standard explanation instead.`
          : 'The language model was unavailable. Showing the standard explanation instead.',
    };
  }
}
