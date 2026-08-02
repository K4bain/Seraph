import ApiKeysPanel from "@/components/settings/ApiKeysPanel";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            API keys for MCP clients (Claude Desktop, Cursor, agents).
          </p>
        </div>
      </header>
      <ApiKeysPanel />
    </div>
  );
}
