/**
 * GET /api/merge-proposals?canvasId=...
 *
 * Scans a canvas for potential duplicate entity cards and returns
 * merge proposals for analyst review. Never auto-merges.
 */

import { loadLatestCanvasDoc } from "@/core/canvas";
import { findMergeProposals } from "@/core/merge/proposals";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const canvasId = url.searchParams.get("canvasId");

  if (!canvasId) {
    return Response.json({ error: "canvasId_required" }, { status: 400 });
  }

  const doc = await loadLatestCanvasDoc(canvasId);
  const result = findMergeProposals(doc);
  return Response.json(result);
}
