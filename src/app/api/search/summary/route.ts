/**
 * Search summary API — streams an AI-generated analyst briefing for a
 * query + its search results (plain-text chunks over a text/plain
 * response). Reuses src/core/ai/client.ts exclusively.
 *
 * GET /api/search/summary?q=&type=
 */

import { getAiClient } from "../../../../core/ai/client";
import { runSearch } from "../../../../core/search/run";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim();
  const type = searchParams.get("type")?.trim() || null;

  if (!query) {
    return Response.json({ error: "query_required" }, { status: 400 });
  }

  const ai = getAiClient();
  if (!ai.isConfigured()) {
    return Response.json({ error: "ai_not_configured" }, { status: 503 });
  }

  const results = await runSearch(query, type);

  // Compact transcript for the model — never the raw payloads.
  const transcript = results.map((entry) => {
    if (entry.status === "error") return `[${entry.source}] error`;
    return `[${entry.source}] ${entry.data
      .slice(0, 5)
      .map((item) => `${item.title}${item.date ? ` (${item.date.slice(0, 10)})` : ""}`)
      .join(" | ")}`;
  });

  const system =
    "You are a professional OSINT analyst. Summarize the available open-source " +
    "intelligence for the given query in 3-5 concise sentences, naming the most " +
    "relevant entities and sources. Note what is missing or uncertain. No disclaimers.";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of ai.completeStreaming({
          system,
          messages: [
            {
              role: "user",
              content: `Query: ${query}${type ? ` (type: ${type})` : ""}\n\nSources:\n${transcript.join("\n")}`,
            },
          ],
          maxTokens: 800,
        })) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        controller.enqueue(encoder.encode(`\n\n[summary unavailable: ${message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
