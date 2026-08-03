import FeedTabs from "@/components/feed/FeedTabs";
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
        subtitle="World events, market signals, and the terms you are tracking."
      />
      <FeedTabs />
    </div>
  );
}
