"use client";

/**
 * SearchOverlay — compact floating search pill pinned top-centre of the globe
 * pane. Offline gazetteer lookups via placesSearch; Esc closes, Enter flies to
 * the first result. Styling is fully self-contained (no parent CSS).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { CesiumNS } from "./cesiumLoader";
import { flyToResult, searchPlaces, type SearchResult } from "./placesSearch";
import styles from "./SearchOverlay.module.css";

export interface SearchOverlayProps {
  cesium: CesiumNS;
  /** Live Cesium viewer instance (optional — supply onFlyTo otherwise). */
  viewer?: unknown;
  /** Override fly behaviour; defaults to flyToResult(cesium, viewer, r). */
  onFlyTo?: (r: SearchResult) => void;
  placeholder?: string;
}

export default function SearchOverlay({
  cesium,
  viewer,
  onFlyTo,
  placeholder = "Search places…",
}: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => (query.trim() ? searchPlaces(query, 8) : []), [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const fly = (r: SearchResult) => {
    if (onFlyTo) onFlyTo(r);
    else flyToResult(cesium, viewer, r);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const first = results[activeIndex] ?? results[0];
      if (first) fly(first);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.pill}>
        <Search className={styles.icon} />
        <input
          ref={inputRef}
          className={styles.input}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          aria-label="Search places"
        />
        {query && (
          <button type="button" className={styles.clear} onClick={() => setQuery("")} aria-label="Clear search">
            <X className={styles.icon} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className={styles.drop}>
          {results.map((r, idx) => (
            <button
              key={`${r.name}-${r.kind}`}
              type="button"
              className={`${styles.item}${idx === activeIndex ? " " + styles.itemActive : ""}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => fly(r)}
            >
              <span className={styles.itemName}>{r.name}</span>
              <span className={styles.itemHint}>
                {r.country ? `${r.country} · ` : ""}
                {r.kind}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}