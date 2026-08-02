"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./ApiKeysPanel.module.css";

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
    <div className="panel">
      <h2 className="panel-title">API Keys</h2>
      <p className={styles.hint}>
        Machine credentials for the MCP endpoint. Only a hash of each key is
        stored — the token is shown exactly once at creation.
      </p>

      <div className={styles.createRow}>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name, e.g. claude-desktop"
          disabled={busy}
        />
        <button className="btn" onClick={() => void create()} disabled={busy || !name.trim()}>
          Create key
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {created && (
        <div className={styles.created}>
          <div className={styles.createdLabel}>
            Key created — copy it now, it will not be shown again:
          </div>
          <div className={styles.tokenRow}>
            <code className={styles.token}>{created.token}</code>
            <button className="btn btn-small" onClick={() => void copy(created.token, "token")}>
              {copied === "token" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Id</th>
            <th>Created</th>
            <th>Last used</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {keys.length === 0 && (
            <tr>
              <td colSpan={6} className={styles.empty}>
                No keys yet. Create one above to enable MCP clients.
              </td>
            </tr>
          )}
          {keys.map((k) => (
            <tr key={k.id}>
              <td>{k.name}</td>
              <td className="mono">{k.id}</td>
              <td className="mono">{new Date(k.createdAt).toLocaleDateString()}</td>
              <td className="mono">
                {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "—"}
              </td>
              <td className={k.revokedAt ? styles.revoked : styles.active}>
                {k.revokedAt ? "revoked" : "active"}
              </td>
              <td>
                {!k.revokedAt && (
                  <button
                    className={`btn btn-small ${styles.revokeBtn}`}
                    onClick={() => void revoke(k.id)}
                    disabled={busy}
                  >
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className={styles.sectionTitle}>MCP client config</h3>
      <p className={styles.hint}>
        Point an MCP client (Claude Desktop, Cursor, ...) at Seraph with a key:
      </p>
      <div className={styles.codeBlock}>
        <button
          className={`btn btn-small ${styles.copyBtn}`}
          onClick={() => void copy(clientConfig, "config")}
        >
          {copied === "config" ? "Copied" : "Copy config"}
        </button>
        <pre>{clientConfig}</pre>
      </div>
      <div className={styles.hint}>
        Endpoint: <code className="mono">{endpoint}</code>
      </div>
    </div>
  );
}
