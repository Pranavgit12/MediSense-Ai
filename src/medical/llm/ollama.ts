/**
 * Ollama, for a fully local model. No API key; needs a reachable base URL.
 */
import { getEnv } from '../../lib/env';
import { LlmError, type LlmClient, type LlmCompletion, type LlmMessage, type LlmOptions } from './types';

const DEFAULT_BASE = 'http://127.0.0.1:11434';

export class OllamaClient implements LlmClient {
  readonly provider = 'ollama';
  readonly model: string;
  readonly #baseUrl: string;

  constructor(opts: { model: string; baseUrl?: string | null }) {
    this.model = opts.model;
    this.#baseUrl = (opts.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  }

  isConfigured(): boolean {
    return true;
  }

  async complete(messages: LlmMessage[], opts: LlmOptions = {}): Promise<LlmCompletion> {
    const env = getEnv();
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.llm.timeoutMs);
    opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      const res = await fetch(`${this.#baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages,
          options: {
            num_predict: opts.maxOutputTokens ?? env.llm.maxOutputTokens,
            temperature: opts.temperature ?? env.llm.temperature,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new LlmError(this.provider, `Request failed with status ${res.status}`, res.status);
      }

      const json = (await res.json()) as { message?: { content?: string } };
      const text = json.message?.content?.trim();
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
