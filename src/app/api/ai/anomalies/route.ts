/**
 * POST /api/ai/anomalies
 *
 * Runs AI anomaly flagging over a canvas. Returns a list of typed
 * anomaly flags — nothing is written to the canvas. The analyst reviews,
 * then POSTs to /api/ai/apply-anomalies to write them as memo cards.
 */

import { AiNotConfiguredError } from "@/core/ai/client";
import { flagAnomalies } from "@/core/ai/tasks/anomalies";
import { loadLatestCanvasDoc } from "@/core/canvas";

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
  const body = (await req.json()) as { canvasId?: unknown };

  if (typeof body.canvasId !== "string" || !body.canvasId) {
    return Response.json({ error: "canvasId_required" }, { status: 400 });
  }

  try {
    const doc = await loadLatestCanvasDoc(body.canvasId);
    const result = await withTimeout(flagAnomalies(doc));
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
