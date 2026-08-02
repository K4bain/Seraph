import Link from "next/link";
import { getDashboardStats } from "@/core/dashboard/stats";

export const dynamic = "force-dynamic";

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  const totalEntities = stats.canvases.reduce((n, c) => n + c.entityCards, 0);
  const totalEvents = stats.canvases.reduce((n, c) => n + c.eventCards, 0);
  const totalProposed = stats.canvases.reduce((n, c) => n + c.proposedEdges, 0);
  const redis = stats.redis;

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
          <div className="stat-value">{stats.canvases.length}</div>
          <div className="stat-note">active investigation boards</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Entities</div>
          <div className="stat-value">{totalEntities}</div>
          <div className="stat-note">entity cards across canvases</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Events</div>
          <div className="stat-value">{totalEvents}</div>
          <div className="stat-note">ingested event cards</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Proposed Edges</div>
          <div className="stat-value">{totalProposed}</div>
          <div className="stat-note">awaiting analyst confirmation</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Connectors</div>
          <div className="stat-value">{stats.connectors.length}</div>
          <div className="stat-note">{stats.connectors.map((c) => c.id).join(", ")}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Queue</div>
          <div className="stat-value">
            {redis.available ? redis.counts?.completed ?? 0 : "—"}
          </div>
          <div className="stat-note">
            {redis.available
              ? `${redis.counts?.waiting ?? 0} waiting · ${redis.counts?.failed ?? 0} failed`
              : "Redis unavailable"}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Connectors</h2>
        <div className="dash-table">
          <div className="dash-row dash-head">
            <span>id</span>
            <span>version</span>
            <span>entity types</span>
          </div>
          {stats.connectors.map((c) => (
            <div key={c.id} className="dash-row">
              <span>
                <span className="mono" style={{ color: "var(--text)" }}>
                  {c.id}
                </span>
                <span className="dash-sub">{c.name}</span>
              </span>
              <span className="mono">{c.version}</span>
              <span className="mono" style={{ color: "var(--text-faint)" }}>
                {c.entityTypes.join(", ")}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Recent Connector Jobs</h2>
        {!redis.available ? (
          <div className="empty-state">
            Redis unavailable (REDIS_URL). Start Redis or use{" "}
            <code>pnpm tsx scripts/run-connector.ts &lt;id&gt;</code> for inline runs.
          </div>
        ) : redis.jobs && redis.jobs.length > 0 ? (
          <div className="dash-table">
            <div className="dash-row dash-head">
              <span>job</span>
              <span>connector</span>
              <span>canvas</span>
              <span>state</span>
              <span>finished</span>
            </div>
            {redis.jobs.map((job) => (
              <div key={job.id} className="dash-row">
                <span className="mono">#{job.id}</span>
                <span className="mono">{job.connectorId}</span>
                <span className="mono">{job.canvasId ?? "—"}</span>
                <span>
                  <span className={`badge badge-${job.state}`}>{job.state}</span>
                </span>
                <span className="mono" style={{ color: "var(--text-faint)" }}>
                  {fmt(job.finishedAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            No jobs yet — trigger one with{" "}
            <code>POST /api/connectors</code> or the run CLI.
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">Recent Canvases</h2>
        {stats.canvases.length === 0 ? (
          <div className="empty-state">
            No canvases yet. Seed demo data with <code>pnpm db:seed</code> or create your first
            canvas.
          </div>
        ) : (
          stats.canvases.map((canvas) => (
            <Link key={canvas.id} href={`/canvas/${canvas.id}`} className="canvas-row">
              <div>
                <div className="canvas-row-title">{canvas.title}</div>
                <div className="canvas-row-meta">
                  {canvas.workspace} · v{canvas.version} · {canvas.entityCards} entities ·{" "}
                  {canvas.eventCards} events · {canvas.edges} edges · updated {fmt(canvas.updatedAt)}
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
