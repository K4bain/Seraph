/**
 * seraph-connector-sdk
 *
 * Public SDK for authoring Seraph connectors. A connector describes a
 * data source (manifest), optionally polls it, optionally accepts
 * webhooks, and emits typed EntityStreamEvents into the Seraph EventBus.
 *
 * See docs/CONNECTOR_GUIDE.md for the full walkthrough.
 */

import type { EntityType, EntityStreamEvent } from "seraph-graph-types";

export type {
  EntityStreamEvent,
  EntityType,
  RawEntity,
  RawRelationship,
  SourceRef,
} from "seraph-graph-types";

export interface ConnectorManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  pollIntervalMs?: number;
  webhookSupported: boolean;
  entityTypes: EntityType[];
}

export interface ConnectorContext {
  /** Raw secret-free config values supplied by the operator. */
  config: Record<string, string>;
  log: (level: "info" | "warn" | "error", message: string, meta?: unknown) => void;
}

/** One hit from a connector's search(). Fields follow the OSINT search
 *  result contract: title + url are required, everything else optional
 *  and source-specific (e.g. EDGAR fills company/date, OpenSanctions
 *  fills country, WHOIS fills registrar). */
export interface SearchResultItem {
  title: string;
  description?: string;
  url?: string;
  /** Source-grouping label, e.g. the schema ("Person") or form type ("8-K"). */
  category?: string;
  /** Canonical entity type when the hit maps to one. */
  entityType?: EntityType;
  source: string;
  date?: string;
  country?: string;
  company?: string;
  name?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchRequest {
  query: string;
  /** Requested entity-type filter ("person" | "organization" | ... or empty). */
  type?: string | null;
}

export interface SearchResponse {
  results: SearchResultItem[];
}

export interface SeraphConnector {
  manifest: ConnectorManifest;
  configure(config: Record<string, string>): Promise<void>;
  /** Stream entities on a poll schedule. Optional — search-only
   *  connectors (e.g. WHOIS, GitHub) don't poll anything. */
  poll?(): AsyncGenerator<EntityStreamEvent>;
  handleWebhook?(payload: unknown): AsyncGenerator<EntityStreamEvent>;
  /** Ad-hoc point search (search page, MCP, entity links). Optional. */
  search?(request: SearchRequest): Promise<SearchResponse>;
}

/**
 * Helper for authoring connectors with full type inference:
 *
 *   export const myConnector = defineConnector({
 *     manifest: { id: "gdelt", ... },
 *     async configure(config) { ... },
 *     async *poll() { yield event; },
 *   });
 */
export function defineConnector<T extends SeraphConnector>(connector: T): T {
  return connector;
}
