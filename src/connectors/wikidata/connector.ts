/**
 * Wikidata connector — search-only. Uses the public wbsearchentities
 * API (free, no key), then batch-fetches instance-of (P31) claims so
 * results can be filtered by canonical entity type.
 *
 * Docs: https://www.wikidata.org/w/api.php?action=help&modules=main
 */

import { defineConnector } from "seraph-connector-sdk";
import type { EntityType } from "seraph-graph-types";
import type { SearchResponse, SearchResultItem } from "seraph-connector-sdk";

const API_BASE = "https://www.wikidata.org/w/api.php";
const FETCH_TIMEOUT_MS = 20_000;

/** Common P31 instance-of QIDs → canonical EntityType. */
const P31_TO_TYPE: Record<string, EntityType> = {
  Q5: "person", // human
  Q43229: "organization", // organization
  Q4830453: "organization", // business enterprise
  Q7187: "organization", // government agency
  Q891723: "organization", // public company
  Q3918: "organization", // university
  Q6256: "location", // country
  Q515: "location", // city
  Q486: "location", // locality
  Q35657: "location", // administrative territorial entity
  Q56061: "location", // administrative territorial entity
  Q532: "location", // village
};

interface WbSearchHit {
  id?: string;
  label?: string;
  description?: string;
}

interface WbGetEntitiesResponse {
  entities?: Record<string, { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } } } }>> }>;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "seraph-connector/0.1 (OSINT research)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`wikidata: API returned ${res.status} ${res.statusText}`);
  return res.json();
}

export const wikidataConnector = defineConnector({
  manifest: {
    id: "wikidata",
    name: "Wikidata",
    version: "0.1.0",
    description: "Structured knowledge base search (free, no key)",
    author: "seraph",
    webhookSupported: false,
    entityTypes: ["person", "organization", "location"],
  },

  async configure() {
    // No config surface — the API is keyless and stateless.
  },

  async search({ query, type }): Promise<SearchResponse> {
    const searchParams = new URLSearchParams({
      action: "wbsearchentities",
      format: "json",
      language: "en",
      search: query,
      type: "item",
      limit: "10",
    });
    const data = (await fetchJson(`${API_BASE}?${searchParams}`)) as {
      search?: WbSearchHit[];
    };
    const hits = data.search ?? [];
    if (hits.length === 0) return { results: [] };

    const ids = hits.map((hit) => hit.id).filter((id): id is string => Boolean(id));
    const instanceOf = await fetchInstanceOf(ids);

    const results: SearchResultItem[] = [];
    for (const hit of hits) {
      if (!hit.id) continue;
      const entityType = instanceOf.get(hit.id);
      if (type && entityType && entityType !== type) continue;

      results.push({
        title: hit.label ?? hit.id,
        description: hit.description,
        url: `https://www.wikidata.org/wiki/${hit.id}`,
        category: entityType ?? "item",
        source: "Wikidata",
        entityType,
        name: hit.label,
        externalId: hit.id,
      });
    }
    return { results };
  },
});

/** Batch P31 lookup — one extra request per search, not per hit. */
async function fetchInstanceOf(ids: string[]): Promise<Map<string, EntityType>> {
  const map = new Map<string, EntityType>();
  const params = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    props: "claims",
    ids: ids.join("|"),
  });
  try {
    const data = (await fetchJson(`${API_BASE}?${params}`)) as WbGetEntitiesResponse;
    for (const [id, entity] of Object.entries(data.entities ?? {})) {
      const p31 = entity.claims?.P31?.[0]?.mainsnak?.datavalue?.value?.id;
      if (p31 && P31_TO_TYPE[p31]) map.set(id, P31_TO_TYPE[p31]!);
    }
  } catch {
    // P31 lookup is best-effort — hits without a resolved type still
    // surface under "item" rather than failing the whole search.
  }
  return map;
}
