/**
 * AI anomaly flagging (Phase 4, stage 4).
 *
 * Reads a canvas document and asks the model to surface activity spikes,
 * suspicious patterns, and outliers across the entities/events. Output is
 * a list of typed anomaly flags — each carries a rationale and the card ids
 * it references. Nothing is auto-committed; flags land as proposed memo
 * cards for analyst review ("AI proposes, analysts decide").
 */

import type { CanvasDocument } from "@/store/canvas";
import type { IntelligenceCard } from "seraph-graph-types";
import { getAiClient, type AiToolDefinition } from "../client";

export interface AnomalyFlag {
  /** Card id(s) the flag references. */
  cardIds: string[];
  /** Short label, e.g. "Activity spike", "Sanction overlap". */
  label: string;
  /** One-sentence rationale quoting the supporting evidence. */
  rationale: string;
  /** Severity 0–1 (higher = more notable). */
  severity: number;
}

export interface AnomalyResult {
  requestId: string;
  anomalies: AnomalyFlag[];
  usage: { inputTokens: number; outputTokens: number };
}

const ANOMALY_TOOL: AiToolDefinition = {
  name: "flag_anomalies",
  description:
    "Identify anomalies, activity spikes, and suspicious patterns in the provided canvas entities and events. " +
    "Only flag patterns supported by the data. Do not speculate.",
  inputSchema: {
    type: "object",
    properties: {
      anomalies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            cardIds: { type: "array", items: { type: "string" }, description: "Card ids referenced by this flag" },
            label: { type: "string", description: "Short label, e.g. 'Activity spike'" },
            rationale: { type: "string", description: "One sentence: which data supports this flag" },
            severity: { type: "number", description: "0–1, higher = more notable" },
          },
          required: ["cardIds", "label", "rationale", "severity"],
        },
      },
    },
    required: ["anomalies"],
  },
};

const SYSTEM_PROMPT = `You are an OSINT anomaly detection engine embedded in an analyst workspace.
Rules:
- Only flag patterns explicitly supported by the provided canvas data.
- Each flag must reference at least one card id from the input.
- Labels are short (2–4 words): "Activity spike", "Sanction overlap", "Network cluster", "Date clustering".
- Rationale: one sentence quoting the supporting evidence.
- Severity 0–1: 0.3–0.5 = notable, 0.6–0.8 = suspicious, 0.9+ = high confidence anomaly.
- If there are no anomalies, return an empty array.`;

/** Serialize a canvas document into a compact text prompt for the model. */
function serializeCanvas(doc: CanvasDocument): string {
  const lines: string[] = [];
  for (const node of doc.nodes ?? []) {
    const card = node.data?.card as IntelligenceCard | undefined;
    if (!card) continue;
    if (card.kind === "entity") {
      const attrs = card.entity.attributes ? ` ${JSON.stringify(card.entity.attributes).slice(0, 200)}` : "";
      lines.push(`[card:${card.id}] entity ${card.entity.type} "${card.entity.name}"${attrs}`);
    } else if (card.kind === "event") {
      lines.push(`[card:${card.id}] event "${card.title}" @ ${card.occurredAt}${card.summary ? ` — ${card.summary}` : ""}`);
    } else if (card.kind === "memo") {
      lines.push(`[card:${card.id}] memo: ${card.body.slice(0, 160)}`);
    } else if (card.kind === "source") {
      lines.push(`[card:${card.id}] source "${card.title}" ${card.url}`);
    }
  }
  for (const edge of doc.edges ?? []) {
    const rel = edge.data?.relationship ?? "linked_to";
    const conf = edge.data?.confidence ?? "?";
    lines.push(`[edge] ${edge.source} --${rel}(${conf})--> ${edge.target}${edge.data?.proposed ? " (proposed)" : ""}`);
  }
  return lines.join("\n");
}

export async function flagAnomalies(doc: CanvasDocument): Promise<AnomalyResult> {
  const client = getAiClient();
  const canvasText = serializeCanvas(doc);

  if (canvasText.trim().length < 40) {
    return { requestId: "", anomalies: [], usage: { inputTokens: 0, outputTokens: 0 } };
  }

  const response = await client.completeStructured({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: canvasText }],
    tools: [ANOMALY_TOOL],
    maxTokens: 2048,
  });

  const tool = response.toolUses.find((t) => t.name === "flag_anomalies");
  const raw = tool?.input as { anomalies?: Array<Record<string, unknown>> } | undefined;

  const validIds = new Set((doc.nodes ?? []).map((n) => n.id));
  const anomalies: AnomalyFlag[] = [];
  for (const item of raw?.anomalies ?? []) {
    const label = typeof item.label === "string" ? item.label.trim().slice(0, 80) : "";
    const rationale = typeof item.rationale === "string" ? item.rationale.trim().slice(0, 300) : "";
    if (!label || !rationale) continue;
    const cardIds = Array.isArray(item.cardIds)
      ? item.cardIds.filter((id): id is string => typeof id === "string" && validIds.has(id))
      : [];
    if (cardIds.length === 0) continue;
    const severity = typeof item.severity === "number" ? Math.min(1, Math.max(0, item.severity)) : 0.5;
    anomalies.push({ cardIds, label, rationale, severity });
  }

  return {
    requestId: response.requestId,
    anomalies,
    usage: response.usage,
  };
}