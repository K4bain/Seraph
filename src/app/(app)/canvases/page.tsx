import { redirect } from "next/navigation";

/** /canvases is the canonical canvas-list route (T6 route map). */
export default function CanvasesAlias() {
  redirect("/canvas");
}
