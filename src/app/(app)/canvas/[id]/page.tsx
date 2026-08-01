"use client";

import { useParams } from "next/navigation";
import CanvasView from "@/components/canvas/CanvasView";

export default function CanvasPage() {
  const params = useParams<{ id: string }>();

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <CanvasView key={params.id} canvasId={params.id} />
    </div>
  );
}
