/**
 * Stream-layer types. Re-exports the canonical definitions from the
 * shared packages so app code imports from one place.
 */

export type { EntityStreamEvent, RawEntity, RawRelationship } from "seraph-graph-types";

/** EventBus topic convention: stream:<connectorId> */
export const streamTopic = (connectorId: string): string => `stream:${connectorId}`;
