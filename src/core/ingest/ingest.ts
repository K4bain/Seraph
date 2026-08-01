/**
 * Ingest engine — connector events → canvas cards.
 *
 * The canvas document is the source of truth (Phase 3, AGE deferred on
 * managed hosts): each EntityStreamEvent becomes a card on the target
 * canvas and its relationships become *proposed* edges awaiting analyst
 * confirmation ("AI proposes, analysts decide").
 *
 * Dedup: entities are keyed by name fingerprint (src/core/graph/dedup);
 * exact matches merge sources, events that repeat are skipped. Writes
 * are new snapshot versions with the same optimistic-concurrency guard
 * as the snapshot API — read-then-insert with retry on (canvasId,
 * version) collisions.
 */

import { prisma } from "@/core/db";
import { ensureCanvas } from "@/core/anchor";
import { nameFingerprint } from "@/core/graph/dedup";
import { Prisma } from "@/generated/prisma/client";
import type { CanvasDocument, CardNode } from "@/store/canvas";
import type {
  EntityCard,
  EntityStreamEvent,
  EventCard,
  IntelligenceCard,
  SourceRef,
} from "meridian-graph-types";

export interface IngestResult {
  canvasId: string;
  cardsCreated: number;
  cardsUpdated: number;
  cardsSkipped: number;
  edgesProposed: number;
  edgesSkipped: number;
}

/** Deterministic, URL-safe card id from a connector event. */
function cardIdFor(connectorId: string, externalId: string): string {
  const seg = externalId.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48);
  return `${connectorId}-${seg}`;
}

function sourceKey(source: SourceRef): string {
  return source.url;
}

/** Append incoming sources that aren't already present (by URL). */
function mergeSources(existing: SourceRef[], incoming: SourceRef[]): SourceRef[] {
  const seen = new Set(existing.map(sourceKey));
  const merged = [...existing];
  for (const source of incoming) {
    if (!seen.has(sourceKey(source))) {
      merged.push(source);
      seen.add(sourceKey(source));
    }
  }
  return merged;
}

function buildEventCard(event: EntityStreamEvent, id: string): EventCard {
  const entity = event.entity;
  const now = new Date().toISOString();
  const summary =
    typeof entity.attributes?.summary === "string" ? entity.attributes.summary : undefined;
  return {
    id,
    kind: "event",
    createdAt: now,
    updatedAt: now,
    title: entity.name,
    occurredAt: entity.lastSeen ?? entity.firstSeen ?? event.fetchedAt,
    summary,
    sources: entity.sources,
  };
}

function buildEntityCard(event: EntityStreamEvent, id: string, fingerprint: string): EntityCard {
  const entity = event.entity;
  const now = new Date().toISOString();
  const meridianId = `${event.connectorId}:${entity.externalId ?? fingerprint}`;
  return {
    id,
    kind: "entity",
    createdAt: now,
    updatedAt: now,
    meridianId,
    entity: {
      externalId: entity.externalId,
      type: entity.type,
      name: entity.name,
      aliases: entity.aliases,
      attributes: entity.attributes,
      geo: entity.geo,
      firstSeen: entity.firstSeen,
      lastSeen: entity.lastSeen,
      sources: entity.sources,
      meridianId,
      fingerprint,
      confidence: event.confidence,
    },
  };
}

/** Merge a repeat occurrence into an existing entity card (sources, confidence). */
function mergeEntityCard(existing: CardNode, event: EntityStreamEvent): void {
  const card = existing.data.card;
  if (card.kind !== "entity") return;
  const entity = card.entity;
  const incoming = event.entity;
  entity.sources = mergeSources(entity.sources, incoming.sources);
  entity.aliases = [...new Set([...(entity.aliases ?? []), ...(incoming.aliases ?? [])])];
  entity.confidence = Math.max(entity.confidence, event.confidence);
  entity.firstSeen = entity.firstSeen ?? incoming.firstSeen;
  entity.lastSeen = incoming.lastSeen ?? entity.lastSeen;
  card.updatedAt = new Date().toISOString();
}

interface DocIndex {
  byId: Map<string, CardNode>;
  entityByFingerprint: Map<string, CardNode>;
  eventByTitleFingerprint: Map<string, CardNode>;
  /** `${connectorId}:${externalId}` → entity card node. */
  entityByExternalId: Map<string, CardNode>;
}

function indexDoc(doc: CanvasDocument): DocIndex {
  const index: DocIndex = {
    byId: new Map(),
    entityByFingerprint: new Map(),
    eventByTitleFingerprint: new Map(),
    entityByExternalId: new Map(),
  };
  for (const node of doc.nodes ?? []) {
    index.byId.set(node.id, node);
    const card = node.data?.card;
    if (!card) continue;
    if (card.kind === "entity") {
      index.entityByFingerprint.set(card.entity.fingerprint, node);
      index.entityByExternalId.set(card.entity.meridianId, node);
    } else if (card.kind === "event") {
      index.eventByTitleFingerprint.set(nameFingerprint(card.title), node);
    }
  }
  return index;
}

function resolveNodeId(
  ref: string,
  connectorId: string,
  index: DocIndex,
  batchIds: Map<string, string>,
): string | null {
  const inBatch = batchIds.get(ref);
  if (inBatch) return inBatch;
  const byExternalId = index.entityByExternalId.get(`${connectorId}:${ref}`);
  if (byExternalId) return byExternalId.id;
  if (index.byId.has(ref)) return ref;
  return null;
}

/**
 * Pure merge: applies events to a document copy. Mutates `doc` and
 * returns the result summary.
 */
function mergeEvents(doc: CanvasDocument, events: EntityStreamEvent[]): IngestResult {
  const result: IngestResult = {
    canvasId: "",
    cardsCreated: 0,
    cardsUpdated: 0,
    cardsSkipped: 0,
    edgesProposed: 0,
    edgesSkipped: 0,
  };

  const index = indexDoc(doc);
  const batchIds = new Map<string, string>();
  const edgeIds = new Set((doc.edges ?? []).map((edge) => edge.id));
  let placed = 0;

  function positionFor(): { x: number; y: number } {
    const col = placed % 4;
    const row = Math.floor(placed / 4);
    placed += 1;
    return { x: 980 + col * 230, y: 60 + row * 170 };
  }

  for (const event of events) {
    const entity = event.entity;
    const id = cardIdFor(event.connectorId, entity.externalId ?? entity.name);

    const existingById = index.byId.get(id);
    if (entity.type === "event") {
      const fingerprint = nameFingerprint(entity.name);
      const existing = existingById ?? index.eventByTitleFingerprint.get(fingerprint);
      if (existing) {
        result.cardsSkipped += 1;
        batchIds.set(entity.externalId ?? "", existing.id);
        continue;
      }
      const card: IntelligenceCard = buildEventCard(event, id);
      const node: CardNode = { id, type: "intelligence", position: positionFor(), data: { card } };
      doc.nodes.push(node);
      index.byId.set(id, node);
      index.eventByTitleFingerprint.set(fingerprint, node);
      batchIds.set(entity.externalId ?? "", id);
      result.cardsCreated += 1;
    } else {
      const fingerprint = nameFingerprint(entity.name);
      const existing = existingById ?? index.entityByFingerprint.get(fingerprint);
      if (existing) {
        mergeEntityCard(existing, event);
        index.entityByExternalId.set(`${event.connectorId}:${entity.externalId ?? fingerprint}`, existing);
        batchIds.set(entity.externalId ?? "", existing.id);
        result.cardsUpdated += 1;
        continue;
      }
      const card: IntelligenceCard = buildEntityCard(event, id, fingerprint);
      const node: CardNode = { id, type: "intelligence", position: positionFor(), data: { card } };
      doc.nodes.push(node);
      index.byId.set(id, node);
      index.entityByFingerprint.set(fingerprint, node);
      index.entityByExternalId.set(card.entity.meridianId, node);
      batchIds.set(entity.externalId ?? "", id);
      result.cardsCreated += 1;
    }

    // Relationships: source/target refs resolve to in-batch or existing cards.
    for (const relationship of event.relationships) {
      const sourceId = resolveNodeId(relationship.source, event.connectorId, index, batchIds);
      const targetId = resolveNodeId(relationship.target, event.connectorId, index, batchIds);
      if (!sourceId || !targetId || sourceId === targetId) {
        result.edgesSkipped += 1;
        continue;
      }
      const edgeId = `${sourceId}--${relationship.type}--${targetId}`;
      if (edgeIds.has(edgeId)) {
        result.edgesSkipped += 1;
        continue;
      }
      edgeIds.add(edgeId);
      doc.edges.push({
        id: edgeId,
        source: sourceId,
        target: targetId,
        type: "intelligence",
        data: { relationship: relationship.type, confidence: relationship.confidence, proposed: true },
      });
      result.edgesProposed += 1;
    }
  }

  return result;
}

/** Idempotent: write the latest snapshot plus a new version with events merged in. */
export async function ingestEvents(
  events: EntityStreamEvent[],
  canvasId: string,
): Promise<IngestResult> {
  if (events.length === 0) {
    return { canvasId, cardsCreated: 0, cardsUpdated: 0, cardsSkipped: 0, edgesProposed: 0, edgesSkipped: 0 };
  }

  await ensureCanvas(canvasId, "Connector ingestion");

  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await prisma.canvasSnapshot.findFirst({
      where: { canvasId },
      orderBy: { version: "desc" },
    });
    const doc = (snapshot?.document as unknown as CanvasDocument | undefined) ?? { nodes: [], edges: [] };
    const version = (snapshot?.version ?? 0) + 1;

    const result = mergeEvents(doc, events);
    result.canvasId = canvasId;

    try {
      await prisma.canvasSnapshot.create({
        data: {
          canvasId,
          version,
          document: doc as unknown as Prisma.InputJsonValue,
        },
      });
      return result;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2002" && attempt < 2) continue; // version collision — re-read and retry
      throw error;
    }
  }

  throw new Error(`ingest: could not write snapshot for canvas "${canvasId}" (persistent conflict)`);
}
