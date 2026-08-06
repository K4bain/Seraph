"use client";

/**
 * Graphics settings — the tunable rendering knobs for the WWV globe lens.
 *
 * The UI lane holds a `GraphicsSettings` state object and exposes it through
 * a `GraphicsHandle` ref; the engine lane (useWwvViewer) implements the
 * handle against the live Cesium scene. All defaults keep the instrument
 * quiet: no shadows, no lighting, FXAA on, native resolution.
 */

export interface GraphicsSettings {
  /** Render resolution multiplier (0.25–2). 1 = native device pixels. */
  resolutionScale: number;
  /** MSAA/FXAA antialiasing. */
  antialias: boolean;
  /** Scene shadow pass (disabled by default — expensive). */
  shadows: boolean;
  /** Globe diffuse lighting (day/night shading). */
  lighting: boolean;
  /** OpenTopoMap-style hillshade overlay ("relief"). */
  relief: boolean;
  /** Active scene mode. */
  sceneMode: "2d" | "2.5d" | "3d";
}

export const DEFAULT_GRAPHICS: GraphicsSettings = {
  resolutionScale: 1,
  antialias: true,
  shadows: false,
  lighting: false,
  relief: false,
  sceneMode: "3d",
};

/**
 * Mutable handle the engine implements once the Cesium scene exists.
 * Setters are idempotent and safe to call before/after the scene boots
 * (the engine simply drops calls while no viewer is alive).
 */
export interface GraphicsHandle {
  setResolutionScale: (x: number) => void;
  setAntialias: (b: boolean) => void;
  setShadows: (b: boolean) => void;
  setLighting: (b: boolean) => void;
  setTerrain: (b: boolean) => void;
  setSceneMode: (m: "2d" | "2.5d" | "3d") => void;
}
