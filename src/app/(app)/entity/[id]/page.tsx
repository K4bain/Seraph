/**
 * Entity profile page (T4). Header + four tabs fed by the entity API
 * routes: Overview (key-value grid + AI paragraph), Timeline (dated
 * events), Connections (read-only mini React Flow graph with an
 * "Open in canvas" action), Canvases (containing canvases from DB).
 */

import EntityProfile from "@/components/entity/EntityProfile";

export const metadata = { title: "Entity" };

export default function EntityPage() {
  return <EntityProfile />;
}
