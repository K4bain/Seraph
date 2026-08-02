/**
 * AI reasoning layer — server-only.
 *
 * Provider: OpenRouter (OpenAI-compatible chat completions + function
 * calling). No provider key is required to boot; the layer activates
 * when OPENROUTER_API_KEY is set.
 *
 * Every call is logged with a request id so AI output stays
 * attributable (design principle #1: provenance is non-negotiable).
 */

const API_URL =
  process.env.OPENROUTER_BASE_URL?.replace(/\/+$/, "") ?? "https://openrouter.ai/api/v1";
const COMPLETIONS_PATH = "/chat/completions";

/** OpenRouter model id, e.g. "anthropic/claude-sonnet-4.6". Override via OPENROUTER_MODEL. */
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";

export type AiModel = string;

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
  /** JSON schema of the tool input (OpenAI "parameters" shape). */
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
    super("OPENROUTER_API_KEY is not set. Add it to .env to enable the AI layer.");
    this.name = "AiNotConfiguredError";
  }
}

function resolveModel(request: AiRequest): string {
  return request.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
}

export class AiClient {
  private readonly apiKey: string | undefined;

  constructor(apiKey = process.env.OPENROUTER_API_KEY) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    if (!this.apiKey) throw new AiNotConfiguredError();
    const requestId = crypto.randomUUID();
    const model = resolveModel(request);

    const response = await fetch(`${API_URL}${COMPLETIONS_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(request.system ? [{ role: "system", content: request.system }] : []),
          ...request.messages,
        ],
        max_tokens: request.maxTokens ?? 4096,
      }),
    });

    const data = await parseCompletion(response);
    const text = data.choices[0]?.message?.content ?? "";

    console.log(
      `[ai] request ${requestId} ok — model=${data.model} in=${data.usage?.prompt_tokens ?? "?"} out=${data.usage?.completion_tokens ?? "?"}`,
    );

    return {
      requestId,
      text,
      model: data.model as AiModel,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  /**
   * Structured completion via OpenAI-style function calling. The model
   * must call the given tool; its parsed input is returned alongside any
   * text. Freeform prose is never written to the graph — callers validate
   * the tool input against canonical types before proposing anything.
   *
   * Some providers cannot enforce `tool_choice` at inference time (they
   * reject it or silently ignore it). When that happens we retry once
   * with a hard system instruction instead, then fail loudly if the model
   * still returns no tool call — a model that won't produce structured
   * output must never yield empty proposals silently.
   */
  async completeStructured(request: AiRequest & { tools: AiToolDefinition[] }): Promise<AiStructuredResponse> {
    if (!this.apiKey) throw new AiNotConfiguredError();
    const requestId = crypto.randomUUID();
    const model = resolveModel(request);

    let data: OpenRouterResponse;
    try {
      data = await this.postCompletion(request, model, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("tool_choice")) {
        // Provider can't enforce tool choice — retry with a hard instruction.
        data = await this.postCompletion(request, model, false);
      } else {
        throw error;
      }
    }

    const toolUses = parseToolUses(data);
    if (toolUses.length === 0) {
      throw new Error(
        `Model ${model} returned no tool call — it cannot provide structured output. ` +
          "Switch OPENROUTER_MODEL to a function-calling model.",
      );
    }

    const text = data.choices[0]?.message?.content ?? "";
    console.log(
      `[ai] request ${requestId} ok — model=${data.model} in=${data.usage?.prompt_tokens ?? "?"} out=${data.usage?.completion_tokens ?? "?"} tools=${toolUses.length}`,
    );

    return {
      requestId,
      text,
      model: data.model as AiModel,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      toolUses,
    };
  }

  private async postCompletion(
    request: AiRequest & { tools: AiToolDefinition[] },
    model: string,
    enforceToolChoice: boolean,
  ): Promise<OpenRouterResponse> {
    if (!this.apiKey) throw new AiNotConfiguredError();
    const system = request.system
      ? enforceToolChoice
        ? request.system
        : `${request.system}\n\nYou MUST respond by calling the tool "${request.tools[0]?.name}". Do not answer in prose.`
      : enforceToolChoice
        ? undefined
        : `You MUST respond by calling the tool "${request.tools[0]?.name}". Do not answer in prose.`;

    const response = await fetch(`${API_URL}${COMPLETIONS_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [...(system ? [{ role: "system", content: system }] : []), ...request.messages],
        max_tokens: request.maxTokens ?? 4096,
        tools: request.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        })),
        ...(enforceToolChoice ? { tool_choice: { type: "function", function: { name: request.tools[0]?.name } } } : {}),
      }),
    });
    return parseCompletion(response);
  }
}

function parseToolUses(data: OpenRouterResponse): AiToolUse[] {
  const toolUses: AiToolUse[] = [];
  for (const call of data.choices[0]?.message?.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try {
      input = call.function?.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
    } catch {
      input = {}; // malformed arguments — treat as empty rather than crashing the flow
    }
    toolUses.push({ id: call.id ?? "", name: call.function?.name ?? "", input });
  }
  return toolUses;
}

interface OpenRouterChoice {
  message?: {
    content?: string | null;
    tool_calls?: Array<{
      id?: string;
      function?: { name?: string; arguments?: string };
    }>;
  };
}

interface OpenRouterResponse {
  model: string;
  choices: OpenRouterChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

async function parseCompletion(response: Response): Promise<OpenRouterResponse> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter API ${response.status}: ${body.slice(0, 300)}`);
  }
  return (await response.json()) as OpenRouterResponse;
}

let _ai: AiClient | undefined;

/** Lazily-constructed singleton. */
export function getAiClient(): AiClient {
  _ai ??= new AiClient();
  return _ai;
}
