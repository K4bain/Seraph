/**
 * POST /api/ai/apply-briefing
 *
 * Writes an analyst-confirmed briefing to a canvas as a single memo card
 * (aiGenerated: true). The briefing title, summary, and sections are
 * rendered into the memo body.
 */

import { prisma } from "@/core/db";
import { ensureCanvas } from "@/core/anchor";
import { Prisma } from "@/generated/prisma/client";
import type { CanvasDocument } from "@/store/canvas";
import type { Briefing } from "@/core/ai/tasks/briefing";
import { publishFeedEvent } from "@/core/stream/publish";

export const dynamic = "force-dynamic";

function renderBriefing(briefing: Briefing): string {
  const lines: string[] = [`# ${briefing.title}`, "", briefing.summary, ""];
  for (const section of briefing.sections) {
    lines.push(`## ${section.heading}`, "", section.body, "");
  }
  return lines.join("\n");
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    canvasId?: unknown;
    briefing?: unknown;
  };

  if (typeof body.canvasId !== "string" || !body.canvasId) {
    return Response.json({ error: "canvasId_required" }, { status: 400 });
  }
  const briefing = body.briefing as Partial<Briefing> | undefined;
  if (!briefing || typeof briefing.title !== "string" || typeof briefing.summary !== "string" || !Array.isArray(briefing.sections)) {
    return Response.json({ error: "briefing_required" }, { status: 400 });
  }

  try {
    await ensureCanvas(body.canvasId, "AI briefing");

    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await prisma.canvasSnapshot.findFirst({
        where: { canvasId: body.canvasId },
        orderBy: { version: "desc" },
      });
      const doc = (snapshot?.document as unknown as CanvasDocument | undefined) ?? { nodes: [], edges: [] };
      const version = (snapshot?.version ?? 0) + 1;

      const now = new Date().toISOString();
      const id = `briefing-${crypto.randomUUID().slice(0, 8)}`;
      const placed = (doc.nodes ?? []).length;
      const col = placed % 4;
      const row = Math.floor(placed / 4);
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
            body: renderBriefing(briefing as Briefing),
            aiGenerated: true,
          },
        },
      });

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
          id: `ai:apply-briefing:${body.canvasId}:${Date.now().toString(36)}`,
          ts: new Date().toISOString(),
          source: "ai",
          canvasId: body.canvasId,
          action: "applied",
          summary: {
            cardsCreated: 1,
            cardsUpdated: 0,
            cardsSkipped: 0,
            edgesProposed: 0,
          },
        });

        return Response.json({ applied: true, cardsCreated: 1 });
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
