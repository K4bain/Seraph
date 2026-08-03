/**
 * Entity connections API.
 *
 * GET /api/entity/[id]/connections
 *   → { name, canvasId, canvasTitle, nodes, edges }
 *
 * Read-only neighbourhood graph from the canvas where the entity lives
 * (≤10 nodes). Nothing here mutates — the AI-proposed edges stay
 * `proposed` for the analyst to confirm on the canvas.
 */

import { findEntityConnections } from "../../../../../core/entity/profile";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const name = decodeURIComponent(id).trim();
  if (!name) return Response.json({ error: "entity_required" }, { status: 400 });

  const graph = await findEntityConnections(name);
  return Response.json({ name, ...graph });
}
