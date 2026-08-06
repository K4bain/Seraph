"use client";

/**
 * SceneModeToggle — tiny vertical stack of three micro-buttons (2D / 2.5D /
 * 3D). Pure presentational: no internal state; the active mode and callback
 * come entirely from props.
 */

import styles from "./SceneModeToggle.module.css";

export type SceneMode = "2d" | "2.5d" | "3d";

export interface SceneModeToggleProps {
  mode: SceneMode;
  onMode: (m: SceneMode) => void;
}

const MODES: SceneMode[] = ["2d", "2.5d", "3d"];

export default function SceneModeToggle({ mode, onMode }: SceneModeToggleProps) {
  return (
    <div className={styles.toggle} role="group" aria-label="Scene mode">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          className={`${styles.btn}${mode === m ? " " + styles.btnActive : ""}`}
          onClick={() => onMode(m)}
          aria-pressed={mode === m}
        >
          {m}
        </button>
      ))}
    </div>
  );
}