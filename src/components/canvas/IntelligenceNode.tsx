"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { EntityCard, EventCard, MemoCard, SourceCard } from "meridian-graph-types";
import { useCanvasStore, type CardNode } from "@/store/canvas";
import styles from "./IntelligenceNode.module.css";

const KIND_LABEL: Record<string, string> = {
  entity: "ENTITY",
  event: "EVENT",
  memo: "MEMO",
  source: "SOURCE",
};

function EntityBody({ card }: { card: EntityCard }) {
  return (
    <div className={styles.body}>
      <div className={styles.entityName}>{card.entity.name}</div>
      <div className={styles.metaRow}>
        <span className={styles.mono}>{card.entity.type}</span>
        <span className={styles.confidence}>
          {Math.round(card.entity.confidence * 100)}%
        </span>
      </div>
      <div className={styles.metaRow}>
        <span className={styles.muted}>
          {card.entity.sources.length} source{card.entity.sources.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function EventBody({ card }: { card: EventCard }) {
  const updateCard = useCanvasStore((s) => s.updateCard);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className={styles.body} onDoubleClick={(e) => e.stopPropagation()}>
        <input
          name="event-title"
          className={styles.memoEdit}
          defaultValue={card.title}
          autoFocus
          onBlur={(e) => {
            const title = e.target.value.trim();
            if (title) updateCard(card.id, { ...card, title });
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <input
          name="event-date"
          type="date"
          className={styles.memoEdit}
          defaultValue={card.occurredAt.slice(0, 10)}
          onBlur={(e) => {
            if (e.target.value) {
              const occurredAt = new Date(`${e.target.value}T12:00:00Z`).toISOString();
              updateCard(card.id, { ...card, occurredAt });
            }
          }}
        />
        <textarea
          name="event-summary"
          className={styles.memoEdit}
          defaultValue={card.summary ?? ""}
          placeholder="Summary…"
          onBlur={(e) => {
            const summary = e.target.value.trim();
            updateCard(card.id, { ...card, summary: summary || undefined });
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
          }}
        />
        <div className={styles.metaRow}>
          <span className={styles.muted}>click out · Esc to cancel</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.body} onDoubleClick={() => setEditing(true)} title="Double-click to edit">
      <div className={styles.entityName}>{card.title}</div>
      <div className={styles.metaRow}>
        <span className={styles.mono}>{card.occurredAt.slice(0, 10)}</span>
        <span className={styles.muted}>double-click to edit</span>
      </div>
      {card.summary ? <p className={styles.summary}>{card.summary}</p> : null}
    </div>
  );
}

function MemoBody({ card }: { card: MemoCard }) {
  const updateCard = useCanvasStore((s) => s.updateCard);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className={styles.body} onDoubleClick={(e) => e.stopPropagation()}>
        <textarea
          className={styles.memoEdit}
          defaultValue={card.body}
          autoFocus
          onBlur={(e) => {
            const body = e.target.value.trim();
            if (body) updateCard(card.id, { ...card, body });
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
          }}
        />
        <div className={styles.metaRow}>
          <span className={styles.muted}>Ctrl+Enter ↵ · Esc to cancel</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.body} onDoubleClick={() => setEditing(true)} title="Double-click to edit">
      <p className={styles.summary}>{card.body}</p>
      {card.aiGenerated ? (
        <div className={styles.metaRow}>
          <span className={styles.aiTag}>AI-generated · unconfirmed</span>
        </div>
      ) : (
        <div className={styles.metaRow}>
          <span className={styles.muted}>double-click to edit</span>
        </div>
      )}
    </div>
  );
}

function SourceBody({ card }: { card: SourceCard }) {
  const updateCard = useCanvasStore((s) => s.updateCard);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className={styles.body} onDoubleClick={(e) => e.stopPropagation()}>
        <input
          name="source-title"
          className={styles.memoEdit}
          defaultValue={card.title}
          autoFocus
          onBlur={(e) => {
            const title = e.target.value.trim();
            if (title) updateCard(card.id, { ...card, title });
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <input
          name="source-url"
          className={styles.memoEdit}
          defaultValue={card.url}
          placeholder="https://…"
          onBlur={(e) => {
            const url = e.target.value.trim();
            if (url) updateCard(card.id, { ...card, url });
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <div className={styles.metaRow}>
          <span className={styles.muted}>click out · Esc to cancel</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.body} onDoubleClick={() => setEditing(true)} title="Double-click to edit">
      <div className={styles.entityName}>{card.title}</div>
      <div className={styles.metaRow}>
        <span className={styles.muted}>{card.url}</span>
      </div>
    </div>
  );
}

function IntelligenceNode({ data, selected }: NodeProps<CardNode>) {
  const card = data.card;
  const kind = card.kind;

  return (
    <div className={`${styles.node}${selected ? ` ${styles.selected}` : ""}`}>
      <div className={`${styles.header} ${styles[kind]}`}>
        <span className={styles.kind}>{KIND_LABEL[kind]}</span>
        {card.meridianId ? (
          <span className={styles.nodeId} title="Canonical graph record">
            {card.meridianId.slice(0, 8)}
          </span>
        ) : null}
      </div>

      {kind === "entity" && <EntityBody card={card} />}
      {kind === "event" && <EventBody card={card} />}
      {kind === "memo" && <MemoBody card={card} />}
      {kind === "source" && <SourceBody card={card} />}

      <Handle type="target" position={Position.Left} className={styles.handle} />
      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
}

export default memo(IntelligenceNode);
