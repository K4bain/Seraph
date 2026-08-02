/**
 * GDELT DOC API connector — near-real-time global news events.
 *
 * Free, no key. The DOC API returns articles matching a query;
 * each article becomes an `event` EntityStreamEvent. Configure a
 * query string (boolean syntax), record cap, and lookback window.
 *
 * Docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 */

import { defineConnector } from "seraph-connector-sdk";
import type { EntityStreamEvent } from "seraph-graph-types";

const API_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const FETCH_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function hoursAgo(hours: number): string {
  const d = new Date(Date.now() - hours * 3_600_000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}0000`;
}

interface GdelArticles {
  articles?: { url?: string; title?: string; seendate?: string; domain?: string; language?: string }[];
}

/** Rate-limit signal — the mirror won't help, the server itself is throttling. */
class RateLimitedError extends Error {}

export const gdeltConnector = defineConnector({
  manifest: {
    id: "gdelt",
    name: "GDELT DOC API",
    version: "0.1.0",
    description: "Global news events in near real time (free, no key)",
    author: "seraph",
    pollIntervalMs: 300_000,
    webhookSupported: false,
    entityTypes: ["event"],
  },

  config: {
    query: '("sanctions" OR "oligarch")',
    maxRecords: "25",
    hoursBack: "48",
    /** API host — override to point at a mirror/proxy when the default is blocked. */
    baseUrl: API_BASE,
  },

  async configure(config) {
    this.config = { ...this.config, ...config };
  },

  /** One URL, up to 3 attempts with backoff; 429s surface as RateLimitedError. */
  async fetchWithRetry(url: string): Promise<GdelArticles> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(5_000 * 2 ** (attempt - 1));
      const res = await fetch(url, {
        headers: { "User-Agent": "seraph-connector/0.1 (OSINT research)" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (res.status === 429) {
        if (attempt === 2) throw new RateLimitedError("gdelt: rate limited by API after retries (429)");
        continue;
      }
      if (!res.ok) {
        throw new Error(`gdelt: API returned ${res.status} ${res.statusText}`);
      }

      const text = await res.text();
      try {
        return JSON.parse(text) as GdelArticles;
      } catch {
        // GDELT serves its rate-limit / error page with a 200 and a
        // plain-text body ("Queries cannot be processed…", "limit
        // requests to one every 5 seconds…"). Recognize it instead of
        // dying on a JSON parse error.
        const snippet = text.slice(0, 160).replace(/\s+/g, " ").trim();
        if (/queries|limit requests|please try again/i.test(snippet)) {
          throw new RateLimitedError(`gdelt: API throttled — ${snippet}`);
        }
        throw new Error(`gdelt: unexpected response — ${snippet}`);
      }
    }
    throw new RateLimitedError("gdelt: rate limited by API after retries (429)");
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

    // Some networks block HTTPS to GDELT (TLS filtered) but allow plain
    // HTTP. Prefer the configured base; fall back to the http:// mirror
    // on transport-level failures only — a 429/4xx/5xx from the server
    // means the mirror is pointless, so those propagate.
    const base = (this.config.baseUrl ?? API_BASE).replace(/\/+$/, "");
    const candidates = [
      base,
      ...(base.startsWith("https://") ? [base.replace(/^https:/, "http:")] : []),
    ];

    let data: GdelArticles | undefined;
    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        data = await this.fetchWithRetry(`${candidate}?${params}`);
        break;
      } catch (error) {
        lastError = error;
        if (error instanceof RateLimitedError) throw error;
      }
    }
    if (!data) throw lastError;

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
