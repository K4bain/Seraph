import Link from "next/link";
import { prisma } from "@/core/db";

export const dynamic = "force-dynamic";

async function loadCanvases() {
  try {
    return await prisma.canvas.findMany({
      include: { workspace: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    });
  } catch {
    // Database not reachable (e.g. docker compose not running) —
    // surface the empty state rather than crashing the dashboard.
    return null;
  }
}

export default async function DashboardPage() {
  const canvases = await loadCanvases();

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Every entity is a node, every relationship is an edge.
          </p>
        </div>
        <Link href="/canvas/demo" className="btn btn-accent">
          New Canvas
        </Link>
      </header>

      <section className="stat-grid">
        <div className="stat-tile">
          <div className="stat-label">Canvases</div>
          <div className="stat-value">{canvases ? canvases.length : "—"}</div>
          <div className="stat-note">active investigation boards</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Entities</div>
          <div className="stat-value">0</div>
          <div className="stat-note">graph nodes · Phase 3 connectors</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Connectors</div>
          <div className="stat-value">0</div>
          <div className="stat-note">OpenSanctions, GDELT, EDGAR inbound</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">AI Proposals</div>
          <div className="stat-value">0</div>
          <div className="stat-note">pending analyst confirmation</div>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Recent Canvases</h2>
        {canvases === null ? (
          <div className="empty-state">
            Database unreachable. Start it with <code>docker compose up -d</code> then{" "}
            <code>pnpm db:push</code>.
          </div>
        ) : canvases.length === 0 ? (
          <div className="empty-state">
            No canvases yet. Seed demo data with <code>pnpm db:seed</code> or create your first
            canvas.
          </div>
        ) : (
          canvases.map((canvas) => (
            <Link key={canvas.id} href={`/canvas/${canvas.id}`} className="canvas-row">
              <div>
                <div className="canvas-row-title">{canvas.title}</div>
                <div className="canvas-row-meta">
                  {canvas.workspace.name} · {canvas.updatedAt.toISOString().slice(0, 16)}
                </div>
              </div>
              <div className="mono" style={{ color: "var(--text-faint)" }}>
                open →
              </div>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
