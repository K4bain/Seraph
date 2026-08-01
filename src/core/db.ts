/**
 * Prisma client singleton. Server-only.
 *
 * Prisma 7 connects through a driver adapter. Neon (serverless) is
 * reached via @prisma/adapter-neon. We use the HTTP driver
 * (PrismaNeonHttp) because it routes over port 443 via fetch/Upgrade:
 * the native WebSocket transport used by PrismaNeon/neon.Pool fails
 * with a bare ErrorEvent on networks that intercept SNI/TLS (this
 * machine). Cost: HTTP mode has no multi-statement transactions —
 * fine for Phase 1/2; revisit when we need interactive transactions.
 *
 * Never import this from a client component — the generated client is
 * Node-only and would leak into the browser bundle.
 */

import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://meridian:password@localhost:5432/meridian";
  const adapter = new PrismaNeonHttp(connectionString, {});
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
