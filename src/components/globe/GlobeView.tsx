"use client";

import { useEffect, useRef, useState } from "react";
import "cesium/Build/Cesium/Widgets/widgets.css";
import styles from "./GlobeView.module.css";

export interface GlobeMarkerData {
  id: string;
  lat: number;
  lon: number;
  label: string;
  subtype?: string;
  approximate: boolean;
  detail?: string;
}

const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const PIN_COLORS: Record<string, string> = {
  person: "#e06c75",
  organization: "#61afef",
  location: "#98c379",
  vessel: "#56b6c2",
  aircraft: "#c678dd",
  domain: "#e5c07b",
  ip_address: "#d19a66",
  financial_account: "#f0c674",
  document: "#abb2bf",
  event: "#e06c75",
};

export default function GlobeView({ markers }: { markers: GlobeMarkerData[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<{ destroy: () => void } | null>(null);
  const [selected, setSelected] = useState<GlobeMarkerData | null>(null);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;
    let disposed = false;

    void import("cesium").then((Cesium) => {
      if (disposed || !containerRef.current) return;

      const token = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
      if (token) Cesium.Ion.defaultAccessToken = token;

      const viewer = new Cesium.Viewer(containerRef.current, {
        baseLayer: new Cesium.ImageryLayer(
          new Cesium.UrlTemplateImageryProvider({
            url: DARK_TILES,
            credit: "© OpenStreetMap · © CARTO",
            maximumLevel: 18,
          }),
        ),
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
      });

      if (token) {
        try {
          viewer.scene.setTerrain(Cesium.Terrain.fromWorldTerrain({ requestVertexNormals: true }));
        } catch {
          /* imagery-only fallback */
        }
      }

      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0b0f14");
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#10161d");
      (viewer.cesiumWidget.creditContainer as HTMLElement).style.display = "none";

      const pinSvg = (color: string) =>
        `data:image/svg+xml,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">` +
            `<path fill="${color}" d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"/>` +
            `<circle cx="12" cy="9" r="3" fill="#0b0f14"/></svg>`,
        )}`;

      const byId = new Map(markers.map((m) => [m.id, m]));
      const positions: number[] = [];
      for (const marker of markers) {
        const color = PIN_COLORS[marker.subtype ?? ""] ?? "#abb2bf";
        viewer.entities.add({
          id: `globe-${marker.id}`,
          position: Cesium.Cartesian3.fromDegrees(marker.lon, marker.lat),
          billboard: {
            image: pinSvg(color),
            width: 20,
            height: 20,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: marker.label,
            font: "11px 'JetBrains Mono', monospace",
            fillColor: Cesium.Color.fromCssColorString("#d8dee9"),
            outlineColor: Cesium.Color.fromCssColorString("#0b0f14"),
            outlineWidth: 3,
            pixelOffset: new Cesium.Cartesian2(0, -22),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8_000_000),
          },
        });
        positions.push(marker.lon, marker.lat);
      }

      if (positions.length > 0) {
        const carto = Cesium.Cartographic.fromCartesian(
          Cesium.BoundingSphere.fromPoints(
            markers.map((m) => Cesium.Cartesian3.fromDegrees(m.lon, m.lat)),
          ).center,
        );
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            Cesium.Math.toDegrees(carto.longitude),
            Cesium.Math.toDegrees(carto.latitude),
            3_000_000,
          ),
          duration: 0,
        });
      }

      viewer.screenSpaceEventHandler.setInputAction(
        (movement: { position: { x: number; y: number } }) => {
          const picked = viewer.scene.pick(new Cesium.Cartesian2(movement.position.x, movement.position.y));
          const entity = Cesium.defined(picked) ? (picked as { id?: { id?: string } }).id : undefined;
          const globeId = entity?.id;
          const marker = typeof globeId === "string" ? byId.get(globeId.replace(/^globe-/, "")) : undefined;
          setSelected(marker ?? null);
        },
        Cesium.ScreenSpaceEventType.LEFT_CLICK,
      );

      viewerRef.current = viewer;
    });

    return () => {
      disposed = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [markers]);

  return (
    <div className={styles.wrap}>
      <div ref={containerRef} className={styles.viewer} />
      {selected && (
        <div className={styles.infoCard}>
          <div className={styles.infoHead}>
            <span className={styles.infoName}>{selected.label}</span>
            <button className={styles.closeBtn} onClick={() => setSelected(null)}>
              ×
            </button>
          </div>
          <div className={styles.infoMeta}>
            {selected.subtype ?? "entity"}
            {selected.approximate ? " · approximate (country centroid)" : ""}
          </div>
          <div className={styles.infoCoord}>
            {selected.lat.toFixed(4)}, {selected.lon.toFixed(4)}
          </div>
          {selected.detail && <div className={styles.infoDetail}>{selected.detail}</div>}
        </div>
      )}
    </div>
  );
}
