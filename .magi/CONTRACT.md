# .magi/CONTRACT.md — fleet shared contract (read before writing anything)

Canonical facts every worker must assume. If a job brief conflicts with this
file, THIS file wins. Update it only via the orchestrator's merge, never in a
single lane's branch.

## Repo facts (master)
- Repo: `K4bain/Seraph` · default branch `master`.
- Package manager: pnpm@8.14 (lockfile frozen in CI/Docker: `pnpm install --frozen-lockfile`).
- Next.js 15.5.22, React 19, node >=20, tailwindcss v4 (no tailwind.config).
- Workspace: `packages/*` (seraph-graph-types, seraph-connector-sdk,
  wwv-plugin-sdk, wwv-lib-aviation, wwv-lib-incidents).

## Paths that have cost us before (seam checklist — CHECK EVERY ONE)
1. Dockerfile copies each workspace package's package.json explicitly:
   all 5 packages must be listed or `pnpm install --frozen-lockfile` fails.
2. tsconfig.json path aliases:
   - `@/*` -> `./src/*`
   - `@worldwideview/wwv-plugin-sdk` -> `./packages/wwv-plugin-sdk/src`
   - `@worldwideview/wwv-lib-aviation` / `wwv-lib-incidents` -> respective src.
   (wwv-plugin-sdk main points at a broken dist; the src alias is what upstream WWV uses.)
3. next.config.ts: `typescript.ignoreBuildErrors: true`,
   `eslint.ignoreDuringBuilds: true`, `transpilePackages` includes all
   `@worldwideview/*` + resium/react-player/satellite.js.
4. Prisma generates `src/generated/prisma` (run `pnpm db:generate`;
   `postinstall` runs it + copies Cesium to public/cesium).
5. WWV CSS: `src/wwv/globals.css` imports `./styles/theme-tokens.css`
   (relative, one level up from the original `src/app/globals.css`).
6. Relative imports inside `src/wwv/*` are one level deeper than upstream's
   `src/*` — any `../` that referenced `src/generated` must become `../../`.
7. NEXT_PUBLIC_* vars are inlined at build time. Dockerfile ARGs:
   NEXT_PUBLIC_WS_SERVER_URL, NEXT_PUBLIC_WWV_EDITION (valid: local/cloud/demo).
8. Tests: repo convention is `vitest` (`pnpm test`). `next build` ignores
   lint/type errors; real acceptance = `pnpm test` + `pnpm build` green.

## Fleet protocol (git = shared memory)
- Before writing ANY code: refresh your clone
  `git fetch origin "+refs/heads/*:refs/remotes/origin/*"` then read
  - this CONTRACT.md
  - `.magi/STATE.json` (master HEAD, plus any lane branches: they hold the
    latest per-lane segments)
  - the file list of every OTHER lane's branch
    (`git log --oneline origin/<lane-branch> --not origin/master`, plus
    `git diff --name-status origin/master...origin/<lane-branch>`).
- Never merge or edit other lanes' branches. Never touch the same file paths
  that another lane has claimed (STATE.json's `files` lists the lanes).
- Own lane state: append YOUR segment to `.magi/STATE.json` on YOUR branch
  (additive key = lane name) before pushing. Orchestrator merges later.
- **Job naming**: every job MUST be prefixed with its lane
  (caspar-|balthazar-|melchior-|artaban-) so history maps to terminals.
- If `git fetch` fails once: retry once; if still failing, proceed WITHOUT
  the link and say so in your summary (degraded-link note, do not block).
- Pushing: commit to branch `magi/<ts>-<slug>`, push, then in your STRICT
  JSON summary include `ref`, `sha`, and a `seams` array naming any of the 8
  items above you had to compensate for.
- Orchestrator gate: every merge runs `gate-merge.ps1` on the big box
  (`pnpm test`; `-Full` also `next build`) BEFORE master is marked landed —
  workers' cgroups OOM on full builds, so this is the orchestrator's gate.

## Acceptance per lane
- **Gate**: after writing, run `bash .magi/verify.sh` (scoped tsc + eslint on
  changed files; add `-full` for vitest on changed tests). It exits 0/1 and
  prints VERDICT lines. Report verdict + exit code in your summary.
- No `.test.ts`/`.spec.ts`/`.test.tsx`/`.spec.tsx` junk left in your landing
  zone unless it's the test job.
- Relative/absolute import resolution verified with a real compile where
  possible (your sandbox tsc may not see the whole repo — state that).
- `.magi/STATE.json` matched schema v1 (see file header).