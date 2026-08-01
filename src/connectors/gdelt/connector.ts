/**
 * GDELT DOC API connector — near-real-time global news events.
 *
 * Free, no key. The DOC API returns articles matching a query;
 * each article becomes an `event` EntityStreamEvent. Configure a
 * query string (boolean syntax), record cap, and lookback window.
 *
 * Docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 */

import { defineConnector } from "meridian-connector-sdk";
import type { EntityStreamEvent } from "meridian-graph-types";

const API_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const FETCH_TIMEOUT_MS = 20_000;

function hoursAgo(hours: number): string {
  const d = new Date(Date.now() - hours * 3_600_000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}0000`;
}

export const gdeltConnector = defineConnector({
  manifest: {
    id: "gdelt",
    name: "GDELT DOC API",
    version: "0.1.0",
    description: "Global news events in near real time (free, no key)",
    author: "meridian",
    pollIntervalMs: 300_000,
    webhookSupported: false,
    entityTypes: ["event"],
  },

  config: {
    query: '"sanctions" OR "oligarch"',
    maxRecords: "25",
    hoursBack: "48",
    /** API host — override to point at a mirror/proxy when the default is blocked. */
    baseUrl: API_BASE,
  },

  async configure(config) {
    this.config = { ...this.config, ...config };
  },

  async *poll() {
    const query = this.config.query.trim();
    const maxRecords = Math.min(Number(this.config.maxRecords) || 25, 250);
    const hoursBack = Number(this.config.hoursBack) || 48;

    if (!query) {
      throw new Error("gdelt: `query` is required in config");
    }

    const params = new URLSearchParams({
      query,
      mode: "artlist",
      format: "json",
      maxrecords: String(maxRecords),
      startdatetime: hoursAgo(hoursBack),
    });

    const res = await fetch(`${this.config.baseUrl ?? API_BASE}?${params}`, {
      headers: { "User-Agent": "meridian-connector/0.1 (OSINT research)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`gdelt: API returned ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      articles?: { url?: string; title?: string; seendate?: string; domain?: string; language?: string }[];
    };

    for (const article of data.articles ?? []) {
      const url = article.url ?? "";
      const title = article.title ?? "Untitled GDELT article";
      if (!url) continue;

      const fetchedAt = new Date().toISOString();
      const event: EntityStreamEvent = {
        connectorId: this.manifest.id,
        entityType: "event",
        entity: {
          type: "event",
          externalId: url,
          name: title,
          attributes: {
            domain: article.domain ?? undefined,
            language: article.language ?? undefined,
            seendate: article.seendate ?? undefined,
          },
          sources: [
            {
              connectorId: this.manifest.id,
              title: article.domain ?? "GDELT",
              url,
              fetchedAt,
            },
          ],
        },
        relationships: [],
        sourceUrl: url,
        fetchedAt,
        confidence: 0.7,
      };
      yield event;
    }
  },
});
