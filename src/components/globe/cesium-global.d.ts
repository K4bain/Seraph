/**
 * Ambient typings for the vendored CesiumJS engine.
 *
 * Seraph ships the prebuilt UMD engine at /cesium/Cesium.js and exposes it
 * as the browser global `window.Cesium`. The npm package is deliberately NOT
 * imported at build time (bundling the ESM build corrupts a WASM payload in
 * @spz-loader — see scripts/copy-cesium.mjs), so there is no type package to
 * resolve against. This loose surface keeps the compiler happy while the
 * runtime object is the real, full Cesium API.
 */
declare global {
  interface Window {
    Cesium?: unknown;
    CESIUM_BASE_URL?: string;
  }
}

export {};
