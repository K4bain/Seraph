/**
 * @file index.ts
 * @description Barrel re-exporting the public LocalDataSource registry API.
 * Consumed by Plan 30-03's service.ts integration seam.
 */

export { hasLocalSource, getLocalSourceIds, resolveLocalSnapshot } from "./registry";
