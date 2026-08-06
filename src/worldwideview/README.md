# WorldwideView (imported)

This folder is populated by the `scripts/import-worldwideview.mjs` importer which clones https://github.com/silvertakana/worldwideview into `src/worldwideview`.

Why this exists
- You asked to replace the existing geo/globe/Cesium maps with the WorldwideView project. Instead of committing all upstream files directly in a single automated step, this importer lets you fetch the upstream code into the branch and iterate safely.

How to use
1. On the import/worldwideview branch run:

   pnpm install
   pnpm run import:worldwideview

2. Inspect `src/worldwideview` and run the app (pnpm dev / pnpm build). Fix imports or adjust component wiring as needed.

Automated replacement
- This branch adds an importer but does not yet perform automatic source replacements across the app. I can attempt automated replacements (update import paths, swap components) in a follow-up commit after you review the imported code or give me permission to run the automated transform.

Notes
- The importer removes the upstream .git directory before copying, so the imported files become regular files in this repo.
- If you want the upstream repo kept as a git submodule instead, tell me and I will switch strategies.
