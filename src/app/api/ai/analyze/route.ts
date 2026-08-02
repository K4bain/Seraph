/**
 * POST /api/ai/analyze
 *
 * Runs AI extraction + edge inference over pasted text. Returns a
 * proposal (entities + relationships) — nothing is written to any
 * canvas. The analyst reviews, then POSTs to /api/ai/apply.
 */

import { AiNotConfiguredError } from "@/core/ai/client";
import { analyzeDocument } from "@/core/ai/tasks/analyze";

export const dynamic = "force-dynamic";

const AI_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error("ai_timeout")), AI_TIMEOUT_MS),
    ),
  ]);
}

export async function POST(req: Request) {
  const body = (await req.json()) as { text?: unknown };

  if (typeof body.text !== "string" || body.text.trim().length < 40) {
    return Response.json(
      { error: "text_too_short", hint: "Paste at least a few sentences of source material." },
      { status: 400 },
    );
  }

  try {
    const result = await withTimeout(analyzeDocument(body.text.trim()));
    return Response.json(result);
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return Response.json(
        { error: "ai_not_configured", hint: "Set OPENROUTER_API_KEY in .env to enable the AI layer." },
        { status: 503 },
      );
    }
    const message = error instanceof Error ? error.message : "unknown_error";
    return Response.json(
      { error: "ai_error", detail: message.slice(0, 300) },
      { status: 500 },
    );
  }
}
