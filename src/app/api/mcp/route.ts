/**
 * Seraph MCP endpoint (Streamable HTTP, spec-compliant).
 *
 * GET    /api/mcp   → SSE stream for client-initiated sessions
 * POST   /api/mcp   → JSON-RPC over HTTP (may return an SSE stream)
 * DELETE /api/mcp   → session teardown (stateless: accepted, no-op)
 *
 * Auth: `Authorization: Bearer seraph_<id>.<secret>` (src/core/keys).
 * Every request gets a freshly constructed McpServer + transport — no
 * module-scope session state, so long-lived MCP client sessions can
 * never pin stale server instances (serverless-safe).
 */

import { createMcpServer } from "@/core/mcp/server";
import { authenticateApiKey } from "@/core/keys/apiKeys";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE_LIMIT_PER_MINUTE = 120;

/** Per-key sliding-window rate limit; per-replica, fine at this scale. */
const rateBuckets = new Map<string, number[]>();
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, stamps] of rateBuckets) {
    const alive = stamps.filter((t) => t > cutoff);
    if (alive.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, alive);
  }
}, 60_000).unref?.();

function rateLimited(keyId: string): boolean {
  const now = Date.now();
  const stamps = (rateBuckets.get(keyId) ?? []).filter((t) => t > now - 60_000);
  if (stamps.length >= RATE_LIMIT_PER_MINUTE) {
    rateBuckets.set(keyId, stamps);
    return true;
  }
  stamps.push(now);
  rateBuckets.set(keyId, stamps);
  return false;
}

function unauthorized(): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32001,
        message: "Unauthorized: send a valid Bearer API key (Seraph → Settings → API Keys).",
      },
    },
    { status: 401, headers: { "content-type": "application/json" } },
  );
}

function rateLimitExceeded(): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32029, message: "Rate limited: 120 requests/min per key." },
    },
    { status: 429, headers: { "content-type": "application/json" } },
  );
}

async function handle(req: Request): Promise<Response> {
  const key = await authenticateApiKey(req);
  if (!key) return unauthorized();
  if (rateLimited(key.keyId)) return rateLimitExceeded();

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);

  // Stateless transport: handleRequest serves GET (SSE), POST (JSON-RPC,
  // possibly an SSE stream) and DELETE per the Streamable HTTP spec. The
  // server/transport pair is per-request and must not be closed here —
  // closing would terminate an in-flight SSE stream.
  return transport.handleRequest(req);
}

export async function GET(req: Request): Promise<Response> {
  return handle(req);
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(req);
}
