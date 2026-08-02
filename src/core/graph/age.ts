/**
 * Apache AGE graph client. Server-only.
 *
 * Talks to the `seraph` AGE graph inside the shared Postgres
 * instance. Every Cypher query runs through ag_catalog.cypher and
 * returns agtype rows; this module maps the raw results into the
 * canonical types from seraph-graph-types.
 *
 * AGE session requirements: SET search_path = ag_catalog, "$user", public
 * before querying (done per-query here via a pooled connection that
 * re-issues the session setup).
 */

import { Pool, type PoolClient } from "pg";

export const GRAPH_NAME = "seraph";

/** AGE vertex labels for the canonical model. */
export const GRAPH_LABELS = {
  entity: "Entity",
  relationship: "Relationship",
} as const;

export interface CypherResult {
  columns: string[];
  rows: unknown[][];
}

interface AgeVertex {
  id: string;
  label: string;
  properties: Record<string, unknown>;
}

interface AgeEdge {
  id: string;
  label: string;
  startId: string;
  endId: string;
  properties: Record<string, unknown>;
}

export class GraphClient {
  private readonly pool: Pool;
  private ageAvailable: boolean | undefined;

  constructor(connectionUrl?: string) {
    const url =
      connectionUrl ??
      process.env.GRAPH_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://seraph:password@localhost:5432/seraph";
    this.pool = new Pool({ connectionString: url, max: 5 });
  }

  /**
   * The `age` extension is a compiled C extension — managed hosts like
   * Neon cannot install it. Check once and fail with a clear message
   * instead of a cryptic "function ag_catalog.cypher does not exist".
   */
  private async ensureAge(): Promise<void> {
    if (this.ageAvailable !== undefined) return;
    const res = await this.pool.query(
      "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'age') AS ok",
    );
    this.ageAvailable = (res.rows[0] as { ok?: boolean } | undefined)?.ok ?? false;
    if (!this.ageAvailable) {
      throw new Error(
        "Apache AGE extension is not installed on the connected Postgres. " +
          "Neon and other managed hosts do not support AGE — self-host Postgres " +
          "with the apache/age image (see docker-compose.yml) and point " +
          "GRAPH_DATABASE_URL at it.",
      );
    }
  }

  private async withSession<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET search_path = ag_catalog, "$user", public`);
      return await fn(client);
    } finally {
      client.release();
    }
  }

  /** Execute a Cypher statement with parameters. */
  async cypher(
    statement: string,
    params: Record<string, unknown> = {},
  ): Promise<CypherResult> {
    await this.ensureAge();
    return this.withSession(async (client) => {
      // AGE 1.6+/PG18 requires the graph name as a literal `name` and the
      // statement as a dollar-quoted literal `cstring`; bind parameters
      // are rejected ("a name constant is expected" / "a dollar-quoted
      // string constant is expected"). GRAPH_NAME is a hardcoded constant
      // and the statement is internal (never user text), so interpolating
      // both is injection-safe. Params travel as the third agtype arg.
      const res = await client.query(
        `SELECT * FROM ag_catalog.cypher('${GRAPH_NAME}', $mrd$ ${statement} $mrd$, $1) AS (row agtype)`,
        [JSON.stringify(params)],
      );
      return { columns: ["row"], rows: res.rows.map((row) => [row.row]) };
    });
  }

  /** Run a statement and return parsed vertices. */
  async queryVertices(statement: string, params: Record<string, unknown> = {}): Promise<AgeVertex[]> {
    const { rows } = await this.cypher(statement, params);
    return rows.flatMap((row) => parseAgtypeRow<AgeVertex>(row[0]));
  }

  /** Run a statement and return parsed edges. */
  async queryEdges(statement: string, params: Record<string, unknown> = {}): Promise<AgeEdge[]> {
    const { rows } = await this.cypher(statement, params);
    return rows.flatMap((row) => parseAgtypeRow<AgeEdge>(row[0]));
  }

  /** Simple statement runner for writes (CREATE / MERGE / DELETE). */
  async write(statement: string, params: Record<string, unknown> = {}): Promise<void> {
    await this.cypher(statement, params);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * ag_catalog.cypher returns every row wrapped in `::agtype`. If a
 * connector aliases `(n)` as a single column the payload arrives as a
 * stringified agtype document; normalize defensively.
 */
function parseAgtypeRow<T>(value: unknown): T[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return [JSON.parse(trimmed) as T];
      } catch {
        // Not JSON — leave as-is below.
      }
    }
    return [value as T];
  }
  return [value as T];
}

/** Lazily-constructed singleton. */
let _graph: GraphClient | undefined;

export function getGraph(): GraphClient {
  _graph ??= new GraphClient();
  return _graph;
}
