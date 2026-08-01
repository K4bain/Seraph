/**
 * meridian-graph-types
 *
 * Shared canonical types for the Meridian graph engine, canvas model,
 * and connector SDK. Single source of truth — the app, SDK, workers,
 * and canvas export schema all build on these.
 */

/* ------------------------------------------------------------------ */
/* Entities                                                           */
/* ------------------------------------------------------------------ */

export type EntityType =
  | "person"
  | "organization"
  | "location"
  | "vessel"
  | "aircraft"
  | "domain"
  | "ip_address"
  | "financial_account"
  | "document"
  | "event";

export interface GeoPoint {
  lat: number;
  lon: number;
  geohash?: string;
}

/** Raw entity as emitted by a connector, before dedup/merge. */
export interface RawEntity {
  /** Stable id assigned by the emitting connector (may collide across connectors). */
  externalId?: string;
  type: EntityType;
  name: string;
  aliases?: string[];
  attributes?: Record<string, unknown>;
  geo?: GeoPoint;
  firstSeen?: string;
  lastSeen?: string;
  /** The set of sources that assert this entity. */
  sources: SourceRef[];
}

/** Canonical graph node, after deduplication and merge. */
export interface EntityRecord extends RawEntity {
  /** Meridian graph id (AGE vertex id). */
  meridianId: string;
  /** Deduplication fingerprint (see src/core/graph/dedup.ts). */
  fingerprint: string;
  /** Aggregate confidence across sources, 0–1. */
  confidence: number;
  /** True when the record was written by the AI inference layer and not yet confirmed by an analyst. */
  proposed?: boolean;
}

/* ------------------------------------------------------------------ */
/* Relationships                                                      */
/* ------------------------------------------------------------------ */

export type EdgeType =
  | "controls"
  | "owns"
  | "employs"
  | "has_member"
  | "located_at"
  | "registered_in"
  | "linked_to"
  | "related_to"
  | "mentions"
  | "participated_in"
  | "acquired"
  | "sanctioned_by"
  | "associated_with";

/** All valid edge types — single source for pickers in the UI. */
export const EDGE_TYPES: readonly EdgeType[] = [
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
];

/** Human-readable label per edge type (canvas inspector, exports). */
export const EDGE_TYPE_LABELS: Record<EdgeType, string> = {
  controls: "Controls",
  owns: "Owns",
  employs: "Employs",
  has_member: "Has member",
  located_at: "Located at",
  registered_in: "Registered in",
  linked_to: "Linked to",
  related_to: "Related to",
  mentions: "Mentions",
  participated_in: "Participated in",
  acquired: "Acquired",
  sanctioned_by: "Sanctioned by",
  associated_with: "Associated with",
};

export interface RawRelationship {
  type: EdgeType;
  /** Reference to the source entity (externalId or meridianId). */
  source: string;
  /** Reference to the target entity (externalId or meridianId). */
  target: string;
  confidence: number;
  validFrom?: string;
  validTo?: string;
  attributes?: Record<string, unknown>;
  sources: SourceRef[];
}

/** Canonical graph edge. */
export interface RelationshipRecord extends RawRelationship {
  meridianId: string;
  proposed?: boolean;
}

/* ------------------------------------------------------------------ */
/* Provenance                                                         */
/* ------------------------------------------------------------------ */

export type AssertedBy = "connector" | "ai" | "analyst";

export interface SourceRef {
  /** Connector id that produced the event, e.g. "opensanctions". */
  connectorId: string;
  /** Human-readable source title, e.g. "US OFAC SDN List". */
  title?: string;
  url: string;
  fetchedAt: string;
}

export interface Provenance {
  sources: SourceRef[];
  assertedBy: AssertedBy;
  /** Free-text note about how the data was derived (e.g. AI inference rationale). */
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Canvas cards                                                       */
/* ------------------------------------------------------------------ */

/** Base for every object that can be pinned to a canvas. */
export interface BaseCard {
  id: string;
  kind: "entity" | "event" | "memo" | "source";
  createdAt: string;
  updatedAt: string;
  /** Optional link to a canonical graph record. */
  meridianId?: string;
}

export interface EntityCard extends BaseCard {
  kind: "entity";
  entity: EntityRecord;
}

export interface EventCard extends BaseCard {
  kind: "event";
  title: string;
  occurredAt: string;
  summary?: string;
  entities?: string[];
  sources?: SourceRef[];
}

export interface MemoCard extends BaseCard {
  kind: "memo";
  body: string;
  /** Whether the memo body was produced by the AI layer (auditable). */
  aiGenerated?: boolean;
}

export interface SourceCard extends BaseCard {
  kind: "source";
  title: string;
  url: string;
  fetchedAt?: string;
}

export type IntelligenceCard = EntityCard | EventCard | MemoCard | SourceCard;

/** React Flow node data for a pinned card (flat record for RF interop). */
export interface CardNodeData extends Record<string, unknown> {
  card: IntelligenceCard;
}

/** Relationship drawn between two canvas cards. */
export interface CanvasEdgeData extends Record<string, unknown> {
  relationship: EdgeType;
  label?: string;
  confidence?: number;
}

/* ------------------------------------------------------------------ */
/* Streams                                                            */
/* ------------------------------------------------------------------ */

export interface EntityStreamEvent {
  connectorId: string;
  entityType: EntityType;
  entity: RawEntity;
  relationships: RawRelationship[];
  sourceUrl: string;
  fetchedAt: string;
  confidence: number;
}
