/**
 * Canvas snapshot loader — shared by the AI worker and API routes.
 *
 * Returns the latest CanvasDocument for a canvas id, or an empty document
 * when the canvas has no snapshots yet. Server-only (Prisma).
 */

import { prisma } from "@/core/db";
import type { CanvasDocument } from "@/store/canvas";

export async function loadLatestCanvasDoc(canvasId: string): Promise<CanvasDocument> {
  const snapshot = await prisma.canvasSnapshot.findFirst({
    where: { canvasId },
    orderBy: { version: "desc" },
  });
  return (snapshot?.document as unknown as CanvasDocument | undefined) ?? { nodes: [], edges: [] };
}