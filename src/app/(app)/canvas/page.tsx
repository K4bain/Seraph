import Link from "next/link";
import { prisma } from "@/core/db";

export const dynamic = "force-dynamic";

export default async function CanvasListPage() {
  let canvases: Awaited<ReturnType<typeof load>> = [];
  try {
    canvases = await load();
  } catch {
    canvases = [];
  }

  async function load() {
    return prisma.canvas.findMany({
      include: { workspace: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Canvases</h1>
          <p className="page-subtitle">Investigation boards — the primary unit of work.</p>
        </div>
        <Link href="/canvas/demo" className="btn btn-accent">
          New Canvas
        </Link>
      </header>

      {canvases.length === 0 ? (
        <div className="empty-state">
          No canvases yet. Run <code>pnpm db:seed</code> for a demo board, or open the demo
          canvas directly.
        </div>
      ) : (
        canvases.map((canvas) => (
          <Link key={canvas.id} href={`/canvas/${canvas.id}`} className="canvas-row">
            <div>
              <div className="canvas-row-title">{canvas.title}</div>
              <div className="canvas-row-meta">
                {canvas.workspace.name} · updated {canvas.updatedAt.toISOString().slice(0, 16)}
              </div>
            </div>
            <div className="mono" style={{ color: "var(--text-faint)" }}>
              open →
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
