/**
 * meridian-connector-sdk
 *
 * Public SDK for authoring Meridian connectors. A connector describes a
 * data source (manifest), optionally polls it, optionally accepts
 * webhooks, and emits typed EntityStreamEvents into the Meridian EventBus.
 *
 * See docs/CONNECTOR_GUIDE.md for the full walkthrough.
 */

import type { EntityType, EntityStreamEvent } from "meridian-graph-types";

export type {
  EntityStreamEvent,
  EntityType,
  RawEntity,
  RawRelationship,
  SourceRef,
} from "meridian-graph-types";

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

export interface MeridianConnector {
  manifest: ConnectorManifest;
  configure(config: Record<string, string>): Promise<void>;
  poll(): AsyncGenerator<EntityStreamEvent>;
  handleWebhook?(payload: unknown): AsyncGenerator<EntityStreamEvent>;
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
export function defineConnector<T extends MeridianConnector>(connector: T): T {
  return connector;
}
