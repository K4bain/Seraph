"use client";

/**
 * GlobeView — Seraph's /globe lens, powered by WorldWideView.
 *
 * Embeds the WWV globe engine (CesiumJS, loaded from the vendored static
 * build at /cesium/Cesium.js) full-bleed under Seraph's instrument chrome:
 * layered data view (satellites + trails, country borders, day/night,
 * Seraph canvas entities), imagery picker, camera presets, a scrubbable
 * simulation timeline, and a live HUD readout.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers3, RotateCcw, Satellite, X } from "lucide-react";
import { entityPoint } from "@/core/geo/gazetteer";
import { injectWidgetsCss, loadCesium, type CesiumNS } from "./wwv/cesiumLoader";
import { useWwvViewer } from "./wwv/useWwvViewer";
import { DEFAULT_LAYERS, type LayerKey, type WwvLayers } from "./wwv/layers";
import LayerPanel from "./wwv/LayerPanel";
import Timeline from "./wwv/Timeline";
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

type GlobeStatus = "booting" | "ready" | "error";

interface SnapshotCard {
  id?: string;
  kind?: string;
  entity?: {
    name?: string;
    type?: string;
    geo?: { lat: number; lon: number } | null;
    attributes?: { description?: unknown; countries?: unknown } | null;
  };
}

interface SnapshotDocument {
  nodes?: Array<{ data?: { card?: SnapshotCard } }>;
}

function useClock() {
  const end = useMemo(() => new Date(), []);
  const start = useMemo(() => new Date(end.getTime() - 24 * 60 * 60 * 1000), [end]);
  const [simTime, setSimTimeState] = useState<Date>(() => new Date());
  const simTimeRef = useRef<Date>(simTime);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playingRef = useRef(isPlaying);
  const speedRef = useRef(playbackSpeed);
  playingRef.current = isPlaying;
  speedRef.current = playbackSpeed;

  const clamp = useCallback(
    (date: Date) => {
      const t = Math.min(Math.max(date.getTime(), start.getTime()), end.getTime());
      return new Date(t);
    },
    [start, end],
  );

  useEffect(() => {
    if (!playingRef.current) return;
    let raf = 0;
    let last = performance.now();
    let lastPush = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 500);
      last = now;
      simTimeRef.current = clamp(new Date(simTimeRef.current.getTime() + dt * speedRef.current));
      if (now - lastPush > 250) {
        lastPush = now;
        setSimTimeState(new Date(simTimeRef.current));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clamp, isPlaying]);

  const setSimTime = useCallback(
    (date: Date) => {
      simTimeRef.current = clamp(date);
      setSimTimeState(new Date(simTimeRef.current));
    },
    [clamp],
  );

  const setPlaying = useCallback((playing: boolean) => setIsPlaying(playing), []);

  return {
    simTime,
    simTimeRef,
    setSimTime,
    isPlaying,
    setPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    start,
    end,
  };
}

export default function GlobeView({ canvasId }: { canvasId?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<unknown>(null);

  const [cesium, setCesium] = useState<CesiumNS | null>(null);
  const [status, setStatus] = useState<GlobeStatus>("booting");
  const [bootStep, setBootStep] = useState("loading engine");
  const [error, setError] = useState<string | null>(null);

  const [layers, setLayers] = useState<WwvLayers>(DEFAULT_LAYERS);
  const [imageryId, setImageryId] = useState("carto-dark");
  const [markers, setMarkers] = useState<GlobeMarkerData[]>([]);
  const [selected, setSelected] = useState<GlobeMarkerData | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [cameraText, setCameraText] = useState("—");

  const [panelOpen, setPanelOpen] = useState(true);

  const clock = useClock();

  // ----- Load the vendored engine -----------------------------------------
  useEffect(() => {
    let cancelled = false;
    injectWidgetsCss();
    loadCesium()
      .then((c) => {
        if (!cancelled) setCesium(c);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Cesium failed to load");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ----- Boot watchdog -----------------------------------------------------
  useEffect(() => {
    if (status !== "booting") return;
    const t = setTimeout(() => {
      setStatus((s) => (s === "booting" ? "error" : s));
      setError((e) => e ?? "Globe initialisation timed out");
    }, 20_000);
    return () => clearTimeout(t);
  }, [status]);

  // ----- Fetch Seraph canvas entities for the pin layer --------------------
  useEffect(() => {
    if (!canvasId) return;
    let cancelled = false;
    fetch(`/api/canvas/${encodeURIComponent(canvasId)}/snapshot`)
      .then((r) => (r.ok ? (r.json() as Promise<{ document: SnapshotDocument | null }>) : null))
      .then((data) => {
        if (cancelled || !data?.document?.nodes) return;
        const cards = data.document.nodes
          .map((n) => n.data?.card)
          .filter((card): card is SnapshotCard => Boolean(card));
        const entities = cards.filter((card) => card.kind === "entity");
        const pinned: GlobeMarkerData[] = [];
        for (const card of entities) {
          if (!card.entity) continue;
          const point = entityPoint(card.entity);
          if (!point) continue;
          pinned.push({
            id: card.id ?? `card-${pinned.length}`,
            lat: point.lat,
            lon: point.lon,
            label: card.entity.name ?? "Entity",
            subtype: card.entity.type,
            approximate: point.approximate,
            detail:
              typeof card.entity.attributes?.description === "string"
                ? card.entity.attributes.description
                : undefined,
          });
        }
        setMarkers(pinned);
      })
      .catch(() => {
        /* canvas unreachable — pins simply stay empty */
      });
    return () => {
      cancelled = true;
    };
  }, [canvasId]);

  // ----- Viewer callbacks --------------------------------------------------
  const handleReady = useCallback(() => setStatus("ready"), []);
  const handleError = useCallback((message: string) => {
    setError(message);
    setStatus("error");
  }, []);
  const handleFps = useCallback((f: number) => setFps(f), []);
  const handleCamera = useCallback((text: string) => setCameraText(text), []);
  const handlePick = useCallback((marker: GlobeMarkerData | null) => setSelected(marker), []);
  const handleBootStep = useCallback((step: string) => setBootStep(step), []);
  const handleViewer = useCallback((viewer: unknown) => {
    viewerRef.current = viewer;
  }, []);

  const callbacks = useMemo(
    () => ({
      onReady: handleReady,
      onError: handleError,
      onFps: handleFps,
      onCamera: handleCamera,
      onPick: handlePick,
      onBootStep: handleBootStep,
      onViewer: handleViewer,
    }),
    [handleReady, handleError, handleFps, handleCamera, handlePick, handleBootStep, handleViewer],
  );

  useWwvViewer({
    cesium,
    containerRef,
    layers,
    imageryId,
    simTimeRef: clock.simTimeRef,
    markers,
    callbacks,
  });

  const toggleLayer = useCallback((key: LayerKey) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleScrub = useCallback(
    (progress: number) => {
      const t = new Date(clock.start.getTime() + progress * (clock.end.getTime() - clock.start.getTime()));
      clock.setSimTime(t);
    },
    [clock],
  );

  const satellitesCount = layers.satellites ? 10 : 0;

  return (
    <div className={styles.root}>
      <div ref={containerRef} className={styles.viewer} />

      {/* HUD header */}
      <header className={styles.hud}>
        <div className={styles.hudLeft}>
          <div className={styles.eyebrow}>
            <Satellite className={styles.eyebrowIcon} />
            Lenses · WorldwideView
          </div>
          <h1 className={styles.title}>Global View</h1>
          <div className={styles.statusLine}>
            <span className={styles.statusDot} />
            {status === "ready" ? "live" : status} · {cameraText}
          </div>
        </div>
        <div className={styles.hudRight}>
          <div className={styles.readout}>
            <span className={styles.readoutLabel}>fps</span>
            <span className={styles.readoutValue}>{fps ?? "—"}</span>
          </div>
          <div className={styles.readout}>
            <span className={styles.readoutLabel}>sats</span>
            <span className={styles.readoutValue}>{satellitesCount}</span>
          </div>
          <div className={styles.readout}>
            <span className={styles.readoutLabel}>pins</span>
            <span className={styles.readoutValue}>{markers.length}</span>
          </div>
          <button
            type="button"
            className={`${styles.hudBtn} ${panelOpen ? styles.hudBtnActive : ""}`}
            onClick={() => setPanelOpen((open) => !open)}
            aria-pressed={panelOpen}
          >
            <Layers3 className={styles.hudBtnIcon} />
            Layers
          </button>
        </div>
      </header>

      {panelOpen && (
        <LayerPanel
          cesium={cesium}
          viewer={viewerRef.current}
          layers={layers}
          imageryId={imageryId}
          markers={markers.length}
          satellites={satellitesCount}
          onToggle={toggleLayer}
          onImagery={setImageryId}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {selected && (
        <div className={styles.infoCard}>
          <div className={styles.infoHead}>
            <span className={styles.infoName}>{selected.label}</span>
            <button className={styles.iconBtn} onClick={() => setSelected(null)} aria-label="Close details">
              <X className={styles.iconBtnIcon} />
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

      <Timeline
        simTime={clock.simTime}
        start={clock.start}
        end={clock.end}
        isPlaying={clock.isPlaying}
        playbackSpeed={clock.playbackSpeed}
        onPlayPause={() => clock.setPlaying(!clock.isPlaying)}
        onSpeed={clock.setPlaybackSpeed}
        onScrub={handleScrub}
      />

      {status === "booting" && (
        <div className={styles.bootOverlay}>
          <div className={styles.bootPanel}>
            <div className={styles.bootMark}>WWV</div>
            <div className={styles.bootEyebrow}>WorldWideView globe</div>
            <div className={styles.bootTitle}>Initialising lens</div>
            <div className={styles.bootBar}>
              <div className={styles.bootBarFill} />
            </div>
            <div className={styles.bootStep}>{bootStep}…</div>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className={styles.errorOverlay}>
          <div className={styles.errorPanel}>
            <div className={styles.errorTitle}>Globe unavailable</div>
            <div className={styles.errorBody}>{error ?? "The WebGL globe failed to start."}</div>
            <button type="button" className={styles.retryBtn} onClick={() => window.location.reload()}>
              <RotateCcw className={styles.retryIcon} />
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
