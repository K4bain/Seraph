/**
 * Server-only dashboard stats.
 *
 * Aggregates the connector registry, per-canvas card counts from the
 * latest snapshot, and BullMQ queue/job state. Every Redis call is
 * bounded — ioredis retries a dead server forever, so a timeout
 * degrades that section to null instead of hanging the page.
 */

import { prisma } from "@/core/db";
import type { CanvasDocument } from "@/store/canvas";
import { listConnectors } from "meridian-connector-sdk/runtime";
import type { Job } from "bullmq";
import "../../connectors";
import { connectorQueue } from "../../../workers/queues";

const REDIS_TIMEOUT_MS = 3500;

function withTimeout<T, U>(promise: Promise<T>, fallback: U): Promise<T | U> {
  return Promise.race([
    promise,
    new Promise<U>((resolve) => setTimeout(() => resolve(fallback), REDIS_TIMEOUT_MS)),
  ]);
}

export interface CanvasStats {
  id: string;
  title: string;
  workspace: string;
  updatedAt: string;
  version: number;
  nodes: number;
  entityCards: number;
  eventCards: number;
  edges: number;
  proposedEdges: number;
}

export interface JobSummary {
  id: string;
  connectorId: string;
  canvasId?: string;
  state: string;
  finishedAt?: string;
  lastLog?: string;
}

export interface DashboardStats {
  connectors: Array<{ id: string; name: string; version: string; entityTypes: string[] }>;
  canvases: CanvasStats[];
  redis: {
    available: boolean;
    counts?: { wait: number; active: number; delayed: number; completed: number; failed: number };
    jobs?: JobSummary[];
  };
}

function countCards(doc: CanvasDocument | null) {
  const nodes = doc?.nodes ?? [];
  return {
    nodes: nodes.length,
    entityCards: nodes.filter((n) => n.data?.card?.kind === "entity").length,
    eventCards: nodes.filter((n) => n.data?.card?.kind === "event").length,
    edges: (doc?.edges ?? []).length,
    proposedEdges: (doc?.edges ?? []).filter((e) => e.data?.proposed === true).length,
  };
}

type JobCounts = { wait: number; active: number; delayed: number; completed: number; failed: number };

async function loadRedis(): Promise<DashboardStats["redis"]> {
  const fallback = { available: false };
  const counts = await withTimeout<JobCounts, null>(connectorQueue.getJobCounts() as Promise<JobCounts>, null);
  if (!counts) return fallback;

  const completed = await withTimeout<Job[], never[]>(connectorQueue.getCompleted(0, 6) as Promise<Job[]>, []);
  const failed = await withTimeout<Job[], never[]>(connectorQueue.getFailed(0, 3) as Promise<Job[]>, []);

  const jobs: JobSummary[] = [];
  for (const job of [...completed, ...failed].slice(0, 6)) {
    const logs = await withTimeout<string[], never[]>(
      connectorQueue.getJobLogs(job.id ?? "?", 0, -1).then((r: { logs: string[] }) => r.logs),
      [],
    );
    jobs.push({
      id: job.id ?? "?",
      connectorId: (job.data as { connectorId?: string }).connectorId ?? "?",
      canvasId: (job.data as { canvasId?: string }).canvasId,
      state: (await withTimeout(job.getState(), "?")) ?? "?",
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
      lastLog: logs.at(-1),
    });
  }

  return {
    available: true,
    counts: {
      wait: counts.wait,
      active: counts.active,
      delayed: counts.delayed,
      completed: counts.completed,
      failed: counts.failed,
    },
    jobs,
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const connectors = listConnectors().map((c) => ({
    id: c.manifest.id,
    name: c.manifest.name,
    version: c.manifest.version,
    entityTypes: c.manifest.entityTypes,
  }));

  let canvases: CanvasStats[] = [];
  try {
    const rows = await prisma.canvas.findMany({
      include: { workspace: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    });
    canvases = await Promise.all(
      rows.map(async (canvas) => {
        const snapshot = await prisma.canvasSnapshot.findFirst({
          where: { canvasId: canvas.id },
          orderBy: { version: "desc" },
        });
        const counts = countCards(snapshot?.document as unknown as CanvasDocument | null);
        return {
          id: canvas.id,
          title: canvas.title,
          workspace: canvas.workspace.name,
          updatedAt: canvas.updatedAt.toISOString(),
          version: snapshot?.version ?? 0,
          ...counts,
        };
      }),
    );
  } catch {
    canvases = [];
  }

  return { connectors, canvases, redis: await loadRedis() };
}
