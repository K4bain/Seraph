"use client";

/**
 * Search results page. Reads /api/search and /api/search/summary,
 * groups hits by source with color-coded badges, supports show/hide
 * per source, and pushes individual hits onto a canvas through the
 * standard ingest pipeline (POST /api/search/add-to-canvas).
 */

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  Copy,
  ExternalLink,
  FilePlus2,
  Loader2,
  Search as SearchIcon,
} from "lucide-react";
import type { SearchResultItem } from "seraph-connector-sdk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type SourceStatus = "ok" | "empty" | "error";

interface SourceResult {
  source: string;
  status: SourceStatus;
  data: SearchResultItem[];
  count: number;
  error?: string;
}

interface SearchResponse {
  query: string;
  type: string | null;
  results: SourceResult[];
  summary: null;
}

/** Source badge palette (T3 spec: OpenSanctions red, EDGAR blue, GDELT
 *  orange, Wikidata purple, WHOIS green, GitHub gray). */
const SOURCE_STYLES: Record<string, string> = {
  opensanctions: "border-red-500/40 bg-red-500/10 text-red-300",
  edgar: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  gdelt: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  wikidata: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  whois: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  github: "border-gray-500/40 bg-gray-500/10 text-gray-300",
  whatsmyname: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
};

const SOURCE_LABELS: Record<string, string> = {
  opensanctions: "OpenSanctions",
  edgar: "SEC EDGAR",
  gdelt: "GDELT",
  wikidata: "Wikidata",
  whois: "WHOIS",
  github: "GitHub",
  whatsmyname: "Whatsmyname",
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

interface CanvasOption {
  id: string;
  title: string;
}

export default function SearchResults() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim();
  const type = searchParams.get("type") ?? "";
  return <SearchResultsContent key={`${query}|${type}`} query={query} type={type} />;
}

function SearchResultsContent({ query, type }: { query: string; type: string }) {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(() => query.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [canvases, setCanvases] = useState<CanvasOption[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pickTarget, setPickTarget] = useState<string>("");
  const summaryAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    fetch(`/api/search?q=${encodeURIComponent(query)}${type ? `&type=${type}` : ""}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `search failed (${res.status})`);
        }
        return (await res.json()) as SearchResponse;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, type]);

  useEffect(() => {
    return () => summaryAbort.current?.abort();
  }, []);

  const toggleSummary = async () => {
    const next = !summaryOpen;
    setSummaryOpen(next);
    if (!next) {
      summaryAbort.current?.abort();
      return;
    }
    if (!query || summary) return;
    summaryAbort.current?.abort();
    const controller = new AbortController();
    summaryAbort.current = controller;
    setSummarizing(true);
    setSummary("");
    try {
      const res = await fetch(
        `/api/search/summary?q=${encodeURIComponent(query)}${type ? `&type=${type}` : ""}`,
        { signal: controller.signal },
      );
      if (!res.ok || !res.body) {
        setSummary("Summary unavailable.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setSummary(text);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setSummary("Summary unavailable.");
    } finally {
      setSummarizing(false);
    }
  };

  const openCanvasPicker = async (itemKey: string) => {
    setAddingTo(itemKey);
    setPickTarget("");
    try {
      const res = await fetch("/api/canvases");
      const body = (await res.json()) as { canvases: CanvasOption[] };
      setCanvases(body.canvases ?? []);
    } catch {
      setCanvases([]);
    }
  };

  const addToCanvas = async (item: SearchResultItem, itemKey: string) => {
    if (!pickTarget) return;
    const res = await fetch("/api/search/add-to-canvas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ canvasId: pickTarget, item }),
    });
    if (res.ok) {
      setAdded((prev) => new Set(prev).add(itemKey));
    }
    setAddingTo(null);
  };

  const visible = (data?.results ?? []).filter((entry) => !hidden.has(entry.source));
  const totalHits = visible.reduce((sum, entry) => sum + entry.count, 0);
  const anyError = (data?.results ?? []).some((entry) => entry.status === "error");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6 lg:p-8">
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <SearchIcon className="size-3.5 text-[#f0883e]" aria-hidden />
          Search
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight">Source Search</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          One query across OpenSanctions, SEC EDGAR, GDELT, Wikidata, WHOIS and GitHub.
        </p>
      </div>

      {/* Query bar */}
      <form
        className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 transition-colors focus-within:border-[#f0883e]/50"
        onSubmit={(event) => {
          event.preventDefault();
          const input = new FormData(event.currentTarget).get("q")?.toString().trim();
          if (!input) return;
          window.location.href = `/search?q=${encodeURIComponent(input)}${type ? `&type=${type}` : ""}`;
        }}
      >
        <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          key={`${query}-${type}`}
          name="q"
          defaultValue={query}
          placeholder="Search people, companies, domains…"
          className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Search"
        />
        {type ? (
          <span className="shrink-0 rounded-md border border-[#f0883e]/40 bg-[#f0883e]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#f0883e]">
            {type}
          </span>
        ) : null}
      </form>

      <div className="grid w-full flex-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* Results column */}
        <div className="min-w-0">
          {!query ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/70 py-24 text-center">
              <SearchIcon className="h-8 w-8 text-muted-foreground/50" aria-hidden />
              <p className="font-mono text-sm text-muted-foreground">enter a query to probe open sources</p>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 py-24 font-mono text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              probing {data ? "sources again" : "open sources"}…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 py-24 font-mono text-sm text-destructive">
              <AlertCircle className="h-4 w-4" aria-hidden />
              {error}
            </div>
          ) : (
            <>
              {/* Meta row */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-muted-foreground">
                <span className="tabular-nums">
                  <span className="text-foreground">{totalHits}</span> results · query{" "}
                  <span className="text-foreground">&quot;{query}&quot;</span>
                  {type ? <span className="ml-1 text-[#f0883e]">[{type}]</span> : null}
                </span>
                {anyError ? (
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <AlertCircle className="h-3 w-3" aria-hidden />
                    some sources unavailable
                  </span>
                ) : null}
              </div>

              {visible.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/70 py-16 text-center">
                  <p className="font-mono text-sm text-muted-foreground">no hits across configured sources</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {visible.map((entry) => (
                    <section key={entry.source}>
                      {/* Source header */}
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className={`font-mono text-[11px] uppercase ${sourceStyle(entry.source)}`}>
                            {SOURCE_LABELS[entry.source] ?? entry.source}
                          </Badge>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {entry.status === "error"
                              ? "unavailable"
                              : `${entry.count} hit${entry.count === 1 ? "" : "s"}`}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            setHidden((prev) => {
                              const next = new Set(prev);
                              if (next.has(entry.source)) next.delete(entry.source);
                              else next.add(entry.source);
                              return next;
                            })
                          }
                          className="font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {hidden.has(entry.source) ? "show" : "hide"}
                        </button>
                      </div>

                      {hidden.has(entry.source) ? null : entry.status === "error" ? (
                        <p className="rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-muted-foreground">
                          {entry.error}
                        </p>
                      ) : entry.status === "empty" ? (
                        <p className="rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-muted-foreground">
                          no matches.
                        </p>
                      ) : (
                        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                          {entry.data.map((item) => {
                            const itemKey = `${entry.source}:${item.title}:${item.url ?? ""}`;
                            return (
                              <li key={itemKey} className="flex items-start gap-4 px-4 py-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                    {item.url ? (
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="truncate font-medium text-foreground underline-offset-2 hover:underline"
                                      >
                                        {item.title}
                                      </a>
                                    ) : (
                                      <span className="font-medium">{item.title}</span>
                                    )}
                                    {item.category ? (
                                      <Badge variant="outline" className="font-mono text-[10px]">
                                        {item.category}
                                      </Badge>
                                    ) : null}
                                    {item.date ? (
                                      <span className="font-mono text-[11px] text-muted-foreground">
                                        {formatDate(item.date)}
                                      </span>
                                    ) : null}
                                  </div>
                                  {item.description ? (
                                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                                  ) : null}
                                  {item.url ? (
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground/80 underline-offset-2 hover:text-[#f0883e] hover:underline"
                                    >
                                      <ExternalLink className="h-3 w-3" aria-hidden />
                                      {item.url.replace(/^https?:\/\//, "").slice(0, 60)}
                                    </a>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1.5">
                                  {added.has(itemKey) ? (
                                    <span className="flex items-center gap-1 font-mono text-xs text-emerald-400">
                                      <Check className="h-3 w-3" aria-hidden />
                                      added
                                    </span>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 gap-1 text-xs"
                                      onClick={() => void openCanvasPicker(itemKey)}
                                    >
                                      <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
                                      Add to Canvas
                                    </Button>
                                  )}
                                  {addingTo === itemKey ? (
                                    <div className="flex items-center gap-1.5">
                                      <select
                                        value={pickTarget}
                                        onChange={(event) => setPickTarget(event.target.value)}
                                        className="h-7 max-w-[140px] rounded-md border border-border bg-background px-1.5 font-mono text-xs outline-none"
                                        aria-label="Target canvas"
                                      >
                                        <option value="">Canvas…</option>
                                        {canvases.map((canvas) => (
                                          <option key={canvas.id} value={canvas.id}>
                                            {canvas.title}
                                          </option>
                                        ))}
                                      </select>
                                      <Button
                                        size="sm"
                                        className="h-7 bg-[#f0883e] text-[#0b0f17] hover:bg-[#f0883e]/90 text-xs"
                                        disabled={!pickTarget}
                                        onClick={() => void addToCanvas(item, itemKey)}
                                      >
                                        Add
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Summary column */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-3">
            <Button
              variant={summaryOpen ? "default" : "outline"}
              className="w-full gap-2"
              onClick={() => void toggleSummary()}
            >
              <Bot className="h-4 w-4" aria-hidden />
              {summaryOpen ? "Hide AI Summary" : "AI Summary"}
            </Button>
            {summaryOpen ? (
              <div className="rounded-lg border border-border bg-card p-4">
                {summarizing && !summary ? (
                  <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    analyzing sources…
                  </p>
                ) : summary ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{summary}</p>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Copy className="h-3 w-3" aria-hidden />
                    Nothing to summarize yet.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
