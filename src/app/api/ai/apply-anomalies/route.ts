/**
 * POST /api/ai/apply-anomalies
 *
 * Writes analyst-confirmed anomaly flags to a canvas as memo cards
 * (aiGenerated: true). Each flag becomes a memo with the label as a
 * heading and the rationale as the body.
 */

import { prisma } from "@/core/db";
import { ensureCanvas } from "@/core/anchor";
import { Prisma } from "@/generated/prisma/client";
import type { CanvasDocument } from "@/store/canvas";
import type { AnomalyFlag } from "@/core/ai/tasks/anomalies";
import { publishFeedEvent } from "@/core/stream/publish";

export const dynamic = "force-dynamic";

const MAX_ANOMALIES = 50;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    canvasId?: unknown;
    anomalies?: unknown;
  };

  if (typeof body.canvasId !== "string" || !body.canvasId) {
    return Response.json({ error: "canvasId_required" }, { status: 400 });
  }
  if (!Array.isArray(body.anomalies)) {
    return Response.json({ error: "anomalies_required" }, { status: 400 });
  }
  if (body.anomalies.length > MAX_ANOMALIES) {
    return Response.json(
      { error: "too_many_items", hint: `Cap is ${MAX_ANOMALIES} anomaly flags.` },
      { status: 400 },
    );
  }

  const flags = body.anomalies as AnomalyFlag[];

  try {
    await ensureCanvas(body.canvasId, "AI anomaly flags");

    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await prisma.canvasSnapshot.findFirst({
        where: { canvasId: body.canvasId },
        orderBy: { version: "desc" },
      });
      const doc = (snapshot?.document as unknown as CanvasDocument | undefined) ?? { nodes: [], edges: [] };
      const version = (snapshot?.version ?? 0) + 1;

      const now = new Date().toISOString();
      let placed = (doc.nodes ?? []).length;
      for (const flag of flags) {
        const col = placed % 4;
        const row = Math.floor(placed / 4);
        const id = `anomaly-${crypto.randomUUID().slice(0, 8)}`;
        doc.nodes.push({
          id,
          type: "intelligence",
          position: { x: 980 + col * 230, y: 60 + row * 170 },
          data: {
            card: {
              id,
              kind: "memo",
              createdAt: now,
              updatedAt: now,
              body: `[${flag.label}] ${flag.rationale} (severity: ${Math.round(flag.severity * 100)}%)`,
              aiGenerated: true,
            },
          },
        });
        placed += 1;
      }

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
          id: `ai:apply-anomalies:${body.canvasId}:${Date.now().toString(36)}`,
          ts: new Date().toISOString(),
          source: "ai",
          canvasId: body.canvasId,
          action: "applied",
          summary: {
            cardsCreated: flags.length,
            cardsUpdated: 0,
            cardsSkipped: 0,
            edgesProposed: 0,
          },
        });

        return Response.json({ applied: true, cardsCreated: flags.length });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "P2002" && attempt < 2) continue;
        throw error;
      }
    }

    throw new Error("persistent snapshot conflict");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return Response.json({ error: "apply_failed", detail: message.slice(0, 300) }, { status: 500 });
  }
}
