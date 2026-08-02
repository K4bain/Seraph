/**
 * AI extraction + edge inference (Phase 4).
 *
 * One structured call: the model reads source text and returns entities
 * and relationships via tool_use. Output is validated against the
 * canonical types before it can be proposed — freeform prose never
 * reaches the canvas. Apply-side mapping reuses the connector ingest
 * pipeline (src/core/ingest/ingest.ts) so AI proposals dedup against
 * connector cards, merge provenance, and always land as
 * `proposed: true` edges awaiting analyst confirmation.
 */

import type {
  EdgeType,
  EntityStreamEvent,
  EntityType,
  RawRelationship,
  SourceRef,
} from "seraph-graph-types";
import { nameFingerprint, normalizeName } from "../../graph/dedup";
import { getAiClient, type AiToolDefinition } from "../client";

const ENTITY_TYPES: readonly EntityType[] = [
  "person",
  "organization",
  "location",
  "vessel",
  "aircraft",
  "domain",
  "ip_address",
  "financial_account",
  "document",
  "event",
];

const EDGE_TYPES: readonly EdgeType[] = [
  "controls",
  "owns",
  "employs",
  "has_member",
  "located_at",
  "registered_in",
  "linked_to",
  "related_to",
  "mentions",
  "participated_in",
  "acquired",
  "sanctioned_by",
  "associated_with",
];

export interface AiEntityProposal {
  name: string;
  type: EntityType;
  aliases?: string[];
  attributes?: Record<string, unknown>;
}

export interface AiRelationshipProposal {
  /** Entity name (matches an AiEntityProposal.name). */
  source: string;
  /** Entity name (matches an AiEntityProposal.name). */
  target: string;
  type: EdgeType;
  confidence?: number;
  rationale?: string;
}

export interface AnalysisResult {
  requestId: string;
  entities: AiEntityProposal[];
  relationships: AiRelationshipProposal[];
  usage: { inputTokens: number; outputTokens: number };
}

const ANALYZE_TOOL: AiToolDefinition = {
  name: "analyze_text",
  description:
    "Extract entities and the relationships between them from the provided intelligence document. " +
    "Only include entities that actually appear in the text. Do not speculate.",
  inputSchema: {
    type: "object",
    properties: {
      entities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ENTITY_TYPES },
            aliases: { type: "array", items: { type: "string" } },
            attributes: { type: "object" },
          },
          required: ["name", "type"],
        },
      },
      relationships: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source: { type: "string" },
            target: { type: "string" },
            type: { type: "string", enum: EDGE_TYPES },
            confidence: { type: "number", description: "0–1" },
            rationale: { type: "string", description: "One sentence: which text supports this edge" },
          },
          required: ["source", "target", "type"],
        },
      },
    },
    required: ["entities", "relationships"],
  },
};

const SYSTEM_PROMPT = `You are an OSINT extraction engine embedded in an analyst workspace.
Rules:
- Extract only entities explicitly present in the document.
- Prefer canonical names (registry names, full legal names over acronyms).
- Keep aliases short (initials, common shorthand).
- Relationships must connect two extracted entities and be supported by the text.
- Mark clear ownership/control signals (owns, controls, employs, has_member, registered_in, located_at, sanctioned_by).
- When in doubt use related_to or linked_to at low confidence (0.3–0.6).
- Confidence is your certainty that the relationship exists as stated, 0–1.
- Rationale: quote the supporting fragment in one sentence.`;

export async function analyzeDocument(text: string): Promise<AnalysisResult> {
  const client = getAiClient();
  const response = await client.completeStructured({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
    tools: [ANALYZE_TOOL],
    maxTokens: 4096,
  });

  const tool = response.toolUses.find((t) => t.name === "analyze_text");
  const raw = tool?.input as
    | { entities?: Array<Record<string, unknown>>; relationships?: Array<Record<string, unknown>> }
    | undefined;

  const entities: AiEntityProposal[] = [];
  const seen = new Set<string>();
  for (const item of raw?.entities ?? []) {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) continue;
    const type = item.type as EntityType;
    if (!ENTITY_TYPES.includes(type)) continue;
    const key = normalizeName(name);
    if (seen.has(key)) continue; // in-document duplicates collapse
    seen.add(key);
    entities.push({
      name,
      type,
      aliases: Array.isArray(item.aliases)
        ? item.aliases.filter((a): a is string => typeof a === "string").slice(0, 8)
        : undefined,
      attributes:
        item.attributes && typeof item.attributes === "object"
          ? (item.attributes as Record<string, unknown>)
          : undefined,
    });
  }

  const byName = new Map(entities.map((e) => [normalizeName(e.name), e]));
  const relationships: AiRelationshipProposal[] = [];
  for (const item of raw?.relationships ?? []) {
    if (typeof item.source !== "string" || typeof item.target !== "string") continue;
    const type = item.type as EdgeType;
    if (!EDGE_TYPES.includes(type)) continue;
    const source = byName.get(normalizeName(item.source));
    const target = byName.get(normalizeName(item.target));
    if (!source || !target || source === target) continue;
    relationships.push({
      source: source.name,
      target: target.name,
      type,
      confidence: typeof item.confidence === "number" ? Math.min(1, Math.max(0, item.confidence)) : undefined,
      rationale: typeof item.rationale === "string" ? item.rationale.slice(0, 240) : undefined,
    });
  }

  return {
    requestId: response.requestId,
    entities,
    relationships,
    usage: response.usage,
  };
}

/**
 * Map a validated analysis to connector-shaped events so the ingest
 * pipeline (dedup, provenance merge, proposed edges) handles the write.
 * `sourceUrl` becomes the provenance anchor for every card and edge.
 */
export function analysisToEvents(
  analysis: Pick<AnalysisResult, "entities" | "relationships">,
  sourceUrl: string,
): EntityStreamEvent[] {
  const fetchedAt = new Date().toISOString();
  const sourceRef: SourceRef = {
    connectorId: "ai",
    title: "AI document analysis",
    url: sourceUrl,
    fetchedAt,
  };
  const byName = new Map(analysis.entities.map((e) => [normalizeName(e.name), e]));

  return analysis.entities.map((entity) => {
    const externalId = `ai-${nameFingerprint(entity.name)}`;
    return {
      connectorId: "ai",
      entityType: entity.type,
      entity: {
        externalId,
        type: entity.type,
        name: entity.name,
        aliases: entity.aliases,
        attributes: {
          ...entity.attributes,
          aiGenerated: true,
          analysisSource: sourceUrl,
        },
        sources: [sourceRef],
      },
      relationships: analysis.relationships
        .filter((r) => normalizeName(r.source) === normalizeName(entity.name))
        .map((r): RawRelationship | null => {
          const target = byName.get(normalizeName(r.target));
          if (!target) return null;
          return {
            type: r.type,
            source: externalId,
            target: `ai-${nameFingerprint(target.name)}`,
            confidence: r.confidence ?? 0.8,
            attributes: r.rationale ? { rationale: r.rationale } : undefined,
            sources: [sourceRef],
          };
        })
        .filter((r): r is RawRelationship => r !== null),
      sourceUrl,
      fetchedAt,
      confidence: 0.8,
    };
  });
}
