import ApiKeysPanel from "@/components/settings/ApiKeysPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { KeyRound } from "lucide-react";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="Platform"
        eyebrowIcon={KeyRound}
        title="Settings"
        subtitle="API keys for MCP clients (Claude Desktop, Cursor, agents)."
      />
      <ApiKeysPanel />
    </div>
  );
}
