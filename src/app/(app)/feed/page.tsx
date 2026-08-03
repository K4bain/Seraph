import FeedPanel from "@/components/feed/FeedPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { Radio } from "lucide-react";

export const dynamic = "force-dynamic";

export default function FeedPage() {
  return (
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="Platform"
        eyebrowIcon={Radio}
        title="Live Feed"
        subtitle="Connector, AI and MCP ingestion activity in real time (SSE)."
      />
      <FeedPanel />
    </div>
  );
}
