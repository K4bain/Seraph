import Link from "next/link";
import { getLatestDocument } from "@/core/document";
import type { EventCard } from "seraph-graph-types";
import styles from "./timeline.module.css";
import { ScrollText } from "lucide-react";

export const dynamic = "force-dynamic";

function monthKey(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ canvas?: string }>;
}) {
  const { canvas: canvasParam } = await searchParams;
  const canvasId = canvasParam || "demo";
  const latest = await getLatestDocument(canvasId);
  const cards = (latest?.document?.nodes ?? []).map((node) => node.data.card);
  const events: EventCard[] = cards.filter((card): card is EventCard => card.kind === "event");
  events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const groups = new Map<string, EventCard[]>();
  for (const event of events) {
    const key = monthKey(event.occurredAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <ScrollText className="size-3.5 text-[#f0883e]" aria-hidden />
            Lenses
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight">Timeline</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {events.length === 0
              ? "Event cards projected onto a time axis."
              : `${events.length} event card${events.length === 1 ? "" : "s"} — ${canvasId} · snapshot v${latest?.version ?? 0}`}
          </p>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/70 py-16 text-center">
          <ScrollText className="h-8 w-8 text-muted-foreground/50" aria-hidden />
          <p className="text-sm text-muted-foreground">No event cards yet.</p>
          <p className="text-xs text-muted-foreground">
            Run a connector from the{" "}
            <Link className="text-[#f0883e] underline-offset-2 hover:underline" href="/connectors">
              connectors page
            </Link>{" "}
            or add events on the{" "}
            <Link className="text-[#f0883e] underline-offset-2 hover:underline" href={`/canvas/${canvasId}`}>
              canvas
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className={styles.rail}>
          {[...groups.entries()].map(([month, monthEvents]) => (
            <section key={month} className={styles.month}>
              <h2 className={styles.monthTitle}>{month}</h2>
              <ol className={styles.list}>
                {monthEvents.map((event) => (
                  <li key={event.id} className={styles.item}>
                    <span className={styles.date}>
                      {new Date(event.occurredAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </span>
                    <div className={styles.body}>
                      <h3 className={styles.title}>{event.title}</h3>
                      {event.summary ? <p className={styles.summary}>{event.summary}</p> : null}
                      <div className={styles.meta}>
                        {event.entities && event.entities.length > 0 ? (
                          <span className={styles.entities}>
                            {event.entities.join(" · ")}
                          </span>
                        ) : null}
                        {event.sources && event.sources.length > 0 ? (
                          <a
                            className={styles.source}
                            href={event.sources[0]?.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {event.sources[0]?.title ?? "source"}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
