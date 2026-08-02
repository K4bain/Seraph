/**
 * API key management.
 *
 * GET  /api/keys        → list keys (never the stored hash)
 * POST /api/keys        → create a key; returns the plaintext token ONCE
 *
 * Keys are revocable (DELETE /api/keys/[id]); revocation is checked on
 * every MCP request. No session auth yet — Phase 2 ships real auth; the
 * management surface currently assumes the operator (same trust domain
 * as the rest of the local/private app).
 */

import { prisma } from "@/core/db";
import { generateApiKey } from "@/core/keys/apiKeys";

export const dynamic = "force-dynamic";

export async function GET() {
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });
  return Response.json({ keys });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) {
    return Response.json({ error: "name_required" }, { status: 400 });
  }

  const generated = generateApiKey();
  try {
    await prisma.apiKey.create({
      data: { id: generated.prefix, name, keyHash: generated.keyHash },
    });
  } catch {
    return Response.json(
      { error: "create_failed", hint: "Could not persist the key (is DATABASE_URL reachable?)." },
      { status: 500 },
    );
  }

  return Response.json(
    {
      key: {
        id: generated.prefix,
        name,
        token: generated.token, // shown exactly once
      },
      note: "Store this token now — it will not be shown again.",
    },
    { status: 201 },
  );
}
