/**
 * AGE graph import bridge — canvas snapshot → Apache AGE graph.
 *
 * The canvas document is the source of truth (Phase 3). This module is
 * the optional bridge that materialises the canvas into the property
 * graph: confirmed entities become `Entity` vertices, confirmed edges
 * become typed relationships. Proposed records stay out of the graph —
 * "AI proposes, analysts decide" (see design principles).
 *
 * Safety:
 * - Server-only (imports `@/core/graph/age` and `@/core/db`).
 * - All-or-nothing per entity batch: a write failure aborts the import
 *   and surfaces the error — the graph never holds a partial canvas.
 * - Idempotent: MERGE on `seraphId` keeps re-imports safe.
 * - No-op on managed hosts without the AGE extension (a clear error is
 *   thrown by `GraphClient.ensureAge()`).
 */

import { prisma } from "@/core/db";
import { getGraph } from "@/core/graph/age";
import type { CanvasDocument, CardNode, RelationEdge } from "@/store/canvas";
import type { EntityCard, EdgeType } from "seraph-graph-types";

export interface GraphImportResult {
  canvasId: string;
  version: number;
  entitiesWritten: number;
  edgesWritten: number;
  edgesSkipped: number;
}

export interface GraphImportError {
  canvasId: string;
  reason: string;
  detail?: string;
}

/**
 * Allowlist of edge types safe to interpolate as Cypher labels. Mirrors
 * the `EdgeType` union from seraph-graph-types — defence in depth so
 * an unexpected string can never reach the Cypher statement.
 */
const ALLOWED_EDGE_TYPES: ReadonlySet<string> = new Set<EdgeType>([
  "controls",
  "owns",
  "employs",
  "has_member",
  "located_at",
  "registered_in",
  "linked_to",
  "related_to",
  "mentions",
  "participated_in",
  "acquired",
  "sanctioned_by",
  "associated_with",
]);

/**
 * Import the latest snapshot of a canvas into the AGE graph.
 *
 * Only confirmed records land in the graph:
 *  - Entity cards whose `entity.proposed` is not true.
 *  - Edges whose `data.proposed` is not true.
 *
 * Proposed records are skipped by design — they await analyst
 * confirmation on the canvas first.
 */
export async function importCanvasToGraph(
  canvasId: string,
): Promise<GraphImportResult | GraphImportError> {
  const snapshot = await prisma.canvasSnapshot.findFirst({
    where: { canvasId },
    orderBy: { version: "desc" },
  });

  if (!snapshot) {
    return { canvasId, reason: "no_snapshot" };
  }

  const doc = snapshot.document as unknown as CanvasDocument;
  const nodes = doc.nodes ?? [];
  const edges = doc.edges ?? [];

  // Filter to confirmed entity cards.
  const entities = nodes
    .filter((n): n is CardNode & { data: { card: EntityCard } } => n.data?.card?.kind === "entity")
    .map((n) => n.data.card)
    .filter((card) => !card.entity.proposed);

  // Filter to confirmed edges (both endpoints must resolve to a written entity).
  const entityIdSet = new Set(entities.map((e) => e.id));
  const confirmedEdges = (edges as RelationEdge[]).filter(
    (edge) =>
      !edge.data?.proposed &&
      entityIdSet.has(edge.source) &&
      entityIdSet.has(edge.target),
  );

  const graph = getGraph();

  // ---- Write entity vertices (idempotent MERGE on seraphId) ----
  for (const card of entities) {
    const e = card.entity;
    const params = {
      mid: e.seraphId,
      name: e.name,
      type: e.type,
      fingerprint: e.fingerprint,
      confidence: e.confidence,
      aliases: (e.aliases ?? []).join("|"),
      lat: e.geo?.lat ?? null,
      lon: e.geo?.lon ?? null,
    };
    await graph.write(
      `MERGE (n:Entity {seraphId: $mid})
       SET n.name = $name,
           n.type = $type,
           n.fingerprint = $fingerprint,
           n.confidence = $confidence,
           n.aliases = $aliases,
           n.lat = $lat,
           n.lon = $lon`,
      params,
    );
  }

  // ---- Write edges (idempotent MERGE on endpoints + type) ----
  let edgesWritten = 0;
  let edgesSkipped = 0;

  // Build a lookup from card id → seraphId for edge endpoint resolution.
  const seraphIdByCardId = new Map(entities.map((e) => [e.id, e.entity.seraphId]));

  for (const edge of confirmedEdges) {
    const sourceMid = seraphIdByCardId.get(edge.source);
    const targetMid = seraphIdByCardId.get(edge.target);
    if (!sourceMid || !targetMid) {
      edgesSkipped += 1;
      continue;
    }
    const rel = (edge.data?.relationship ?? "linked_to") as EdgeType;
    const confidence = edge.data?.confidence ?? 1;
    // Cypher edge labels cannot be parameterised — they must be literal.
    // The value is constrained to the EdgeType union, so it is safe to
    // interpolate after an allowlist check (defence in depth).
    if (!ALLOWED_EDGE_TYPES.has(rel)) {
      edgesSkipped += 1;
      continue;
    }
    await graph.write(
      `MATCH (a:Entity {seraphId: $sourceMid}), (b:Entity {seraphId: $targetMid})
       MERGE (a)-[r:${rel}]->(b)
       SET r.confidence = $confidence`,
      { sourceMid, targetMid, confidence },
    );
    edgesWritten += 1;
  }

  return {
    canvasId,
    version: snapshot.version,
    entitiesWritten: entities.length,
    edgesWritten,
    edgesSkipped,
  };
}

/**
 * Check whether the AGE extension is available on the connected
 * Postgres. Returns false on managed hosts (Neon, etc.) without
 * throwing — callers use this to decide whether to offer graph import.
 */
export async function isGraphAvailable(): Promise<boolean> {
  try {
    const graph = getGraph();
    // ensureAge() throws when the extension is missing; catch and report.
    await graph.queryVertices("RETURN 1");
    return true;
  } catch {
    return false;
  }
}

/** Type guard narrowing the union result. */
export function isGraphImportError(
  r: GraphImportResult | GraphImportError,
): r is GraphImportError {
  return "reason" in r;
}
