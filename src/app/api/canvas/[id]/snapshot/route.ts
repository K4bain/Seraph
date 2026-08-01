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
import { ensureCanvas } from "@/core/anchor";
import { Prisma } from "@/generated/prisma/client";
import type { CanvasDocument } from "@/store/canvas";

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
    try {
      await ensureCanvas(id, "Untitled Canvas");
    } catch {
      return Response.json({ error: "seed_missing" }, { status: 500 });
    }
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
