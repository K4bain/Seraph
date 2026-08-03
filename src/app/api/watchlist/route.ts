/**
 * Watchlist API.
 *
 * GET  /api/watchlist            → { items, unread }
 * POST /api/watchlist            { term, type?, note? } → { item }
 * DELETE /api/watchlist/[id]     → { deleted }
 *
 * Items are polled by the connector worker (see T8) which writes
 * WatchlistAlert rows; unread alerts show as a badge on the Feed page.
 */

import { prisma } from "../../../core/db";
import { auth } from "../../../auth";

export const dynamic = "force-dynamic";

async function currentUserId(): Promise<string | null> {
  const session = await auth().catch(() => null);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  const [items, unreadCount] = await Promise.all([
    prisma.watchlistItem.findMany({
      orderBy: { createdAt: "desc" },
      include: { alerts: { orderBy: { createdAt: "desc" }, take: 5 } },
    }),
    prisma.watchlistAlert.count({ where: { read: false } }),
  ]);
  const unread = userId
    ? await prisma.watchlistAlert.count({ where: { read: false, watchlist: { userId } } }).catch(() => unreadCount)
    : unreadCount;
  return Response.json({ items, unread });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { term?: unknown; type?: unknown } | null;
  const term = typeof body?.term === "string" ? body.term.trim() : "";
  const type = typeof body?.type === "string" && body.type.trim() ? body.type.trim() : null;

  if (!term) {
    return Response.json({ error: "term_required" }, { status: 400 });
  }
  if (type && !/^[a-z]+$/.test(type)) {
    return Response.json({ error: "invalid_type" }, { status: 400 });
  }

  const userId = await currentUserId();
  const existing = await prisma.watchlistItem.findFirst({
    where: { term, type: type ?? null, userId },
  });
  if (existing) {
    return Response.json({ item: existing, duplicate: true });
  }

  const item = await prisma.watchlistItem.create({
    data: { userId, term, type },
  });
  return Response.json({ item, duplicate: false });
}
