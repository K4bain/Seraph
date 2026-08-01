/**
 * Graph import API — materialises a canvas into the AGE property graph.
 *
 * POST /api/graph/import         → import latest snapshot into AGE
 *      { canvasId }              → { entitiesWritten, edgesWritten, ... }
 * GET  /api/graph/import         → AGE availability check { available }
 *
 * Only confirmed (non-proposed) entities and edges are written — the
 * graph never holds analyst-unconfirmed data. Requires the `age`
 * Postgres extension (self-hosted); returns 503 with a clear message on
 * managed hosts where AGE is unavailable.
 */

import {
  importCanvasToGraph,
  isGraphAvailable,
  isGraphImportError,
} from "@/core/graph/import";

export async function GET() {
  const available = await isGraphAvailable();
  return Response.json({ available });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { canvasId?: string } | null;
  if (!body?.canvasId) {
    return Response.json({ error: "canvasId_required" }, { status: 400 });
  }

  // Fail fast if AGE isn't installed (Neon / managed hosts).
  const available = await isGraphAvailable().catch(() => false);
  if (!available) {
    return Response.json(
      {
        error: "age_unavailable",
        detail:
          "Apache AGE extension is not installed. Self-host Postgres with the apache/age image and point GRAPH_DATABASE_URL at it.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await importCanvasToGraph(body.canvasId);
    if (isGraphImportError(result)) {
      // No snapshot to import — not a server error, just nothing to do.
      return Response.json(result, { status: 404 });
    }
    return Response.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "graph_import_failed", detail }, { status: 500 });
  }
}
