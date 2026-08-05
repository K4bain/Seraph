"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./ApiKeysPanel.module.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, Copy, KeyRound } from "lucide-react";

interface ApiKeyRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface CreatedKey {
  id: string;
  name: string;
  token: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"token" | "config" | null>(null);
  const endpoint =
    typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/keys");
      if (!res.ok) return;
      const body = (await res.json()) as { keys: ApiKeyRow[] };
      setKeys(body.keys);
    } catch {
      /* panel stays empty on failure */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = (await res.json()) as { key?: CreatedKey; error?: string; hint?: string };
      if (res.ok && body.key) {
        setCreated(body.key);
        setName("");
        await load();
      } else {
        setError(body.hint ?? body.error ?? "Create failed");
      }
    } catch {
      setError("Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, which: "token" | "config") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  const clientConfig = `# ~/.config/claude/claude_desktop_config.json
{
  "mcpServers": {
    "seraph": {
      "type": "http",
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer <your seraph_ key>" }
    }
  }
}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider">
          <KeyRound className="size-4 text-[#f0883e]" aria-hidden />
          API Keys
        </CardTitle>
        <CardDescription>
          Machine credentials for the MCP endpoint. Only a hash of each key is stored — the token is
          shown exactly once at creation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
            }}
            placeholder="Key name, e.g. claude-desktop"
            disabled={busy}
            className="max-w-xs"
          />
          <Button
            size="sm"
            onClick={() => void create()}
            disabled={busy || !name.trim()}
            className="bg-[#f0883e] text-[#0b0f17] hover:bg-[#f0883e]/90"
          >
            Create key
          </Button>
        </div>

        {error && <p className="font-mono text-xs text-destructive">{error}</p>}

        {created && (
          <div className="rounded-lg border border-[#f0883e]/40 bg-[#f0883e]/[0.06] p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Key created — copy it now, it will not be shown again:
            </p>
            <div className="flex items-center gap-2">
              <code className={styles.token}>{created.token}</code>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1.5 text-xs"
                onClick={() => void copy(created.token, "token")}
              >
                {copied === "token" ? (
                  <Check className="size-3.5 text-emerald-400" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
                {copied === "token" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 px-3 font-mono text-[10px] uppercase tracking-wider">Name</TableHead>
                <TableHead className="h-9 px-3 font-mono text-[10px] uppercase tracking-wider">Id</TableHead>
                <TableHead className="h-9 px-3 font-mono text-[10px] uppercase tracking-wider">Created</TableHead>
                <TableHead className="h-9 px-3 font-mono text-[10px] uppercase tracking-wider">Last used</TableHead>
                <TableHead className="h-9 px-3 font-mono text-[10px] uppercase tracking-wider">Status</TableHead>
                <TableHead className="h-9 px-3 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-8 text-center font-mono text-xs text-muted-foreground">
                    no keys yet — create one above to enable MCP clients
                  </TableCell>
                </TableRow>
              )}
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="px-3 text-sm">{k.name}</TableCell>
                  <TableCell className="px-3 font-mono text-xs text-muted-foreground">{k.id}</TableCell>
                  <TableCell className="px-3 font-mono text-xs text-muted-foreground">{fmtDate(k.createdAt)}</TableCell>
                  <TableCell className="px-3 font-mono text-xs text-muted-foreground">
                    {k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "—"}
                  </TableCell>
                  <TableCell className="px-3">
                    {k.revokedAt ? (
                      <Badge variant="outline" className="border-border font-mono text-[10px] uppercase text-muted-foreground">
                        revoked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 font-mono text-[10px] uppercase text-emerald-300">
                        active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="px-3 text-right">
                    {!k.revokedAt && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => void revoke(k.id)}
                        disabled={busy}
                      >
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-2">
          <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            MCP client config
          </h3>
          <p className="text-xs text-muted-foreground">
            Point an MCP client (Claude Desktop, Cursor, ...) at Seraph with a key:
          </p>
          <div className={styles.codeBlock}>
            <button className={styles.copyBtn} onClick={() => void copy(clientConfig, "config")}>
              {copied === "config" ? "Copied" : "Copy config"}
            </button>
            <pre>{clientConfig}</pre>
          </div>
          <p className="text-xs text-muted-foreground">
            Endpoint: <code className={styles.inlineCode}>{endpoint}</code>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
