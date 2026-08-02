/**
 * Seed script — creates a demo user, workspace, and canvas.
 * Run with: pnpm db:seed
 *
 * Uses find-or-create instead of upsert: the Neon HTTP driver
 * (see src/core/db.ts) has no transactions, and Prisma 7 wraps
 * upsert in one. Idempotent either way.
 */

import "dotenv/config";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaNeonHttp(
    process.env.DATABASE_URL ??
      "postgresql://seraph:password@localhost:5432/seraph",
    {},
  ),
});

async function main() {
  const user =
    (await prisma.user.findUnique({ where: { email: "analyst@seraph.local" } })) ??
    (await prisma.user.create({
      data: {
        name: "Demo Analyst",
        email: "analyst@seraph.local",
      },
    }));

  const workspace =
    (await prisma.workspace.findUnique({ where: { slug: "demo" } })) ??
    (await prisma.workspace.create({
      data: {
        slug: "demo",
        name: "Demo Workspace",
      },
    }));

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
  });
  if (!membership) {
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "OWNER",
      },
    });
  } else if (membership.role !== "OWNER") {
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      data: { role: "OWNER" },
    });
  }

  await (prisma.canvas.findUnique({ where: { id: "demo" } }) ??
    prisma.canvas.create({
      data: {
        id: "demo",
        workspaceId: workspace.id,
        createdById: user.id,
        title: "Starter Canvas",
        description:
          "The investigation board — every entity is a node, every relationship is an edge.",
      },
    }));

  console.log("Seed complete: analyst@seraph.local / workspace 'demo' / canvas 'Starter Canvas'");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
