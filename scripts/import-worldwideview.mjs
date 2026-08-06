#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = "https://github.com/silvertakana/worldwideview.git";
const TMP = path.resolve(".tmp/worldwideview");
const TARGET = path.resolve("src/worldwideview");

function rmrf(p) {
  try {
    execSync(`rm -rf ${p}`);
  } catch (e) {
    // ignore
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, name.name);
    const d = path.join(dest, name.name);
    if (name.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

(async function main() {
  console.log("Importing worldwideview from", REPO);
  rmrf(TMP);
  rmrf(TARGET);

  try {
    execSync(`git clone --depth 1 ${REPO} ${TMP}`, { stdio: "inherit" });
  } catch (err) {
    console.error("git clone failed:", err.message || err);
    process.exit(1);
  }

  // Remove upstream git history before copying into this repo
  rmrf(path.join(TMP, ".git"));

  // Ensure target exists and copy
  fs.mkdirSync(TARGET, { recursive: true });
  copyDir(TMP, TARGET);

  // Clean up tmp
  rmrf(TMP);

  console.log(`Worldwideview imported into ${TARGET}`);
  console.log("Next steps: run the app, fix imports, and commit the adjusted files.");
})();
