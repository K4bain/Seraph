/**
 * @file cache.ts
 * @description Module-level in-memory TTL cache for PluginDataSnapshot results.
 *
 * Keyed per source string (e.g. "camera:default", "camera:traffic").
 * Returns the cached snapshot while Date.now() < expiresAt, otherwise invokes
 * the fetcher and stores the new result with a fresh expiry.
 *
 * TTL constants (D-07, Research Area 6):
 *   - TTL_GEOJSON_MS: 60 min (static file; changes only on deploy)
 *   - TTL_ROUTE_MS:   60 s   (internal Next.js route; data updates frequently)
 */

import type { PluginDataSnapshot } from "../types";

/** 60-minute TTL for static GeoJSON file sources. */
export const TTL_GEOJSON_MS = 60 * 60 * 1000;

/** 60-second TTL for internal route sources (/api/...). */
export const TTL_ROUTE_MS = 60 * 1000;

interface CacheEntry {
    snapshot: PluginDataSnapshot;
    expiresAt: number;
}

/** Module-level cache — persists for the lifetime of the Node.js process. */
const cache = new Map<string, CacheEntry>();

/**
 * getCached
 *
 * Returns a cached snapshot if one exists and has not expired.
 * Otherwise calls `fetcher`, stores the result, and returns it.
 *
 * @param key    - Unique string key for this source (e.g. "camera:default").
 * @param ttlMs  - Time-to-live in milliseconds before the entry is invalidated.
 * @param fetcher - Async function that fetches and returns a fresh snapshot.
 */
export async function getCached(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<PluginDataSnapshot>,
): Promise<PluginDataSnapshot> {
    const entry = cache.get(key);
    if (entry !== undefined && entry.expiresAt > Date.now()) {
        return entry.snapshot;
    }

    const snapshot = await fetcher();
    cache.set(key, { snapshot, expiresAt: Date.now() + ttlMs });
    return snapshot;
}

/** Exposed for testing: clear all cache entries. */
export function _clearCache(): void {
    cache.clear();
}
