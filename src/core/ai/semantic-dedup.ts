/**
 * Semantic dedup — uses Voyage AI embeddings for fuzzy entity matching
 * beyond the string fingerprints in src/core/graph/dedup.ts.
 *
 * Exact-name matches always win (handled by ingest). This module backs
 * the *proposal* tier: entities with different names but similar meaning
 * surface as merge proposals via /api/merge-proposals.
 *
 * Server-only (imports the embeddings client which touches process.env).
 */

import { getEmbeddingsClient, cosineSimilarity, type EmbeddingResult } from "./embeddings";
import type { CanvasDocument, CardNode } from "@/store/canvas";
import type { EntityCard } from "seraph-graph-types";
import { nameSimilarity } from "@/core/graph/dedup";

export interface SemanticMergeProposal {
  primaryId: string;
  duplicateId: string;
  primaryName: string;
  duplicateName: string;
  /** Cosine similarity of the embeddings (0–1). */
  semanticSimilarity: number;
  /** String-based name similarity (0–1), for context. */
  nameSimilarity: number;
}

/**
 * Scan a canvas for semantically similar entity pairs.
 * Embeds each entity name, then compares all pairs by cosine similarity.
 * Pairs above the threshold (default 0.75) become proposals — but only
 * if their string fingerprints differ (exact matches are already merged).
 */
export async function findSemanticMerges(
  doc: CanvasDocument,
  threshold = 0.75,
): Promise<{ proposals: SemanticMergeProposal[]; scanned: number }> {
  const client = getEmbeddingsClient();
  if (!client.isConfigured()) {
    return { proposals: [], scanned: 0 };
  }

  const entityNodes = (doc.nodes ?? []).filter(
    (n): n is CardNode & { data: { card: EntityCard } } => n.data?.card?.kind === "entity",
  );

  if (entityNodes.length < 2) {
    return { proposals: [], scanned: entityNodes.length };
  }

  // Embed all entity names in one batch.
  const names = entityNodes.map((n) => n.data.card.entity.name);
  let embeddings: EmbeddingResult[];
  try {
    embeddings = await client.embedBatch(names);
  } catch {
    return { proposals: [], scanned: entityNodes.length };
  }

  const proposals: SemanticMergeProposal[] = [];

  for (let i = 0; i < entityNodes.length; i++) {
    for (let j = i + 1; j < entityNodes.length; j++) {
      const a = entityNodes[i]!;
      const b = entityNodes[j]!;
      const cardA = a.data.card;
      const cardB = b.data.card;

      // Skip exact fingerprint matches — already merged by ingest.
      if (cardA.entity.fingerprint === cardB.entity.fingerprint) continue;

      const embA = embeddings[i]?.embedding;
      const embB = embeddings[j]?.embedding;
      if (!embA || !embB) continue;

      const sim = cosineSimilarity(embA, embB);
      if (sim < threshold) continue;

      const nameSim = nameSimilarity(cardA.entity.name, cardB.entity.name);

      // Primary = older card, duplicate = newer.
      const aOlder = cardA.createdAt <= cardB.createdAt;
      const primary = aOlder ? a : b;
      const duplicate = aOlder ? b : a;

      proposals.push({
        primaryId: primary.id,
        duplicateId: duplicate.id,
        primaryName: primary.data.card.entity.name,
        duplicateName: duplicate.data.card.entity.name,
        semanticSimilarity: Math.round(sim * 100) / 100,
        nameSimilarity: Math.round(nameSim * 100) / 100,
      });
    }
  }

  return { proposals, scanned: entityNodes.length };
}
