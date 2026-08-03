import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Boxes,
  Cable,
  Gauge,
  GitBranchPlus,
  Network,
  Plus,
  Sparkles,
} from "lucide-react";
import { getDashboardStats } from "@/core/dashboard/stats";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ActivityTrend from "@/components/dashboard/ActivityTrend";
import { JobStateBadge } from "@/components/dashboard/JobStateBadge";

export const dynamic = "force-dynamic";

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  const totalEntities = stats.canvases.reduce((n, c) => n + c.entityCards, 0);
  const totalEvents = stats.canvases.reduce((n, c) => n + c.eventCards, 0);
  const totalProposed = stats.canvases.reduce((n, c) => n + c.proposedEdges, 0);
  const redis = stats.redis;

  const kpis = [
    {
      label: "Canvases",
      value: String(stats.canvases.length),
      note: "active investigation boards",
      icon: Boxes,
    },
    {
      label: "Entities",
      value: String(totalEntities),
      note: "entity cards across canvases",
      icon: Network,
    },
    {
      label: "Events",
      value: String(totalEvents),
      note: "ingested event cards",
      icon: Activity,
    },
    {
      label: "Proposed Edges",
      value: String(totalProposed),
      note: "awaiting analyst confirmation",
      icon: GitBranchPlus,
    },
    {
      label: "Connectors",
      value: String(stats.connectors.length),
      note: "sources live in the registry",
      icon: Cable,
    },
  ];

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            Command Center
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every entity is a node, every relationship is an edge. This is the graph you&apos;re
            building.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant={redis.available ? "default" : "destructive"}
            className="gap-1.5 font-mono text-[10px] uppercase tracking-wider"
          >
            <span className="relative flex size-2">
              {redis.available ? (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              ) : null}
              <span
                className={`relative inline-flex size-2 rounded-full ${
                  redis.available ? "bg-emerald-500" : "bg-destructive"
                }`}
              />
            </span>
            {redis.available ? "queue live" : "queue down"}
          </Badge>
          <Button size="sm" className="gap-1.5" asChild>
            <Link href="/canvas/demo">
              <Plus className="size-4" />
              New Canvas
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="group relative overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription>{kpi.label}</CardDescription>
                <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
              </CardHeader>
              <CardContent>
                <div className="font-mono text-3xl font-semibold tabular-nums tracking-tight">
                  {kpi.value}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{kpi.note}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* trend + queue */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Ingestion Activity</CardTitle>
              <CardDescription>
                24-point rolling window of entities ingested vs failed jobs across the platform.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityTrend
                completed={redis.counts?.completed ?? 0}
                failed={redis.counts?.failed ?? 0}
                waiting={redis.counts?.waiting ?? 0}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Queue State</CardTitle>
              <CardDescription>BullMQ pressure on seraph-connectors</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {redis.available && redis.counts ? (
                <>
                  {(
                    [
                      ["waiting", redis.counts.waiting, "hsl(217 78% 57%)"],
                      ["active", redis.counts.active, "hsl(158 72% 52%)"],
                      ["delayed", redis.counts.delayed, "hsl(262 72% 66%)"],
                      ["completed", redis.counts.completed, "hsl(189 70% 55%)"],
                      ["failed", redis.counts.failed, "hsl(355 70% 62%)"],
                    ] as const
                  ).map(([label, value, color]) => {
                    const total = Math.max(
                      1,
                      redis.counts!.waiting +
                        redis.counts!.active +
                        redis.counts!.delayed +
                        redis.counts!.completed +
                        redis.counts!.failed,
                    );
                    const pct = Math.round((value / total) * 100);
                    return (
                      <div key={label} className="space-y-1">
                        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                          <span>{label}</span>
                          <span className="tabular-nums text-foreground">{value}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Redis unavailable — start Redis or set{" "}
                  <code className="font-mono">REDIS_URL</code>.
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Gauge className="size-3.5" />
                  Throughput
                </span>
                <span className="text-emerald-400">nominal</span>
              </div>
            </CardContent>
          </Card>
        </div>

      {/* connectors registry */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm font-semibold">Connector Registry</CardTitle>
            <CardDescription className="mt-1">
              Sources wired into the platform — pick a connector to point it at a canvas.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href="/connectors">
              Manage
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {stats.connectors.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
              No connectors registered.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {stats.connectors.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between rounded-lg border bg-card p-3.5 transition-colors hover:border-border"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs font-semibold">{c.id}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.name}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.entityTypes.slice(0, 3).map((t) => (
                        <Badge
                          key={t}
                          variant="secondary"
                          className="font-mono text-[9px] uppercase tracking-wider"
                        >
                          {t}
                        </Badge>
                      ))}
                      {c.entityTypes.length > 3 ? (
                        <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-wider">
                          +{c.entityTypes.length - 3}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">
                    v{c.version}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* jobs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Recent Connector Jobs</CardTitle>
          <CardDescription className="mt-1">
            Last six completed or failed runs, newest first. Logs stream live on the{" "}
            <Link href="/feed" className="text-primary underline underline-offset-4">
              feed
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!redis.available ? (
            <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
              Redis unavailable (<code className="font-mono">REDIS_URL</code>). Start Redis or use{" "}
              <code className="font-mono">pnpm tsx scripts/run-connector.ts &lt;id&gt;</code> for
              inline runs.
            </div>
          ) : redis.jobs && redis.jobs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">job</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">connector</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">canvas</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-wider">state</TableHead>
                  <TableHead className="hidden sm:table-cell font-mono text-[10px] uppercase tracking-wider">
                    finished
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {redis.jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">#{job.id}</TableCell>
                    <TableCell className="font-mono text-xs">{job.connectorId}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {job.canvasId ?? "—"}
                    </TableCell>
                    <TableCell>{<JobStateBadge state={job.state} />}</TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                      {fmt(job.finishedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
              No jobs yet — trigger one with <code className="font-mono">POST /api/connectors</code>{" "}
              or the run CLI.
            </div>
          )}
        </CardContent>
      </Card>

      {/* recent canvases */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm font-semibold">Recent Canvases</CardTitle>
            <CardDescription className="mt-1">
              Open a board to keep building — entities, edges and annotations included.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/canvas">All canvases</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {stats.canvases.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
              No canvases yet. Seed demo data with <code className="font-mono">pnpm db:seed</code>{" "}
              or create your first board.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {stats.canvases.map((canvas) => (
                <Link
                  key={canvas.id}
                  href={`/canvas/${canvas.id}`}
                  className="group flex items-center justify-between gap-4 rounded-lg border bg-background p-3.5 transition-colors hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Network className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
                      <span className="truncate text-sm font-medium">{canvas.title}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                      <span>{canvas.workspace}</span>
                      <span>v{canvas.version}</span>
                      <span>{canvas.entityCards} entities</span>
                      <span>{canvas.eventCards} events</span>
                      <span>{canvas.edges} edges</span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                      updated {fmt(canvas.updatedAt)}
                    </div>
                  </div>
                  <ArrowUpRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
                    strokeWidth={1.75}
                  />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}