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

export interface AiToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface AiToolUse {
  id: string;
  name: string;
  /** Parsed tool input — shape is defined by the tool schema. */
  input: Record<string, unknown>;
}

export interface AiResponse {
  requestId: string;
  text: string;
  model: AiModel;
  usage: { inputTokens: number; outputTokens: number };
}

export interface AiStructuredResponse {
  requestId: string;
  text: string;
  model: AiModel;
  usage: { inputTokens: number; outputTokens: number };
  toolUses: AiToolUse[];
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

  /**
   * Structured completion via Anthropic tool_use. The model must call the
   * given tool; its parsed input is returned alongside any text. Freeform
   * prose is never written to the graph — callers validate the tool input
   * against canonical types before proposing anything.
   */
  async completeStructured(request: AiRequest & { tools: AiToolDefinition[] }): Promise<AiStructuredResponse> {
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
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        })),
        tool_choice: { type: "tool", name: request.tools[0]?.name },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      id: string;
      model: string;
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const toolUses: AiToolUse[] = data.content
      .filter((block) => block.type === "tool_use")
      .map((block) => ({
        id: block.id ?? "",
        name: block.name ?? "",
        input: block.input ?? {},
      }));

    const text = data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

    console.log(
      `[ai] request ${requestId} ok — model=${data.model} in=${data.usage.input_tokens} out=${data.usage.output_tokens} tools=${toolUses.length}`,
    );

    return {
      requestId,
      text,
      model: data.model as AiModel,
      usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens },
      toolUses,
    };
  }
}

let _ai: AiClient | undefined;

/** Lazily-constructed singleton. */
export function getAiClient(): AiClient {
  _ai ??= new AiClient();
  return _ai;
}
