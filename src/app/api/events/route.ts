/**
 * GET /api/events — live feed (Server-Sent Events).
 *
 * Streams connector/AI/MCP ingestion activity as it happens: the
 * connector worker publishes to Redis (`seraph:feed`), this endpoint
 * subscribes and fans out to browser EventSource clients. On connect,
 * the last 100 buffered events are replayed so a fresh page is not
 * blank.
 *
 * Redis is best-effort: if it is unreachable the stream stays open and
 * reports status redis:false (heartbeat keeps the connection alive).
 */

import { Redis } from "ioredis";
import {
  FEED_CHANNEL,
  readRecentFeedEvents,
  type FeedEvent,
} from "@/core/stream/publish";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEARTBEAT_MS = 15_000;
const DEDUP_CAP = 500;

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let redis: Redis | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  const recentIds = new Set<string>();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => {
        if (controller.desiredSize === null) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const cleanup = () => {
        if (heartbeat) clearInterval(heartbeat);
        if (redis) {
          void redis.unsubscribe(FEED_CHANNEL).catch(() => {});
          redis.disconnect();
        }
      };

      send({ type: "hello", ok: true, ts: new Date().toISOString() });

      const recent = await readRecentFeedEvents(100);
      for (const ev of recent) {
        recentIds.add(ev.id);
        send({ type: "event", event: ev });
      }

      const redisUrl = process.env.REDIS_URL;
      if (redisUrl) {
        redis = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 8000,
          retryStrategy: () => null,
        });
        redis.on("message", (_channel, payload) => {
          let ev: FeedEvent;
          try {
            ev = JSON.parse(payload) as FeedEvent;
          } catch {
            return;
          }
          if (recentIds.has(ev.id)) return; // replayed already
          if (recentIds.size >= DEDUP_CAP) recentIds.delete(recentIds.values().next().value as string);
          recentIds.add(ev.id);
          send({ type: "event", event: ev });
        });
        redis.on("error", () => {
          /* keep-alive handles a dead link; status reported once below */
        });
        try {
          await redis.connect();
          await redis.subscribe(FEED_CHANNEL);
          send({ type: "status", redis: true });
        } catch {
          send({ type: "status", redis: false, hint: "Redis unreachable — feed is idle." });
        }
      } else {
        send({ type: "status", redis: false, hint: "REDIS_URL not set." });
      }

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, HEARTBEAT_MS);

      req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (redis) {
        void redis.unsubscribe(FEED_CHANNEL).catch(() => {});
        redis.disconnect();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
