/**
 * OpenAI and every OpenAI-compatible endpoint (Groq, Together, OpenRouter,
 * LM Studio, vLLM) via the /chat/completions shape.
 */
import { getEnv } from '../../lib/env';
import { LlmError, type LlmClient, type LlmCompletion, type LlmMessage, type LlmOptions } from './types';

const DEFAULT_BASE = 'https://api.openai.com/v1';

export class OpenAiCompatibleClient implements LlmClient {
  readonly provider: string;
  readonly model: string;
  readonly #baseUrl: string;
  readonly #apiKey: string | null;

  constructor(opts: { provider: string; model: string; baseUrl?: string | null; apiKey?: string | null }) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.#baseUrl = (opts.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
    this.#apiKey = opts.apiKey || null;
  }

  isConfigured(): boolean {
    return this.#apiKey !== null;
  }

  async complete(messages: LlmMessage[], opts: LlmOptions = {}): Promise<LlmCompletion> {
    if (!this.#apiKey) {
      throw new LlmError(this.provider, 'No API key configured');
    }
    const env = getEnv();
    const started = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.signal ? env.llm.timeoutMs : env.llm.timeoutMs);
    opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      const res = await fetch(`${this.#baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.#apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: opts.maxOutputTokens ?? env.llm.maxOutputTokens,
          temperature: opts.temperature ?? env.llm.temperature,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Surface the status, never the key.
        throw new LlmError(this.provider, `Request failed with status ${res.status}`, res.status);
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) throw new LlmError(this.provider, 'Provider returned an empty response');

      return { text, provider: this.provider, model: this.model, latencyMs: Date.now() - started };
    } catch (err) {
      if (err instanceof LlmError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new LlmError(this.provider, `Request timed out after ${env.llm.timeoutMs}ms`);
      }
      throw new LlmError(this.provider, err instanceof Error ? err.message : 'Request failed');
    } finally {
      clearTimeout(timer);
    }
  }
}
