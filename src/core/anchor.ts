/**
 * Demo workspace/user anchor — the bootstrap identity used until real
 * auth lands. Lazy canvas creation and server-side ingestion both
 * attribute their writes to this placeholder user.
 */

import { prisma } from "@/core/db";

export async function demoAnchor() {
  const workspace = await prisma.workspace.findUnique({ where: { slug: "demo" } });
  const user = await prisma.user.findUnique({ where: { email: "analyst@seraph.local" } });
  return { workspaceId: workspace?.id, userId: user?.id };
}

/** Create the canvas row if missing (attributes it to the demo anchor). */
export async function ensureCanvas(canvasId: string, title: string): Promise<void> {
  const existing = await prisma.canvas.findUnique({ where: { id: canvasId } });
  if (existing) return;
  const { workspaceId, userId } = await demoAnchor();
  if (!workspaceId || !userId) {
    throw new Error("seed_missing: run `pnpm db:seed` first");
  }
  await prisma.canvas.create({
    data: { id: canvasId, workspaceId, createdById: userId, title },
  });
}
