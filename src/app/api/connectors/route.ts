/**
 * Connector API.
 *
 * GET  /api/connectors          → registered connector manifests
 * POST /api/connectors          → enqueue a run on the BullMQ connector
 *      queue { connectorId, canvasId?, config? }
 *
 * Enqueueing needs Redis (REDIS_URL); without it the POST returns 503
 * with a pointer to scripts/run-connector.ts (the no-Redis path).
 */

import { connectorQueue } from "../../../../workers/queues";
import { listConnectors } from "meridian-connector-sdk/runtime";
import "../../../../src/connectors";

export async function GET() {
  const manifests = listConnectors().map((connector) => ({
    id: connector.manifest.id,
    name: connector.manifest.name,
    version: connector.manifest.version,
    description: connector.manifest.description,
    pollIntervalMs: connector.manifest.pollIntervalMs,
    webhookSupported: connector.manifest.webhookSupported,
    entityTypes: connector.manifest.entityTypes,
  }));
  return Response.json({ connectors: manifests });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    connectorId?: string;
    canvasId?: string;
    config?: Record<string, string>;
  };

  if (!body.connectorId) {
    return Response.json({ error: "connectorId_required" }, { status: 400 });
  }

  try {
    // Bounded wait: ioredis retries a dead Redis forever, so fail fast with a hint.
    const job = await Promise.race([
      connectorQueue.add("run", {
        connectorId: body.connectorId,
        trigger: "schedule",
        canvasId: body.canvasId,
        config: body.config,
      }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("redis_timeout")), 4000);
      }),
    ]);
    return Response.json({ enqueued: true, jobId: job.id }, { status: 202 });
  } catch {
    return Response.json(
      {
        error: "redis_unavailable",
        hint: "Start Redis or run the connector inline: pnpm tsx scripts/run-connector.ts <id> --canvas <canvasId>",
      },
      { status: 503 },
    );
  }
}
