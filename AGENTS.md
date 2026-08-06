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

### Non-trigger behavior
Do NOT touch the terminals unless the user says "trigger the 4 magi",
asks a question about the terminals, or asks for a status check.
