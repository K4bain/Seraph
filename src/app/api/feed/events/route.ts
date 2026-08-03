/**
 * World events feed API.
 *
 * GET /api/feed/events → { fetchedAt, events }
 *
 * GDELT DOC world-news snapshot (see src/core/feed/events.ts). The
 * client refreshes on a 5-minute interval.
 */

import { getWorldEvents } from "../../../../core/feed/events";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await getWorldEvents();
    return Response.json({ fetchedAt: new Date().toISOString(), events });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ fetchedAt: new Date().toISOString(), events: [], error: message }, { status: 502 });
  }
}
