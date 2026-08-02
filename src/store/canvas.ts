/**
 * Canvas state — Zustand + Immer. Server-agnostic store; the canvas
 * page hydrates it from the CanvasSnapshot API (Phase 2 persistence),
 * the Yjs sync layer lands in a later phase.
 */

import { create } from "zustand";
import { produce } from "immer";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
} from "@xyflow/react";
import type {
  CardNodeData,
  CanvasEdgeData,
  IntelligenceCard,
  MemoCard,
  SourceCard,
} from "seraph-graph-types";

export type CardNode = Node<CardNodeData, "intelligence">;
export type RelationEdge = Edge<CanvasEdgeData>;

/** Serialized canvas document (the CanvasSnapshot payload). */
export interface CanvasDocument {
  nodes: CardNode[];
  edges: RelationEdge[];
  /** Bumped by the server on each save; used to avoid overwriting newer snapshots. */
  version?: number;
}

interface CanvasState {
  nodes: CardNode[];
  edges: RelationEdge[];
  onNodesChange: OnNodesChange<CardNode>;
  onEdgesChange: OnEdgesChange<RelationEdge>;
  onConnect: (connection: Connection) => void;
  addCard: (card: IntelligenceCard, position?: { x: number; y: number }) => void;
  addMemo: (position?: { x: number; y: number }) => void;
  addSource: (position?: { x: number; y: number }) => void;
  updateEdgeData: (
    edgeId: string,
    patch: Partial<CanvasEdgeData>,
  ) => void;
  updateCard: (nodeId: string, card: IntelligenceCard) => void;
  hydrate: (doc: CanvasDocument) => void;
  reset: (nodes: CardNode[], edges: RelationEdge[]) => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  nodes: [],
  edges: [],

  onNodesChange: (changes) =>
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),

  onEdgesChange: (changes) =>
    set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),

  onConnect: (connection) => {
    if (!connection.source || !connection.target) return;
    set((state) =>
      produce(state, (draft) => {
        draft.edges.push({
          id: `${connection.source}->${connection.target}`,
          source: connection.source!,
          target: connection.target!,
          type: "intelligence",
          data: { relationship: "linked_to", confidence: 1 },
        });
      }),
    );
  },

  addCard: (card, position) =>
    set((state) =>
      produce(state, (draft) => {
        draft.nodes.push({
          id: card.id,
          type: "intelligence",
          position: position ?? { x: 120, y: 120 },
          data: { card },
        });
      }),
    ),

  addMemo: (position) =>
    set((state) =>
      produce(state, (draft) => {
        const now = new Date().toISOString();
        const id = `memo-${crypto.randomUUID().slice(0, 8)}`;
        const card: MemoCard = {
          id,
          kind: "memo",
          createdAt: now,
          updatedAt: now,
          body: "New memo — double-click to edit.",
        };
        draft.nodes.push({
          id,
          type: "intelligence",
          position: position ?? { x: 140, y: 140 },
          data: { card },
        });
      }),
    ),

  addSource: (position) =>
    set((state) =>
      produce(state, (draft) => {
        const now = new Date().toISOString();
        const id = `src-${crypto.randomUUID().slice(0, 8)}`;
        const card: SourceCard = {
          id,
          kind: "source",
          createdAt: now,
          updatedAt: now,
          title: "Untitled source",
          url: "https://",
        };
        draft.nodes.push({
          id,
          type: "intelligence",
          position: position ?? { x: 140, y: 140 },
          data: { card },
        });
      }),
    ),

  updateEdgeData: (edgeId, patch) =>
    set((state) =>
      produce(state, (draft) => {
        const edge = draft.edges.find((e) => e.id === edgeId);
        if (!edge) return;
        edge.data = { relationship: "linked_to", ...edge.data, ...patch };
      }),
    ),

  updateCard: (nodeId, card) =>
    set((state) =>
      produce(state, (draft) => {
        const node = draft.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        node.data.card = { ...card, updatedAt: new Date().toISOString() };
      }),
    ),

  hydrate: (doc) => set({ nodes: doc.nodes ?? [], edges: doc.edges ?? [] }),

  reset: (nodes, edges) => set({ nodes, edges }),
}));
