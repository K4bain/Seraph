import Link from "next/link";
import { prisma } from "@/core/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Boxes, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

async function load() {
  return prisma.canvas.findMany({
    include: { workspace: true },
    orderBy: { updatedAt: "desc" },
  });
}

export default async function CanvasListPage() {
  let canvases: Awaited<ReturnType<typeof load>> = [];
  try {
    canvases = await load();
  } catch {
    canvases = [];
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="Workspace"
        eyebrowIcon={Boxes}
        title="Canvases"
        subtitle="Investigation boards — the primary unit of work. Entities, edges and annotations live on a board."
      >
        <Button size="sm" className="gap-1.5" asChild>
          <Link href="/canvas/demo">
            <Plus className="size-4" />
            New Canvas
          </Link>
        </Button>
      </PageHeader>

      {canvases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No canvases yet. Run <code className="font-mono text-foreground">pnpm db:seed</code>{" "}
              for a demo board, or open the demo canvas directly.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {canvases.map((canvas) => (
            <Link key={canvas.id} href={`/canvas/${canvas.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardHeader>
                  <CardTitle className="text-base leading-snug">{canvas.title}</CardTitle>
                  <CardDescription className="font-mono text-xs">
                    {canvas.workspace.name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      updated {canvas.updatedAt.toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                    <span className="font-mono text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      open →
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
