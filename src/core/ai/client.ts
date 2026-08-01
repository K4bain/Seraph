/**
 * AI reasoning layer — server-only.
 *
 * Phase 1 ships the typed client surface only (no provider key is
 * required to boot). Phase 4 fills in entity extraction, edge
 * inference, anomaly flagging, and narrative generation on top of
 * `complete()`.
 *
 * Every call is logged with a request id so AI output stays
 * attributable (design principle #1: provenance is non-negotiable).
 */

const API_URL = "https://api.anthropic.com/v1/messages";

export type AiModel = "claude-sonnet-4-6";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiRequest {
  model?: AiModel;
  system?: string;
  messages: AiMessage[];
  maxTokens?: number;
}

export interface AiResponse {
  requestId: string;
  text: string;
  model: AiModel;
  usage: { inputTokens: number; outputTokens: number };
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set. Add it to .env to enable the AI layer.");
    this.name = "AiNotConfiguredError";
  }
}

export class AiClient {
  private readonly apiKey: string | undefined;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    if (!this.apiKey) throw new AiNotConfiguredError();
    const requestId = crypto.randomUUID();

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: request.model ?? "claude-sonnet-4-6",
        system: request.system,
        messages: request.messages,
        max_tokens: request.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      id: string;
      model: string;
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const text = data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

    console.log(
      `[ai] request ${requestId} ok — model=${data.model} in=${data.usage.input_tokens} out=${data.usage.output_tokens}`,
    );

    return {
      requestId,
      text,
      model: data.model as AiModel,
      usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens },
    };
  }
}

let _ai: AiClient | undefined;

/** Lazily-constructed singleton. */
export function getAiClient(): AiClient {
  _ai ??= new AiClient();
  return _ai;
}
