/**
 * AI processor worker.
 *
 * Consumes aiQueue jobs. Phase 1: logs and acknowledges; Phase 4 wires
 * the reasoning layer (src/core/ai) here so heavy LLM calls never run
 * inside the web server request path.
 *
 * Run with: pnpm worker:ai
 */

import "dotenv/config";
import { Worker } from "bullmq";
import { connection, aiQueue, type AiJobData } from "./queues";
import { getAiClient } from "../src/core/ai/client";

const worker = new Worker<AiJobData>(
  aiQueue.name,
  async (job) => {
    const { task } = job.data;

    const ai = getAiClient();
    if (!ai.isConfigured()) {
      job.log("OPENROUTER_API_KEY not set — skipping AI task");
      return;
    }

    job.log(`Running AI task "${task}"`);
    // Phase 4: dispatch to extraction / inference / anomaly handlers.
    // For now, a smoke call validates connectivity end to end.
    const result = await ai.complete({
      system: "You are the Seraph reasoning layer.",
      messages: [{ role: "user", content: `Run task: ${task}. Reply with OK.` }],
      maxTokens: 64,
    });
    job.log(`AI task "${task}" → ${result.text.slice(0, 120)} (${result.requestId})`);
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
