import Link from "next/link";
import { prisma } from "@/core/db";
import styles from "./share.module.css";
import type { CanvasDocument } from "@/store/canvas";
import type { EntityCard, EventCard } from "seraph-graph-types";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await prisma.share.findUnique({
    where: { token },
    include: { canvas: { select: { id: true, title: true } } },
  });

  if (!share) {
    return (
      <main className={styles.shell}>
        <div className={styles.brand}>Seraph</div>
        <div className={styles.card}>
          <h1 className={styles.title}>Link not found</h1>
          <p className={styles.muted}>
            This share link is invalid or has been revoked. Ask the sender for a fresh link.
          </p>
        </div>
      </main>
    );
  }

  const snapshot = await prisma.canvasSnapshot.findFirst({
    where: { canvasId: share.canvasId },
    orderBy: { version: "desc" },
  });
  const document = snapshot?.document as unknown as CanvasDocument | null;
  const cards = (document?.nodes ?? []).map((node) => node.data.card);
  const entities = cards.filter((card): card is EntityCard => card.kind === "entity");
  const events = cards.filter((card): card is EventCard => card.kind === "event");
  const edges = document?.edges ?? [];

  const labels = new Map<string, string>();
  for (const card of entities) labels.set(card.id, card.entity.name);
  for (const event of events) labels.set(event.id, event.title);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>Seraph</span>
        <span className={styles.badge}>shared snapshot v{snapshot?.version ?? 0}</span>
      </header>

      <div className={styles.card}>
        <h1 className={styles.title}>{share.canvas.title}</h1>
        <p className={styles.muted}>
          Read-only view · shared{" "}
          {new Date(share.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        </p>
        <div className={styles.stats}>
          <span className={styles.stat}>
            <b>{entities.length}</b> entities
          </span>
          <span className={styles.stat}>
            <b>{edges.length}</b> edges
          </span>
          <span className={styles.stat}>
            <b>{events.length}</b> events
          </span>
        </div>
      </div>

      {entities.length > 0 ? (
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Entities</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((card) => (
                <tr key={card.id}>
                  <td className={styles.name}>{card.entity.name}</td>
                  <td>
                    <code className={styles.mono}>{card.entity.type}</code>
                  </td>
                  <td className={styles.mono}>
                    {card.entity.confidence != null ? card.entity.confidence.toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {edges.length > 0 ? (
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Relationships</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>From</th>
                <th>Relation</th>
                <th>To</th>
              </tr>
            </thead>
            <tbody>
              {edges.map((edge) => (
                <tr key={edge.id}>
                  <td className={styles.name}>{labels.get(edge.source) ?? edge.source}</td>
                  <td>
                    <code className={styles.mono}>
                      {edge.data?.relationship ?? edge.data?.label ?? "linked_to"}
                    </code>
                  </td>
                  <td className={styles.name}>{labels.get(edge.target) ?? edge.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {events.length > 0 ? (
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Events</h2>
          <ol className={styles.eventList}>
            {events.map((event) => (
              <li key={event.id} className={styles.event}>
                <span className={styles.mono}>
                  {new Date(event.occurredAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </span>
                <div>
                  <h3 className={styles.eventTitle}>{event.title}</h3>
                  {event.summary ? <p className={styles.muted}>{event.summary}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <footer className={styles.footer}>
        <Link href="/" className={styles.homeLink}>
          Seraph — OSINT fusion platform
        </Link>
      </footer>
    </main>
  );
}
