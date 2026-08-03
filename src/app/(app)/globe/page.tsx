import { getLatestDocument } from "@/core/document";
import { entityPoint } from "@/core/geo/gazetteer";
import GlobeView, { type GlobeMarkerData } from "@/components/globe/GlobeView";
import type { EntityCard } from "seraph-graph-types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Satellite } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function GlobePage({
  searchParams,
}: {
  searchParams: Promise<{ canvas?: string }>;
}) {
  const { canvas: canvasParam } = await searchParams;
  const canvasId = canvasParam || "demo";
  const latest = await getLatestDocument(canvasId);
  const cards = (latest?.document?.nodes ?? []).map((node) => node.data.card);
  const entities: EntityCard[] = cards.filter((card): card is EntityCard => card.kind === "entity");

  const markers: GlobeMarkerData[] = [];
  for (const card of entities) {
    const point = entityPoint(card.entity);
    if (!point) continue;
    const description = card.entity.attributes?.description;
    markers.push({
      id: card.id,
      lat: point.lat,
      lon: point.lon,
      label: card.entity.name,
      subtype: card.entity.type,
      approximate: point.approximate,
      detail: typeof description === "string" ? description : undefined,
    });
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="Lenses"
        eyebrowIcon={Satellite}
        title="Globe"
        subtitle={
          markers.length === 0
            ? "Geolocated entities render as pins on the 3D globe."
            : `${markers.length} entities plotted — ${canvasId} · snapshot v${latest?.version ?? 0}`
        }
      />

      {markers.length === 0 ? (
        <div className="empty-state">
          No geolocated entities yet. Entities with a <code className="code-inline">geo</code> point, or
          a country attribution from a connector, will appear here. Set{" "}
          <code className="code-inline">NEXT_PUBLIC_CESIUM_ION_TOKEN</code> to enable world terrain and
          Ion imagery.
        </div>
      ) : (
        <GlobeView markers={markers} />
      )}
    </div>
  );
}
