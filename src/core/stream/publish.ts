/**
 * Live feed publisher (SSE fan-out).
 *
 * Publishes a JSON envelope to the Redis channel `seraph:feed` (cross-
 * process: workers → app) and appends it to a capped recent-event list
 * so a freshly connected feed replays the last events instead of
 * staring at an empty screen.
 *
 * Redis is best-effort: publish failures never throw into the caller.
 * When REDIS_URL is unreachable the feed endpoint simply stays silent
 * (the in-process EventBus remains the connector runtime channel).
 */

import { Redis } from "ioredis";

export type FeedAction =
  | "emitted"
  | "created"
  | "updated"
  | "skipped"
  | "proposed"
  | "applied";

export interface FeedBatchSummary {
  cardsCreated: number;
  cardsUpdated: number;
  cardsSkipped: number;
  edgesProposed: number;
}

export interface FeedEvent {
  kind: "entity" | "batch";
  /** Dedup key: stable across retries (externalId + ts). */
  id: string;
  ts: string;
  source: string;
  connectorId?: string;
  canvasId?: string;
  jobId?: string;
  entityType?: string;
  name?: string;
  externalId?: string;
  action: FeedAction;
  summary?: FeedBatchSummary;
}

export const FEED_CHANNEL = "seraph:feed";
export const FEED_RECENT_KEY = "seraph:feed:recent";
export const FEED_RECENT_CAP = 100;

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    _redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 8000,
      // Never retry forever: a dead Redis must fail fast (default
      // retryStrategy keeps commands pending indefinitely).
      retryStrategy: () => null,
    });
    void _redis.connect().catch(() => {
      /* offline feed: endpoint reports status */
    });
  } catch {
    return null;
  }
  return _redis;
}

export async function publishFeedEvent(event: FeedEvent): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const payload = JSON.stringify(event);
    await Promise.all([
      redis.publish(FEED_CHANNEL, payload),
      redis.multi().lpush(FEED_RECENT_KEY, payload).ltrim(FEED_RECENT_KEY, 0, FEED_RECENT_CAP - 1).pexpire(FEED_RECENT_KEY, 3_600_000).exec(),
    ]);
  } catch {
    /* best-effort — never fail the caller */
  }
}

/** Read the recent-event replay list (newest first). */
export async function readRecentFeedEvents(limit = FEED_RECENT_CAP): Promise<FeedEvent[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.lrange(FEED_RECENT_KEY, 0, limit - 1);
    return raw.flatMap((line) => {
      try {
        return [JSON.parse(line) as FeedEvent];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
