/**
 * AI narrative briefing generation (Phase 4, stage 4).
 *
 * Reads a canvas document and produces a concise analyst briefing — a
 * structured summary of key entities, relationships, and notable patterns.
 * Output is a typed Briefing object (title + sections of prose). The caller
 * writes it as a memo card (aiGenerated: true) for analyst review.
 */

import type { CanvasDocument } from "@/store/canvas";
import type { IntelligenceCard } from "seraph-graph-types";
import { getAiClient, type AiToolDefinition } from "../client";

export interface BriefingSection {
  /** Section heading, e.g. "Key entities", "Notable relationships". */
  heading: string;
  /** 1–4 sentences of prose. */
  body: string;
}

export interface Briefing {
  title: string;
  /** One-sentence executive summary. */
  summary: string;
  sections: BriefingSection[];
}

export interface BriefingResult {
  requestId: string;
  briefing: Briefing;
  usage: { inputTokens: number; outputTokens: number };
}

const BRIEFING_TOOL: AiToolDefinition = {
  name: "generate_briefing",
  description:
    "Produce a concise analyst briefing from the provided canvas entities, events, and relationships. " +
    "Summarize what is known, highlight notable patterns, and flag open questions. Do not speculate beyond the data.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Briefing title, 3–8 words" },
      summary: { type: "string", description: "One-sentence executive summary" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string", description: "Section heading, 2–5 words" },
            body: { type: "string", description: "1–4 sentences of prose" },
          },
          required: ["heading", "body"],
        },
      },
    },
    required: ["title", "summary", "sections"],
  },
};

const SYSTEM_PROMPT = `You are an OSINT analyst assistant producing a briefing document.
Rules:
- Base every statement on the provided canvas data. Do not speculate.
- Title: 3–8 words, neutral and factual.
- Summary: one sentence capturing the most important takeaway.
- Sections: 2–5 sections, each with a short heading and 1–4 sentences.
- Cover: key entities, notable relationships, temporal patterns, and open questions.
- Cite card ids inline where relevant, e.g. "(card:ent-northwind)".`;

function serializeCanvas(doc: CanvasDocument): string {
  const lines: string[] = [];
  for (const node of doc.nodes ?? []) {
    const card = node.data?.card as IntelligenceCard | undefined;
    if (!card) continue;
    if (card.kind === "entity") {
      lines.push(`[card:${card.id}] entity ${card.entity.type} "${card.entity.name}"`);
    } else if (card.kind === "event") {
      lines.push(`[card:${card.id}] event "${card.title}" @ ${card.occurredAt}`);
    } else if (card.kind === "memo") {
      lines.push(`[card:${card.id}] memo: ${card.body.slice(0, 160)}`);
    } else if (card.kind === "source") {
      lines.push(`[card:${card.id}] source "${card.title}" ${card.url}`);
    }
  }
  for (const edge of doc.edges ?? []) {
    const rel = edge.data?.relationship ?? "linked_to";
    lines.push(`[edge] ${edge.source} --${rel}--> ${edge.target}${edge.data?.proposed ? " (proposed)" : ""}`);
  }
  return lines.join("\n");
}

export async function generateBriefing(doc: CanvasDocument): Promise<BriefingResult> {
  const client = getAiClient();
  const canvasText = serializeCanvas(doc);

  if (canvasText.trim().length < 40) {
    return {
      requestId: "",
      briefing: { title: "Empty canvas", summary: "No data to summarize.", sections: [] },
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const response = await client.completeStructured({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: canvasText }],
    tools: [BRIEFING_TOOL],
    maxTokens: 2048,
  });

  const tool = response.toolUses.find((t) => t.name === "generate_briefing");
  const raw = tool?.input as
    | { title?: string; summary?: string; sections?: Array<Record<string, unknown>> }
    | undefined;

  const title = typeof raw?.title === "string" ? raw.title.trim().slice(0, 120) : "Untitled briefing";
  const summary = typeof raw?.summary === "string" ? raw.summary.trim().slice(0, 400) : "";
  const sections: BriefingSection[] = [];
  for (const item of raw?.sections ?? []) {
    const heading = typeof item.heading === "string" ? item.heading.trim().slice(0, 80) : "";
    const body = typeof item.body === "string" ? item.body.trim().slice(0, 800) : "";
    if (!heading || !body) continue;
    sections.push({ heading, body });
  }

  return {
    requestId: response.requestId,
    briefing: { title, summary, sections },
    usage: response.usage,
  };
}