"use client";

/**
 * Filter engine for the WWV live-data layers.
 * An empty `kinds` or `statuses` array means "match everything" for that axis;
 * `query` matches any visible string field case-insensitively.
 */

import type { FeedEntity } from "./entityModel";

export interface EntityFilter {
  kinds: FeedEntity["kind"][];
  statuses: string[];
  query: string;
}

export const DEFAULT_FILTER: EntityFilter = {
  kinds: [],
  statuses: [],
  query: "",
};

function queryHits(entity: FeedEntity, needle: string): boolean {
  const haystack: string[] = [entity.label];
  if (entity.status) haystack.push(entity.status);
  if (entity.detail) haystack.push(entity.detail);
  if (entity.properties) {
    for (const value of Object.values(entity.properties)) {
      if (typeof value === "string" || typeof value === "number") {
        haystack.push(String(value));
      }
    }
  }
  return haystack.some((text) => text.toLowerCase().includes(needle));
}

export function applyFilter(entities: FeedEntity[], f: EntityFilter): FeedEntity[] {
  const kindSet = new Set(f.kinds);
  const statusSet = new Set(f.statuses);
  const needle = f.query.trim().toLowerCase();

  return entities.filter((entity) => {
    if (kindSet.size > 0 && !kindSet.has(entity.kind)) return false;
    if (statusSet.size > 0 && !(entity.status !== undefined && statusSet.has(entity.status))) {
      return false;
    }
    if (needle !== "" && !queryHits(entity, needle)) return false;
    return true;
  });
}
