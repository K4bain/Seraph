/**
 * Watchlist item removal.
 *
 * DELETE /api/watchlist/[id] → { deleted }
 * WatchlistAlert rows cascade via the Prisma relation.
 */

import { prisma } from "../../../../core/db";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.watchlistItem.delete({ where: { id } });
    return Response.json({ deleted: id });
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
}
