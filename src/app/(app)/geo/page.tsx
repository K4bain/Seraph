import { getLatestDocument } from "@/core/document";
import { entityPoint } from "@/core/geo/gazetteer";
import GeoView, { type GeoMarkerData } from "@/components/geo/GeoView";
import styles from "./geo.module.css";
import type { EntityCard } from "meridian-graph-types";

export const dynamic = "force-dynamic";

export default async function GeoPage() {
  const latest = await getLatestDocument("demo");
  const cards = (latest?.document?.nodes ?? []).map((node) => node.data.card);
  const entities: EntityCard[] = cards.filter((card): card is EntityCard => card.kind === "entity");

  const markers: GeoMarkerData[] = [];
  for (const card of entities) {
    const point = entityPoint(card.entity);
    if (!point) continue;
    markers.push({
      id: card.id,
      lat: point.lat,
      lon: point.lon,
      label: card.entity.name,
      subtype: card.entity.type,
      approximate: point.approximate,
    });
  }

  const precise = markers.filter((m) => !m.approximate).length;
  const approximate = markers.length - precise;

  return (
    <div>
      <header className="page-header">
        <div>
          <h1 className="page-title">Geo View</h1>
          <p className="page-subtitle">
            {markers.length === 0
              ? "Entities with coordinates or country attribution land on the map."
              : `${markers.length} of ${entities.length} entities plotted — snapshot v${latest?.version ?? 0}`}
          </p>
        </div>
      </header>

      {markers.length === 0 ? (
        <div className="empty-state">
          No geolocated entities yet. Entities with a <code className="code-inline">geo</code>{" "}
          point, or a country attribution from a connector, will appear here.
        </div>
      ) : (
        <>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.swatch} /> precise
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.swatch} ${styles.swatchApprox}`} /> approximate (country
              centroid)
            </span>
            <span className={styles.counts}>
              {precise} precise · {approximate} approximate
            </span>
          </div>
          <GeoView markers={markers} />
        </>
      )}
    </div>
  );
}
