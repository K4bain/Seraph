"use client";

/**
 * Feed page (T5) — three tabs:
 *  - World Events: GDELT world-news snapshot, 5-minute auto-refresh,
 *    tone pills (green/red/gray by composite tone).
 *  - Markets: core indices + crypto with 30-day sparklines, top movers.
 *  - Watchlist: term tracking with CRUD + unread alert badge.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const REFRESH_MS = 5 * 60_000;

/** Tone → pill palette (mirrors src/core/feed/events.ts). */
function toneLevel(tone: number): "positive" | "negative" | "neutral" {
  if (tone > 5) return "positive";
  if (tone < -5) return "negative";
  return "neutral";
}

const TYPE_STYLES: Record<string, string> = {
  person: "border-red-500/40 bg-red-500/10 text-red-300",
  organization: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  domain: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

function formatTime(date?: string): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------------ */
/* World Events                                                        */
/* ------------------------------------------------------------------ */

interface FeedEvent {
  id: string;
  title: string;
  url: string;
  domain: string;
  language: string;
  tone: number;
  date: string;
}

const TONE_STYLES: Record<string, string> = {
  positive: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  negative: "border-red-500/40 bg-red-500/10 text-red-300",
  neutral: "border-border bg-card text-muted-foreground",
};

function WorldEvents() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/feed/events");
      const body = (await res.json()) as { events?: FeedEvent[]; error?: string };
      setEvents(body.events ?? []);
      setError(body.error ?? null);
      setLastFetched(new Date().toISOString());
    } catch {
      setError("Could not reach the events feed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-red-300">{error}</p>;
  }
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No world events in the current window.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {events.length} events · refreshed {lastFetched ? new Date(lastFetched).toLocaleTimeString("en") : "—"}
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {events.map((event) => {
          const tone = toneLevel(event.tone);
          return (
            <li key={event.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-10 shrink-0 font-mono text-[10px] text-muted-foreground">
                {formatTime(event.date)}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={event.url}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-2 text-sm text-foreground hover:underline"
                >
                  {event.title}
                </Link>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {event.domain} {event.language ? `· ${event.language}` : ""}
                </p>
              </div>
              {event.tone !== 0 && (
                <Badge variant="outline" className={`shrink-0 ${TONE_STYLES[tone]}`}>
                  {event.tone > 0 ? "+" : ""}
                  {event.tone.toFixed(1)}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Markets                                                             */
/* ------------------------------------------------------------------ */

interface MarketSnapshot {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  sparkline: number[];
}

interface Mover {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
}

interface MarketsFeed {
  fetchedAt: string;
  core: MarketSnapshot[];
  movers: Mover[];
  error?: string;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="h-8 w-full" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 120;
  const height = 32;
  const coords = points.map((value, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = points.at(-1)! >= points[0]!;
  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible" aria-hidden>
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={up ? "#34d399" : "#f87171"}
        strokeWidth={1.5}
      />
    </svg>
  );
}

function Markets() {
  const [feed, setFeed] = useState<MarketsFeed | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/feed/markets");
      setFeed((await res.json()) as MarketsFeed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !feed) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    );
  }
  if (!feed || feed.core.every((row) => row.price === null)) {
    return <p className="text-sm text-muted-foreground">Markets are temporarily unavailable.</p>;
  }

  return (
    <div className="space-y-4">
      {feed.error && <p className="text-[10px] text-amber-400">Partial data — {feed.error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {feed.core.map((row) => {
          const up = (row.changePercent ?? 0) >= 0;
          return (
            <div key={row.symbol} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-xs text-muted-foreground">{row.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {row.symbol}
                </p>
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-xl text-foreground">
                    {row.price !== null ? row.price.toLocaleString("en", { maximumFractionDigits: 2 }) : "—"}
                  </p>
                  <p
                    className={`font-mono text-xs ${up ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {up ? "▲" : "▼"} {row.changePercent !== null ? `${Math.abs(row.changePercent).toFixed(2)}%` : "—"}
                  </p>
                </div>
                <Sparkline points={row.sparkline} />
              </div>
            </div>
          );
        })}
      </div>

      <section className="rounded-lg border border-border bg-card">
        <h3 className="border-b border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Top Movers
        </h3>
        {feed.movers.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No mover data right now.</p>
        ) : (
          <ul className="divide-y divide-border">
            {feed.movers.map((mover) => {
              const up = (mover.changePercent ?? 0) >= 0;
              return (
                <li key={mover.symbol} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{mover.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {mover.symbol}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-foreground">
                      {mover.price !== null ? mover.price.toLocaleString("en", { maximumFractionDigits: 2 }) : "—"}
                    </p>
                    <p className={`font-mono text-xs ${up ? "text-emerald-400" : "text-red-400"}`}>
                      {up ? "▲" : "▼"} {mover.changePercent !== null ? `${Math.abs(mover.changePercent).toFixed(2)}%` : "—"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Watchlist                                                           */
/* ------------------------------------------------------------------ */

interface WatchlistAlert {
  id: string;
  headline: string;
  source: string;
  url: string | null;
  tone: number | null;
  read: boolean;
  createdAt: string;
}

interface WatchlistItem {
  id: string;
  term: string;
  type: string | null;
  lastCheck: string | null;
  createdAt: string;
  alerts: WatchlistAlert[];
}

interface WatchlistResponse {
  items: WatchlistItem[];
  unread: number;
}

function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [term, setTerm] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlist");
      const body = (await res.json()) as WatchlistResponse;
      setItems(body.items);
      setUnread(body.unread);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  };

  const addItem = async () => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term: trimmed, type }),
      });
      const body = (await res.json()) as { item?: WatchlistItem; error?: string; duplicate?: boolean };
      if (body.error) {
        flash(body.error);
      } else {
        setTerm("");
        setType(null);
        flash(body.duplicate ? "Already watching that term." : "Now watching.");
        await load();
      }
    } finally {
      setAdding(false);
    }
  };

  const removeItem = async (id: string) => {
    await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    await load();
  };

  const markRead = async (id: string) => {
    await fetch(`/api/watchlist/alerts/${id}/read`, { method: "PATCH" });
    await load();
  };

  return (
    <div className="space-y-4">
      {unread > 0 && (
        <p className="text-xs text-amber-300">{unread} unread alert{unread === 1 ? "" : "s"} across your watchlist.</p>
      )}
      {notice && <p className="text-xs text-emerald-400">{notice}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void addItem();
          }}
          placeholder="Track a person, company, or domain…"
          className="max-w-xs"
        />
        <Select
          value={type ?? ""}
          onValueChange={(value) => setType(value || null)}
        >
          <SelectTrigger className="w-40" aria-label="Watchlist type">
            <SelectValue placeholder="Any type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any type</SelectItem>
            <SelectItem value="person">Person</SelectItem>
            <SelectItem value="organization">Organization</SelectItem>
            <SelectItem value="domain">Domain</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => void addItem()} disabled={adding || !term.trim()}>
          Add to watchlist
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing watched yet. Add a term and the poll worker will surface new mentions as alerts.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{item.term}</p>
                  {item.type && (
                    <Badge variant="outline" className={TYPE_STYLES[item.type] ?? "border-border"}>
                      {item.type}
                    </Badge>
                  )}
                  {item.alerts.filter((alert) => !alert.read).length > 0 && (
                    <Badge className="bg-red-500/20 text-red-300">
                      {item.alerts.filter((alert) => !alert.read).length} new
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {item.lastCheck
                      ? `checked ${new Date(item.lastCheck).toLocaleDateString("en")}`
                      : "not checked yet"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void removeItem(item.id)}
                    className="text-red-300 hover:bg-red-500/10"
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {item.alerts.length > 0 && (
                <ul className="divide-y divide-border border-t border-border">
                  {item.alerts.map((alert) => (
                    <li key={alert.id} className="flex items-center gap-3 px-4 py-2">
                      {!alert.read && <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" />}
                      <div className="min-w-0 flex-1">
                        {alert.url ? (
                          <Link
                            href={alert.url}
                            target="_blank"
                            rel="noreferrer"
                            className="line-clamp-1 text-xs text-foreground hover:underline"
                          >
                            {alert.headline}
                          </Link>
                        ) : (
                          <p className="line-clamp-1 text-xs text-foreground">{alert.headline}</p>
                        )}
                        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {alert.source} · {formatTime(alert.createdAt)}
                        </p>
                      </div>
                      {alert.tone !== null && alert.tone !== undefined && (
                        <Badge
                          variant="outline"
                          className={TONE_STYLES[toneLevel(alert.tone)]}
                        >
                          {alert.tone > 0 ? "+" : ""}
                          {alert.tone.toFixed(1)}
                        </Badge>
                      )}
                      {!alert.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void markRead(alert.id)}
                          className="text-[10px] text-muted-foreground"
                        >
                          Mark read
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export default function FeedTabs() {
  return (
    <Tabs defaultValue="events">
      <TabsList>
        <TabsTrigger value="events">World Events</TabsTrigger>
        <TabsTrigger value="markets">Markets</TabsTrigger>
        <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
      </TabsList>
      <TabsContent value="events" className="pt-4">
        <WorldEvents />
      </TabsContent>
      <TabsContent value="markets" className="pt-4">
        <Markets />
      </TabsContent>
      <TabsContent value="watchlist" className="pt-4">
        <Watchlist />
      </TabsContent>
    </Tabs>
  );
}
