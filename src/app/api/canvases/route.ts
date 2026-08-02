import { prisma } from "@/core/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const canvases = await prisma.canvas.findMany({
    select: { id: true, title: true, description: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return Response.json({ canvases });
}
