"use client";

/**
 * Shared feed entity model for the WWV live-data layers.
 * One shape across aircraft / vessels / weather stations / events so the
 * globe pin layer, filter engine and cluster math all consume the same slice.
 */

export interface FeedEntity {
  id: string;
  kind: "aircraft" | "vessel" | "station" | "event";
  label: string;
  lat: number;
  lon: number;
  altKm?: number;
  headingDeg?: number;
  speedKts?: number;
  status?: string;
  tempC?: number;
  windKts?: number;
  detail?: string;
  color?: string;
  properties?: Record<string, string | number | boolean | null>;
}

export const FEED_KIND_COLORS: Record<FeedEntity["kind"], string> = {
  aircraft: "#c678dd",
  vessel: "#56b6c2",
  station: "#98c379",
  event: "#e06c75",
};
