"use client";

/**
 * InfoPanel — detail card for the currently inspected globe marker.
 * Shows provenance, coordinate readout and any recognised detail text.
 */

import { X } from "lucide-react";
import type { GlobeMarkerData } from "../GlobeView";
import styles from "../GlobeView.module.css";

export interface InfoPanelProps {
  marker: GlobeMarkerData;
  onClose: () => void;
}

export default function InfoPanel({ marker, onClose }: InfoPanelProps) {
  return (
    <div className={styles.infoCard}>
      <div className={styles.infoHead}>
        <span className={styles.infoName}>{marker.label}</span>
        <button className={styles.iconBtn} onClick={onClose} aria-label="Close details">
          <X className={styles.iconBtnIcon} />
        </button>
      </div>
      <div className={styles.infoMeta}>
        {marker.subtype ?? "entity"}
        {marker.approximate ? " · approximate (country centroid)" : ""}
      </div>
      <div className={styles.infoCoord}>
        {marker.lat.toFixed(4)}, {marker.lon.toFixed(4)}
      </div>
      {marker.detail && <div className={styles.infoDetail}>{marker.detail}</div>}
    </div>
  );
}