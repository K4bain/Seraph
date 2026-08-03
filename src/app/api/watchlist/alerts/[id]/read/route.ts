/**
 * Watchlist alert read-state toggle.
 *
 * PATCH /api/watchlist/alerts/[id]/read → { updated }
 */

import { prisma } from "../../../../../../core/db";

export const dynamic = "force-dynamic";

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const alert = await prisma.watchlistAlert.update({
      where: { id },
      data: { read: true },
    });
    return Response.json({ updated: alert.id });
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
}
