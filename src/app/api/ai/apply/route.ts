/**
 * POST /api/ai/apply
 *
 * Writes an analyst-confirmed AI analysis to a canvas. Goes through the
 * same ingest pipeline as connectors: fingerprint dedup, provenance
 * merge, deterministic card ids, and `proposed: true` edges.
 */

import { ingestEvents } from "@/core/ingest/ingest";
import {
  analysisToEvents,
  type AnalysisResult,
} from "@/core/ai/tasks/analyze";

export const dynamic = "force-dynamic";

const MAX_ENTITIES = 100;
const MAX_RELATIONSHIPS = 200;
const SOURCE_URL = "manual://paste"; // provenance anchor for paste-driven analysis

export async function POST(req: Request) {
  const body = (await req.json()) as {
    canvasId?: unknown;
    analysis?: unknown;
  };

  if (typeof body.canvasId !== "string" || !body.canvasId) {
    return Response.json({ error: "canvasId_required" }, { status: 400 });
  }
  const analysis = body.analysis as Partial<AnalysisResult> | undefined;
  if (!analysis || !Array.isArray(analysis.entities) || !Array.isArray(analysis.relationships)) {
    return Response.json({ error: "analysis_required" }, { status: 400 });
  }
  if (analysis.entities.length > MAX_ENTITIES || analysis.relationships.length > MAX_RELATIONSHIPS) {
    return Response.json(
      { error: "too_many_items", hint: `Cap is ${MAX_ENTITIES} entities / ${MAX_RELATIONSHIPS} relationships.` },
      { status: 400 },
    );
  }

  try {
    const events = analysisToEvents(
      { entities: analysis.entities, relationships: analysis.relationships },
      SOURCE_URL,
    );
    const result = await ingestEvents(events, body.canvasId);
    return Response.json({ applied: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return Response.json({ error: "apply_failed", detail: message.slice(0, 300) }, { status: 500 });
  }
}
