/**
 * Connector runtime: registry and runner-side plumbing.
 *
 * Phase 1: in-memory registry only. Phase 3 wires this to the BullMQ
 * connector queue (workers/connector-runner.ts) which drives poll()
 * on a schedule and funnels yielded events into the EventBus.
 */

import type { MeridianConnector } from "./index";

const registry = new Map<string, MeridianConnector>();

export function registerConnector(connector: MeridianConnector): void {
  if (registry.has(connector.manifest.id)) {
    throw new Error(`Connector already registered: ${connector.manifest.id}`);
  }
  registry.set(connector.manifest.id, connector);
}

export function listConnectors(): MeridianConnector[] {
  return [...registry.values()];
}

export function getConnector(id: string): MeridianConnector | undefined {
  return registry.get(id);
}
