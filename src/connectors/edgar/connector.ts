/**
 * SEC EDGAR connector — corporate filings via the full-text search API.
 *
 * Free, no key, but SEC **requires** a descriptive User-Agent header
 * (name + contact email) and rate-limits to ~10 req/s; configure the
 * `userAgent` value accordingly. Each matching filing becomes an
 * `event` EntityStreamEvent.
 *
 * Docs: https://www.sec.gov/search-filings/edgar-full-text-search
 */

import { defineConnector } from "seraph-connector-sdk";
import type { EntityStreamEvent } from "seraph-graph-types";
import type { SearchResponse, SearchResultItem } from "seraph-connector-sdk";

const FTS_BASE = "https://efts.sec.gov/LATEST/search-index";
const FETCH_TIMEOUT_MS = 20_000;

interface FtsHit {
  _id?: string;
  _source?: {
    ciks?: string[];
    form?: string;
    file_date?: string;
    display_names?: string[];
    adsh?: string;
    items?: string[];
  };
}

interface FtsResponse {
  hits?: {
    hits?: FtsHit[];
  };
}

export const edgarConnector = defineConnector({
  manifest: {
    id: "edgar",
    name: "SEC EDGAR",
    version: "0.1.0",
    description: "Corporate filings from the SEC full-text search API",
    author: "seraph",
    pollIntervalMs: 3_600_000,
    webhookSupported: false,
    entityTypes: ["event", "organization"],
  },

  config: {
    query: "sanctions",
    forms: "8-K",
    dateRange: "1m",
    maxRecords: "20",
    userAgent: "Seraph OSINT Research demo@seraph.local",
  },

  async configure(config) {
    this.config = { ...this.config, ...config };
  },

  /** Point search over the full-text index (company/form relevance). */
  async search({ query, type }): Promise<SearchResponse> {
    const params = new URLSearchParams({
      q: query,
      hitsPerPage: "10",
      // Organizations are companies; without a type filter default to
      // the widest useful surface (all filings mentioning the query).
      ...(type === "organization" ? { forms: "10-K,10-Q,8-K,DEF 14A,SC 13D,SC 13G" } : {}),
    });

    const res = await fetch(`${FTS_BASE}?${params}`, {
      headers: {
        "User-Agent": this.config.userAgent,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 403) {
      throw new Error(
        "edgar: SEC rejected the request (403). Set `userAgent` to \"YourName contact@example.com\" — SEC blocks anonymous UAs.",
      );
    }
    if (!res.ok) throw new Error(`edgar: API returned ${res.status} ${res.statusText}`);

    const data = (await res.json()) as FtsResponse;
    const results: SearchResultItem[] = [];
    for (const hit of data.hits?.hits ?? []) {
      if (results.length >= 10) break;
      const source = hit._source;
      const cik = source?.ciks?.[0];
      if (!cik || !source?.form) continue;

      const company = source.display_names?.[0]?.split("  (")[0] ?? `CIK ${cik}`;
      const accession = source.adsh ?? (hit._id ?? "").split(":")[0] ?? "";
      const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/`;
      const date = source.file_date ? new Date(source.file_date).toISOString() : undefined;

      results.push({
        title: `${source.form} — ${company}`,
        description: `Form ${source.form} filing${date ? `, filed ${date.slice(0, 10)}` : ""}${
          source.items?.length ? ` · items: ${source.items.join(", ")}` : ""
        }`,
        url: filingUrl,
        category: source.form,
        source: "SEC EDGAR",
        entityType: "event",
        date,
        company,
        externalId: hit._id ?? `${cik}-${source.form}`,
      });
    }
    return { results };
  },

  async *poll() {
    const query = this.config.query.trim();
    const maxRecords = Math.min(Number(this.config.maxRecords) || 20, 100);
    if (!query) throw new Error("edgar: `query` is required in config");

    const params = new URLSearchParams({ q: query, dateRange: this.config.dateRange });
    if (this.config.forms) params.set("forms", this.config.forms);

    const res = await fetch(`${FTS_BASE}?${params}`, {
      headers: {
        "User-Agent": this.config.userAgent,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 403) {
      throw new Error(
        "edgar: SEC rejected the request (403). Set `userAgent` to \"YourName contact@example.com\" — SEC blocks anonymous UAs.",
      );
    }
    if (!res.ok) throw new Error(`edgar: API returned ${res.status} ${res.statusText}`);

    const data = (await res.json()) as FtsResponse;
    const fetchedAt = new Date().toISOString();
    let emitted = 0;

    for (const hit of data.hits?.hits ?? []) {
      if (emitted >= maxRecords) break;
      const source = hit._source;
      const cik = source?.ciks?.[0];
      if (!cik || !source?.form) continue;

      const company = source.display_names?.[0]?.split("  (")[0] ?? `CIK ${cik}`;
      const title = `${source.form} — ${company}`;
      const accession = source.adsh ?? (hit._id ?? "").split(":")[0] ?? "";
      const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/`;

      const event: EntityStreamEvent = {
        connectorId: this.manifest.id,
        entityType: "event",
        entity: {
          type: "event",
          externalId: hit._id ?? `${cik}-${source.form}`,
          name: title,
          attributes: {
            cik,
            form: source.form,
            company,
            accession,
            items: source.items,
          },
          lastSeen: source.file_date ? new Date(source.file_date).toISOString() : undefined,
          sources: [
            {
              connectorId: this.manifest.id,
              title: `SEC EDGAR — form ${source.form}`,
              url: filingUrl,
              fetchedAt,
            },
          ],
        },
        relationships: [],
        sourceUrl: filingUrl,
        fetchedAt,
        confidence: 0.75,
      };
      emitted += 1;
      yield event;
    }
  },
});
