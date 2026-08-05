"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/**
 * Top-bar search. Submits to /search?q=… (the results page owns its own
 * SearchResults form; this is the persistent entry point for every app page).
 */
export default function TopSearch() {
  const router = useRouter();
  const [value, setValue] = React.useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = value.trim();
    if (!q) return;
    setValue("");
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={submit} className="relative flex-1 max-w-md" role="search">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search people, companies, domains…"
        className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/80 transition-colors focus-visible:border-ring/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-label="Search across all sources"
      />
    </form>
  );
}
