"use client";

/**
 * LayerPanel — ported from WorldWideView's left sidebar panel.
 * Controls base imagery, data layers, and camera presets for the globe lens.
 */

import { Camera, Layers3, X } from "lucide-react";
import { IMAGERY_LAYERS } from "./imagery";
import { CAMERA_PRESETS, flyToPreset } from "./cameraPresets";
import type { CesiumNS } from "./cesiumLoader";
import { LAYER_META, type LayerKey, type WwvLayers } from "./layers";
import styles from "../GlobeView.module.css";

export interface LayerPanelProps {
  cesium: CesiumNS | null;
  viewer: unknown;
  layers: WwvLayers;
  imageryId: string;
  markers: number;
  satellites: number;
  onToggle: (key: LayerKey) => void;
  onImagery: (id: string) => void;
  onClose: () => void;
}

export default function LayerPanel({
  cesium,
  viewer,
  layers,
  imageryId,
  markers,
  satellites,
  onToggle,
  onImagery,
  onClose,
}: LayerPanelProps) {
  return (
    <aside className={styles.panel} role="dialog" aria-label="Globe layers">
      <header className={styles.panelHead}>
        <span className={styles.panelEyebrow}>
          <Layers3 className={styles.panelIcon} />
          Layers
        </span>
        <button className={styles.iconBtn} onClick={onClose} aria-label="Close layers panel">
          <X className={styles.iconBtnIcon} />
        </button>
      </header>

      <section className={styles.panelSection}>
        <h3 className={styles.panelSectionTitle}>Base imagery</h3>
        <ul className={styles.radioList}>
          {IMAGERY_LAYERS.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={`${styles.radioItem} ${imageryId === option.id ? styles.radioItemActive : ""}`}
                onClick={() => onImagery(option.id)}
              >
                <span className={styles.radioDot} />
                <span className={styles.radioText}>
                  <span className={styles.radioName}>{option.name}</span>
                  <span className={styles.radioDesc}>{option.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panelSection}>
        <h3 className={styles.panelSectionTitle}>Data layers</h3>
        <ul className={styles.toggleList}>
          {LAYER_META.map(({ key, label, hint }) => {
            const badge =
              key === "seraph" ? String(markers) : key === "satellites" ? String(satellites) : null;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={styles.toggleRow}
                  onClick={() => onToggle(key)}
                  role="switch"
                  aria-checked={layers[key]}
                >
                  <span className={styles.toggleLabel}>
                    <span>{label}</span>
                    <span className={styles.toggleHint}>{hint}</span>
                  </span>
                  {badge !== null && <span className={styles.toggleBadge}>{badge}</span>}
                  <span className={`${styles.switch} ${layers[key] ? styles.switchOn : ""}`}>
                    <span className={styles.switchKnob} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.panelSection}>
        <h3 className={styles.panelSectionTitle}>
          <Camera className={styles.panelSectionIcon} />
          Camera presets
        </h3>
        <ul className={styles.presetGrid}>
          {CAMERA_PRESETS.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                className={styles.presetBtn}
                onClick={() => cesium && viewer && flyToPreset(cesium, viewer, preset.id)}
              >
                {preset.label}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className={styles.panelFoot}>WWV · worldwideview globe lens</footer>
    </aside>
  );
}
