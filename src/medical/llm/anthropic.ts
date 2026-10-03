/**
 * Anthropic Messages API.
 */
import { getEnv } from '../../lib/env';
import { LlmError, type LlmClient, type LlmCompletion, type LlmMessage, type LlmOptions } from './types';

const DEFAULT_BASE = 'https://api.anthropic.com/v1';
const API_VERSION = '2023-06-01';

export class AnthropicClient implements LlmClient {
  readonly provider = 'anthropic';
  readonly model: string;
  readonly #baseUrl: string;
  readonly #apiKey: string | null;

  constructor(opts: { model: string; baseUrl?: string | null; apiKey?: string | null }) {
    this.model = opts.model;
    this.#baseUrl = (opts.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
    this.#apiKey = opts.apiKey || null;
  }

  isConfigured(): boolean {
    return this.#apiKey !== null;
  }

  async complete(messages: LlmMessage[], opts: LlmOptions = {}): Promise<LlmCompletion> {
    if (!this.#apiKey) throw new LlmError(this.provider, 'No API key configured');
    const env = getEnv();
    const started = Date.now();

    // Anthropic takes the system prompt out of band rather than as a message.
    const system = messages.find((m) => m.role === 'system')?.content;
    const turns = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.llm.timeoutMs);
    opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      const res = await fetch(`${this.#baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.#apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: opts.maxOutputTokens ?? env.llm.maxOutputTokens,
          temperature: opts.temperature ?? env.llm.temperature,
          ...(system ? { system } : {}),
          messages: turns,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new LlmError(this.provider, `Request failed with status ${res.status}`, res.status);
      }

      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = json.content
        ?.filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
        .trim();
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
