"use client";

import { EDGE_TYPES, EDGE_TYPE_LABELS } from "meridian-graph-types";
import { useCanvasStore, type RelationEdge } from "@/store/canvas";
import styles from "./EdgeInspector.module.css";

interface EdgeInspectorProps {
  edgeId: string;
  onClose: () => void;
}

export default function EdgeInspector({ edgeId, onClose }: EdgeInspectorProps) {
  const edge = useCanvasStore((s) => s.edges.find((e: RelationEdge) => e.id === edgeId));
  const updateEdgeData = useCanvasStore((s) => s.updateEdgeData);

  if (!edge) return null;
  const data = edge.data ?? { relationship: "linked_to" };

  return (
    <aside className={styles.inspector}>
      <header className={styles.header}>
        <span className={styles.title}>Edge</span>
        <button className={styles.close} onClick={onClose} aria-label="Close inspector">
          ×
        </button>
      </header>

      <div className={styles.body}>
        <div className={styles.monoId}>{edgeId}</div>

        <label className={styles.field}>
          <span className={styles.label}>Relationship</span>
          <select
            name="edge-relationship"
            className={styles.select}
            value={data.relationship ?? "linked_to"}
            onChange={(e) =>
              updateEdgeData(edgeId, { relationship: e.target.value as (typeof EDGE_TYPES)[number] })
            }
          >
            {EDGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {EDGE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Label</span>
          <input
            name="edge-label"
            className={styles.input}
            value={data.label ?? ""}
            placeholder="Optional annotation"
            onChange={(e) => updateEdgeData(edgeId, { label: e.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            Confidence <span className={styles.mono}>{Math.round((data.confidence ?? 1) * 100)}%</span>
          </span>
          <input
            name="edge-confidence"
            type="range"
            className={styles.range}
            min={0}
            max={100}
            value={Math.round((data.confidence ?? 1) * 100)}
            onChange={(e) => updateEdgeData(edgeId, { confidence: Number(e.target.value) / 100 })}
          />
        </label>
      </div>
    </aside>
  );
}
