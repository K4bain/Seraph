import { EventBus } from "./EventBus";
import type { EntityStreamEvent } from "seraph-graph-types";

/**
 * Platform-wide stream bus. Connector runners publish, the graph
 * engine and AI processor subscribe. In-process for Phase 1.
 */
export const seraphBus = new EventBus<EntityStreamEvent>();
