# Canvas Schema

The canvas export format — an open, versioned JSON standard. Anything Seraph
can render can be serialized to this document, and any tool that produces it
can be imported. No lock-in: export to Gephi, Neo4j, Maltego, or back.

## Status

Draft v0.1 — the canonical TypeScript shapes live in
`packages/seraph-graph-types` and this document describes the serialization.

## Structure

```json
{
  "schema": "seraph.canvas.v1",
  "id": "canvas-demo",
  "title": "Starter Canvas",
  "description": "...",
  "createdAt": "2026-08-01T00:00:00.000Z",
  "updatedAt": "2026-08-01T00:00:00.000Z",
  "createdBy": { "id": "u_1", "name": "Demo Analyst" },
  "workspace": "demo",
  "cards": [
    {
      "id": "ent-northwind",
      "kind": "entity",
      "position": { "x": 60, "y": 80 },
      "createdAt": "2026-08-01T00:00:00.000Z",
      "seraphId": "dem-1001",
      "entity": {
        "type": "organization",
        "name": "Northwind Trading LLC",
        "confidence": 0.94,
        "proposed": false,
        "sources": [
          {
            "connectorId": "opensanctions",
            "title": "US OFAC SDN List",
            "url": "https://sanctionssearch.ofac.treas.gov/",
            "fetchedAt": "2026-08-01T00:00:00.000Z"
          }
        ]
      }
    },
    {
      "id": "evt-berth",
      "kind": "event",
      "position": { "x": 240, "y": 320 },
      "title": "Berth anomaly — dark AIS gap, Bosphorus",
      "occurredAt": "2026-08-01T00:00:00.000Z",
      "summary": "Vessel last seen 4 days before scheduled discharge."
    },
    {
      "id": "memo-hypothesis",
      "kind": "memo",
      "position": { "x": 560, "y": 340 },
      "body": "Co-occurrence hypothesis...",
      "aiGenerated": true
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "ent-northwind",
      "target": "ent-volkov",
      "relationship": "associated_with",
      "confidence": 0.71,
      "proposed": true,
      "annotation": "Shared corporate address in OFAC filings"
    }
  ]
}
```

## Rules

1. `schema` is mandatory and gates version migrations (`seraph.canvas.vN`).
2. Card `kind` is one of `entity | event | memo | source`. Unknown kinds must
   be preserved as `opaque` cards on import, never dropped.
3. Every entity/edge may carry `proposed: true` — **importers must preserve
   this flag**; a proposal is never silently promoted to fact.
4. `sources[]` provenance is preserved verbatim. Exporters must not strip or
   merge it. Importers may *add* an `imported-via` source to the provenance
   chain — appending attribution is always allowed.
5. Positions are canvas-relative pixels; a `viewport` block may accompany
   them but is optional.
6. Edge endpoints reference card `id`s within the document.

## Interop targets

| Tool | Mapping |
|---|---|
| Gephi / Neo4j | cards → nodes, edges → edges; `entity.type` → node label |
| Maltego | entity cards → entities, edge `relationship` → link type |
| CSV | edge list: `source_name, relationship, target_name, confidence` |

## Snapshots & versioning

The relational `CanvasSnapshot` table stores this document per version; a
canvas's history is the ordered list of snapshots. Phase 2 adds Yjs CRDT
documents as the live working copy, with snapshots remaining the audit trail
and rewind point.
