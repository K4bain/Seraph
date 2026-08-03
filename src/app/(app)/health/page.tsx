import { getSystemStatus } from "@/core/dashboard/stats";
import { PageHeader } from "@/components/layout/PageHeader";
import { JobStateBadge } from "@/components/dashboard/JobStateBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Server, CircleDot, Database, Boxes, Cable } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const status = await getSystemStatus();
  const redis = status.redis.available ? status.redis.counts : null;

  const tiles = [
    {
      label: "Database",
      icon: Database,
      value: status.db.ok ? "ok" : "down",
      ok: status.db.ok,
      note: status.db.ok
        ? `${status.db.latencyMs ?? "?"} ms probe latency`
        : status.db.error ?? "unreachable",
    },
    {
      label: "Redis / BullMQ",
      icon: Cable,
      value: status.redis.available ? "ok" : "down",
      ok: status.redis.available,
      note: redis
        ? `${redis.waiting} waiting · ${redis.active} active · ${redis.delayed} delayed · ${redis.completed} completed · ${redis.failed} failed`
        : "queue unavailable (REDIS_URL not reachable)",
    },
    {
      label: "AGE Graph",
      icon: Boxes,
      value: status.age.enabled ? "on" : "off",
      ok: status.age.enabled,
      note: status.age.enabled
        ? `import enabled · ${status.age.labels.join(", ")}`
        : "ENABLE_GRAPH_IMPORT not set — canvas store is the source of truth",
    },
    {
      label: "Connectors",
      icon: Server,
      value: String(status.connectors.length),
      ok: status.connectors.length > 0,
      note: status.connectors.map((c) => c.id).join(" · "),
    },
  ];

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="Platform"
        title="System"
        subtitle="Infrastructure status — PostgreSQL, Redis, AGE, connectors."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Card key={tile.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription>{tile.label}</CardDescription>
                <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
                    {tile.value}
                  </div>
                  <CircleDot
                    className={`size-3 ${
                      tile.ok ? "text-emerald-500" : "text-destructive"
                    }`}
                  />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tile.note}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {redis ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Connector Jobs</CardTitle>
            <CardDescription>
              Last runs on <code className="font-mono">seraph-connectors</code>, newest first.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Connector</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Last log</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.redis.jobs && status.redis.jobs.length > 0 ? (
                  status.redis.jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-xs">#{job.id}</TableCell>
                      <TableCell className="font-mono text-xs">{job.connectorId}</TableCell>
                      <TableCell>{<JobStateBadge state={job.state} />}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {job.finishedAt ? new Date(job.finishedAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="max-w-72 truncate text-xs text-muted-foreground">
                        {job.lastLog ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      No connector jobs yet — run one from the connectors page.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <p className="font-mono text-xs text-muted-foreground">
        Health probe: <code className="text-foreground">GET /api/health</code> returns{" "}
        <code className="text-foreground">{"{ ok: true }"}</code> when the process is up.
      </p>
    </div>
  );
}
