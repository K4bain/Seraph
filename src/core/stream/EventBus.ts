/**
 * Typed in-process pub/sub EventBus. The spine of the platform:
 * connector runners publish EntityStreamEvents, the graph engine and
 * AI processor subscribe.
 *
 * Phase 1: in-process only (single Node process).
 * Phase 3: Redis-backed fan-out for multi-node deployments — the
 * bus interface is intentionally small so the transport can swap.
 */

export type BusTopic = string;

export class EventBus<T = unknown> {
  private readonly listeners = new Map<BusTopic, Set<(event: T) => void>>();

  publish(topic: BusTopic, event: T): void {
    const handlers = this.listeners.get(topic);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        // A failing subscriber must not break the bus for others.
        console.error(`[EventBus] subscriber error on "${topic}"`, error);
      }
    }
  }

  subscribe(topic: BusTopic, handler: (event: T) => void): () => void {
    let handlers = this.listeners.get(topic);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(topic, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers?.delete(handler);
    };
  }

  /** Subscribe to a topic prefix, e.g. "stream:" catches all connector streams. */
  subscribePrefix(prefix: string, handler: (event: T) => void): () => void {
    return this.subscribe(prefix, handler);
  }

  topicCount(): number {
    return this.listeners.size;
  }
}
