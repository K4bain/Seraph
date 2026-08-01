export default function SystemPage() {
  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">System</h1>
          <p className="page-subtitle">Infrastructure status — PostgreSQL/AGE, Redis, MinIO, queues.</p>
        </div>
      </header>
      <div className="empty-state">
        API health probe lives at <code>/api/health</code>. A full status panel arrives with the
        connector dashboard.
      </div>
    </div>
  );
}
