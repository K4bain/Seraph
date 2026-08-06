"use client";

/**
 * Timeline — ported from WorldWideView's temporal navigation controller.
 * Scrubs the globe's simulation clock (used by the satellite propagator)
 * with live playback, a speed selector, a UTC readout, a time-window preset
 * row and a Live snap-to-now control.
 *
 * The core props contract (simTime/start/end/isPlaying/playbackSpeed and the
 * onPlayPause/onSpeed/onScrub callbacks) is unchanged; the window row and
 * Live toggle are optional extras that default to internal fallbacks when the
 * parent does not wire them.
 */

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import styles from "./Timeline.module.css";

export interface TimelineProps {
  simTime: Date;
  start: Date;
  end: Date;
  isPlaying: boolean;
  playbackSpeed: number;
  onPlayPause: () => void;
  onSpeed: (speed: number) => void;
  onScrub: (progress: number) => void;
  /** Window preset callback (hours). Optional — falls back to internal window. */
  onWindowPreset?: (hours: number) => void;
  /** Active window preset in hours (for highlighting). Optional. */
  windowHours?: number;
  /** Snap-to-now + resume. Optional — falls back to scrubbing to current time. */
  onLive?: () => void;
}

const SPEEDS = [1, 2, 10, 100];

const WINDOWS: { label: string; hours: number }[] = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "12h", hours: 12 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
];

function timeLabel(date: Date): string {
  return `${date.toISOString().slice(11, 19)}Z ${date.toISOString().slice(0, 10)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function Timeline({
  simTime,
  start,
  end,
  isPlaying,
  playbackSpeed,
  onPlayPause,
  onSpeed,
  onScrub,
  onWindowPreset,
  windowHours,
  onLive,
}: TimelineProps) {
  const [windowStart, setWindowStart] = useState(start);
  const [windowEnd, setWindowEnd] = useState(end);
  const [activeWindow, setActiveWindow] = useState<number | undefined>(windowHours);

  useEffect(() => {
    setActiveWindow(windowHours);
  }, [windowHours]);

  const effStart = onWindowPreset ? start : windowStart;
  const effEnd = onWindowPreset ? end : windowEnd;
  const totalMs = effEnd.getTime() - effStart.getTime();
  const progress = totalMs > 0 ? clamp((simTime.getTime() - effStart.getTime()) / totalMs, 0, 1) : 0;

  const handleWindow = (hours: number) => {
    setActiveWindow(hours);
    if (onWindowPreset) {
      onWindowPreset(hours);
      return;
    }
    const half = (hours * 3600_000) / 2;
    const t = simTime.getTime();
    setWindowStart(new Date(t - half));
    setWindowEnd(new Date(t + half));
  };

  const handleLive = () => {
    if (onLive) {
      onLive();
      return;
    }
    const now = new Date();
    if (totalMs > 0) {
      onScrub(clamp((now.getTime() - effStart.getTime()) / totalMs, 0, 1));
    }
    if (!isPlaying) onPlayPause();
  };

  return (
    <footer className={styles.timeline}>
      <div className={styles.timelineRow}>
        <button
          type="button"
          className={styles.timelinePlay}
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause playback" : "Play playback"}
        >
          {isPlaying ? <Pause className={styles.timelinePlayIcon} /> : <Play className={styles.timelinePlayIcon} />}
        </button>

        <div className={styles.timelineSpeedWrap}>
          <label className={styles.timelineSpeedLabel} htmlFor="wwv-speed">
            Speed
          </label>
          <select
            id="wwv-speed"
            className={styles.timelineSpeed}
            value={playbackSpeed}
            onChange={(e) => onSpeed(Number(e.target.value))}
          >
            {SPEEDS.map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
        </div>

        <div className={styles.timelineScrubWrap}>
          <input
            type="range"
            className={styles.timelineScrubber}
            min={0}
            max={1}
            step={0.001}
            value={progress}
            onChange={(e) => onScrub(parseFloat(e.target.value))}
            aria-label="Globe simulation time"
          />
        </div>

        <div className={styles.timelineLive}>
          {isPlaying ? "REPLAY" : progress >= 0.999 ? "LIVE" : "PAUSED"}
        </div>

        <time className={styles.timelineClock}>{timeLabel(simTime)}</time>
      </div>

      <div className={styles.timelineRow}>
        <div className={styles.windowGroup}>
          <span className={styles.windowLabel}>window</span>
          {WINDOWS.map((w) => (
            <button
              key={w.label}
              type="button"
              className={`${styles.windowBtn}${activeWindow === w.hours ? " " + styles.windowBtnActive : ""}`}
              onClick={() => handleWindow(w.hours)}
            >
              {w.label}
            </button>
          ))}
          <button type="button" className={styles.liveBtn} onClick={handleLive} aria-label="Snap to now and resume">
            LIVE
          </button>
        </div>

        <span className={styles.timelineLabel}>start {timeLabel(effStart)}</span>
        <span className={styles.timelineLabel}>UTC · sim clock · playback {playbackSpeed}×</span>
        <span className={styles.timelineLabel}>end {timeLabel(effEnd)}</span>
      </div>
    </footer>
  );
}
