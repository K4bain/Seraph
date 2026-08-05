"use client";

/**
 * useWwvViewer — the WorldWideView globe engine hook.
 *
 * Owns the Cesium viewer lifecycle for the embedded lens: scene setup,
 * base imagery, satellite constellation + trails, country borders, day/night
 * lighting, Seraph entity pins, picking, and the FPS/camera readouts. All
 * heavy objects live in refs; React only carries the small state the HUD
 * needs (FPS, camera, selection), throttled to ~1 Hz.
 */

import { useEffect, useRef } from "react";
import type { CesiumNS } from "./cesiumLoader";
import type { WwvLayers } from "./layers";
import { SATELLITE_CATALOG, TrailBuffer, propagateSatellite, type SatelliteDef } from "./satellites";
import { createImageryProvider } from "./imagery";
import { bordersUrl, loadBorders } from "./borders";
import type { GlobeMarkerData } from "../GlobeView";

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

export interface WwvViewerCallbacks {
  onReady: () => void;
  onError: (message: string) => void;
  onFps: (fps: number) => void;
  onCamera: (text: string) => void;
  onPick: (marker: GlobeMarkerData | null) => void;
  onBootStep: (step: string) => void;
  onViewer: (viewer: unknown) => void;
}

export interface WwvViewerProps {
  cesium: CesiumNS | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  layers: WwvLayers;
  imageryId: string;
  simTimeRef: React.MutableRefObject<Date>;
  markers: GlobeMarkerData[];
  callbacks: WwvViewerCallbacks;
}

function pinSvg(color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">` +
      `<path fill="${color}" d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"/>` +
      `<circle cx="12" cy="9" r="3" fill="#07090e"/></svg>`,
  )}`;
}

function satDot(color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">` +
      `<circle cx="8" cy="8" r="4" fill="${color}" stroke="#07090e" stroke-width="1.5"/></svg>`,
  )}`;
}

interface SatelliteRuntime {
  def: SatelliteDef;
  entity: unknown;
  trailEntity: unknown;
  buffer: TrailBuffer;
}

interface MarkerRuntime {
  id: string;
  entity: unknown;
  marker: GlobeMarkerData;
}

/** Loose view into the viewer object we hand around. */
interface ViewerLike {
  scene: {
    canvas: unknown;
    pick: (p: unknown) => unknown;
    backgroundColor: unknown;
    globe: { baseColor: unknown; enableLighting: boolean };
    sun: { show: boolean };
    preRender: { addEventListener: (name: string, cb: () => void) => () => void };
  };
  entities: {
    add: (e: Record<string, unknown>) => unknown;
    remove: (e: unknown) => void;
  };
  imageryLayers: { add: (l: unknown, index?: number) => unknown; remove: (l: unknown) => void };
  dataSources: { add: (d: unknown) => unknown };
  camera: { positionWC: unknown; heading?: number; pitch?: number };
  cesiumWidget: { creditContainer: HTMLElement };
  destroy: () => void;
  isDestroyed: () => boolean;
}

export function useWwvViewer({
  cesium,
  containerRef,
  layers,
  imageryId,
  simTimeRef,
  markers,
  callbacks,
}: WwvViewerProps): void {
  const layersRef = useRef(layers);
  layersRef.current = layers;

  const viewerRef = useRef<ViewerLike | null>(null);
  const imageryLayerRef = useRef<unknown>(null);
  const bordersHandleRef = useRef<{ setVisible: (v: boolean) => void; destroy: () => void } | null>(null);
  const satellitesRef = useRef<SatelliteRuntime[]>([]);
  const markerRuntimesRef = useRef<MarkerRuntime[]>([]);
  const simRef = useRef(simTimeRef);
  simRef.current = simTimeRef;
  const rafRef = useRef(0);
  const fpsAccumRef = useRef(0);
  const fpsFrameRef = useRef(0);
  const fpsLastRef = useRef(0);
  const cameraLastRef = useRef(0);

  const cleanupRef = useRef<() => void>(() => {});

  // ----- Viewer creation ------------------------------------------------
  useEffect(() => {
    if (!cesium || !containerRef.current) return;

    const c = cesium as unknown as {
      Viewer: new (el: HTMLElement, opts: Record<string, unknown>) => ViewerLike;
      ImageryLayer: new (provider: unknown, opts?: Record<string, unknown>) => unknown;
      Cartesian3: { fromDegrees: (lon: number, lat: number, alt: number) => unknown };
      Cartesian2: new (x: number, y: number) => unknown;
      Cartographic: { fromCartesian: (p: unknown) => { longitude: number; latitude: number; height: number } };
      Color: { fromCssColorString: (css: string) => unknown };
      Math: { toDegrees: (r: number) => number };
      ScreenSpaceEventType: { LEFT_CLICK: unknown };
      ScreenSpaceEventHandler: new (canvas: unknown) => {
        setInputAction: (
          cb: (e: { position: { x: number; y: number } }) => void,
          type: unknown,
        ) => void;
        destroy: () => void;
      };
      CallbackProperty: new (cb: () => unknown, isConstant: boolean) => unknown;
      ConstantProperty: new (value: unknown) => unknown;
      ColorMaterialProperty: new (color: unknown) => unknown;
      ArcType: { NONE: unknown };
      VerticalOrigin: { BOTTOM: unknown };
      HorizontalOrigin: { LEFT: unknown };
      LabelStyle: { FILL_AND_OUTLINE: unknown };
      DistanceDisplayCondition: new (near: number, far: number) => unknown;
    };

    let viewer: ViewerLike;
    try {
      viewer = new c.Viewer(containerRef.current, {
        baseLayer: false,
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
        contextOptions: { requestWebgl2: true, webgl: { antialias: true } },
      });
    } catch (err) {
      callbacks.onError(err instanceof Error ? err.message : "WebGL context failed to initialise");
      return;
    }
    viewerRef.current = viewer;
    callbacks.onViewer(viewer);
    callbacks.onBootStep("building scene");

    viewer.scene.backgroundColor = c.Color.fromCssColorString("#07090e");
    viewer.scene.globe.baseColor = c.Color.fromCssColorString("#0b0f17");
    viewer.scene.globe.enableLighting = layersRef.current.dayNight;
    viewer.cesiumWidget.creditContainer.style.display = "none";

    // Base imagery.
    const base = createImageryProvider(cesium, imageryId);
    const layer = new c.ImageryLayer(base, { credit: "© OpenStreetMap · © CARTO · © Esri" });
    viewer.imageryLayers.add(layer, 0);
    imageryLayerRef.current = layer;
    callbacks.onBootStep("loading imagery");

    const entities = viewer.entities;
    const Cartesian3 = c.Cartesian3;

    // ----- Satellites + trails -------------------------------------------
    satellitesRef.current = SATELLITE_CATALOG.map((def) => {
      const sat = def;
      const buffer = new TrailBuffer(240, 30_000);

      const positionProperty = new c.CallbackProperty(() => {
        const track = propagateSatellite(sat, simRef.current.current);
        return Cartesian3.fromDegrees(track.lon, track.lat, Math.max(track.altKm, 200) * 1000);
      }, false);

      const trailProperty = new c.CallbackProperty(() => {
        const track = propagateSatellite(sat, simRef.current.current);
        const pts = buffer
          .get()
          .map((p) => Cartesian3.fromDegrees(p.lon, p.lat, Math.max(p.altKm, 200) * 1000));
        pts.push(Cartesian3.fromDegrees(track.lon, track.lat, Math.max(track.altKm, 200) * 1000));
        return pts;
      }, false);

      const entity = entities.add({
        id: `wwv-sat-${sat.id}`,
        position: positionProperty,
        billboard: {
          image: satDot(sat.color),
          width: 10,
          height: 10,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: sat.name,
          font: "10px ui-monospace, SFMono-Regular, Menlo, monospace",
          fillColor: c.Color.fromCssColorString("#d8dee9"),
          outlineColor: c.Color.fromCssColorString("#07090e"),
          outlineWidth: 3,
          style: c.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: { x: 0, y: -14 },
          verticalOrigin: c.VerticalOrigin.BOTTOM,
          horizontalOrigin: c.HorizontalOrigin.LEFT,
          show: false,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      const trailEntity = entities.add({
        id: `wwv-trail-${sat.id}`,
        polyline: {
          positions: trailProperty,
          width: 1.4,
          arcType: c.ArcType.NONE,
          material: new c.ColorMaterialProperty(
            (c.Color.fromCssColorString(sat.color) as { withAlpha: (a: number) => unknown }).withAlpha(0.5),
          ),
        },
      });

      return { def: sat, entity, trailEntity, buffer };
    });
    callbacks.onBootStep("satellites online");

    // ----- Picking --------------------------------------------------------
    const handler = new c.ScreenSpaceEventHandler(viewer.scene.canvas as unknown);
    handler.setInputAction((movement: { position: { x: number; y: number } }) => {
      const picked = viewer.scene.pick(new c.Cartesian2(movement.position.x, movement.position.y));
      const entityId = picked ? (picked as { id?: { id?: string } }).id?.id : undefined;
      if (typeof entityId === "string" && entityId.startsWith("wwv-marker-")) {
        const markerId = entityId.replace(/^wwv-marker-/, "");
        const runtime = markerRuntimesRef.current.find((m) => m.id === markerId);
        callbacks.onPick(runtime?.marker ?? null);
      } else {
        callbacks.onPick(null);
      }
    }, c.ScreenSpaceEventType.LEFT_CLICK);

    // ----- Per-frame loop: trails + fps + camera readouts ------------------
    const loop = () => {
      if (viewer.isDestroyed()) return;

      const now = performance.now();
      const track = simRef.current.current.getTime();

      // Push trail samples for every satellite.
      for (const sat of satellitesRef.current) {
        sat.buffer.push(propagateSatellite(sat.def, simRef.current.current), track);
      }

      // FPS (1 Hz).
      fpsFrameRef.current += 1;
      fpsAccumRef.current += now - (fpsLastRef.current || now);
      fpsLastRef.current = now;
      if (fpsAccumRef.current >= 1000) {
        const fps = Math.round((fpsFrameRef.current * 1000) / fpsAccumRef.current);
        fpsFrameRef.current = 0;
        fpsAccumRef.current = 0;
        callbacks.onFps(fps);
      }

      // Camera readout (2 Hz).
      if (now - cameraLastRef.current > 500) {
        cameraLastRef.current = now;
        const carto = c.Cartographic.fromCartesian(viewer.camera.positionWC);
        const heading = viewer.camera.heading ?? 0;
        const pitch = viewer.camera.pitch ?? 0;
        callbacks.onCamera(
          `${c.Math.toDegrees(carto.latitude).toFixed(2)}° ${c.Math.toDegrees(carto.longitude).toFixed(2)}° · ${(carto.height / 1000).toFixed(0)} km · ${c.Math.toDegrees(heading).toFixed(0)}°/${c.Math.toDegrees(pitch).toFixed(0)}°`,
        );
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    callbacks.onBootStep("ready");
    callbacks.onReady();

    cleanupRef.current = () => {
      cancelAnimationFrame(rafRef.current);
      handler.destroy();
      satellitesRef.current = [];
      markerRuntimesRef.current = [];
      bordersHandleRef.current = null;
      imageryLayerRef.current = null;
      callbacks.onViewer(null);
      if (!viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    };

    return () => {
      cleanupRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cesium, containerRef]);

  // ----- Imagery swap ----------------------------------------------------
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !cesium) return;
    try {
      const next = createImageryProvider(cesium, imageryId);
      const c = cesium as unknown as { ImageryLayer: new (p: unknown, o?: Record<string, unknown>) => unknown };
      const nextLayer = new c.ImageryLayer(next, { credit: "© OpenStreetMap · © CARTO · © Esri" });
      if (imageryLayerRef.current) viewer.imageryLayers.remove(imageryLayerRef.current);
      viewer.imageryLayers.add(nextLayer, 0);
      imageryLayerRef.current = nextLayer;
    } catch {
      callbacks.onError("Failed to swap base imagery");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageryId, cesium]);

  // ----- Borders ----------------------------------------------------------
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !cesium) return;

    if (layers.borders) {
      if (bordersHandleRef.current) {
        bordersHandleRef.current.setVisible(true);
        return;
      }
      let cancelled = false;
      loadBorders(cesium, viewer, bordersUrl())
        .then((handle) => {
          if (cancelled || viewerRef.current !== viewer || viewer.isDestroyed()) {
            handle.destroy();
            return;
          }
          bordersHandleRef.current = handle;
          handle.setVisible(true);
        })
        .catch(() => {
          /* offline / unreachable — globe keeps working without borders */
        });
      return () => {
        cancelled = true;
      };
    }

    bordersHandleRef.current?.setVisible(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers.borders, cesium]);

  // ----- Seraph entity pins (rebuilt when markers arrive / change) ----------
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !cesium) return;

    const c = cesium as unknown as {
      Cartesian3: { fromDegrees: (lon: number, lat: number, alt?: number) => unknown };
      Color: { fromCssColorString: (css: string) => unknown };
      VerticalOrigin: { BOTTOM: unknown };
      DistanceDisplayCondition: new (near: number, far: number) => unknown;
    };

    for (const runtime of markerRuntimesRef.current) {
      viewer.entities.remove(runtime.entity);
    }
    markerRuntimesRef.current = markers.map((marker) => {
      const color = PIN_COLORS[marker.subtype ?? ""] ?? "#abb2bf";
      const entity = viewer.entities.add({
        id: `wwv-marker-${marker.id}`,
        position: c.Cartesian3.fromDegrees(marker.lon, marker.lat),
        billboard: {
          image: pinSvg(color),
          width: 20,
          height: 20,
          verticalOrigin: c.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: marker.label,
          font: "11px ui-monospace, SFMono-Regular, Menlo, monospace",
          fillColor: c.Color.fromCssColorString("#d8dee9"),
          outlineColor: c.Color.fromCssColorString("#07090e"),
          outlineWidth: 3,
          pixelOffset: { x: 0, y: -22 },
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new c.DistanceDisplayCondition(0, 8_000_000),
        },
      });
      return { id: marker.id, entity, marker };
    });

    const visible = layersRef.current.seraph;
    for (const runtime of markerRuntimesRef.current) {
      (runtime.entity as { show: boolean }).show = visible;
    }
  }, [markers, cesium]);

  // ----- Layer visibility --------------------------------------------------
  useEffect(() => {
    for (const sat of satellitesRef.current) {
      (sat.entity as { show: boolean }).show = layers.satellites;
      (sat.trailEntity as { show: boolean }).show = layers.satellites && layers.trails;
    }
  }, [layers.satellites, layers.trails]);

  useEffect(() => {
    for (const m of markerRuntimesRef.current) {
      (m.entity as { show: boolean }).show = layers.seraph;
    }
  }, [layers.seraph]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer) viewer.scene.globe.enableLighting = layers.dayNight;
  }, [layers.dayNight]);

  useEffect(() => {
    if (!cesium) return;
    const c = cesium as unknown as { ConstantProperty: new (v: unknown) => unknown };
    for (const sat of satellitesRef.current) {
      const entity = sat.entity as { label?: { show?: unknown } };
      if (entity.label) entity.label.show = new c.ConstantProperty(layers.labels);
    }
    for (const m of markerRuntimesRef.current) {
      const entity = m.entity as { label?: { show?: unknown } };
      if (entity.label) entity.label.show = new c.ConstantProperty(layers.labels);
    }
  }, [layers.labels, cesium]);
}
