/**
 * Shared server-side canvas document accessor (Phase 5 lenses).
 * Returns the latest saved snapshot for a canvas without touching
 * client bundles.
 */

import { prisma } from "@/core/db";
import type { CanvasDocument } from "@/store/canvas";

export async function getLatestDocument(
  canvasId: string,
): Promise<{ version: number; document: CanvasDocument | null } | null> {
  const canvas = await prisma.canvas.findUnique({ where: { id: canvasId } });
  if (!canvas) return null;
  const snapshot = await prisma.canvasSnapshot.findFirst({
    where: { canvasId },
    orderBy: { version: "desc" },
  });
  return {
    version: snapshot?.version ?? 0,
    document: (snapshot?.document as unknown as CanvasDocument | null) ?? null,
  };
}
