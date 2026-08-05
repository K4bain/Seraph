/**
 * Shared connector search fan-out (server-only).
 *
 * Runs every registered connector's optional search() with per-source
 * filtering, normalizes the settled results, and returns a stable shape
 * used by both /api/search and the entity profile routes.
 */

import { listConnectors } from "seraph-connector-sdk/runtime";
import type { SearchResultItem } from "seraph-connector-sdk";
import "../../connectors";

export type SourceStatus = "ok" | "empty" | "error";

export interface SourceResult {
  source: string;
  status: SourceStatus;
  data: SearchResultItem[];
  count: number;
  error?: string;
}

/**
 * Which sources run for a given type filter.
 * Wikidata: person/organization/location. WHOIS: strictly domain-only
 * (a person query is never a whois lookup). GitHub: person only.
 * OpenSanctions/EDGAR/GDELT always run.
 */
export function isSourceEnabled(connectorId: string, type: string | null): boolean {
  switch (connectorId) {
    case "wikidata":
      return type === null || type === "person" || type === "organization" || type === "location";
    case "whois":
      return type === "domain";
    case "github":
      return type === null || type === "person";
    case "whatsmyname":
      return type === null || type === "person";
    default:
      return true;
  }
}

/** Fan out across every search-capable connector. */
export async function runSearch(query: string, type: string | null): Promise<SourceResult[]> {
  const active = listConnectors().filter(
    (connector) => connector.search && isSourceEnabled(connector.manifest.id, type),
  );
  const settled = await Promise.allSettled(
    active.map((connector) => connector.search!({ query, type })),
  );

  return active.map((connector, index) => {
    const entry = settled[index]!;
    if (entry.status === "fulfilled") {
      const items = entry.value.results
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }));
      return {
        source: connector.manifest.id,
        status: (items.length > 0 ? "ok" : "empty") as SourceStatus,
        data: items,
        count: items.length,
      };
    }
    const message = entry.reason instanceof Error ? entry.reason.message : String(entry.reason);
    console.warn(`[search] ${connector.manifest.id} failed: ${message}`);
    return {
      source: connector.manifest.id,
      status: "error" as SourceStatus,
      data: [],
      count: 0,
      error: message,
    };
  });
}

/** Every hit across all sources, tagged with its source id. */
export function flattenResults(results: SourceResult[]): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  for (const entry of results) {
    for (const item of entry.data) items.push(item);
  }
  return items;
}
