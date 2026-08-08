"use client";

/**
 * Landing page — the platform's front door. Full-width search with
 * type chips, recent searches from localStorage, and the stat row.
 * Lives outside the (app) shell by design (T6 nav restructure keeps
 * the landing chrome-free).
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SearchType = "" | "person" | "organization" | "domain";

const TYPE_CHIPS: { label: string; value: SearchType }[] = [
  { label: "All", value: "" },
  { label: "Person", value: "person" },
  { label: "Organization", value: "organization" },
  { label: "Domain", value: "domain" },
];

interface RecentSearch {
  q: string;
  type: SearchType;
  ts: number;
}

const RECENT_KEY = "seraph:recent-searches";

const STATS = [
  { value: "10M+", label: "Sanctions records", note: "OpenSanctions · PEPs · watchlists" },
  { value: "500K+", label: "Daily news events", note: "GDELT global article stream" },
  { value: "20M+", label: "Corporate filings", note: "SEC EDGAR full-text index" },
];

export default function SearchLanding() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<SearchType>("");
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem(RECENT_KEY);
        if (raw) setRecent((JSON.parse(raw) as RecentSearch[]).slice(0, 5));
      } catch {
        // corrupt or unavailable storage — landing still works
      }
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const submit = (q: string, t: SearchType) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const next = [{ q: trimmed, type: t, ts: Date.now() }, ...recent.filter((r) => r.q !== trimmed)].slice(0, 5);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failures
    }
    router.push(`/search?q=${encodeURIComponent(trimmed)}${t ? `&type=${t}` : ""}`);
  };

  const stats = STATS.map((stat) => (
    <div
      key={stat.label}
      className="flex flex-col gap-1 border border-card-border bg-card/60 px-6 py-5 backdrop-blur-sm"
    >
      <span className="font-mono text-2xl font-semibold tracking-tight text-foreground">{stat.value}</span>
      <span className="text-sm font-medium text-foreground">{stat.label}</span>
      <span className="text-xs text-muted-foreground">{stat.note}</span>
    </div>
  ));

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Top nav */}
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">seraph</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:inline">
            osint fusion
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/search" className="px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground">
            Search
          </Link>
          <Link href="/feed" className="px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground">
            Feed
          </Link>
          <Link href="/canvases" className="px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground">
            Canvases
          </Link>
          <Link href="/settings" className="px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground">
            Profile
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 pb-16 pt-24 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-primary">
          Open-source intelligence platform
        </p>
        <h1 className="mt-6 bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-7xl font-semibold tracking-tight text-transparent sm:text-8xl">
          seraph
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Find anyone. Map everything. Stay informed.
        </p>

        {/* Search */}
        <form
          className="mt-10 w-full"
          onSubmit={(event) => {
            event.preventDefault();
            submit(query, type);
          }}
        >
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-[0_0_0_1px_transparent] transition-shadow focus-within:border-primary-border focus-within:shadow-[0_0_24px_-6px_hsl(var(--primary))]">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people, companies, domains…"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              aria-label="Search"
              enterKeyHint="search"
            />
            <Button type="submit" size="sm" className="shrink-0 gap-1.5">
              Search
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>

          {/* Type chips */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {TYPE_CHIPS.map((chip) => (
              <button
                key={chip.value}
                type="button"
                onClick={() => setType(chip.value)}
                className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                  type === chip.value
                    ? "border-primary-border bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary-border/60 hover:text-foreground"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </form>

        {/* Recent searches */}
        {recent.length > 0 && (
          <div className="mt-8 flex w-full flex-wrap items-center justify-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              Recent
            </span>
            {recent.map((item) => (
              <button
                key={`${item.q}-${item.ts}`}
                onClick={() => submit(item.q, item.type)}
                className="rounded-full border border-border bg-card px-3 py-1 text-muted-foreground transition-colors hover:border-primary-border/60 hover:text-foreground"
              >
                {item.q}
                {item.type ? <span className="ml-1.5 font-mono text-[10px] uppercase text-primary">{item.type.slice(0, 4)}</span> : null}
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Stat row */}
      <footer className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-px bg-border px-6 pb-10 sm:grid-cols-3">
        {stats}
      </footer>
    </div>
  );
}
