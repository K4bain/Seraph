/**
 * Add a search result to a canvas.
 *
 * POST /api/search/add-to-canvas { canvasId, item: SearchResultItem }
 *   → ingest result (same dedup/provenance pipeline as connectors and
 *     MCP propose_entity — entities merge by fingerprint, edges are
 *     proposed, never auto-committed).
 */

import type { SearchResultItem } from "seraph-connector-sdk";
import { prisma } from "../../../../core/db";
import { ingestEvents } from "../../../../core/ingest/ingest";
import type { EntityStreamEvent, SourceRef } from "seraph-graph-types";
import { publishFeedEvent } from "../../../../core/stream/publish";

export async function POST(req: Request) {
  const body = (await req.json()) as { canvasId?: string; item?: SearchResultItem };
  const { canvasId, item } = body;

  if (!canvasId || !item?.title) {
    return Response.json({ error: "canvasId_and_item_required" }, { status: 400 });
  }
  const canvas = await prisma.canvas.findUnique({ where: { id: canvasId } });
  if (!canvas) {
    return Response.json({ error: "canvas_not_found" }, { status: 404 });
  }

  const entityType = (item.entityType ?? "person") as EntityStreamEvent["entityType"];
  const fetchedAt = new Date().toISOString();
  const sourceRef: SourceRef = {
    connectorId: item.source.toLowerCase().replace(/\s+/g, "-"),
    title: `${item.source} — ${item.title}`,
    url: item.url ?? item.source,
    fetchedAt,
  };

  const event: EntityStreamEvent = {
    connectorId: sourceRef.connectorId,
    entityType,
    entity: {
      externalId: `search-${item.externalId ?? item.title}-${Date.now().toString(36)}`,
      type: entityType,
      name: item.title,
      aliases: item.name && item.name !== item.title ? [item.name] : undefined,
      attributes: {
        ...(item.category ? { category: item.category } : {}),
        ...(item.date ? { date: item.date } : {}),
        ...(item.country ? { country: item.country } : {}),
        ...(item.company ? { company: item.company } : {}),
        ...(item.description ? { description: item.description } : {}),
        ...(item.metadata ? { ...item.metadata } : {}),
      },
      sources: [sourceRef],
    },
    relationships: [],
    sourceUrl: sourceRef.url,
    fetchedAt,
    confidence: 0.8,
  };

  const result = await ingestEvents([event], canvasId);
  void publishFeedEvent({
    kind: "batch",
    id: `search:add:${canvasId}:${Date.now().toString(36)}`,
    ts: fetchedAt,
    source: sourceRef.connectorId,
    canvasId,
    action: "proposed",
    summary: {
      cardsCreated: result.cardsCreated,
      cardsUpdated: result.cardsUpdated,
      cardsSkipped: result.cardsSkipped,
      edgesProposed: result.edgesProposed,
    },
  });

  return Response.json({
    added: result.cardsCreated + result.cardsUpdated,
    duplicate: result.cardsSkipped,
    edgesProposed: result.edgesProposed,
  });
}
