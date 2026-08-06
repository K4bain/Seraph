"use client";

/**
 * Timeline — ported from WorldWideView's temporal navigation controller.
 * Scrubs the globe's simulation clock (used by the satellite propagator)
 * with live playback, a speed selector, and a UTC readout.
 */

import { Pause, Play } from "lucide-react";
import styles from "../GlobeView.module.css";

export interface TimelineProps {
  simTime: Date;
  start: Date;
  end: Date;
  isPlaying: boolean;
  playbackSpeed: number;
  onPlayPause: () => void;
  onSpeed: (speed: number) => void;
  onScrub: (progress: number) => void;
}

const SPEEDS = [1, 2, 10, 100];

function timeLabel(date: Date): string {
  return `${date.toISOString().slice(11, 19)}Z ${date.toISOString().slice(0, 10)}`;
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
}: TimelineProps) {
  const totalMs = end.getTime() - start.getTime();
  const progress = totalMs > 0 ? Math.max(0, Math.min(1, (simTime.getTime() - start.getTime()) / totalMs)) : 0;

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
        <span className={styles.timelineLabel}>start {timeLabel(start)}</span>
        <span className={styles.timelineLabel}>UTC · sim clock · playback {playbackSpeed}×</span>
        <span className={styles.timelineLabel}>end {timeLabel(end)}</span>
      </div>
    </footer>
  );
}
