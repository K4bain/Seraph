"use client";

/**
 * Entity profile (T4). Header + four tabs fed by the entity API routes:
 * Overview (key-value grid + AI paragraph), Timeline (dated events),
 * Connections (read-only mini React Flow graph with "Open in canvas"),
 * Canvases (canvases containing the entity).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SOURCE_STYLES: Record<string, string> = {
  opensanctions: "border-red-500/40 bg-red-500/10 text-red-300",
  edgar: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  gdelt: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  wikidata: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  whois: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  github: "border-gray-500/40 bg-gray-500/10 text-gray-300",
};

const SOURCE_LABELS: Record<string, string> = {
  opensanctions: "OpenSanctions",
  edgar: "SEC EDGAR",
  gdelt: "GDELT",
  wikidata: "Wikidata",
  whois: "WHOIS",
  github: "GitHub",
};

const TYPE_LABELS: Record<string, string> = {
  person: "Person",
  organization: "Organization",
  company: "Company",
  domain: "Domain",
  location: "Location",
  event: "Event",
  media: "Media",
};

function sourceStyle(source: string): string {
  return SOURCE_STYLES[source] ?? "border-border bg-card text-muted-foreground";
}

function formatDate(date?: string): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}

interface SourceSummary {
  source: string;
  status: "ok" | "empty" | "error";
  count: number;
  samples: string[];
}

interface ProfileResponse {
  name: string;
  type: string | null;
  aliases: string[];
  attributes: Record<string, unknown>;
  sources: SourceSummary[];
  canvases: Array<{ canvasId: string; canvasTitle: string; nodeId: string; updatedAt: string }>;
  summary: string | null;
}

interface TimelineEvent {
  date: string;
  title: string;
  source: string;
  url?: string;
  kind: "search" | "canvas";
}

interface TimelineResponse {
  name: string;
  events: TimelineEvent[];
}

interface ConnectionsResponse {
  name: string;
  canvasId: string | null;
  canvasTitle: string | null;
  nodes: Array<{ id: string; name: string; type: string; proposed?: boolean }>;
  edges: Array<{ source: string; target: string; label: string; proposed?: boolean }>;
}

interface MiniNodeData extends Record<string, unknown> {
  label: string;
  kind: string;
}

function MiniNode({ data }: { data: MiniNodeData }) {
  return (
    <div className="w-44 rounded-md border border-border bg-card px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <div className="truncate text-xs font-medium text-foreground">{data.label}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {TYPE_LABELS[data.kind] ?? data.kind}
      </div>
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
}

const MINI_NODE_TYPES = { mini: MiniNode };

function circleLayout(center: { id: string; label: string }, others: ConnectionsResponse["nodes"]) {
  const radius = 240;
  const nodes: Node<MiniNodeData>[] = [
    { id: center.id, type: "mini", position: { x: 0, y: 0 }, data: { label: center.label, kind: "entity" } },
  ];
  others.forEach((node, index) => {
    const angle = (index / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2;
    nodes.push({
      id: node.id,
      type: "mini",
      position: { x: Math.cos(angle) * radius - 88, y: Math.sin(angle) * radius - 40 },
      data: { label: node.name, kind: node.type },
    });
  });
  return nodes;
}

export default function EntityProfile() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [connections, setConnections] = useState<ConnectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const encoded = encodeURIComponent(id);
    Promise.all([
      fetch(`/api/entity/${encoded}`, { signal: controller.signal }).then((res) => res.json()),
      fetch(`/api/entity/${encoded}/timeline`, { signal: controller.signal }).then((res) => res.json()),
      fetch(`/api/entity/${encoded}/connections`, { signal: controller.signal }).then((res) => res.json()),
    ])
      .then(([profileBody, timelineBody, connectionsBody]) => {
        setProfile(profileBody as ProfileResponse);
        setTimeline(timelineBody as TimelineResponse);
        setConnections(connectionsBody as ConnectionsResponse);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [id]);

  const flowNodes = useMemo(() => {
    if (!connections || !connections.nodes.length) return [];
    const center = connections.nodes.find((node) => node.name === id);
    const others = connections.nodes.filter((node) => node.name !== id);
    return circleLayout(
      { id: center?.id ?? "entity", label: id },
      others.map((node) => ({ ...node, name: node.name, type: node.type })),
    );
  }, [connections, id]);

  const flowEdges = useMemo<Edge[]>(() => {
    if (!connections) return [];
    return connections.edges.map((edge) => ({
      id: `${edge.source}->${edge.target}`,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      style: {
        stroke: edge.proposed ? "#f59e0b" : "#64748b",
        strokeDasharray: edge.proposed ? "5 4" : undefined,
        strokeWidth: 1.5,
      },
      labelStyle: { fill: "#94a3b8", fontSize: 10 },
      markerEnd: { type: MarkerType.ArrowClosed, color: edge.proposed ? "#f59e0b" : "#64748b" },
    }));
  }, [connections]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !profile) {
    return (
      <div className="p-6 text-sm text-red-300">
        {error ?? "Entity not found."}
      </div>
    );
  }

  const attributeEntries = Object.entries(profile.attributes).slice(0, 12);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground">{profile.name}</h1>
          {profile.type && (
            <Badge variant="outline" className="border-border text-muted-foreground">
              {TYPE_LABELS[profile.type] ?? profile.type}
            </Badge>
          )}
        </div>
        {profile.aliases.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Also known as: <span className="text-foreground">{profile.aliases.join(", ")}</span>
          </p>
        )}
        {profile.summary && (
          <p className="border-l-2 border-accent pl-3 text-sm leading-relaxed text-muted-foreground">
            {profile.summary}
          </p>
        )}
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="canvases">Canvases ({profile.canvases.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-4">
          {attributeEntries.length > 0 && (
            <section className="rounded-lg border border-border bg-card">
              <h2 className="border-b border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Attributes
              </h2>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 sm:grid-cols-2">
                {attributeEntries.map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-0.5">
                    <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{key}</dt>
                    <dd className="truncate text-sm text-foreground">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="rounded-lg border border-border bg-card">
            <h2 className="border-b border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Sources
            </h2>
            <div className="divide-y divide-border">
              {profile.sources.map((entry) => (
                <div key={entry.source} className="flex items-start gap-3 px-4 py-3">
                  <Badge variant="outline" className={`shrink-0 ${sourceStyle(entry.source)}`}>
                    {SOURCE_LABELS[entry.source] ?? entry.source} · {entry.count}
                  </Badge>
                  <div className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
                    {entry.status === "error" ? (
                      <span className="text-red-300">Source unavailable</span>
                    ) : entry.samples.length === 0 ? (
                      "No matches"
                    ) : (
                      <ul className="space-y-0.5">
                        {entry.samples.map((sample) => (
                          <li key={sample} className="truncate text-foreground">
                            {sample}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="timeline" className="pt-4">
          {!timeline || timeline.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dated events found.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {timeline.events.map((event, index) => (
                <li key={`${event.date}-${index}`} className="relative">
                  <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full border border-border bg-accent" />
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {formatDate(event.date)}
                  </p>
                  <div className="flex items-start gap-2">
                    {event.url ? (
                      <Link
                        href={event.url}
                        target={event.kind === "search" ? "_blank" : undefined}
                        rel="noreferrer"
                        className="text-sm text-foreground hover:underline"
                      >
                        {event.title}
                      </Link>
                    ) : (
                      <span className="text-sm text-foreground">{event.title}</span>
                    )}
                    <Badge variant="outline" className={`shrink-0 ${sourceStyle(event.source)}`}>
                      {SOURCE_LABELS[event.source] ?? event.source}
                    </Badge>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="connections" className="pt-4">
          {!connections || connections.nodes.length === 0 ? (
            <div className="space-y-2 rounded-lg border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No connections yet — this entity is not on any canvas.
              </p>
              <Link href="/canvas">
                <Button variant="outline" size="sm">
                  Open canvases
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {connections.canvasTitle ?? "Canvas"} · {connections.edges.length} relationship
                  {connections.edges.length === 1 ? "" : "s"}
                </p>
                {connections.canvasId && (
                  <Link href={`/canvas/${connections.canvasId}`}>
                    <Button variant="outline" size="sm">
                      Open in canvas
                    </Button>
                  </Link>
                )}
              </div>
              <div className="h-[420px] overflow-hidden rounded-lg border border-border bg-card">
                <ReactFlow
                  nodes={flowNodes}
                  edges={flowEdges}
                  nodeTypes={MINI_NODE_TYPES}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  panOnDrag
                  zoomOnScroll={false}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background gap={24} color="#1e293b" />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
              {connections.edges.some((edge) => edge.proposed) && (
                <p className="text-[10px] text-amber-400">
                  Dashed amber edges are AI-proposed and awaiting analyst confirmation.
                </p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="canvases" className="pt-4">
          {profile.canvases.length === 0 ? (
            <p className="text-sm text-muted-foreground">This entity is not pinned to any canvas yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {profile.canvases.map((canvas) => (
                <li key={canvas.canvasId}>
                  <Link
                    href={`/canvas/${canvas.canvasId}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/40"
                  >
                    <span className="text-sm text-foreground">{canvas.canvasTitle}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {formatDate(canvas.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
