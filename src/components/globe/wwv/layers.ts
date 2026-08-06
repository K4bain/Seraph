"use client";

/**
 * WWV-style globe layers + timeline state model.
 * Mirrors WorldWideView's layer slice but keeps the store local to the lens.
 */

export interface WwvLayers {
  satellites: boolean;
  trails: boolean;
  borders: boolean;
  dayNight: boolean;
  seraph: boolean;
  labels: boolean;
  aircraft: boolean;
  vessels: boolean;
  weather: boolean;
  clusters: boolean;
}

export const DEFAULT_LAYERS: WwvLayers = {
  satellites: true,
  trails: true,
  borders: true,
  dayNight: true,
  seraph: true,
  labels: false,
  aircraft: false,
  vessels: false,
  weather: false,
  clusters: true,
};

export type LayerKey = keyof WwvLayers;

export const LAYER_META: { key: LayerKey; label: string; hint: string }[] = [
  { key: "satellites", label: "Satellites", hint: "Live two-body tracks" },
  { key: "trails", label: "Trails", hint: "Orbital ground trails" },
  { key: "borders", label: "Country borders", hint: "Natural Earth 110m" },
  { key: "dayNight", label: "Day / night", hint: "Terminator lighting" },
  { key: "seraph", label: "Seraph entities", hint: "Graph canvas pins" },
  { key: "labels", label: "Labels", hint: "Name tags" },
  { key: "aircraft", label: "Aircraft", hint: "Live air traffic" },
  { key: "vessels", label: "Vessels", hint: "Live ship traffic" },
  { key: "weather", label: "Weather", hint: "Station data" },
  { key: "clusters", label: "Clustering", hint: "Auto-group dense pins" },
];
