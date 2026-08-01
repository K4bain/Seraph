/**
 * Canvas snapshot persistence.
 *
 * GET  /api/canvas/[id]/snapshot → latest saved document (empty when the
 *      canvas has no saved state yet — the client seeds a starter board)
 * POST /api/canvas/[id]/snapshot → save a new version (doc + expected base version)
 *
 * A missing canvas row is created lazily on first save: any URL path is a
 * valid new canvas ("New Canvas" lands on /canvas/demo and bootstraps itself).
 *
 * Optimistic concurrency: the client sends the `version` it was built on;
 * if the server's latest version differs, the write is rejected (409) so
 * a stale client can't clobber newer work. This is a light guard —
 * interactive multi-user sync is Yjs in a later phase.
 *
 * The Neon HTTP driver cannot run transactions, so version assignment is
 * read-then-insert; the unique (canvasId, version) constraint keeps it safe.
 */

import { prisma } from "@/core/db";
import { Prisma } from "@/generated/prisma/client";
import type { CanvasDocument } from "@/store/canvas";

/** Demo workspace/user anchor — replaced by real auth in a later phase. */
async function demoAnchor() {
  const workspace = await prisma.workspace.findUnique({ where: { slug: "demo" } });
  const user = await prisma.user.findUnique({ where: { email: "analyst@meridian.local" } });
  return { workspaceId: workspace?.id, userId: user?.id };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const snapshot = await prisma.canvasSnapshot.findFirst({
    where: { canvasId: id },
    orderBy: { version: "desc" },
  });

  return Response.json({
    version: snapshot?.version ?? 0,
    document: snapshot?.document ?? null,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as {
    document?: CanvasDocument;
    baseVersion?: number;
  };

  if (!body.document) {
    return Response.json({ error: "document_required" }, { status: 400 });
  }

  // Lazy canvas creation on first save.
  const existing = await prisma.canvas.findUnique({ where: { id } });
  if (!existing) {
    const { workspaceId, userId } = await demoAnchor();
    if (!workspaceId || !userId) {
      return Response.json({ error: "seed_missing" }, { status: 500 });
    }
    await prisma.canvas.create({
      data: {
        id,
        workspaceId,
        createdById: userId,
        title: "Untitled Canvas",
      },
    });
  }

  const latest = await prisma.canvasSnapshot.findFirst({
    where: { canvasId: id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const currentVersion = latest?.version ?? 0;

  if (body.baseVersion !== undefined && body.baseVersion !== currentVersion) {
    return Response.json(
      { error: "version_conflict", currentVersion, clientVersion: body.baseVersion },
      { status: 409 },
    );
  }

  const version = currentVersion + 1;
  await prisma.canvasSnapshot.create({
    data: {
      canvasId: id,
      version,
      document: body.document as unknown as Prisma.InputJsonValue,
    },
  });

  return Response.json({ version });
}
