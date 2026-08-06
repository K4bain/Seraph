"use client";

/**
 * Runtime loader for the vendored CesiumJS engine.
 *
 * Cesium ships as a static UMD global (/cesium/Cesium.js) that must stay out
 * of the webpack bundle — see scripts/copy-cesium.mjs for the reasoning. This
 * module loads the script on demand and hands back the API object.
 */

export type CesiumNS = Record<string, unknown>;

const WIN = (): Window & typeof globalThis => window;

/** Synchronous accessor — only valid after `loadCesium()` resolved. */
export function getCesium(): CesiumNS {
  return WIN().Cesium as CesiumNS;
}

/** True once the engine has been loaded into the window. */
export function cesiumLoaded(): boolean {
  return typeof WIN().Cesium !== "undefined";
}

/** Load (once) and resolve the engine global. */
export function loadCesium(): Promise<CesiumNS> {
  const existing = WIN().Cesium;
  if (existing) return Promise.resolve(existing as CesiumNS);

  WIN().CESIUM_BASE_URL = "/cesium";

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/cesium/Cesium.js";
    script.async = true;
    script.onload = () => {
      if (WIN().Cesium) resolve(WIN().Cesium as CesiumNS);
      else reject(new Error("Cesium global missing after script load"));
    };
    script.onerror = () => reject(new Error("Failed to load /cesium/Cesium.js"));
    document.head.appendChild(script);
  });
}

/** Inject Cesium's widget stylesheet from the static build (idempotent). */
export function injectWidgetsCss(): void {
  if (document.getElementById("cesium-widgets-css")) return;
  const link = document.createElement("link");
  link.id = "cesium-widgets-css";
  link.rel = "stylesheet";
  link.href = "/cesium/Widgets/widgets.css";
  document.head.appendChild(link);
}

// ---------------------------------------------------------------------------
// Loose typed views over the vendored engine's namespaces. These mirror the
// runtime surface the WWV engine touches (scene modes, screen transforms,
// imagery layers) without pulling in a full Cesium type package.
// ---------------------------------------------------------------------------

/** SceneMode enum (numeric ids on the runtime SceneMode object). */
export interface CesiumSceneMode {
  SCENE2D: number;
  SCENE3D: number;
  COLUMBUS_VIEW: number;
  MORPHING: number;
}

/** SceneTransforms.worldToWindowCoordinates — 3D position to window pixels. */
export interface CesiumSceneTransforms {
  worldToWindowCoordinates: (
    scene: unknown,
    position: unknown,
    result?: unknown,
  ) => { x: number; y: number } | undefined;
}

/** Minimal ImageryLayer surface the engine touches. */
export interface CesiumImageryLayerLike {
  alpha: number;
  show: boolean;
}
