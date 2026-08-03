/**
 * One-off schema application for the Phase 8 search/watchlist tables.
 * `prisma db push` is blocked from this network (TLS reset to Neon),
 * but the app's Prisma client connects fine — so run the generated DDL
 * through it. Idempotent (IF NOT EXISTS).
 */
import "dotenv/config";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaNeonHttp(process.env.DATABASE_URL!, {}),
});

const DDL = [
  `CREATE TABLE IF NOT EXISTS "SearchHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "query" TEXT NOT NULL,
    "type" TEXT,
    "results" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "WatchlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "term" TEXT NOT NULL,
    "type" TEXT,
    "lastCheck" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "WatchlistAlert" (
    "id" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "tone" DOUBLE PRECISION,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchlistAlert_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "SearchHistory_userId_idx" ON "SearchHistory"("userId")`,
  `CREATE INDEX IF NOT EXISTS "SearchHistory_createdAt_idx" ON "SearchHistory"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "WatchlistItem_userId_idx" ON "WatchlistItem"("userId")`,
  `CREATE INDEX IF NOT EXISTS "WatchlistAlert_watchlistId_read_idx" ON "WatchlistAlert"("watchlistId", "read")`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WatchlistAlert_watchlistId_fkey') THEN
       ALTER TABLE "WatchlistAlert" ADD CONSTRAINT "WatchlistAlert_watchlistId_fkey"
         FOREIGN KEY ("watchlistId") REFERENCES "WatchlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
];

async function main() {
  for (const ddl of DDL) {
    try {
      await prisma.$executeRawUnsafe(ddl);
      console.log("ok:", ddl.slice(0, 60));
    } catch (err) {
      console.error("FAILED:", ddl.slice(0, 60));
      console.error(err);
      process.exitCode = 1;
    }
  }
  await prisma.$disconnect();
  console.log("done");
}

main();
