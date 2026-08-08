#!/bin/bash
# verify.sh — scoped quality gates for a lane's changed files (runs inside the
# worker's repo clone; cgroup-safe: no full-project tsc/build).
# Usage: bash .magi/verify.sh            # gate changed files only
#        bash .magi/verify.sh --full     # also run vitest (if tests touched)
# Exit 0 = pass, 1 = fail. Prints one verdict line per gate.
# Fetches nothing; assumes the worker already ran the fleet-sync fetch.
set -u

REPO="K4bain/Seraph"
FAILS=0

changed_files() {
  git diff --name-only origin/master...HEAD 2>/dev/null \
    | sed 's/^"//;s/"$//'
}

FILES="$(changed_files)"
if [ -z "$FILES" ]; then
  echo "VERDICT SKIP: no files changed vs origin/master (nothing to gate)"
  exit 0
fi

echo "GATING $(echo "$FILES" | wc -l) changed files"

ts_src="$(echo "$FILES" | grep -E '\.(ts|tsx)$' || true)"
if [ -n "$ts_src" ]; then
  # Scoped typecheck that still honors the project tsconfig (--jsx, @/ paths,
  # strictness), unlike plain `tsc file.tsx` which ignores tsconfig entirely
  # (would fail with TS17004/TS2307). Generates a temp config extending the
  # repo tsconfig with noEmit + include: changed files only.
  TMPCFG=".verify-tsconfig.json"
  printf '{\n  "extends": "./tsconfig.json",\n  "compilerOptions": { "noEmit": true, "skipLibCheck": true },\n  "include": [%s]\n}\n' "$(printf '%s' "$ts_src" | sed 's|^|"|; s|$|"|' | paste -sd, -)" > "$TMPCFG"
  if npx tsc -p "$TMPCFG" >/dev/null 2>&1; then
    echo "VERDICT PASS tsc (project config, scoped, $(( $(echo "$ts_src" | wc -l) )) files)"
  else
    echo "VERDICT FAIL tsc on changed source (run: npx tsc -p .verify-tsconfig.json to see errors)"
    FAILS=$((FAILS+1))
  fi
  rm -f "$TMPCFG"
else
  echo "VERDICT SKIP tsc (no ts/tsx changed)"
fi

if command -v eslint >/dev/null 2>&1 || [ -f package.json ]; then
  if npx eslint --no-warn-ignored $ts_src $FILES >/dev/null 2>&1; then
    echo "VERDICT PASS eslint"
  else
    echo "VERDICT FAIL eslint (lint errors in changed files)"
    FAILS=$((FAILS+1))
  fi
fi

if [ "${1:-}" = "-full" ]; then
  testfiles="$(echo "$FILES" | grep -E '\.(test|spec)\.(ts|tsx|js|tsx)$' || true)"
  if [ -n "$testfiles" ]; then
    if npx vitest run "$testfiles" >/dev/null 2>&1; then
      echo "VERDICT PASS vitest"
    else
      echo "VERDICT FAIL vitest"; FAILS=$((FAILS+1))
    fi
  else
    echo "VERDICT SKIP vitest (no test files changed)"
  fi
fi

if [ "$FAILS" -gt 0 ]; then
  echo "VERIFY RESULT: FAIL ($FAILS gate(s) failed) — fix before pushing"
  exit 1
fi
echo "VERIFY RESULT: OK — lane gate passed"
exit 0