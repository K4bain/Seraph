/**
 * Prisma client re-export.
 *
 * The canonical singleton lives in `@/lib/db` (PostgreSQL adapter + tenant
 * isolation extension). This module re-exports it under the conventional
 * `@/lib/prisma` path so feature code and tests can depend on a stable import
 * specifier without reaching into db.ts internals.
 */
export { prisma } from "@/wwv/lib/db";
