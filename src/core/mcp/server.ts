/**
 * Seraph MCP server (Streamable HTTP, server-only).
 *
 * Exposes the investigation platform to MCP clients (Claude Desktop,
 * Cursor, custom agents): connector discovery + triggering, canvas
 * reads, entity search, read-only AGE graph queries, and entity
 * proposals that flow through the exact same ingest pipeline as
 * connector and AI writes (dedup, provenance merge, `proposed: true`).
 *
 * Server-created per request: `createMcpServer()` constructs a fresh
 * McpServer with all tools registered. No server or transport state is
 * kept at module scope — MCP clients may hold long-lived sessions and
 * we must never serve a stale transport across requests.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listConnectors } from "seraph-connector-sdk/runtime";
import { connectorQueue } from "../../../workers/queues";
import { prisma } from "../db";
import { getGraph } from "../graph/age";
import { ingestEvents } from "../ingest/ingest";
import type { EntityStreamEvent, EntityType, SourceRef } from "seraph-graph-types";
import "../../connectors";

const ENTITY_TYPES: readonly EntityType[] = [
  "person",
  "organization",
  "location",
  "vessel",
  "aircraft",
  "domain",
  "ip_address",
  "financial_account",
  "document",
  "event",
];

const MAX_GRAPH_ROWS = 100;
const MAX_ENTITY_MATCHES = 50;

/** Read-only AGE guard: reject anything that mutates the graph. */
const READ_ONLY_OK = /^\s*(MATCH|OPTIONAL MATCH|RETURN|WITH|UNWIND|CALL|LOAD CSV)/i;
const WRITE_BLOCK = /\b(CREATE|MERGE|DELETE|SET|REMOVE|DETACH)\b/i;

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "seraph-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "list_connectors",
    {
      description:
        "List the OSINT connectors installed on this Seraph instance (OpenSanctions, GDELT, EDGAR, ...) " +
        "with their entity types and poll intervals.",
    },
    async () => {
      const manifests = listConnectors().map((c) => ({
        id: c.manifest.id,
        name: c.manifest.name,
        version: c.manifest.version,
        description: c.manifest.description,
        entityTypes: c.manifest.entityTypes,
        pollIntervalMs: c.manifest.pollIntervalMs,
        webhookSupported: c.manifest.webhookSupported,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify({ connectors: manifests }, null, 2) }] };
    },
  );

  server.registerTool(
    "run_connector",
    {
      description:
        "Trigger a connector run on a canvas. The connector ingests matches from its live source " +
        "(sanctions lists, news, filings) through dedup; new entities appear as cards and edges are " +
        "proposed for analyst confirmation. Returns the BullMQ job id.",
      inputSchema: {
        connectorId: z.string().describe("Connector id, e.g. opensanctions, gdelt, edgar"),
        canvasId: z.string().optional().describe("Target canvas id (defaults to the demo canvas)"),
        config: z.record(z.string(), z.string()).optional().describe("Optional per-run config, e.g. { query: '...' }"),
      },
    },
    async ({ connectorId, canvasId, config }) => {
      const manifest = listConnectors().find((c) => c.manifest.id === connectorId);
      if (!manifest) {
        const ids = listConnectors().map((c) => c.manifest.id).join(", ");
        return {
          content: [{ type: "text" as const, text: `Unknown connector "${connectorId}". Installed: ${ids}` }],
          isError: true,
        };
      }
      try {
        const job = await Promise.race([
          connectorQueue.add("run", { connectorId, trigger: "mcp", canvasId, config }),
          new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("redis_timeout")), 4000)),
        ]);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ enqueued: true, jobId: job.id, connectorId }, null, 2),
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: "Redis is unavailable. Start Redis (REDIS_URL) or run the connector inline via " +
                "`pnpm tsx scripts/run-connector.ts <id> --canvas <canvasId>`.",
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "list_canvases",
    {
      description: "List canvases (investigation workspaces) with id, title, description and update time.",
    },
    async () => {
      const canvases = await prisma.canvas.findMany({
        select: { id: true, title: true, description: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ canvases }, null, 2) }] };
    },
  );

  server.registerTool(
    "get_canvas",
    {
      description:
        "Read a canvas: latest snapshot version, entity card count, confirmed vs proposed edges, " +
        "and the full card list. Use ids returned here as search_entities / query_graph inputs.",
      inputSchema: {
        canvasId: z.string().describe("Canvas id (see list_canvases)"),
      },
    },
    async ({ canvasId }) => {
      const canvas = await prisma.canvas.findUnique({
        where: { id: canvasId },
        select: { id: true, title: true, description: true },
      });
      if (!canvas) {
        return {
          content: [{ type: "text" as const, text: `Canvas "${canvasId}" not found.` }],
          isError: true,
        };
      }
      const latest = await prisma.canvasSnapshot.findFirst({
        where: { canvasId },
        orderBy: { version: "desc" },
      });
      if (!latest) {
        return { content: [{ type: "text" as const, text: `Canvas "${canvasId}" has no snapshot yet.` }] };
      }
      const doc = latest.document as {
        nodes?: Array<{ id?: string; type?: string; data?: Record<string, unknown> }>;
        edges?: Array<{ id?: string; source?: string; target?: string; type?: string; data?: Record<string, unknown> }>;
      };
      const nodes = doc.nodes ?? [];
      const edges = doc.edges ?? [];
      const cards = nodes
        .filter((n) => n.type === "entity" || n.data?.entityType)
        .map((n) => ({
          id: n.id,
          name: typeof n.data?.name === "string" ? n.data.name : n.data?.label ?? null,
          entityType: n.data?.entityType ?? n.type ?? null,
        }));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                canvas: { id: canvas.id, title: canvas.title, description: canvas.description },
                snapshot: {
                  version: latest.version,
                  createdAt: latest.createdAt,
                  nodes: nodes.length,
                  edges: edges.length,
                  entityCards: cards.length,
                  proposedEdges: edges.filter((e) => (e.data as { proposed?: boolean } | undefined)?.proposed).length,
                },
                cards,
                edges: edges.map((e) => ({
                  id: e.id,
                  source: e.source,
                  target: e.target,
                  type: e.type ?? e.data?.edgeType ?? null,
                  proposed: (e.data as { proposed?: boolean } | undefined)?.proposed ?? false,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "search_entities",
    {
      description:
        "Search entities across the latest snapshot of one canvas (or all canvases): matches on name, " +
        "aliases and attributes. Returns ids suitable for query_graph lookups.",
      inputSchema: {
        query: z.string().describe("Case-insensitive substring, e.g. 'acme' or 'sanctioned'"),
        canvasId: z.string().optional().describe("Restrict to one canvas (default: all canvases)"),
        entityType: z.enum(ENTITY_TYPES).optional().describe("Restrict to an entity type"),
      },
    },
    async ({ query, canvasId, entityType }) => {
      const q = query.toLowerCase();
      const canvases = canvasId
        ? [{ id: canvasId }]
        : await prisma.canvas.findMany({ select: { id: true } });

      const matches: Array<{ canvasId: string; id: string; name: string; entityType: string }> = [];
      for (const c of canvases) {
        if (matches.length >= MAX_ENTITY_MATCHES) break;
        const snapshots = await prisma.canvasSnapshot.findMany({
          where: { canvasId: c.id },
          orderBy: { version: "desc" },
          take: 1,
        });
        const doc = snapshots[0]?.document as { nodes?: Array<Record<string, unknown>> } | undefined;
        for (const node of doc?.nodes ?? []) {
          if (matches.length >= MAX_ENTITY_MATCHES) break;
          const data = (node.data ?? {}) as Record<string, unknown>;
          const type = (data.entityType ?? node.type) as string | undefined;
          if (entityType && type !== entityType) continue;
          const name = (data.name ?? data.label) as string | undefined;
          if (typeof name !== "string" || !name.toLowerCase().includes(q)) continue;
          matches.push({
            canvasId: c.id,
            id: String(node.id ?? ""),
            name,
            entityType: type ?? "entity",
          });
        }
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ query, count: matches.length, matches }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "query_graph",
    {
      description:
        "Run a read-only Cypher query against the AGE property graph (labels: Entity, Relationship). " +
        "Only MATCH/READ statements are allowed. Examples: " +
        "'MATCH (n:Entity) RETURN n.name, n.entity_type LIMIT 25' or " +
        "'MATCH (a:Entity)-[r:RELATED_TO]->(b:Entity) RETURN a.name, r.confidence, b.name'.",
      inputSchema: {
        query: z.string().describe("Read-only Cypher (MATCH/RETURN). Limit your rows (LIMIT n)."),
      },
    },
    async ({ query }) => {
      if (!READ_ONLY_OK.test(query)) {
        return {
          content: [
            { type: "text" as const, text: `Only read queries allowed. Statement must start with MATCH, RETURN, WITH, UNWIND, CALL or LOAD CSV.` },
          ],
          isError: true,
        };
      }
      if (WRITE_BLOCK.test(query)) {
        return {
          content: [{ type: "text" as const, text: "Write clauses (CREATE/MERGE/DELETE/SET/REMOVE) are not allowed." }],
          isError: true,
        };
      }
      try {
        const graph = getGraph();
        const { rows } = await graph.cypher(query);
        const limited = rows.slice(0, MAX_GRAPH_ROWS);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { rows: limited, truncated: rows.length > MAX_GRAPH_ROWS, count: limited.length },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Graph query failed: ${err instanceof Error ? err.message.slice(0, 300) : "unknown error"}. ` +
                "Is the AGE graph imported (ENABLE_GRAPH_IMPORT, POST /api/graph/import)?",
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "propose_entity",
    {
      description:
        "Propose an entity (person, organization, location, ...) to a canvas. Goes through the standard " +
        "ingest pipeline: dedup fingerprints merge with existing cards, provenance is attached, and any " +
        "resulting edges are proposed for analyst confirmation (never auto-committed).",
      inputSchema: {
        canvasId: z.string().describe("Target canvas id"),
        name: z.string().describe("Canonical entity name"),
        entityType: z.enum(ENTITY_TYPES).describe("Entity type"),
        aliases: z.array(z.string()).optional().describe("Known aliases"),
        attributes: z.record(z.string(), z.any()).optional().describe("Optional structured attributes"),
        sourceUrl: z.string().optional().describe("Source URL for provenance (defaults to the MCP tool id)"),
      },
    },
    async ({ canvasId, name, entityType, aliases, attributes, sourceUrl }) => {
      const fetchedAt = new Date().toISOString();
      const sourceRef: SourceRef = {
        connectorId: "mcp",
        title: "MCP entity proposal",
        url: sourceUrl ?? "mcp://propose_entity",
        fetchedAt,
      };
      const event: EntityStreamEvent = {
        connectorId: "mcp",
        entityType,
        entity: {
          externalId: `mcp-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 64)}-${Date.now().toString(36)}`,
          type: entityType,
          name,
          aliases,
          attributes,
          sources: [sourceRef],
        },
        relationships: [],
        sourceUrl: sourceRef.url,
        fetchedAt,
        confidence: 0.9,
      };
      try {
        const result = await ingestEvents([event], canvasId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  proposed: true,
                  canvasId,
                  entity: { name, entityType },
                  ingest: {
                    cardsCreated: result.cardsCreated,
                    cardsUpdated: result.cardsUpdated,
                    cardsSkipped: result.cardsSkipped,
                    edgesProposed: result.edgesProposed,
                  },
                  note: "Entity landed on the canvas; edges and merges are proposed until an analyst confirms them.",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Proposal failed: ${err instanceof Error ? err.message.slice(0, 300) : "unknown error"}. ` +
                "Check canvasId and that the app DB is reachable.",
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}
