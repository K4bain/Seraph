import FeedPanel from "@/components/feed/FeedPanel";

export const dynamic = "force-dynamic";

export default function FeedPage() {
  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Live Feed</h1>
          <p className="page-subtitle">
            Connector, AI and MCP ingestion activity in real time (SSE).
          </p>
        </div>
      </header>
      <FeedPanel />
    </div>
  );
}
