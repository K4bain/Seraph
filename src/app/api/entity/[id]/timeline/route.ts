/**
 * Entity timeline API.
 *
 * GET /api/entity/[id]/timeline
 *   → { name, events: [{ date, title, source, url, kind }] }
 *
 * Dated events from the connector search fan-out (GDELT/EDGAR dates)
 * plus any matching canvas cards carrying dates.
 */

import { runSearch, flattenResults } from "../../../../../core/search/run";
import { findEntityCanvases, eventsFromSearchItems, cardDate } from "../../../../../core/entity/profile";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const name = decodeURIComponent(id).trim();
  if (!name) return Response.json({ error: "entity_required" }, { status: 400 });

  const results = await runSearch(name, null);
  const events = eventsFromSearchItems(flattenResults(results));

  // Canvas cards carrying dates (entity lastSeen / event occurredAt).
  for (const ref of await findEntityCanvases(name)) {
    const date = cardDate(ref.card);
    if (!date) continue;
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) continue;
    events.push({
      date: parsed.toISOString(),
      title: ref.canvasTitle,
      source: "canvas",
      url: `/canvas/${ref.canvasId}`,
      kind: "canvas",
    });
  }
  events.sort((a, b) => b.date.localeCompare(a.date));

  return Response.json({ name, events });
}
