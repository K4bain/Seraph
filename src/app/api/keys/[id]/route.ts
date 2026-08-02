/**
 * DELETE /api/keys/[id] — revoke an API key. Revoked keys are rejected
 * at the MCP door; the row is kept for audit (revokedAt timestamp).
 */

import { prisma } from "@/core/db";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    // findUnique + update, not updateMany: batch writes go through the
    // transactional path, which the Neon HTTP driver rejects.
    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.revokedAt) {
      return Response.json({ error: "not_found", hint: "No active key with that id." }, { status: 404 });
    }
    await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return Response.json({ revoked: true, id });
  } catch {
    return Response.json(
      { error: "revoke_failed", hint: "Could not revoke the key (is DATABASE_URL reachable?)." },
      { status: 500 },
    );
  }
}
