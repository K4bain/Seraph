"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { EDGE_TYPE_LABELS } from "seraph-graph-types";
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
  const proposed = data?.proposed === true;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={proposed ? { strokeDasharray: "6 4", stroke: "#8b7fae" } : undefined}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={`${styles.edgeLabel}${selected ? ` ${styles.selected}` : ""}${proposed ? ` ${styles.proposed}` : ""}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
            {proposed ? " · proposed" : ""}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
