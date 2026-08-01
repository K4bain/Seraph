import Link from "next/link";
import { getLatestDocument } from "@/core/document";
import type { EventCard } from "meridian-graph-types";
import styles from "./timeline.module.css";

export const dynamic = "force-dynamic";

function monthKey(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function TimelinePage() {
  const latest = await getLatestDocument("demo");
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
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Timeline</h1>
          <p className="page-subtitle">
            {events.length === 0
              ? "Event cards projected onto a time axis."
              : `${events.length} event card${events.length === 1 ? "" : "s"} — snapshot v${latest?.version ?? 0}`}
          </p>
        </div>
      </header>

      {events.length === 0 ? (
        <div className="empty-state">
          No event cards yet. Run a connector from the{" "}
          <Link className="empty-link" href="/connectors">
            connectors page
          </Link>{" "}
          or add events on the{" "}
          <Link className="empty-link" href="/canvas/demo">
            canvas
          </Link>
          .
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
