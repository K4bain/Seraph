# AGENTS.md — opencode session instructions (workspace root)

## The 4 Magi — 4-terminal parallel work

The canonical, complete protocol (trigger phrase **"trigger the 4 magi"**,
health gate, chunking, dispatch via magi-exec.mjs, cheap polling via summary
files, quality gate, and the degraded-worker credit/rate-limit rule) lives in
the GLOBAL config: `~/.config/opencode/AGENTS.md`. It applies in every
project/session.

Full runbook: `C:\Users\STATEL~1\AppData\Local\Temp\opencode\magi-ttyd\MANAGEMENT.md`
(canonical facts: `magi.json` in the same directory). Remote-exec tool:
`node magi-exec.mjs <url> "<cmd>"` or `-f <script.sh> <url>`.

### Fleet link (shared-memory via git) — keep it wired

Workers on the same repo are blind to each other's filesystems; the only
shared bus they all have is git. Keep the fleet contract in the repo:

- `.magi/CONTRACT.md` — canonical facts (paths, aliases, Dockerfile args,
  seam checklist) that every job brief must reference. Re-read on any
  follow-up that touches the same area.
- `.magi/STATE.json` — per-lane segments (lane → branch, files claimed,
  status). Workers append their own key only; the orchestrator merges.
- Job scripts for a repo-lane MUST include a `git fetch` + read of
  `.magi/` from master AND from other lanes' branches, so each worker
  checks claimed files before writing (write-order conflicts are the
  #1 seam source).
- After any orchestrated merge, refresh `.magi/STATE.json` (add merged
  lane, prune done) so the next trigger starts from reality.

### Non-trigger behavior
Do NOT touch the terminals unless the user says "trigger the 4 magi",
asks a question about the terminals, or asks for a status check.
