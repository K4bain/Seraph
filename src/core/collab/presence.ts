/**
 * Collaborative editing — Phase 2.
 *
 * Planned implementation: Yjs CRDT documents per canvas, synced
 * through a y-websocket server (WS_SERVER_URL) with a custom in-memory
 * store that snapshots to the relational `CanvasSnapshot` table on
 * save. Presence (cursors, selection) rides the same channel.
 *
 * Until then this module only defines the shapes the rest of the app
 * can code against.
 */

/** User identity broadcast with every presence update. */
export interface PresenceUser {
  id: string;
  name: string;
  color: string;
}

/** Cursor position over a canvas viewport. */
export interface CursorState {
  x: number;
  y: number;
}

export interface PresenceEvent {
  user: PresenceUser;
  cursor?: CursorState;
  /** Card ids currently selected by the user. */
  selection?: string[];
}

export interface CollabChannel {
  join(canvasId: string, user: PresenceUser): void;
  leave(canvasId: string, userId: string): void;
  sendPresence(canvasId: string, event: Omit<PresenceEvent, "user">): void;
  onPresence(canvasId: string, handler: (event: PresenceEvent) => void): () => void;
}

/** Placeholder — no-op until Phase 2 wiring. */
export function createCollabChannel(url: string = process.env.WS_SERVER_URL ?? "ws://localhost:3001"): CollabChannel {
  // Phase 2: connect a y-websocket provider to `url` and hydrate presence events.
  void url;
  return {
    join() {},
    leave() {},
    sendPresence() {},
    onPresence() {
      return () => {};
    },
  };
}
