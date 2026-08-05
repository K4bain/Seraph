"use client";

/**
 * Imagery base-layer catalogue — ported from WorldWideView's imagery picker.
 * Every provider is token-free and tiles over plain HTTPS, so the globe works
 * with zero configuration. Dark CARTO is the default to match the instrument.
 */

import type { CesiumNS } from "./cesiumLoader";

export interface ImageryOption {
  id: string;
  name: string;
  description: string;
  kind: "url" | "arcgis";
  url: string;
  dark: boolean;
}

export const IMAGERY_LAYERS: ImageryOption[] = [
  {
    id: "carto-dark",
    name: "Carto Dark",
    description: "Dark basemap — matches the instrument panel",
    kind: "url",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    dark: true,
  },
  {
    id: "carto-light",
    name: "Carto Light",
    description: "Light basemap",
    kind: "url",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    dark: false,
  },
  {
    id: "osm",
    name: "OpenStreetMap",
    description: "Community-driven map data",
    kind: "url",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    dark: false,
  },
  {
    id: "arcgis-imagery",
    name: "ArcGIS World Imagery",
    description: "High-resolution satellite imagery",
    kind: "arcgis",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
    dark: false,
  },
  {
    id: "arcgis-dark",
    name: "ArcGIS Dark Gray",
    description: "Dark gray canvas basemap",
    kind: "arcgis",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer",
    dark: true,
  },
];

export function getImageryOption(id: string): ImageryOption {
  return IMAGERY_LAYERS.find((l) => l.id === id) ?? IMAGERY_LAYERS[0]!;
}

/** Build a Cesium ImageryProvider for the given option id. */
export function createImageryProvider(cesium: CesiumNS, id: string): unknown {
  const option = getImageryOption(id);
  const { UrlTemplateImageryProvider, ArcGisMapServerImageryProvider } = cesium as {
    UrlTemplateImageryProvider: new (opts: unknown) => unknown;
    ArcGisMapServerImageryProvider: new (opts: unknown) => unknown;
  };

  if (option.kind === "arcgis") {
    return new ArcGisMapServerImageryProvider({
      url: option.url,
      enablePickFeatures: false,
    });
  }

  return new UrlTemplateImageryProvider({
    url: option.url,
    credit: "© OpenStreetMap · © CARTO · © Esri",
    maximumLevel: 18,
  });
}
