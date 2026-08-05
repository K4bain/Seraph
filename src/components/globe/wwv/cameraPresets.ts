"use client";

/**
 * Camera presets — ported from WorldWideView's CameraController.
 * Named regions the camera can fly to with a smooth quintic ease.
 */

import type { CesiumNS } from "./cesiumLoader";

export interface CameraPreset {
  id: string;
  label: string;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  pitch: number;
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: "global", label: "Global", lat: 20, lon: 0, alt: 20_000_000, heading: 0, pitch: -90 },
  { id: "americas", label: "Americas", lat: 15, lon: -80, alt: 12_000_000, heading: 0, pitch: -80 },
  { id: "europe", label: "Europe", lat: 50, lon: 15, alt: 6_000_000, heading: 0, pitch: -75 },
  { id: "mena", label: "MENA", lat: 28, lon: 42, alt: 6_000_000, heading: 0, pitch: -75 },
  { id: "asia-pacific", label: "Asia-Pacific", lat: 30, lon: 105, alt: 10_000_000, heading: 0, pitch: -80 },
  { id: "africa", label: "Africa", lat: 2, lon: 22, alt: 8_000_000, heading: 0, pitch: -80 },
  { id: "oceania", label: "Oceania", lat: -25, lon: 140, alt: 7_000_000, heading: 0, pitch: -75 },
  { id: "arctic", label: "Arctic", lat: 80, lon: 0, alt: 6_000_000, heading: 0, pitch: -85 },
];

export function getCameraPreset(id: string): CameraPreset | undefined {
  return CAMERA_PRESETS.find((p) => p.id === id);
}

/** Fly the camera to a named preset region. */
export function flyToPreset(cesium: CesiumNS, viewer: unknown, presetId: string): void {
  const preset = getCameraPreset(presetId);
  if (!preset) return;
  flyToPosition(cesium, viewer, preset.lat, preset.lon, preset.alt, preset.heading, preset.pitch, 3.0);
}

/** Fly to a specific lat/lon/alt with smooth animation. */
export function flyToPosition(
  cesium: CesiumNS,
  viewer: unknown,
  lat: number,
  lon: number,
  alt: number,
  heading = 0,
  pitch = -90,
  duration = 2.0,
): void {
  const { Cartesian3, Math: CesiumMath, EasingFunction } = cesium as {
    Cartesian3: { fromDegrees: (lon: number, lat: number, alt: number) => unknown };
    Math: { toRadians: (deg: number) => number };
    EasingFunction: { QUINTIC_IN_OUT: unknown };
  };
  (viewer as { camera: { flyTo: (opts: unknown) => void } }).camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, lat, alt),
    orientation: {
      heading: CesiumMath.toRadians(heading),
      pitch: CesiumMath.toRadians(pitch),
      roll: 0,
    },
    duration,
    easingFunction: EasingFunction.QUINTIC_IN_OUT,
  });
}
