# AI Layer

The intelligence layer — not a chatbot bolted on, but a reasoning layer woven
through the platform. All calls are logged, attributable, and auditable, and
all outputs land as *proposals* that require analyst confirmation
(design principle: **AI proposes, analysts decide**).

## Design constraints

1. **Provenance on every output.** Every extracted entity, inferred edge, and
   anomaly flag carries the source documents and the reasoning that produced
   it (`Provenance` in `seraph-graph-types`).
2. **No silent commits.** AI writes `proposed: true` records. Nothing merges,
   links, or flags itself into the graph without an analyst's click.
3. **Server-only.** `src/core/ai/client.ts` runs in the Next.js server and the
   BullMQ AI worker — never in a client bundle.
4. **Auditable.** Every request gets a `requestId`, logged with model, token
   usage, and task. The prompt that produced a claim must be reproducible.

## Pipeline

```
Input (URL / document / canvas selection / NL query)
        │
        ▼
┌───────────────────────────────┐
│ 1. Extraction                 │  tool_use structured output → entities,
│    (extract_entities)         │  relationships, dates, locations
└──────────────┬────────────────┘
               ▼
┌───────────────────────────────┐
│ 2. Dedup + merge proposals    │  fingerprint match (src/core/graph/dedup)
│                               │  → proposed merges for analyst review
└──────────────┬────────────────┘
               ▼
┌───────────────────────────────┐
│ 3. Edge inference             │  co-occurrence + semantic proximity
│    (infer_edges)              │  → proposed edges with rationale
└──────────────┬────────────────┘
               ▼
┌───────────────────────────────┐
│ 4. Anomaly + narrative        │  activity spikes across feeds;
│    (flag_anomalies,           │  timeline briefing documents
│     generate_briefing)        │
└──────────────┬────────────────┘
               ▼
        Analyst review → confirmed → graph commit
```

## Client surface

`src/core/ai/client.ts` ships the typed `complete()` surface plus
`completeStructured()` (function calling). Extraction + edge inference run
interactively via `src/core/ai/tasks/analyze.ts` behind `POST /api/ai/analyze`
(preview only) and `POST /api/ai/apply` (analyst-confirmed write through the
connector ingest pipeline).

**Implemented:** stages 1 (extraction) + 3 (edge inference), the analyze/apply
API pair, and the canvas AI panel. Verified end-to-end with OpenRouter models.

**Not yet wired (future subphases):** stage 2 (dedup + merge proposals
surface), stage 4 (anomaly flagging, narrative briefing), and NL → Cypher
query translation. These stay behind `AiJobData.task` in `workers/queues.ts`.

## Structured output via function calling

Extraction uses OpenRouter function calling (OpenAI-compatible) to force a
stable JSON shape matching `RawEntity` / `RawRelationship` from
`seraph-graph-types` — freeform text is never written to the graph. Schema
drift is caught by the worker against the canonical types before anything is
proposed.

## Embeddings & semantic dedup

Voyage AI embeddings into pgvector (same Postgres instance) provide
semantic similarity for fuzzy entity matching beyond the string fingerprints.
Exact-name matches always win; embeddings back the *proposal* tier.

## Natural language query

Future subphase: NL → graph query translation. The translated Cypher will be
previewed to the analyst before execution — the AI never runs queries unseen
(defense in depth: it *proposes* queries, analysts run them).

## Safety

- Prompts and outputs are logged with `requestId`s; a claim must be traceable
  from graph edge → proposal → request log → source document.
- No classified inputs. OSINT only, by platform definition.
- Rate limits and budgets enforced at the queue layer, not the app layer.
