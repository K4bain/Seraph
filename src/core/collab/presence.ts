/**
 * Collaborative editing — Phase 2 (presence).
 *
 * Yjs documents per canvas, synced through a y-websocket server
 * (`pnpm collab:server`, default ws://localhost:3001). Presence —
 * identity, cursors, selection — rides the same channel via Yjs
 * awareness. Document CRDT state persistence is intentionally left to
 * the snapshot API; this module only fans out realtime presence.
 */

import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

/** User identity broadcast with every presence update. */
export interface PresenceUser {
  id: string;
  name: string;
  color: string;
}

/** Cursor position in canvas (flow) coordinates. */
export interface CursorState {
  x: number;
  y: number;
}

export interface PresenceEvent {
  user: PresenceUser;
  cursor?: CursorState;
  /** Card ids currently selected by the user. */
  selection?: string[];
  /** Set on disconnect — handlers should drop this user's state. */
  leaving?: boolean;
}

export interface CollabChannel {
  join(canvasId: string, user: PresenceUser): void;
  leave(canvasId: string, userId: string): void;
  sendPresence(canvasId: string, event: Omit<PresenceEvent, "user">): void;
  onPresence(canvasId: string, handler: (event: PresenceEvent) => void): () => void;
}

const DEFAULT_WS_URL = "ws://localhost:3001";
const ROOM_PREFIX = "seraph-canvas";

/** Awareness payload carried for the local client. */
interface AwarenessState {
  user?: PresenceUser;
  cursor?: CursorState;
  selection?: string[];
}

interface Room {
  canvasId: string;
  user: PresenceUser;
  doc: Y.Doc;
  provider: WebsocketProvider;
  handlers: Set<(event: PresenceEvent) => void>;
  /** Last-seen identity per remote client id, needed to emit `leaving`. */
  knownUsers: Map<number, PresenceUser>;
}

/** Browser builds inline only NEXT_PUBLIC_*; WS_SERVER_URL applies to the server side. */
function resolveServerUrl(): string {
  if (typeof process !== "undefined" && typeof process.env !== "undefined") {
    const url = process.env.NEXT_PUBLIC_WS_SERVER_URL ?? process.env.WS_SERVER_URL;
    if (url) return url;
  }
  return DEFAULT_WS_URL;
}

/**
 * In-memory presence channel over y-websocket. One Y.Doc per canvas;
 * awareness carries identity, cursors and selection.
 */
export function createCollabChannel(url: string = resolveServerUrl()): CollabChannel {
  const rooms = new Map<string, Room>();

  function roomName(canvasId: string): string {
    return `${ROOM_PREFIX}-${canvasId}`;
  }

  function emit(room: Room, event: PresenceEvent): void {
    for (const handler of room.handlers) handler(event);
  }

  /** Re-broadcast every known remote state (used when a subscriber joins late). */
  function replayRemotes(room: Room): void {
    const states = room.provider.awareness.getStates() as Map<number, AwarenessState | undefined>;
    for (const [clientId, state] of states) {
      if (clientId === room.provider.awareness.clientID) continue;
      const user = state?.user;
      if (!user) continue;
      room.knownUsers.set(clientId, user);
      emit(room, { user, cursor: state.cursor, selection: state.selection });
    }
  }

  return {
    join(canvasId, user) {
      const existing = rooms.get(canvasId);
      if (existing) {
        existing.user = user;
        existing.provider.awareness.setLocalState({ user });
        return;
      }

      const doc = new Y.Doc();
      const provider = new WebsocketProvider(url, roomName(canvasId), doc);
      const room: Room = { canvasId, user, doc, provider, handlers: new Set(), knownUsers: new Map() };
      rooms.set(canvasId, room);

      provider.awareness.setLocalState({ user });
      provider.awareness.on("change", ({ removed }: { removed: number[] }) => {
        const states = provider.awareness.getStates() as Map<number, AwarenessState | undefined>;
        for (const [clientId, state] of states) {
          if (clientId === provider.awareness.clientID) continue;
          const remoteUser = state?.user;
          if (!remoteUser) continue;
          room.knownUsers.set(clientId, remoteUser);
          emit(room, { user: remoteUser, cursor: state.cursor, selection: state.selection });
        }
        for (const clientId of removed) {
          const user = room.knownUsers.get(clientId);
          if (!user) continue;
          room.knownUsers.delete(clientId);
          emit(room, { user, leaving: true });
        }
      });
    },

    leave(canvasId, userId) {
      const room = rooms.get(canvasId);
      if (!room) return;
      void userId;
      room.handlers.clear();
      room.provider.awareness.setLocalState(null);
      room.provider.destroy();
      room.doc.destroy();
      rooms.delete(canvasId);
    },

    sendPresence(canvasId, event) {
      const room = rooms.get(canvasId);
      if (!room) return;
      room.provider.awareness.setLocalState({
        user: room.user,
        cursor: event.cursor,
        selection: event.selection,
      });
    },

    onPresence(canvasId, handler) {
      const room = rooms.get(canvasId);
      if (!room) return () => {};
      room.handlers.add(handler);
      replayRemotes(room);
      return () => {
        room.handlers.delete(handler);
      };
    },
  };
}
