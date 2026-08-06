"use client";

/**
 * StatsPanel — collapsible floating telemetry card. 100% presentational:
 * the parent owns the data (fps, cameraText, simTime) and the mode wiring
 * (onSceneMode). No Cesium access, no state beyond open/collapsed.
 */

import { useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import styles from "./StatsPanel.module.css";

export type SceneMode = "2d" | "2.5d" | "3d";

export interface StatsPanelProps {
  fps: number;
  cameraText: string;
  mode: SceneMode;
  onSceneMode: (m: SceneMode) => void;
  simTime?: string;
}

export default function StatsPanel({ fps, cameraText, mode, onSceneMode, simTime }: StatsPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <aside className={styles.card}>
      <button type="button" className={styles.head} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Activity className={styles.headIcon} />
        <span className={styles.headTitle}>telemetry</span>
        <span className={styles.fps}>{fps.toFixed(0)} fps</span>
        <ChevronDown className={`${styles.headChevron}${open ? " " + styles.headChevronOpen : ""}`} />
      </button>

      {open && (
        <div className={styles.body}>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>camera</span>
            <span className={styles.metricValue}>{cameraText}</span>
          </div>
          {simTime && (
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>sim</span>
              <span className={styles.metricValue}>{simTime}</span>
            </div>
          )}

          <div className={styles.modeGroup}>
            {(["2d", "2.5d", "3d"] as SceneMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`${styles.modeBtn}${mode === m ? " " + styles.modeBtnActive : ""}`}
                onClick={() => onSceneMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}