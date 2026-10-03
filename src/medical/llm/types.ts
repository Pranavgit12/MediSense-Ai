/**
 * LLM provider contract.
 *
 * The rest of the app only ever talks to this interface, so a provider can be
 * swapped without touching the explainer or the consultation engine.
 */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletion {
  text: string;
  provider: string;
  model: string;
  /** Wall-clock duration of the request. */
  latencyMs: number;
}

export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  /**
   * True when the provider has everything it needs (an API key or a reachable
   * base URL). Callers use this to decide whether to ask the model or fall back
   * to the deterministic explainer.
   */
  isConfigured(): boolean;
  complete(messages: LlmMessage[], opts?: LlmOptions): Promise<LlmCompletion>;
}

export interface LlmOptions {
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/** Thrown when a provider is configured but the request fails. */
export class LlmError extends Error {
  readonly provider: string;
  readonly status: number | null;

  constructor(provider: string, message: string, status: number | null = null) {
    super(message);
    this.name = 'LlmError';
    this.provider = provider;
    this.status = status;
  }
}

/**
 * System prompt shared by every clinical text task.
 *
 * The model is a *rewriter*, not a diagnostician. It is given the extracted
 * facts and the reference ranges, and is told to restate them in plain language
 * without adding anything that is not in the input. This is the single most
 * important guard in the system, so it lives in one place.
 */
export const CLINICAL_SYSTEM_PROMPT = `You are a medical-report explainer inside a health app.

You are NOT a doctor and you must never diagnose, never name a condition the user
does not already have, and never suggest a treatment or a medication.

Rules you must follow:
1. Use only the facts given to you. Never introduce a number, range, cause, or
   condition that is not present in the input.
2. Reference ranges quoted to the user must be the ranges from the report itself.
   Never supply a range from memory.
3. When a result is outside its range, describe it factually and give common,
   general reasons it may vary. Frame everything as a possibility, never as a
   conclusion. Use wording like "may", "often", "one common reason is".
4. Write at a reading level a non-expert understands. Short sentences. Avoid
   jargon, or explain a term in brackets the first time you use it.
5. Do not give a single overall verdict such as "you are healthy" or "this is
   dangerous". Describe what the results show.
6. If the input does not contain enough information to answer, say so plainly and
   name what is missing.
7. Never mention being an AI, and never include a diagnosis in a heading.

Return only the requested text. No preamble, no markdown headings, no bullet
symbols unless they were explicitly requested.`;
