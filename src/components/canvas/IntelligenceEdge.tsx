"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { EDGE_TYPE_LABELS } from "meridian-graph-types";
import type { RelationEdge } from "@/store/canvas";
import styles from "./IntelligenceEdge.module.css";

/** Canvas edge — bezier with the relationship label on the midpoint. */
export default function IntelligenceEdge(props: EdgeProps<RelationEdge>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    markerEnd,
    data,
  } = props;

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const label = data?.label ?? (data?.relationship ? EDGE_TYPE_LABELS[data.relationship] : "");

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={`${styles.edgeLabel}${selected ? ` ${styles.selected}` : ""}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
