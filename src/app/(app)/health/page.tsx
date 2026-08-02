import { getSystemStatus } from "@/core/dashboard/stats";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const status = await getSystemStatus();
  const redis = status.redis.available ? status.redis.counts : null;

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">System</h1>
          <p className="page-subtitle">Infrastructure status — PostgreSQL, Redis, AGE, connectors.</p>
        </div>
      </header>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-label">Database</div>
          <div className="stat-value">{status.db.ok ? "ok" : "down"}</div>
          <div className="stat-note">
            {status.db.ok
              ? `${status.db.latencyMs ?? "?"} ms probe latency`
              : status.db.error ?? "unreachable"}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Redis / BullMQ</div>
          <div className="stat-value">{status.redis.available ? "ok" : "down"}</div>
          <div className="stat-note">
            {redis
              ? `${redis.waiting} waiting · ${redis.active} active · ${redis.delayed} delayed · ${redis.completed} completed · ${redis.failed} failed`
              : "queue unavailable (REDIS_URL not reachable)"}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">AGE graph</div>
          <div className="stat-value">{status.age.enabled ? "on" : "off"}</div>
          <div className="stat-note">
            {status.age.enabled
              ? `import enabled · ${status.age.labels.join(", ")}`
              : "ENABLE_GRAPH_IMPORT not set — canvas store is the source of truth"}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">Connectors</div>
          <div className="stat-value">{status.connectors.length}</div>
          <div className="stat-note">{status.connectors.map((c) => c.id).join(" · ")}</div>
        </div>
      </div>

      {redis ? (
        <table className="dash-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Connector</th>
              <th>State</th>
              <th>Finished</th>
              <th>Last log</th>
            </tr>
          </thead>
          <tbody>
            {status.redis.jobs && status.redis.jobs.length > 0 ? (
              status.redis.jobs.map((job) => (
                <tr key={job.id}>
                  <td className="mono">#{job.id}</td>
                  <td>{job.connectorId}</td>
                  <td>
                    <span className={`badge badge-${job.state}`}>{job.state}</span>
                  </td>
                  <td className="dash-sub">
                    {job.finishedAt ? new Date(job.finishedAt).toLocaleString() : "—"}
                  </td>
                  <td className="dash-sub">{job.lastLog ?? "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="dash-sub">
                  No connector jobs yet — run one from the connectors page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ) : null}

      <div className="dash-row">
        <span className="dash-sub">
          Health probe: <code className="mono">GET /api/health</code> returns{" "}
          <code className="mono">{"{ ok: true }"}</code> when the process is up.
        </span>
      </div>
    </div>
  );
}
