import { getLatestDocument } from "@/core/document";
import { entityPoint } from "@/core/geo/gazetteer";
import GlobeView from "@/components/globe/GlobeView";
import styles from "./geo.module.css";
import type { EntityCard } from "seraph-graph-types";
import { PageHeader } from "@/components/layout/PageHeader";
import { MapPinned } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function GeoPage({
  searchParams,
}: {
  searchParams: Promise<{ canvas?: string }>;
}) {
  const { canvas: canvasParam } = await searchParams;
  const canvasId = canvasParam || "demo";
  const latest = await getLatestDocument(canvasId);
  const cards = (latest?.document?.nodes ?? []).map((node) => node.data.card);
  const entities: EntityCard[] = cards.filter((card): card is EntityCard => card.kind === "entity");

  const markers = [] as { id?: string; lat: number; lon: number; label?: string; subtype?: string; approximate?: boolean }[];
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

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="Lenses"
        eyebrowIcon={MapPinned}
        title="Geo View"
        subtitle={
          markers.length === 0
            ? "Entities with coordinates or country attribution land on the map."
            : `${markers.length} of ${entities.length} entities plotted — ${canvasId} · snapshot v${latest?.version ?? 0}`
        }
      />

      {markers.length === 0 ? (
        <div className="empty-state">
          No geolocated entities yet. Entities with a <code className="code-inline">geo</code> point, or a country attribution from a connector, will appear here.
        </div>
      ) : (
        <div className="space-y-3">
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.swatch} /> precise
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.swatch} ${styles.swatchApprox}`} /> approximate (country
              centroid)
            </span>
            <span className={styles.counts}>
              {precise} precise · {markers.length - precise} approximate
            </span>
          </div>

          {/* Replace Leaflet GeoView with the 3D Globe lens (WorldWideView/Cesium) */}
          <div className="h-[calc(100dvh-12rem)] w-full overflow-hidden bg-background rounded-md">
            {/* GlobeView accepts an optional canvasId prop; we pass the same canvas snapshot id */}
            {/* Client component — will hydrate on the client */}
            <GlobeView canvasId={canvasId} />
          </div>
        </div>
      )}
    </div>
  );
}
