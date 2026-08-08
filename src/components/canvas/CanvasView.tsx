"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type OnSelectionChangeParams,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import IntelligenceNode from "@/components/canvas/IntelligenceNode";
import IntelligenceEdge from "@/components/canvas/IntelligenceEdge";
import EdgeInspector from "@/components/canvas/EdgeInspector";
import AiPanel from "@/components/canvas/AiPanel";
import CanvasExport from "@/components/canvas/CanvasExport";
import { useCollabPresence } from "@/components/canvas/useCollabPresence";
import type { CursorState } from "@/core/collab/presence";
import { useCanvasStore, type CardNode, type RelationEdge, type CanvasDocument } from "@/store/canvas";
import styles from "./CanvasView.module.css";

const nodeTypes = { intelligence: IntelligenceNode };
const edgeTypes = { intelligence: IntelligenceEdge };

const AUTOSAVE_DELAY_MS = 1200;

/** Phase 1 demo graph — the starter board for new canvases with no saved state. */
function seedGraph(): { nodes: CardNode[]; edges: RelationEdge[] } {
  const now = new Date().toISOString();
  const nodes: CardNode[] = [
    {
      id: "ent-northwind",
      type: "intelligence",
      position: { x: 60, y: 80 },
      data: {
        card: {
          id: "ent-northwind",
          kind: "entity",
          createdAt: now,
          updatedAt: now,
          seraphId: "dem-1001",
          entity: {
            seraphId: "dem-1001",
            type: "organization",
            name: "Northwind Trading LLC",
            fingerprint: "northwind trading",
            confidence: 0.94,
            sources: [
              {
                connectorId: "opensanctions",
                title: "US OFAC SDN List",
                url: "https://sanctionssearch.ofac.treas.gov/",
                fetchedAt: now,
              },
            ],
          },
        },
      },
    },
    {
      id: "ent-volkov",
      type: "intelligence",
      position: { x: 420, y: 80 },
      data: {
        card: {
          id: "ent-volkov",
          kind: "entity",
          createdAt: now,
          updatedAt: now,
          seraphId: "dem-1002",
          entity: {
            seraphId: "dem-1002",
            type: "person",
            name: "Igor Volkov",
            fingerprint: "igor volkov",
            confidence: 0.88,
            sources: [
              {
                connectorId: "opensanctions",
                title: "OpenSanctions persons",
                url: "https://www.opensanctions.org/",
                fetchedAt: now,
              },
            ],
          },
        },
      },
    },
    {
      id: "evt-berth",
      type: "intelligence",
      position: { x: 240, y: 320 },
      data: {
        card: {
          id: "evt-berth",
          kind: "event",
          createdAt: now,
          updatedAt: now,
          title: "Berth anomaly — dark AIS gap, Bosphorus",
          occurredAt: now,
          summary: "Vessel last seen 4 days before scheduled discharge; broadcast resumed off Constanța.",
        },
      },
    },
    {
      id: "memo-hypothesis",
      type: "intelligence",
      position: { x: 560, y: 340 },
      data: {
        card: {
          id: "memo-hypothesis",
          kind: "memo",
          createdAt: now,
          updatedAt: now,
          aiGenerated: true,
          body: "Co-occurrence: Northwind and Volkov share a corporate address in three OFAC filings. Proposed edge: associated_with (confidence 0.71). Awaiting analyst confirmation.",
        },
      },
    },
  ];

  const edges: RelationEdge[] = [
    {
      id: "e1",
      source: "ent-northwind",
      target: "ent-volkov",
      type: "intelligence",
      data: { relationship: "associated_with", confidence: 0.71 },
    },
    {
      id: "e2",
      source: "ent-northwind",
      target: "evt-berth",
      type: "intelligence",
      data: { relationship: "related_to" },
    },
  ];

  return { nodes, edges };
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function CanvasView({ canvasId }: { canvasId: string }) {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, hydrate, addMemo, addSource } =
    useCanvasStore();
  const [loaded, setLoaded] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const baseVersion = useRef(0);
  const dirtyRef = useRef(false);

  // --- Realtime presence (Yjs awareness) ---------------------------------
  const { peers, sendPresence } = useCollabPresence(canvasId);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [shellRect, setShellRect] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const lastCursorRef = useRef<CursorState | null>(null);
  const lastPointerSentAt = useRef(0);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setShellRect({ left: rect.left, top: rect.top });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** Convert a screen point into flow coordinates for the current viewport. */
  const toFlowPoint = useCallback((clientX: number, clientY: number): CursorState => {
    const rect = shellRef.current?.getBoundingClientRect();
    const vp = viewportRef.current;
    return { x: (clientX - (rect?.left ?? 0) - vp.x) / vp.zoom, y: (clientY - (rect?.top ?? 0) - vp.y) / vp.zoom };
  }, []);

  const onShellPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const now = performance.now();
      if (now - lastPointerSentAt.current < 80) return;
      lastPointerSentAt.current = now;
      lastCursorRef.current = toFlowPoint(event.clientX, event.clientY);
      sendPresence({ cursor: lastCursorRef.current });
    },
    [sendPresence, toFlowPoint],
  );

  const onMove = useCallback((_event: unknown, next: Viewport) => {
    viewportRef.current = next;
    setViewport(next);
  }, []);

  // Hydrate from the latest snapshot on mount; seed a demo graph when empty.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/canvas/${canvasId}/snapshot`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`snapshot fetch ${res.status}`);
        return (await res.json()) as { version: number; document: CanvasDocument | null };
      })
      .then((snap) => {
        if (cancelled) return;
        baseVersion.current = snap.version;
        if (snap.document?.nodes?.length || snap.document?.edges?.length) {
          hydrate(snap.document);
        } else {
          const { nodes: seedNodes, edges: seedEdges } = seedGraph();
          hydrate({ nodes: seedNodes, edges: seedEdges });
        }
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        const { nodes: seedNodes, edges: seedEdges } = seedGraph();
        hydrate({ nodes: seedNodes, edges: seedEdges });
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [canvasId, hydrate]);

  // Debounced autosave — fires 1.2s after the last change, skips the initial hydrate.
  const savedRef = useRef({ nodes: "", edges: "" });
  useEffect(() => {
    if (!loaded) return;
    const nodeSig = JSON.stringify(nodes.map((n) => [n.id, n.position, n.data]));
    const edgeSig = JSON.stringify(edges);
    if (nodeSig === savedRef.current.nodes && edgeSig === savedRef.current.edges) return;

    dirtyRef.current = true;
    const t = setTimeout(async () => {
      savedRef.current = { nodes: nodeSig, edges: edgeSig };
      dirtyRef.current = false;
      setSaveState("saving");
      try {
        const res = await fetch(`/api/canvas/${canvasId}/snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            document: { nodes, edges },
            baseVersion: baseVersion.current,
          }),
        });
        if (!res.ok) throw new Error(`save ${res.status}`);
        const { version } = (await res.json()) as { version: number };
        baseVersion.current = version;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [nodes, edges, loaded, canvasId]);

  // Track the selected edge to drive the inspector panel; broadcast node selection.
  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      setSelectedEdgeId(selectedEdges[0]?.id ?? null);
      sendPresence({ selection: selectedNodes.map((n) => n.id), cursor: lastCursorRef.current ?? undefined });
    },
    [sendPresence],
  );

  const remoteCursors = Array.from(peers.values())
    .map((peer) => {
      if (!peer.cursor) return null;
      const left = shellRect.left;
      const top = shellRect.top;
      return (
        <div
          key={peer.user.id}
          className={styles.remoteCursor}
          style={{
            left: left + peer.cursor.x * viewport.zoom + viewport.x,
            top: top + peer.cursor.y * viewport.zoom + viewport.y,
          }}
        >
          <span className={styles.cursorArrow} style={{ borderTopColor: peer.user.color }} />
          <span className={styles.cursorTag} style={{ background: peer.user.color }}>
            {peer.user.name}
            {peer.selection?.length ? ` · ${peer.selection.length} selected` : ""}
          </span>
        </div>
      );
    })
    .filter(Boolean);

  return (
    <div className={styles.canvasShell} ref={shellRef} onPointerMove={onShellPointerMove}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onMove={onMove}
        fitView
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background variant={BackgroundVariant.Lines} gap={24} color="#1c2536" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor="#232c3d"
          maskColor="rgba(11, 14, 19, 0.7)"
          style={{ background: "#10141c", border: "1px solid #232c3d" }}
        />
      </ReactFlow>

      <div className={styles.toolbar}>
        <button className="btn btn-ghost" onClick={() => addMemo()}>
          + Memo
        </button>
        <button className="btn btn-ghost" onClick={() => addSource()}>
          + Source
        </button>
        <button
          className={`btn btn-ghost ${aiOpen ? styles.aiActive : ""}`}
          onClick={() => setAiOpen((open) => !open)}
        >
          AI
        </button>
        <span className={styles.peerList} title="Analysts viewing this canvas">
          {Array.from(peers.values()).map((peer) => (
            <span key={peer.user.id} className={styles.peerDot} style={{ background: peer.user.color }} />
          ))}
          {peers.size > 0 ? <span className={styles.peerCount}>{peers.size}</span> : null}
        </span>
        <CanvasExport canvasId={canvasId} />
        <span className={`${styles.saveBadge} ${styles[saveState]}`}>
          {saveState === "saving" ? "saving…" : saveState === "saved" ? "saved" : saveState === "error" ? "save failed" : ""}
        </span>
      </div>

      {remoteCursors}

      {aiOpen ? <AiPanel canvasId={canvasId} onClose={() => setAiOpen(false)} /> : null}

      {selectedEdgeId ? (
        <EdgeInspector
          edgeId={selectedEdgeId}
          onClose={() => setSelectedEdgeId(null)}
        />
      ) : null}
    </div>
  );
}
