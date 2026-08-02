import { afterEach, describe, expect, it, vi } from "vitest";
import { AiClient, AiNotConfiguredError } from "./client";

const originalFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("AiClient", () => {
  it("throws AiNotConfiguredError without a key", async () => {
    const client = new AiClient("");
    expect(client.isConfigured()).toBe(false);
    await expect(client.complete({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
      AiNotConfiguredError,
    );
  });

  it("sends Bearer auth and returns text + usage", async () => {
    mockFetch(200, {
      model: "anthropic/claude-sonnet-4.6",
      choices: [{ message: { role: "assistant", content: "hello world" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const client = new AiClient("sk-test");
    const res = await client.complete({ messages: [{ role: "user", content: "hi" }], maxTokens: 32 });

    expect(res.text).toBe("hello world");
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const init = vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ authorization: "Bearer sk-test" });
    const sent = JSON.parse(init.body as string);
    expect(sent.max_tokens).toBe(32);
    expect(sent.model).toBe("anthropic/claude-sonnet-4.6");
  });

  it("parses OpenAI-style tool_calls with JSON-string arguments", async () => {
    mockFetch(200, {
      model: "openai/gpt-5",
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "analyze_text",
                  arguments: JSON.stringify({
                    entities: [{ name: "Acme Corp", type: "organization" }],
                    relationships: [],
                  }),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 40 },
    });

    const client = new AiClient("sk-test");
    const res = await client.completeStructured({
      messages: [{ role: "user", content: "text" }],
      tools: [{ name: "analyze_text", inputSchema: { type: "object" } }],
    });

    expect(res.toolUses).toHaveLength(1);
    expect(res.toolUses[0]).toMatchObject({
      id: "call_1",
      name: "analyze_text",
      input: { entities: [{ name: "Acme Corp", type: "organization" }] },
    });
    expect(res.text).toBe("");

    const sent = JSON.parse((vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(sent.tools[0]).toEqual({
      type: "function",
      function: { name: "analyze_text", parameters: { type: "object" } },
    });
    expect(sent.tool_choice).toEqual({ type: "function", function: { name: "analyze_text" } });
  });

  it("survives malformed tool-call arguments", async () => {
    mockFetch(200, {
      model: "openai/gpt-5",
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "call_x", type: "function", function: { name: "analyze_text", arguments: "not json" } },
            ],
          },
        },
      ],
    });

    const client = new AiClient("sk-test");
    const res = await client.completeStructured({
      messages: [{ role: "user", content: "text" }],
      tools: [{ name: "analyze_text", inputSchema: {} }],
    });
    expect(res.toolUses[0]?.input).toEqual({});
  });

  it("surfaces provider errors with the status", async () => {
    mockFetch(429, { error: { message: "rate limited" } });
    const client = new AiClient("sk-test");
    await expect(client.complete({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
      /OpenRouter API 429/,
    );
  });
});
