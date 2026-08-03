/**
 * Merge proposal scanner (AI stage 2 surface).
 *
 * Scans a canvas document for entity cards that may refer to the same
 * real-world thing, using the fingerprint + fuzzy-name similarity from
 * src/core/graph/dedup. Returns proposed merges — never auto-merges.
 * The analyst reviews via /api/merge-proposals and confirms via
 * /api/merge-proposals/apply.
 */

import type { CanvasDocument, CardNode } from "@/store/canvas";
import type { EntityCard } from "seraph-graph-types";
import { nameSimilarity } from "@/core/graph/dedup";

export interface MergeProposal {
  primaryId: string;
  duplicateId: string;
  primaryName: string;
  duplicateName: string;
  similarity: number;
}

export interface MergeProposalsResult {
  proposals: MergeProposal[];
  scanned: number;
}

export function findMergeProposals(doc: CanvasDocument, threshold = 0.92): MergeProposalsResult {
  const entityNodes = (doc.nodes ?? []).filter(
    (n): n is CardNode & { data: { card: EntityCard } } => n.data?.card?.kind === "entity",
  );

  const proposals: MergeProposal[] = [];

  for (let i = 0; i < entityNodes.length; i++) {
    for (let j = i + 1; j < entityNodes.length; j++) {
      const a = entityNodes[i]!;
      const b = entityNodes[j]!;
      const cardA = a.data.card;
      const cardB = b.data.card;

      if (cardA.entity.fingerprint === cardB.entity.fingerprint) continue;

      const sim = nameSimilarity(cardA.entity.name, cardB.entity.name);
      if (sim < threshold) continue;

      const aOlder = cardA.createdAt <= cardB.createdAt;
      const primary = aOlder ? a : b;
      const duplicate = aOlder ? b : a;

      proposals.push({
        primaryId: primary.id,
        duplicateId: duplicate.id,
        primaryName: primary.data.card.entity.name,
        duplicateName: duplicate.data.card.entity.name,
        similarity: Math.round(sim * 100) / 100,
      });
    }
  }

  return { proposals, scanned: entityNodes.length };
}

export function applyMerge(
  doc: CanvasDocument,
  primaryId: string,
  duplicateId: string,
): CanvasDocument {
  const nodes = doc.nodes ?? [];
  const edges = doc.edges ?? [];

  const primaryNode = nodes.find((n) => n.id === primaryId);
  const duplicateNode = nodes.find((n) => n.id === duplicateId);

  if (!primaryNode || !duplicateNode) return doc;

  const primaryCard = primaryNode.data?.card;
  const duplicateCard = duplicateNode.data?.card;
  if (!primaryCard || primaryCard.kind !== "entity") return doc;
  if (!duplicateCard || duplicateCard.kind !== "entity") return doc;

  const pe = primaryCard.entity;
  const de = duplicateCard.entity;
  const seenUrls = new Set(pe.sources.map((s) => s.url));
  pe.sources = [...pe.sources, ...de.sources.filter((s) => !seenUrls.has(s.url))];
  pe.aliases = [...new Set([...(pe.aliases ?? []), ...(de.aliases ?? [])])];
  pe.confidence = Math.max(pe.confidence, de.confidence);
  pe.firstSeen = pe.firstSeen ?? de.firstSeen;
  pe.lastSeen = de.lastSeen ?? pe.lastSeen;
  primaryCard.updatedAt = new Date().toISOString();

  doc.nodes = nodes.filter((n) => n.id !== duplicateId);
  doc.edges = edges.map((edge) => {
    if (edge.source === duplicateId) return { ...edge, source: primaryId };
    if (edge.target === duplicateId) return { ...edge, target: primaryId };
    return edge;
  });

  const seen = new Set<string>();
  doc.edges = doc.edges.filter((edge) => {
    const rel = edge.data?.relationship ?? "linked_to";
    const key = `${edge.source}--${rel}--${edge.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return doc;
}
