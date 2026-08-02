/**
 * Copies CesiumJS static assets (Workers, ThirdParty, Assets, Widgets)
 * from node_modules into public/cesium so the browser can load them
 * (Next.js serves /public verbatim; Cesium resolves everything else
 * relative to CESIUM_BASE_URL=/cesium).
 *
 * Runs in the Dockerfile builder stage and locally via `pnpm copy:cesium`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cesiumSource = path.join(root, "node_modules/cesium/Build/Cesium");
const targetBase = path.join(root, "public/cesium");

const folders = ["Workers", "ThirdParty", "Assets", "Widgets"];

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log("Copying Cesium assets...");
for (const folder of folders) {
  const src = path.join(cesiumSource, folder);
  const dest = path.join(targetBase, folder);
  if (fs.existsSync(src)) {
    copyDir(src, dest);
    console.log(`Copied ${folder}`);
  } else {
    console.warn(`Source folder not found: ${src}`);
  }
}
console.log("Cesium assets copied successfully.");
