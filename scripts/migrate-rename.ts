/**
 * One-time data migration for the Meridian → Seraph rename.
 *
 * Rewrites persisted payloads that carry the old brand as a DATA
 * contract (the code rename is a git operation; this fixes the rows):
 *
 *   1. Every CanvasSnapshot.document JSON: renames the `meridianId`
 *      key to `seraphId` (recursively) and rewrites the schema tag
 *      `meridian.canvas.v1` → `seraph.canvas.v1`.
 *   2. Demo user email `analyst@meridian.local` → `analyst@seraph.local`
 *      (auth stub anchors on this address, see src/core/anchor.ts).
 *
 * Idempotent: rows that already match the new contract are left
 * untouched. Run against the live DB: `pnpm tsx scripts/migrate-rename.ts`
 */

import "dotenv/config";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaNeonHttp(
    process.env.DATABASE_URL ?? "postgresql://seraph:password@localhost:5432/seraph",
    { arrayMode: false },  ),
});

function rewriteKey(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteKey);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = k === "meridianId" ? "seraphId" : k;
      out[next] = rewriteKey(v);
    }
    return out;
  }
  if (typeof value === "string") {
    return value.replaceAll("meridian.canvas.v1", "seraph.canvas.v1");
  }
  return value;
}

async function main() {
  const snapshots = await prisma.canvasSnapshot.findMany({ select: { id: true, document: true } });
  let updated = 0;
  for (const s of snapshots) {
    const rewritten = rewriteKey(s.document);
    if (JSON.stringify(rewritten) !== JSON.stringify(s.document)) {
      await prisma.canvasSnapshot.update({ where: { id: s.id }, data: { document: rewritten as object } });
      updated++;
    }
  }
  console.log(`snapshots migrated: ${updated}/${snapshots.length}`);

  // updateMany is transactional on the HTTP driver; do a single-row update.
  const user = await prisma.user.findUnique({ where: { email: "analyst@meridian.local" } });
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { email: "analyst@seraph.local" } });
    console.log("users renamed: 1");
  } else {
    console.log("users renamed: 0 (already migrated)");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
