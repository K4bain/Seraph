"use client";

/**
 * Camera presets — ported from WorldWideView's CameraController.
 * Named regions the camera can fly to with a smooth quintic ease.
 *
 * v2 adds region presets, a flight-height (altitude) helper that preserves
 * the current fix, and a speed-controlled fly-to-place entry point.
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
  // New region presets (v2)
  { id: "antarctica", label: "Antarctica", lat: -82, lon: -60, alt: 7_000_000, heading: 0, pitch: -88 },
  { id: "pacific", label: "South Pacific", lat: -12, lon: -150, alt: 13_000_000, heading: 0, pitch: -80 },
  { id: "indian-ocean", label: "Indian Ocean", lat: -20, lon: 80, alt: 9_000_000, heading: 0, pitch: -80 },
  { id: "atlan-north", label: "N. Atlantic", lat: 42, lon: -38, alt: 8_000_000, heading: 0, pitch: -78 },
  { id: "atlan-south", label: "S. Atlantic", lat: -28, lon: -20, alt: 9_000_000, heading: 0, pitch: -80 },
  { id: "siberia", label: "Siberia", lat: 62, lon: 105, alt: 5_000_000, heading: 0, pitch: -75 },
  { id: "amazon", label: "Amazon", lat: -4, lon: -60, alt: 4_000_000, heading: 0, pitch: -78 },
  { id: "sahara", label: "Sahara", lat: 23, lon: 12, alt: 5_000_000, heading: 0, pitch: -75 },
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

/**
 * Fly to a specific lat/lon/alt with smooth animation.
 * Altitude is given in metres.
 */
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

const ALT_MIN_M = 5_000;
const ALT_MAX_M = 40_000_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Fly to a target elevation while preserving the current camera fixpoint
 * (lat/lon, heading and pitch). Altitude is given in km and is clamped to
 * 5 km .. 40,000 km above the ellipsoid.
 */
export function setCameraAltitude(cesium: CesiumNS, viewer: unknown, altKm: number): void {
  const cast = cesium as unknown as {
    Ellipsoid: {
      WGS84: { cartesianToCartographic: (c: unknown) => { longitude: number; latitude: number; height: number } };
    };
    Cartesian3: { fromDegrees: (lon: number, lat: number, alt: number) => unknown };
    Math: { toDegrees: (rad: number) => number };
    EasingFunction: { QUINTIC_IN_OUT: unknown };
  };
  const cam = viewer as {
    camera: {
      position: unknown;
      heading: number;
      pitch: number;
      flyTo: (opts: unknown) => void;
    };
  };

  const carto = cast.Ellipsoid.WGS84.cartesianToCartographic(cam.camera.position);
  const altM = clamp(altKm * 1000, ALT_MIN_M, ALT_MAX_M);

  cam.camera.flyTo({
    destination: cast.Cartesian3.fromDegrees(
      cast.Math.toDegrees(carto.longitude),
      cast.Math.toDegrees(carto.latitude),
      altM,
    ),
    orientation: {
      heading: cam.camera.heading,
      pitch: cam.camera.pitch,
      roll: 0,
    },
    duration: 4.0,
    easingFunction: cast.EasingFunction.QUINTIC_IN_OUT,
  });
}

/**
 * Fly to a geographic coordinate with a speed-controlled, altitude-adjustable
 * view. If `altKm` is omitted the camera drops to the default 1,000 km.
 */
export function flyToPlace(cesium: CesiumNS, viewer: unknown, lat: number, lon: number, altKm?: number): void {
  const alt = typeof altKm === "number" ? altKm * 1000 : 1_000_000;
  flyToPosition(cesium, viewer, lat, lon, alt);
}