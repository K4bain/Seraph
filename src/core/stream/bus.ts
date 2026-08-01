import { EventBus } from "./EventBus";
import type { EntityStreamEvent } from "meridian-graph-types";

/**
 * Platform-wide stream bus. Connector runners publish, the graph
 * engine and AI processor subscribe. In-process for Phase 1.
 */
export const meridianBus = new EventBus<EntityStreamEvent>();
