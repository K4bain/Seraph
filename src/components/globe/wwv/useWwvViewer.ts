"use client";

/**
 * useWwvViewer — the WorldWideView globe engine hook.
 *
 * Owns the Cesium viewer lifecycle for the embedded lens: scene setup,
 * base imagery, satellite constellation + trails, country borders, day/night
 * lighting, Seraph entity pins, live feed entities, screen-space clustering,
 * picking, scene-mode morphing, graphics settings, and the FPS/camera
 * readouts. All heavy objects live in refs; React only carries the small
 * state the HUD needs (FPS, camera, selection), throttled to ~1 Hz.
 */

import { useEffect, useRef } from "react";
import type {
  CesiumImageryLayerLike,
  CesiumNS,
  CesiumSceneMode,
  CesiumSceneTransforms,
} from "./cesiumLoader";
import { LAYER_META, type WwvLayers } from "./layers";
import type { FeedEntity } from "./entityModel";
import { clusterPoints, spiderOffsets } from "./clustering";
import { SATELLITE_CATALOG, TrailBuffer, propagateSatellite, type SatelliteDef } from "./satellites";
import { createImageryProvider } from "./imagery";
import { bordersUrl, loadBorders } from "./borders";
import type { GlobeMarkerData } from "../GlobeView";
import { DEFAULT_GRAPHICS, type GraphicsHandle } from "./graphicsSettings";

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

const FEED_COLORS: Record<FeedEntity["kind"], string> = {
  aircraft: "#c678dd",
  vessel: "#56b6c2",
  station: "#98c379",
  event: "#e06c75",
};

const CLUSTER_MIN_RADIUS_PX = 28;
const CLUSTER_MAX_POINTS = 400;
const MORPH_DURATION_SECONDS = 1.2;

/** True when the (possibly not-yet-landed) layer key is switched on. */
function layerOn(layers: WwvLayers, key: string): boolean {
  return (layers as unknown as Record<string, boolean | undefined>)[key] === true;
}

/** Whether a feed entity kind is visible under the current layer set. */
function feedKindVisible(feed: FeedEntity, layers: WwvLayers): boolean {
  if (feed.kind === "aircraft") return layerOn(layers, "aircraft");
  if (feed.kind === "vessel") return layerOn(layers, "vessels");
  return true;
}

function feedColor(feed: FeedEntity): string {
  return feed.color ?? FEED_COLORS[feed.kind] ?? "#abb2bf";
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

function feedDot(color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">` +
      `<circle cx="6" cy="6" r="3.5" fill="${color}" stroke="#07090e" stroke-width="1"/></svg>`,
  )}`;
}

function clusterDotSvg(): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
      `<circle cx="12" cy="12" r="11" fill="#f0883e" stroke="#07090e" stroke-width="2"/></svg>`,
  )}`;
}

export interface SceneModeHandle {
  mode: "2d" | "2.5d" | "3d";
  setMode: (m: "2d" | "2.5d" | "3d") => void;
}

export interface WwvViewerCallbacks {
  onReady: () => void;
  onError: (message: string) => void;
  onFps: (fps: number) => void;
  onCamera: (text: string) => void;
  onPick: (marker: GlobeMarkerData | null) => void;
  onBootStep: (step: string) => void;
  onViewer: (viewer: unknown) => void;
  onFeedSelect?: (entity: FeedEntity | null) => void;
}

export interface WwvViewerProps {
  cesium: CesiumNS | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  layers: WwvLayers;
  imageryId: string;
  simTimeRef: React.MutableRefObject<Date>;
  markers: GlobeMarkerData[];
  feeds?: FeedEntity[];
  sceneModeRef?: React.MutableRefObject<SceneModeHandle | null>;
  settingsRef?: React.MutableRefObject<GraphicsHandle | null>;
  callbacks: WwvViewerCallbacks;
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
  cart: unknown;
}

interface FeedRuntime {
  feed: FeedEntity;
  entity: unknown;
  cart: unknown;
}

interface BillboardItemLike {
  position: unknown;
  image: string;
  width: number;
  height: number;
  disableDepthTestDistance: number;
}

interface CollectionLike {
  length: number;
  get: (index: number) => unknown;
  add: (properties?: unknown) => unknown;
  remove: (item: unknown) => boolean;
  removeAll: () => void;
  destroy: () => void;
}

interface BillboardCollectionLike extends CollectionLike {
  get: (index: number) => BillboardItemLike;
}

interface LabelItemLike {
  position: unknown;
  text: string;
  font: string;
  fillColor: unknown;
  horizontalOrigin: unknown;
  verticalOrigin: unknown;
  pixelOffset: { x: number; y: number };
  disableDepthTestDistance: number;
}

interface LabelCollectionLike extends CollectionLike {
  get: (index: number) => LabelItemLike;
}

interface PolylineItemLike {
  positions: unknown;
  width: number;
  material: unknown;
}

interface PolylineCollectionLike extends CollectionLike {
  get: (index: number) => PolylineItemLike;
}

interface ClusterRenderers {
  badges: BillboardCollectionLike;
  badgeLabels: LabelCollectionLike;
  spokes: PolylineCollectionLike;
  memberDots: BillboardCollectionLike;
  clear: () => void;
}

/** Loose view into the viewer object we hand around. */
interface ViewerLike {
  scene: {
    canvas: unknown;
    pick: (p: unknown) => unknown;
    backgroundColor: unknown;
    globe: { baseColor: unknown; enableLighting: boolean; ellipsoid: unknown };
    sun: { show: boolean };
    preRender: { addEventListener: (name: string, cb: () => void) => () => void };
    mode: number;
    resolutionScale: number;
    shadows: boolean;
    primitives: { add: (p: unknown) => void };
    postProcessStages: { fxaa: { enabled: boolean } };
    morphTo2D: (duration?: number) => void;
    morphTo3D: (duration?: number) => void;
    morphToColumbusView: (duration?: number) => void;
    camera: { positionWC: unknown; heading?: number; pitch?: number; pickEllipsoid: (w: unknown, e: unknown) => unknown };
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
  feeds = [],
  sceneModeRef,
  settingsRef,
  callbacks,
}: WwvViewerProps): void {
  const layersRef = useRef(layers);
  layersRef.current = layers;

  const viewerRef = useRef<ViewerLike | null>(null);
  const imageryLayerRef = useRef<unknown>(null);
  const reliefLayerRef = useRef<CesiumImageryLayerLike | null>(null);
  const bordersHandleRef = useRef<{ setVisible: (v: boolean) => void; destroy: () => void } | null>(null);
  const satellitesRef = useRef<SatelliteRuntime[]>([]);
  const markerRuntimesRef = useRef<MarkerRuntime[]>([]);
  const feedRuntimesRef = useRef<FeedRuntime[]>([]);
  const clusterRenderRef = useRef<ClusterRenderers | null>(null);
  const sceneModeStateRef = useRef<"2d" | "2.5d" | "3d">(sceneModeRef?.current?.mode ?? "3d");
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
      UrlTemplateImageryProvider: new (opts: Record<string, unknown>) => unknown;
      BillboardCollection: new (opts: { scene: unknown }) => BillboardCollectionLike;
      LabelCollection: new (opts: { scene: unknown }) => LabelCollectionLike;
      PolylineCollection: new (opts: { scene: unknown }) => PolylineCollectionLike;
      Cartesian3: { fromDegrees: (lon: number, lat: number, alt: number) => unknown };
      Cartesian2: new (x: number, y: number) => unknown;
      Cartographic: { fromCartesian: (p: unknown) => { longitude: number; latitude: number; height: number } };
      Color: { fromCssColorString: (css: string) => unknown };
      Material: {
        fromType: (type: unknown, opts: Record<string, unknown>) => unknown;
        ColorType: unknown;
      };
      Math: { toDegrees: (r: number) => number };
      SceneMode: CesiumSceneMode;
      SceneTransforms?: CesiumSceneTransforms;
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
      VerticalOrigin: { BOTTOM: unknown; CENTER: unknown };
      HorizontalOrigin: { LEFT: unknown; CENTER: unknown };
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
        contextOptions: { requestWebgl2: true, webgl: { antialias: DEFAULT_GRAPHICS.antialias } },
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
    viewer.scene.resolutionScale = DEFAULT_GRAPHICS.resolutionScale;
    viewer.scene.shadows = DEFAULT_GRAPHICS.shadows;
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

    // Satellite name tags honour the initial labels layer straight away.
    const labelProp = new c.ConstantProperty(layersRef.current.labels);
    for (const sat of satellitesRef.current) {
      const e = sat.entity as { label?: { show?: unknown } };
      if (e.label) e.label.show = labelProp;
    }
    callbacks.onBootStep("satellites online");

    // ----- Picking --------------------------------------------------------
    const handler = new c.ScreenSpaceEventHandler(viewer.scene.canvas as unknown);
    handler.setInputAction((movement: { position: { x: number; y: number } }) => {
      const picked = viewer.scene.pick(new c.Cartesian2(movement.position.x, movement.position.y));
      const entityId = picked ? (picked as { id?: { id?: string } }).id?.id : undefined;
      if (typeof entityId === "string" && entityId.startsWith("wwv-feed-")) {
        const feedId = entityId.replace(/^wwv-feed-/, "");
        const runtime = feedRuntimesRef.current.find((r) => r.feed.id === feedId);
        callbacks.onFeedSelect?.(runtime?.feed ?? null);
      } else if (typeof entityId === "string" && entityId.startsWith("wwv-marker-")) {
        const markerId = entityId.replace(/^wwv-marker-/, "");
        const runtime = markerRuntimesRef.current.find((m) => m.id === markerId);
        callbacks.onPick(runtime?.marker ?? null);
      } else {
        callbacks.onPick(null);
      }
    }, c.ScreenSpaceEventType.LEFT_CLICK);

    // ----- Cluster renderer (persistent primitive pools) -------------------
    const badges = new c.BillboardCollection({ scene: viewer.scene });
    const badgeLabels = new c.LabelCollection({ scene: viewer.scene });
    const spokes = new c.PolylineCollection({ scene: viewer.scene });
    const memberDots = new c.BillboardCollection({ scene: viewer.scene });
    viewer.scene.primitives.add(badges);
    viewer.scene.primitives.add(badgeLabels);
    viewer.scene.primitives.add(spokes);
    viewer.scene.primitives.add(memberDots);
    const clusterRender: ClusterRenderers = {
      badges,
      badgeLabels,
      spokes,
      memberDots,
      clear: () => {
        badges.removeAll();
        badgeLabels.removeAll();
        spokes.removeAll();
        memberDots.removeAll();
      },
    };
    clusterRenderRef.current = clusterRender;

    /** Resize a Cesium collection to exactly `n` items (length is read-only). */
    const resizeCollection = (col: CollectionLike, n: number) => {
      while (col.length > n) {
        const item = col.get(col.length - 1);
        if (item === undefined) break;
        col.remove(item);
      }
      while (col.length < n) col.add();
    };

    const cart3Ctor = c.Cartesian3 as unknown as new (x: number, y: number, z: number) => unknown;
    const cart2Ctor = c.Cartesian2;

    /** Average world position of a cluster's member cartesians. */
    const groupCenter = (ids: string[], byId: Map<string, { cart: unknown }>): unknown => {
      let x = 0;
      let y = 0;
      let z = 0;
      let n = 0;
      for (const id of ids) {
        const entry = byId.get(id);
        if (!entry) continue;
        const cart = entry.cart as { x: number; y: number; z: number };
        x += cart.x;
        y += cart.y;
        z += cart.z;
        n += 1;
      }
      if (n === 0) return undefined;
      return new cart3Ctor(x / n, y / n, z / n);
    };

    /** Screen window -> point on the ellipsoid (3D/Columbus friendly). */
    const windowToWorld = (sx: number, sy: number): unknown => {
      try {
        const win = new cart2Ctor(sx, sy);
        const picked = viewer.scene.camera.pickEllipsoid(win, viewer.scene.globe.ellipsoid);
        return picked ?? undefined;
      } catch {
        return undefined;
      }
    };

    const spiderRadius = (count: number): number => 16 + Math.min(20, count * 2);

    // ----- Per-frame cluster pass -----------------------------------------
    const runClusters = () => {
      const render = clusterRenderRef.current;
      const current = layersRef.current;
      if (!render) return;

      const clustersOn = layerOn(current, "clusters");
      const in2d = sceneModeStateRef.current === "2d";
      const st = c.SceneTransforms;
      const canProject = Boolean(st?.worldToWindowCoordinates);
      const showClusters = clustersOn && !in2d && canProject;

      if (!showClusters) {
        render.clear();
        for (const r of feedRuntimesRef.current) {
          (r.entity as { show: boolean }).show = feedKindVisible(r.feed, current);
        }
        for (const m of markerRuntimesRef.current) {
          (m.entity as { show: boolean }).show = layerOn(current, "seraph");
        }
        return;
      }

      const w2w = st!.worldToWindowCoordinates.bind(st);
      const sceneMode = c.SceneMode;
      const is3dish = viewer.scene.mode === sceneMode.SCENE3D || viewer.scene.mode === sceneMode.MORPHING;

      const candidates: { id: string; x: number; y: number; cart: unknown; color: string }[] = [];
      const consider = (id: string, cart: unknown, color: string) => {
        if (candidates.length >= CLUSTER_MAX_POINTS) return;
        let win: { x: number; y: number } | undefined;
        try {
          win = w2w(viewer.scene, cart);
        } catch {
          return;
        }
        if (!win || !Number.isFinite(win.x) || !Number.isFinite(win.y)) return;
        candidates.push({ id, x: win.x, y: win.y, cart, color });
      };

      for (const r of feedRuntimesRef.current) {
        if (!(r.entity as { show: boolean }).show) continue;
        consider(`feed:${r.feed.id}`, r.cart, feedColor(r.feed));
      }
      if (layerOn(current, "seraph")) {
        for (const m of markerRuntimesRef.current) {
          if (!(m.entity as { show: boolean }).show) continue;
          consider(`marker:${m.id}`, m.cart, PIN_COLORS[m.marker.subtype ?? ""] ?? "#abb2bf");
        }
      }

      const groups = clusterPoints(
        candidates.map((p) => ({ id: p.id, x: p.x, y: p.y })),
        CLUSTER_MIN_RADIUS_PX,
      );

      const grouped = new Set<string>();
      for (const g of groups) {
        if (g.ids.length > 1) {
          for (const id of g.ids) grouped.add(id);
        }
      }

      // Hide grouped members; reveal everything else.
      for (const r of feedRuntimesRef.current) {
        (r.entity as { show: boolean }).show =
          feedKindVisible(r.feed, current) && !grouped.has(`feed:${r.feed.id}`);
      }
      for (const m of markerRuntimesRef.current) {
        (m.entity as { show: boolean }).show =
          layerOn(current, "seraph") && !grouped.has(`marker:${m.id}`);
      }

      const multi = groups.filter((g) => g.ids.length > 1);
      const byId = new Map(candidates.map((p) => [p.id, p] as const));

      // Cluster badges: ember dot + mono count.
      resizeCollection(render.badges, multi.length);
      resizeCollection(render.badgeLabels, multi.length);
      for (let i = 0; i < multi.length; i++) {
        const g = multi[i]!;
        const center = groupCenter(g.ids, byId);
        if (!center) continue;
        const badge = render.badges.get(i);
        badge.position = center;
        badge.image = clusterDotSvg();
        badge.width = 18;
        badge.height = 18;
        badge.disableDepthTestDistance = Number.POSITIVE_INFINITY;
        const label = render.badgeLabels.get(i);
        label.position = center;
        label.text = String(g.ids.length);
        label.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
        label.fillColor = c.Color.fromCssColorString("#07090e");
        label.horizontalOrigin = c.HorizontalOrigin.CENTER;
        label.verticalOrigin = c.VerticalOrigin.CENTER;
        label.pixelOffset = { x: 0, y: 0 };
        label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
      }

      // Spider spokes + member dots (3D only; badges stay in 2.5D).
      if (is3dish) {
        const spokePairs: unknown[] = [];
        const dotPositions: unknown[] = [];
        const dotColors: string[] = [];
        for (const g of multi) {
          const center = groupCenter(g.ids, byId);
          if (!center) continue;
          const offsets = spiderOffsets(g, spiderRadius(g.ids.length));
          for (const off of offsets) {
            const member = byId.get(off.id);
            if (!member) continue;
            const world = windowToWorld(g.cx + off.dx, g.cy + off.dy);
            if (!world) continue;
            spokePairs.push([center, world]);
            dotPositions.push(world);
            dotColors.push(member.color);
          }
        }
        // Rebuild spokes + member dots per frame via add(). Polyline.material
        // must be a real Cesium Material: a raw Color has no destroy(), so the
        // next remove()/removeAll() crashes in _destroy. add() gives each item a
        // clean lifecycle and removal destroys it properly.
        render.spokes.removeAll();
        render.memberDots.removeAll();
        const spokeColor = (c.Color.fromCssColorString("#f0883e") as {
          withAlpha: (a: number) => unknown;
        }).withAlpha(0.35);
        for (let i = 0; i < spokePairs.length; i++) {
          render.spokes.add({
            positions: spokePairs[i],
            width: 1,
            material: c.Material.fromType(c.Material.ColorType, { color: spokeColor }),
          });
        }
        for (let i = 0; i < dotPositions.length; i++) {
          render.memberDots.add({
            position: dotPositions[i],
            image: feedDot(dotColors[i] ?? "#abb2bf"),
            width: 8,
            height: 8,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          });
        }
      } else {
        render.spokes.removeAll();
        render.memberDots.removeAll();
      }
    };

    // ----- Scene mode handle ----------------------------------------------
    const morph = (mode: "2d" | "2.5d" | "3d") => {
      sceneModeStateRef.current = mode;
      if (sceneModeRef?.current) sceneModeRef.current.mode = mode;
      try {
        if (mode === "2d") viewer.scene.morphTo2D(MORPH_DURATION_SECONDS);
        else if (mode === "2.5d") viewer.scene.morphToColumbusView(MORPH_DURATION_SECONDS);
        else viewer.scene.morphTo3D(MORPH_DURATION_SECONDS);
      } catch {
        callbacks.onError("Scene mode change failed");
      }
    };
    if (sceneModeRef) {
      sceneModeRef.current = { mode: sceneModeStateRef.current, setMode: morph };
    }

    // ----- Graphics handle -------------------------------------------------
    const setRelief = (on: boolean) => {
      try {
        if (on) {
          if (reliefLayerRef.current) {
            reliefLayerRef.current.show = true;
            return;
          }
          const provider = new c.UrlTemplateImageryProvider({
            url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
            credit: "© OpenStreetMap · © OpenTopoMap (CC-BY-SA)",
            maximumLevel: 17,
          });
          const relief = new c.ImageryLayer(provider) as unknown as CesiumImageryLayerLike;
          relief.alpha = 0.9;
          viewer.imageryLayers.add(relief as unknown);
          reliefLayerRef.current = relief;
        } else if (reliefLayerRef.current) {
          viewer.imageryLayers.remove(reliefLayerRef.current as unknown);
          reliefLayerRef.current = null;
        }
      } catch {
        /* relief overlay is optional — the globe keeps working without it */
      }
    };
    if (settingsRef) {
      settingsRef.current = {
        setResolutionScale: (x) => {
          viewer.scene.resolutionScale = Math.max(0.25, Math.min(x, 2));
        },
        setAntialias: (b) => {
          try {
            viewer.scene.postProcessStages.fxaa.enabled = b;
          } catch {
            /* fxaa not available in this context */
          }
        },
        setShadows: (b) => {
          viewer.scene.shadows = b;
        },
        setLighting: (b) => {
          viewer.scene.globe.enableLighting = b;
        },
        setTerrain: setRelief,
        setSceneMode: morph,
      };
    }

    // ----- Per-frame loop: trails + clustering + fps + camera readouts ------
    const loop = () => {
      if (viewer.isDestroyed()) return;

      const now = performance.now();
      const track = simRef.current.current.getTime();

      // Push trail samples for every satellite.
      for (const sat of satellitesRef.current) {
        sat.buffer.push(propagateSatellite(sat.def, simRef.current.current), track);
      }

      // Cluster pass (feed entities + seraph markers).
      runClusters();

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
      clusterRenderRef.current = null;
      satellitesRef.current = [];
      markerRuntimesRef.current = [];
      feedRuntimesRef.current = [];
      bordersHandleRef.current = null;
      imageryLayerRef.current = null;
      reliefLayerRef.current = null;
      if (sceneModeRef) sceneModeRef.current = null;
      if (settingsRef) settingsRef.current = null;
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
      const cart = c.Cartesian3.fromDegrees(marker.lon, marker.lat);
      const entity = viewer.entities.add({
        id: `wwv-marker-${marker.id}`,
        position: cart,
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
      return { id: marker.id, entity, marker, cart };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, cesium]);

  // ----- Feed entities (rebuilt when the feed set changes) ------------------
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !cesium) return;

    const c = cesium as unknown as {
      Cartesian3: { fromDegrees: (lon: number, lat: number, alt?: number) => unknown };
      Color: { fromCssColorString: (css: string) => unknown };
      VerticalOrigin: { BOTTOM: unknown };
      HorizontalOrigin: { LEFT: unknown };
      LabelStyle: { FILL_AND_OUTLINE: unknown };
    };

    for (const runtime of feedRuntimesRef.current) {
      viewer.entities.remove(runtime.entity);
    }
    feedRuntimesRef.current = feeds.map((feed) => {
      const cart = c.Cartesian3.fromDegrees(feed.lon, feed.lat, (feed.altKm ?? 0.01) * 1000);
      const entity = viewer.entities.add({
        id: `wwv-feed-${feed.id}`,
        position: cart,
        billboard: {
          image: feedDot(feedColor(feed)),
          width: 8,
          height: 8,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: feed.label,
          font: "10px ui-monospace, SFMono-Regular, Menlo, monospace",
          fillColor: c.Color.fromCssColorString("#d8dee9"),
          outlineColor: c.Color.fromCssColorString("#07090e"),
          outlineWidth: 3,
          style: c.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: { x: 0, y: -12 },
          verticalOrigin: c.VerticalOrigin.BOTTOM,
          horizontalOrigin: c.HorizontalOrigin.LEFT,
          show: false,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      return { feed, entity, cart };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeds, cesium]);

  // ----- Generic layer visibility ------------------------------------------
  useEffect(() => {
    const viewer = viewerRef.current;

    const applyFeedShows = () => {
      for (const r of feedRuntimesRef.current) {
        (r.entity as { show: boolean }).show = feedKindVisible(r.feed, layers);
      }
    };

    for (const meta of LAYER_META) {
      const key = meta.key as string;
      const on = (layers as unknown as Record<string, boolean>)[key] ?? false;
      switch (key) {
        case "satellites":
          for (const sat of satellitesRef.current) {
            (sat.entity as { show: boolean }).show = on;
          }
          break;
        case "trails":
          for (const sat of satellitesRef.current) {
            (sat.trailEntity as { show: boolean }).show = on && layers.satellites;
          }
          break;
        case "seraph":
          for (const m of markerRuntimesRef.current) {
            (m.entity as { show: boolean }).show = on;
          }
          break;
        case "dayNight":
          if (viewer) viewer.scene.globe.enableLighting = on;
          break;
        case "labels":
          if (cesium) {
            const lc = cesium as unknown as { ConstantProperty: new (v: unknown) => unknown };
            for (const sat of satellitesRef.current) {
              const e = sat.entity as { label?: { show?: unknown } };
              if (e.label) e.label.show = new lc.ConstantProperty(on);
            }
            for (const m of markerRuntimesRef.current) {
              const e = m.entity as { label?: { show?: unknown } };
              if (e.label) e.label.show = new lc.ConstantProperty(on);
            }
            for (const f of feedRuntimesRef.current) {
              const e = f.entity as { label?: { show?: unknown } };
              if (e.label) e.label.show = new lc.ConstantProperty(on);
            }
          }
          break;
        case "aircraft":
        case "vessels":
        case "weather":
          applyFeedShows();
          break;
        case "clusters":
          // The per-frame cluster pass reads layersRef directly.
          break;
        default:
          break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, cesium]);
}
