/**
 * Canvas PDF generator — client-side via jsPDF.
 *
 * Reads the live canvas store state (not the persisted snapshot) so
 * unsaved changes are captured. Produces a structured intelligence
 * report: entities table, events timeline, relationships matrix,
 * memos, and sources.
 */

import autoTable from "jspdf-autotable";
import { jsPDF } from "jspdf";
import type {
  EntityCard,
  EventCard,
  MemoCard,
  SourceCard,
  EdgeType,
  SourceRef,
} from "meridian-graph-types";
import type { CardNode, RelationEdge } from "@/store/canvas";

/* ---- colour tokens matching the instrument-panel aesthetic ---- */

const COL = {
  bg: [11, 14, 19] as [number, number, number],
  panel: [19, 25, 36] as [number, number, number],
  border: [35, 44, 61] as [number, number, number],
  text: [220, 227, 238] as [number, number, number],
  muted: [139, 149, 168] as [number, number, number],
  accent: [232, 163, 61] as [number, number, number],
} as const;

/* ---- helpers ---- */

function labelForType(et: EdgeType): string {
  const labels: Record<EdgeType, string> = {
    controls: "Controls",
    owns: "Owns",
    employs: "Employs",
    has_member: "Has member",
    located_at: "Located at",
    registered_in: "Registered in",
    linked_to: "Linked to",
    related_to: "Related to",
    mentions: "Mentions",
    participated_in: "Participated in",
    acquired: "Acquired",
    sanctioned_by: "Sanctioned by",
    associated_with: "Associated with",
  };
  return labels[et];
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtPct(v: number | undefined): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

function nodeLabel(id: string, nodes: CardNode[]): string {
  const node = nodes.find((n) => n.id === id);
  if (!node) return id;
  const card = node.data?.card;
  if (!card) return id;
  if (card.kind === "entity") return card.entity.name;
  if (card.kind === "event") return card.title;
  if (card.kind === "memo") return card.body.slice(0, 40);
  if (card.kind === "source") return card.title;
  return id;
}

function sourceList(sources: SourceRef[] | undefined): string {
  if (!sources || sources.length === 0) return "—";
  return sources
    .slice(0, 3)
    .map((s) => s.title ?? s.url)
    .join("; ");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/**
 * jspdf-autotable stores the last table's final Y on the doc instance at
 * runtime, but the property isn't on jsPDF's type. Read it defensively.
 */
function lastTableFinalY(doc: jsPDF): number | undefined {
  const d = doc as unknown as { lastAutoTable?: { finalY?: number } };
  return d.lastAutoTable?.finalY;
}

/* ---- page geometry + cursor ---- */

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** Mutable vertical cursor shared across the build. */
interface Cursor {
  y: number;
}

function applyBackground(doc: jsPDF): void {
  doc.setFillColor(...COL.bg);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
}

function newPage(doc: jsPDF, cur: Cursor): void {
  doc.addPage();
  applyBackground(doc);
  cur.y = MARGIN;
}

function ensureSpace(doc: jsPDF, cur: Cursor, needed: number): void {
  if (cur.y + needed > PAGE_H - MARGIN) {
    newPage(doc, cur);
  }
}

function sectionHeader(doc: jsPDF, cur: Cursor, text: string): void {
  ensureSpace(doc, cur, 12);
  cur.y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COL.accent);
  doc.text(text.toUpperCase(), MARGIN, cur.y);
  doc.setTextColor(...COL.text);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  cur.y += 5;
}

/** Shared autotable options. */
function tableOpts(startY: number) {
  return {
    startY,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    theme: "plain" as const,
    styles: {
      fillColor: COL.panel,
      textColor: COL.text,
      font: "helvetica" as const,
      fontSize: 8,
      cellPadding: 2,
      lineColor: COL.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: COL.border,
      textColor: COL.accent,
      fontStyle: "bold" as const,
      fontSize: 7,
    },
  };
}

/* ---- public API ---- */

export interface PdfExportOptions {
  canvasId: string;
  nodes: CardNode[];
  edges: RelationEdge[];
  /** ISO timestamp for the export. */
  exportedAt?: string;
}

export function generateCanvasPdf(opts: PdfExportOptions): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const cur: Cursor = { y: MARGIN };
  const timestamp = opts.exportedAt ?? new Date().toISOString();

  // ---- cover ----
  applyBackground(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...COL.accent);
  doc.text("MERIDIAN", MARGIN, 50);
  doc.setFontSize(10);
  doc.setTextColor(...COL.muted);
  doc.text("Intelligence Canvas Export", MARGIN, 58);

  doc.setFontSize(9);
  doc.setTextColor(...COL.text);
  doc.text(`Canvas:  ${opts.canvasId}`, MARGIN, 78);
  doc.text(
    `Exported: ${fmtDate(timestamp)} ${new Date(timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
    MARGIN,
    84,
  );

  const entityCount = opts.nodes.filter((n) => n.data?.card?.kind === "entity").length;
  const eventCount = opts.nodes.filter((n) => n.data?.card?.kind === "event").length;
  const edgeCount = opts.edges.length;
  const memoCount = opts.nodes.filter((n) => n.data?.card?.kind === "memo").length;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COL.muted);
  doc.text(
    `${entityCount} entities  ·  ${eventCount} events  ·  ${edgeCount} relationships  ·  ${memoCount} memos`,
    MARGIN,
    94,
  );

  cur.y = 104;

  // ---- entities ----
  const entities = opts.nodes
    .filter((n): n is CardNode & { data: { card: EntityCard } } => n.data?.card?.kind === "entity")
    .map((n) => n.data.card);

  if (entities.length > 0) {
    sectionHeader(doc, cur, `Entities (${entities.length})`);
    autoTable(doc, {
      ...tableOpts(cur.y),
      head: [["Name", "Type", "Confidence", "Sources"]],
      body: entities.map((e) => [
        truncate(e.entity.name, 42),
        e.entity.type,
        fmtPct(e.entity.confidence),
        truncate(sourceList(e.entity.sources), 50),
      ]),
    });
    cur.y = lastTableFinalY(doc) ?? cur.y + 10;
    cur.y += 4;
  }

  // ---- events ----
  const events = opts.nodes
    .filter((n): n is CardNode & { data: { card: EventCard } } => n.data?.card?.kind === "event")
    .map((n) => n.data.card)
    .sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));

  if (events.length > 0) {
    sectionHeader(doc, cur, `Events (${events.length})`);
    autoTable(doc, {
      ...tableOpts(cur.y),
      head: [["Date", "Title", "Summary"]],
      body: events.map((e) => [
        fmtDate(e.occurredAt),
        truncate(e.title, 45),
        truncate(e.summary ?? "", 60),
      ]),
    });
    cur.y = lastTableFinalY(doc) ?? cur.y + 10;
    cur.y += 4;
  }

  // ---- relationships ----
  if (opts.edges.length > 0) {
    sectionHeader(doc, cur, `Relationships (${opts.edges.length})`);
    autoTable(doc, {
      ...tableOpts(cur.y),
      head: [["Source", "Relationship", "Target", "Conf.", "Proposed"]],
      body: opts.edges.map((e) => [
        truncate(nodeLabel(e.source, opts.nodes), 30),
        labelForType(e.data?.relationship ?? "linked_to"),
        truncate(nodeLabel(e.target, opts.nodes), 30),
        fmtPct(e.data?.confidence),
        e.data?.proposed ? "Yes" : "",
      ]),
    });
    cur.y = lastTableFinalY(doc) ?? cur.y + 10;
    cur.y += 4;
  }

  // ---- memos ----
  const memos = opts.nodes
    .filter((n): n is CardNode & { data: { card: MemoCard } } => n.data?.card?.kind === "memo")
    .map((n) => n.data.card);

  if (memos.length > 0) {
    sectionHeader(doc, cur, `Memos (${memos.length})`);
    for (const m of memos) {
      ensureSpace(doc, cur, 14);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...COL.muted);
      const prefix = m.aiGenerated ? "[AI] " : "";
      const lines = doc.splitTextToSize(prefix + m.body, CONTENT_W);
      const blockH = lines.length * 4 + 3;
      ensureSpace(doc, cur, blockH);
      doc.text(lines, MARGIN, cur.y);
      cur.y += blockH;
    }
    doc.setFont("helvetica", "normal");
  }

  // ---- sources ----
  const sources = opts.nodes
    .filter((n): n is CardNode & { data: { card: SourceCard } } => n.data?.card?.kind === "source")
    .map((n) => n.data.card);

  if (sources.length > 0) {
    sectionHeader(doc, cur, `Sources (${sources.length})`);
    autoTable(doc, {
      ...tableOpts(cur.y),
      head: [["Title", "URL", "Fetched"]],
      body: sources.map((s) => [
        truncate(s.title, 50),
        truncate(s.url, 60),
        fmtDate(s.fetchedAt),
      ]),
    });
  }

  // ---- footer on every page ----
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COL.muted);
    doc.text(
      `Meridian Intelligence Report — ${opts.canvasId} — Page ${i}/${totalPages}`,
      MARGIN,
      PAGE_H - 8,
    );
    doc.text(`Exported ${fmtDate(timestamp)}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  return doc;
}
