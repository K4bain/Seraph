/**
 * POST /api/merge-proposals/apply
 *
 * Applies a confirmed merge: removes the duplicate card, re-points its
 * edges to the primary card, and merges sources/aliases/confidence.
 * Writes a new canvas snapshot version.
 */

import { prisma } from "@/core/db";
import { ensureCanvas } from "@/core/anchor";
import { Prisma } from "@/generated/prisma/client";
import type { CanvasDocument } from "@/store/canvas";
import { applyMerge } from "@/core/merge/proposals";
import { publishFeedEvent } from "@/core/stream/publish";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    canvasId?: unknown;
    primaryId?: unknown;
    duplicateId?: unknown;
  };

  if (typeof body.canvasId !== "string" || !body.canvasId) {
    return Response.json({ error: "canvasId_required" }, { status: 400 });
  }
  if (typeof body.primaryId !== "string" || typeof body.duplicateId !== "string") {
    return Response.json({ error: "primaryId_and_duplicateId_required" }, { status: 400 });
  }
  if (body.primaryId === body.duplicateId) {
    return Response.json({ error: "ids_must_differ" }, { status: 400 });
  }

  try {
    await ensureCanvas(body.canvasId, "Merge proposals");

    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await prisma.canvasSnapshot.findFirst({
        where: { canvasId: body.canvasId },
        orderBy: { version: "desc" },
      });
      const doc = (snapshot?.document as unknown as CanvasDocument | undefined) ?? { nodes: [], edges: [] };
      const version = (snapshot?.version ?? 0) + 1;

      applyMerge(doc, body.primaryId, body.duplicateId);

      try {
        await prisma.canvasSnapshot.create({
          data: {
            canvasId: body.canvasId,
            version,
            document: doc as unknown as Prisma.InputJsonValue,
          },
        });

        void publishFeedEvent({
          kind: "batch",
          id: `merge:${body.canvasId}:${body.primaryId}:${body.duplicateId}:${Date.now().toString(36)}`,
          ts: new Date().toISOString(),
          source: "analyst",
          canvasId: body.canvasId,
          action: "applied",
          summary: {
            cardsCreated: 0,
            cardsUpdated: 1,
            cardsSkipped: 0,
            edgesProposed: 0,
          },
        });

        return Response.json({ applied: true, merged: true });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "P2002" && attempt < 2) continue;
        throw error;
      }
    }

    throw new Error("persistent snapshot conflict");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return Response.json({ error: "merge_failed", detail: message.slice(0, 300) }, { status: 500 });
  }
}
