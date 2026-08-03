/**
 * AI processor worker.
 *
 * Consumes aiQueue jobs and dispatches to the real reasoning-layer
 * handlers in src/core/ai/tasks. Heavy LLM calls run here, out of the
 * web server request path.
 *
 * Tasks:
 *  - extract_entities / infer_edges → analyzeDocument (text in, proposals out)
 *  - flag_anomalies                  → flagAnomalies (canvas in, flags out)
 *  - generate_briefing               → generateBriefing (canvas in, briefing out)
 *
 * Results are published to the live feed and logged with the AI request id
 * for auditability. Nothing is auto-committed to the graph — every output
 * is a proposal awaiting analyst confirmation.
 *
 * Run with: pnpm worker:ai  (needs Redis up)
 */

import "dotenv/config";
import { Worker } from "bullmq";
import { connection, aiQueue, type AiJobData } from "./queues";
import { getAiClient } from "../src/core/ai/client";
import { analyzeDocument } from "../src/core/ai/tasks/analyze";
import { flagAnomalies } from "../src/core/ai/tasks/anomalies";
import { generateBriefing } from "../src/core/ai/tasks/briefing";
import { loadLatestCanvasDoc } from "../src/core/canvas";
import { publishFeedEvent } from "../src/core/stream/publish";

const worker = new Worker<AiJobData>(
  aiQueue.name,
  async (job) => {
    const { task, document, canvasId } = job.data;

    const ai = getAiClient();
    if (!ai.isConfigured()) {
      job.log("OPENROUTER_API_KEY not set — skipping AI task");
      return;
    }

    job.log(`Running AI task "${task}"`);

    switch (task) {
      case "extract_entities":
      case "infer_edges": {
        const text = document?.trim() ?? "";
        if (text.length < 40) {
          job.log("document too short — skipping");
          return;
        }
        const result = await analyzeDocument(text);
        job.log(
          `analyze → ${result.entities.length} entities, ${result.relationships.length} relationships (request ${result.requestId})`,
        );
        void publishFeedEvent({
          kind: "batch",
          id: `ai:${task}:${job.id}:${Date.now().toString(36)}`,
          ts: new Date().toISOString(),
          source: "ai",
          canvasId,
          jobId: String(job.id),
          action: "proposed",
          summary: {
            cardsCreated: result.entities.length,
            cardsUpdated: 0,
            cardsSkipped: 0,
            edgesProposed: result.relationships.length,
          },
        });
        return;
      }

      case "flag_anomalies": {
        if (!canvasId) {
          job.log("canvasId required for flag_anomalies — skipping");
          return;
        }
        const doc = await loadLatestCanvasDoc(canvasId);
        const result = await flagAnomalies(doc);
        job.log(`flag_anomalies → ${result.anomalies.length} flags (request ${result.requestId})`);
        void publishFeedEvent({
          kind: "batch",
          id: `ai:flag_anomalies:${job.id}:${Date.now().toString(36)}`,
          ts: new Date().toISOString(),
          source: "ai",
          canvasId,
          jobId: String(job.id),
          action: "proposed",
          summary: {
            cardsCreated: result.anomalies.length,
            cardsUpdated: 0,
            cardsSkipped: 0,
            edgesProposed: 0,
          },
        });
        return;
      }

      case "generate_briefing": {
        if (!canvasId) {
          job.log("canvasId required for generate_briefing — skipping");
          return;
        }
        const doc = await loadLatestCanvasDoc(canvasId);
        const result = await generateBriefing(doc);
        job.log(
          `generate_briefing → "${result.briefing.title}" (${result.briefing.sections.length} sections, request ${result.requestId})`,
        );
        void publishFeedEvent({
          kind: "batch",
          id: `ai:generate_briefing:${job.id}:${Date.now().toString(36)}`,
          ts: new Date().toISOString(),
          source: "ai",
          canvasId,
          jobId: String(job.id),
          action: "proposed",
          summary: {
            cardsCreated: 1,
            cardsUpdated: 0,
            cardsSkipped: 0,
            edgesProposed: 0,
          },
        });
        return;
      }

      default: {
        job.log(`Unknown AI task "${task}" — skipping`);
      }
    }
  },
  { connection },
);

worker.on("failed", (job, error) => {
  console.error(`[ai-processor] job ${job?.id} failed:`, error);
});

worker.on("ready", () => {
  console.log("[ai-processor] listening for AI jobs");
});

process.on("SIGINT", () => void worker.close());
process.on("SIGTERM", () => void worker.close());
