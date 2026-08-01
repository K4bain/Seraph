"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCollabChannel,
  type CollabChannel,
  type PresenceEvent,
  type PresenceUser,
} from "@/core/collab/presence";

const PRESENCE_COLORS = [
  "#5fb3ff",
  "#ff9e64",
  "#9ece6a",
  "#bb9af7",
  "#f7768e",
  "#e0af68",
  "#7dcfff",
  "#c0caf5",
];

/** Stable per-tab identity until real auth lands. */
function buildLocalUser(canvasId: string): PresenceUser {
  let hash = 0;
  for (let i = 0; i < canvasId.length; i++) hash = (hash * 31 + canvasId.charCodeAt(i)) >>> 0;
  const id = `anon-${hash.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const color = PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)]!;
  return { id, name: "Analyst", color };
}

/**
 * Joins the collab channel for a canvas and mirrors remote users'
 * presence into local state. `sendPresence` broadcasts cursor and
 * selection to everyone else on the canvas.
 */
export function useCollabPresence(canvasId: string | null): {
  peers: Map<string, PresenceEvent>;
  sendPresence: (event: Omit<PresenceEvent, "user">) => void;
  user: PresenceUser;
} {
  const [peers, setPeers] = useState<Map<string, PresenceEvent>>(new Map());
  const user = useMemo(() => buildLocalUser(canvasId ?? "default"), [canvasId]);
  const channelRef = useRef<CollabChannel | null>(null);
  const sendRef = useRef<(event: Omit<PresenceEvent, "user">) => void>(() => {});

  useEffect(() => {
    if (!canvasId) return;
    const channel = createCollabChannel();
    channelRef.current = channel;
    channel.join(canvasId, user);
    const off = channel.onPresence(canvasId, (event) => {
      setPeers((prev) => {
        const next = new Map(prev);
        if (event.leaving) next.delete(event.user.id);
        else next.set(event.user.id, event);
        return next;
      });
    });
    sendRef.current = (event) => channel.sendPresence(canvasId, event);
    return () => {
      off();
      channel.leave(canvasId, user.id);
      channelRef.current = null;
    };
  }, [canvasId, user]);

  const sendPresence = useCallback((event: Omit<PresenceEvent, "user">) => {
    sendRef.current(event);
  }, []);

  return { peers, sendPresence, user };
}
