"use client";

/**
 * Country borders layer — ported from WorldWideView's border overlay.
 *
 * WWV renders borders as low-level wall primitives; for an embedded lens we
 * load the same Natural Earth dataset through Cesium's GeoJsonDataSource and
 * style it as hairline strokes, which matches Seraph's instrument chrome and
 * keeps the engine's worker-driven geometry pipeline in charge.
 */

import type { CesiumNS } from "./cesiumLoader";

export const DEFAULT_BORDERS_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

export const bordersUrl = (): string => DEFAULT_BORDERS_URL;

export interface BordersHandle {
  setVisible: (visible: boolean) => void;
  destroy: () => void;
}

/**
 * Load the borders GeoJSON and create a toggleable data source.
 * Fails gracefully (logs a warning) so the globe still works offline.
 */
export async function loadBorders(cesium: CesiumNS, viewer: unknown, url: string): Promise<BordersHandle> {
  const { GeoJsonDataSource, Color } = cesium as {
    GeoJsonDataSource: {
      load: (url: string, opts?: unknown) => Promise<unknown>;
    };
    Color: { fromCssColorString: (css: string) => unknown };
  };

  const ds = await GeoJsonDataSource.load(url, {
    stroke: Color.fromCssColorString("rgba(255,255,255,0.24)"),
    strokeWidth: 1.2,
    fill: Color.fromCssColorString("rgba(255,255,255,0.02)"),
    clampToGround: false,
  });

  (viewer as { dataSources: { add: (ds: unknown) => void } }).dataSources.add(ds);

  return {
    setVisible: (visible: boolean) => {
      (ds as { show: boolean }).show = visible;
    },
    destroy: () => {
      const dataSources = (viewer as { dataSources: { remove: (ds: unknown, destroy?: boolean) => void } }).dataSources;
      dataSources.remove(ds, true);
    },
  };
}
