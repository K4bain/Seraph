/**
 * Markets feed API.
 *
 * GET /api/feed/markets → { fetchedAt, core, movers, error? }
 *
 * Core indices + crypto with sparklines, plus daily top movers
 * (see src/core/feed/markets.ts).
 */

import { getMarketsFeed } from "../../../../core/feed/markets";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getMarketsFeed());
}
