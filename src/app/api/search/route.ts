/**
 * Platform search API.
 *
 * GET /api/search?q=&type=
 *   → { query, type, results: [{ source, status, data, count }], summary: null }
 *
 * Fan-out lives in src/core/search/run.ts (shared with the entity
 * profile routes). Each search is recorded in SearchHistory
 * (best-effort) so the landing page can surface recent queries.
 */

import { prisma } from "../../../core/db";
import { auth } from "../../../auth";
import { runSearch } from "../../../core/search/run";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim();
  const type = searchParams.get("type")?.trim() || null;

  if (!query) {
    return Response.json({ error: "query_required" }, { status: 400 });
  }
  if (type && !/^[a-z]+$/.test(type)) {
    return Response.json({ error: "invalid_type" }, { status: 400 });
  }

  const results = await runSearch(query, type);
  const total = results.reduce((sum, entry) => sum + entry.count, 0);

  const session = await auth().catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  void prisma.searchHistory
    ?.create({
      data: {
        userId,
        query,
        type: type ?? undefined,
        results: total,
      },
    })
    .catch(() => {
      // History is best-effort — a failed write never fails the search.
    });

  return Response.json({ query, type, results, summary: null });
}
