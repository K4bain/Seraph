/**
 * Entity profile API.
 *
 * GET /api/entity/[id]
 *   → { name, type, aliases, attributes, sources, canvases, summary }
 *
 * The entity is addressed by name (URL-encoded). Facts are aggregated
 * from the connector search fan-out plus any canvas cards matching the
 * name; the summary is an AI paragraph (best-effort, null when the AI
 * layer is off or the call fails).
 */

import { runSearch } from "../../../../core/search/run";
import { findEntityCanvases } from "../../../../core/entity/profile";
import { getAiClient } from "../../../../core/ai/client";

const SUMMARY_TIMEOUT_MS = 60_000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const name = decodeURIComponent(id).trim();
  if (!name) return Response.json({ error: "entity_required" }, { status: 400 });

  const results = await runSearch(name, null);
  const hits = results.flatMap((entry) => entry.data);

  // Type guess — most common entityType among hits.
  const typeCounts = new Map<string, number>();
  for (const hit of hits) {
    if (!hit.entityType) continue;
    typeCounts.set(hit.entityType, (typeCounts.get(hit.entityType) ?? 0) + 1);
  }
  let type: string | null = null;
  let best = 0;
  for (const [candidate, count] of typeCounts) {
    if (count > best) {
      best = count;
      type = candidate;
    }
  }

  // Aliases + flat key/value attributes.
  const aliases = new Set<string>();
  const attributes = new Map<string, unknown>();
  for (const hit of hits) {
    if (hit.name && hit.name !== name) aliases.add(hit.name);
    const metaAliases = (hit.metadata as { aliases?: unknown } | undefined)?.aliases;
    if (Array.isArray(metaAliases)) {
      for (const alias of metaAliases) if (typeof alias === "string") aliases.add(alias);
    }
    for (const [key, value] of Object.entries(hit.metadata ?? {})) {
      if (key === "aliases") continue;
      if (value !== undefined && value !== null && value !== "") attributes.set(key, value);
    }
  }

  const canvases = await findEntityCanvases(name);
  const sources = results.map((entry) => ({
    source: entry.source,
    status: entry.status,
    count: entry.count,
    samples: entry.data.slice(0, 3).map((item) => item.title),
  }));

  // AI paragraph (best-effort, bounded).
  let summary: string | null = null;
  const ai = getAiClient();
  if (ai.isConfigured()) {
    try {
      const transcript = results
        .filter((entry) => entry.status !== "error")
        .map((entry) => `[${entry.source}] ${entry.data.slice(0, 8).map((item) => item.title).join(" | ")}`);
      const response = await Promise.race([
        ai.complete({
          system:
            "You are a professional OSINT analyst. Write a short intelligence paragraph (2-4 sentences) " +
            "about the entity: who/what it is, and which sources assert what. " +
            "Respond with ONLY the paragraph — no preamble, no process narration, no disclaimers.",
          messages: [
            {
              role: "user",
              content: `Entity: ${name}\n\nSources:\n${transcript.join("\n")}`,
            },
          ],
          maxTokens: 700,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), SUMMARY_TIMEOUT_MS)),
      ]);
      summary = response?.text.trim() || null;
    } catch (error) {
      console.warn(`[api/entity] summary failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return Response.json({
    name,
    type,
    aliases: [...aliases].slice(0, 20),
    attributes: Object.fromEntries(attributes),
    sources,
    canvases: canvases.map((ref) => ({
      canvasId: ref.canvasId,
      canvasTitle: ref.canvasTitle,
      nodeId: ref.nodeId,
      updatedAt: ref.updatedAt,
    })),
    summary,
  });
}
