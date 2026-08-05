import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY;

/** 1x1 transparent PNG — tiny enough to live inline in a test. */
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (ORIGINAL_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = ORIGINAL_KEY;
});

describe("imint metadata extraction", () => {
  it("extracts dimensions from a generated 1x1 PNG buffer", async () => {
    const { extractImageMetadata } = await import("./extract");
    const { metadata, hasLocation } = await extractImageMetadata(PNG_1x1);
    expect(metadata.width).toBe(1);
    expect(metadata.height).toBe(1);
    expect(hasLocation).toBe(false);
    expect(metadata.gpsLat).toBeUndefined();
    expect(metadata.gpsLon).toBeUndefined();
  });

  it("returns empty metadata for an opaque buffer without throwing", async () => {
    const { extractImageMetadata } = await import("./extract");
    const { metadata, hasLocation } = await extractImageMetadata(new Uint8Array([0, 1, 2, 3]));
    expect(metadata).toEqual({});
    expect(hasLocation).toBe(false);
  });
});

describe("imint AI fallback", () => {
  it("skips the summary when no OPENROUTER_API_KEY is configured", async () => {
    delete process.env.OPENROUTER_API_KEY;
    vi.resetModules();
    const { summarizeImageMetadata } = await import("./summarize");
    const summary = await summarizeImageMetadata({ width: 1, height: 1 });
    expect(summary).toBe("");
  });

  it("returns an analyst summary when the AI layer is configured", async () => {
    process.env.OPENROUTER_API_KEY = "sk-test";
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            model: "anthropic/claude-sonnet-4.6",
            choices: [{ message: { role: "assistant", content: "1x1 PNG, no EXIF GPS — a synthetic asset." } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
          { status: 200 },
        ),
      ),
    );
    const { summarizeImageMetadata } = await import("./summarize");
    const summary = await summarizeImageMetadata({ cameraModel: "iPhone 15", width: 1, height: 1 });
    expect(summary).toBe("1x1 PNG, no EXIF GPS — a synthetic asset.");
  });

  it("survives an upstream AI error and returns an empty summary", async () => {
    process.env.OPENROUTER_API_KEY = "sk-test";
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const { summarizeImageMetadata } = await import("./summarize");
    const summary = await summarizeImageMetadata({ cameraModel: "iPhone 15" });
    expect(summary).toBe("");
  });
});
