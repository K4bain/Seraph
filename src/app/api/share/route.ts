/**
 * Share link API.
 *
 * POST /api/share            → create a read-only share token for a canvas
 *      { canvasId }          → { token, url }
 *
 * The token IS the capability: anyone with the URL can view the latest
 * snapshot via /share/[token] (no auth — share links are the sharing
 * mechanism by design).
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@/core/db";

const TOKEN_LENGTH = 10;

export async function POST(req: Request) {
  const body = (await req.json()) as { canvasId?: string };
  if (!body.canvasId) {
    return Response.json({ error: "canvasId_required" }, { status: 400 });
  }

  const canvas = await prisma.canvas.findUnique({
    where: { id: body.canvasId },
    select: { id: true, title: true },
  });
  if (!canvas) {
    return Response.json({ error: "canvas_not_found" }, { status: 404 });
  }

  let token = "";
  let created = false;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    token = randomBytes(TOKEN_LENGTH).toString("base64url");
    try {
      await prisma.share.create({ data: { token, canvasId: canvas.id } });
      created = true;
    } catch {
      // token collision — retry with a fresh token
    }
  }
  if (!created) {
    return Response.json({ error: "share_create_failed" }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  return Response.json({ token, url: `${origin}/share/${token}` });
}
