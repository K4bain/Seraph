/**
 * Entity profile assembly (server-only).
 *
 * There is no canonical entity table — entities live as cards inside
 * canvas snapshot documents, with per-source facts coming from the
 * connector search fan-out. This module scans the latest snapshots for
 * cards matching a name and cross-references search hits so the
 * /entity/[id] pages can render overview/timeline/connections/canvases.
 */

import { prisma } from "@/core/db";
import type { CanvasDocument } from "@/store/canvas";
import type { IntelligenceCard } from "seraph-graph-types";
import type { SearchResultItem } from "seraph-connector-sdk";

export interface EntityCanvasRef {
  canvasId: string;
  canvasTitle: string;
  nodeId: string;
  card: IntelligenceCard;
  updatedAt: string;
}

export interface ConnectionGraph {
  canvasId: string | null;
  canvasTitle: string | null;
  nodes: Array<{ id: string; name: string; type: string; proposed?: boolean }>;
  edges: Array<{ source: string; target: string; label: string; proposed?: boolean }>;
}

/** Normalized name matching — case-insensitive, ignores punctuation. */
export function nameEquals(a: string, b: string): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(a) === norm(b);
}

function cardName(card: IntelligenceCard): string | null {  switch (card.kind) {
    case "entity":
      return card.entity.name;
    case "event":
      return card.title;
    default:
      return null;
  }
}

/** Best available date for a card (entity lastSeen or event occurredAt). */
export function cardDate(card: IntelligenceCard): string | null {
  switch (card.kind) {
    case "entity":
      return (
        card.entity.lastSeen ??
        (typeof card.entity.attributes?.date === "string" ? (card.entity.attributes.date as string) : null) ??
        null
      );
    case "event":
      return card.occurredAt;
    default:
      return null;
  }
}

/** Latest snapshot per canvas (bounded, like dashboard stats). */
async function latestSnapshots(take = 8): Promise<
  Array<{ canvasId: string; canvasTitle: string; document: CanvasDocument | null; updatedAt: string }>
> {
  const canvases = await prisma.canvas.findMany({
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take,
  });
  const rows = await Promise.all(
    canvases.map(async (canvas) => {
      const snapshot = await prisma.canvasSnapshot.findFirst({
        where: { canvasId: canvas.id },
        orderBy: { version: "desc" },
      });
      return {
        canvasId: canvas.id,
        canvasTitle: canvas.title,
        document: snapshot?.document as unknown as CanvasDocument | null,
        updatedAt: canvas.updatedAt.toISOString(),
      };
    }),
  );
  return rows;
}

/** All canvases that contain a card matching the name. */
export async function findEntityCanvases(name: string): Promise<EntityCanvasRef[]> {
  const refs: EntityCanvasRef[] = [];
  for (const row of await latestSnapshots()) {
    for (const node of row.document?.nodes ?? []) {
      const card = node.data?.card as IntelligenceCard | undefined;
      if (!card) continue;
      const candidate = cardName(card);
      if (candidate && nameEquals(candidate, name)) {
        refs.push({
          canvasId: row.canvasId,
          canvasTitle: row.canvasTitle,
          nodeId: node.id,
          card,
          updatedAt: row.updatedAt,
        });
      }
    }
  }
  return refs;
}

/** Read-only neighbourhood graph around the named entity (≤10 nodes). */
export async function findEntityConnections(name: string): Promise<ConnectionGraph> {
  for (const row of await latestSnapshots()) {
    const doc = row.document;
    if (!doc) continue;
    const match = doc.nodes.find((node) => {
      const card = node.data?.card as IntelligenceCard | undefined;
      const candidate = card ? cardName(card) : null;
      return candidate !== null && nameEquals(candidate, name);
    });
    if (!match) continue;

    const nodes = new Map<string, { id: string; name: string; type: string; proposed?: boolean }>();
    const edges: ConnectionGraph["edges"] = [];
    nodes.set(match.id, {
      id: match.id,
      name,
      type: (match.data?.card as IntelligenceCard | undefined)?.kind ?? "entity",
    });

    for (const edge of doc.edges ?? []) {
      if (edge.source !== match.id && edge.target !== match.id) continue;
      if (nodes.size >= 10) break;
      const otherId = edge.source === match.id ? edge.target : edge.source;
      const other = doc.nodes.find((node) => node.id === otherId);
      if (!other) continue;
      const otherCard = other.data?.card as IntelligenceCard | undefined;
      if (!otherCard) continue;
      const name = cardName(otherCard) ?? other.id;
      if (!nodes.has(other.id)) {
        nodes.set(other.id, {
          id: other.id,
          name,
          type: otherCard.kind,
          proposed: edge.data?.proposed === true,
        });
      }
      edges.push({
        source: edge.source,
        target: edge.target,
        label: edge.data?.label ?? (edge.data?.relationship as string | undefined) ?? "linked_to",
        proposed: edge.data?.proposed === true,
      });
    }
    return { canvasId: row.canvasId, canvasTitle: row.canvasTitle, nodes: [...nodes.values()], edges };
  }
  return { canvasId: null, canvasTitle: null, nodes: [], edges: [] };
}

export interface TimelineEvent {
  date: string;
  title: string;
  source: string;
  url?: string;
  kind: "search" | "canvas";
}

/** Dated events mentioning the entity — search hits + canvas cards. */
export function eventsFromSearchItems(items: SearchResultItem[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const item of items) {
    if (!item.date) continue;
    const parsed = new Date(item.date);
    if (Number.isNaN(parsed.getTime())) continue;
    events.push({
      date: parsed.toISOString(),
      title: item.title,
      source: item.source,
      url: item.url,
      kind: "search",
    });
  }
  return events.sort((a, b) => b.date.localeCompare(a.date));
}
