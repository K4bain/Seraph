import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { WebSocket } from "ws";

const ROOM = "probe-room";

async function waitConnected(p, ms = 5000) {
  if (p.wsconnected) return;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("connect timeout")), ms);
    p.on("status", (e) => {
      if (e.status === "connected") {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

const docA = new Y.Doc();
const docB = new Y.Doc();
const provA = new WebsocketProvider("ws://localhost:3001", ROOM, docA, { WebSocketPolyfill: WebSocket });
const provB = new WebsocketProvider("ws://localhost:3001", ROOM, docB, { WebSocketPolyfill: WebSocket });

try {
  await Promise.all([waitConnected(provA), waitConnected(provB)]);
  docA.getMap("m").set("hello", "world");

  await new Promise((r) => setTimeout(r, 1500));

  const val = docB.getMap("m").get("hello");
  console.log("A->B sync:", val === "world" ? "OK" : `FAIL (got ${JSON.stringify(val)})`);

  const nameA = Math.random().toString(36).slice(2);
  provA.awareness.setLocalState({ user: { name: nameA, color: "#0f0" }, cursor: { x: 1, y: 2 } });
  await new Promise((r) => setTimeout(r, 800));
  const remote = [...provB.awareness.getStates().entries()].find(([, s]) => s?.user?.name === nameA);
  console.log("awareness:", remote ? `OK (${nameA})` : "FAIL (not seen on B)");

  console.log("yjs versions — A:", Y.lib0?.version ? "lib0" : "?");
} catch (e) {
  console.error("PROBE FAILED:", e.message);
  process.exitCode = 1;
} finally {
  provA.destroy();
  provB.destroy();
  docA.destroy();
  docB.destroy();
}
