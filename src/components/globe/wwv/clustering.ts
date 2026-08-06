"use client";

/**
 * Pure clustering math for the WWV pin layers.
 *
 * clusterPoints uses a grid-bucket sweep (bucket size == minRadiusPx) with a
 * 3x3 neighbour search so any two points within minRadiusPx collapse into one
 * group; singletons survive as groups of 1. spiderOffsets fans a group's ids
 * out around its centroid so overlapping pins remain pickable.
 */

export interface ClusterPoint {
  id: string;
  x: number;
  y: number;
  weight?: number;
  kind?: string;
}

export interface PointCluster {
  ids: string[];
  cx: number;
  cy: number;
}

interface ClusterAccum extends PointCluster {
  w: number;
}

export function clusterPoints(points: ClusterPoint[], minRadiusPx: number): PointCluster[] {
  const radius = Math.max(minRadiusPx, 1);

  const bucketOf = (x: number, y: number): { bx: number; by: number; key: string } => {
    const bx = Math.floor(x / radius);
    const by = Math.floor(y / radius);
    return { bx, by, key: `${bx},${by}` };
  };

  const clusters: ClusterAccum[] = [];
  const grid = new Map<string, number[]>();

  for (const p of points) {
    const w = p.weight ?? 1;
    const b = bucketOf(p.x, p.y);
    let merged = false;

    for (let dx = -1; dx <= 1 && !merged; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${b.bx + dx},${b.by + dy}`;
        const indices = grid.get(key);
        if (!indices) continue;
        for (const ci of indices) {
          const c = clusters[ci];
          if (!c) continue;
          if (Math.hypot(p.x - c.cx, p.y - c.cy) <= radius) {
            c.ids.push(p.id);
            const nw = c.w + w;
            c.cx = (c.cx * c.w + p.x * w) / nw;
            c.cy = (c.cy * c.w + p.y * w) / nw;
            c.w = nw;
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }

    if (!merged) {
      const ci = clusters.length;
      clusters.push({ ids: [p.id], cx: p.x, cy: p.y, w });
      const bucket = grid.get(b.key);
      if (bucket) bucket.push(ci);
      else grid.set(b.key, [ci]);
    }
  }

  return clusters.map((c) => ({ ids: c.ids, cx: c.cx, cy: c.cy }));
}

export function spiderOffsets(
  group: PointCluster,
  radiusPx: number,
): { id: string; dx: number; dy: number }[] {
  const n = group.ids.length;
  return group.ids.map((id, i) => {
    const angleRad = ((-90 + (i * 360) / n) * Math.PI) / 180;
    return { id, dx: radiusPx * Math.cos(angleRad), dy: radiusPx * Math.sin(angleRad) };
  });
}
