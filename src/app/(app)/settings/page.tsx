import ApiKeysPanel from "@/components/settings/ApiKeysPanel";
import { KeyRound } from "lucide-react";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <KeyRound className="size-3.5 text-[#f0883e]" aria-hidden />
            Platform
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            API keys for MCP clients (Claude Desktop, Cursor, agents).
          </p>
        </div>
      </div>
      <ApiKeysPanel />
    </div>
  );
}
