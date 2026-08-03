/**
 * Watchlist polling (server-only).
 *
 * The connector-runner worker calls pollWatchlist() every 30 minutes.
 * For every WatchlistItem it runs a GDELT DOC 2.0 artlist query for the
 * quoted term since lastCheck (capped at a 24h window — GDELT rejects
 * start/end spans over 48h and the Railway worker may sleep for long
 * stretches), writes WatchlistAlert rows for new URLs, then advances
 * lastCheck. Per-item failure never aborts the sweep: the error is
 * collected and lastCheck is left stale so the item is retried.
 */

import { prisma } from "@/core/db";
import { fetchDoc } from "./events";

const DOC_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const MAX_ALERTS_PER_ITEM = 50;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
/** GDELT rejects start datetimes too close to now (min span ≈ 1 hour). */
const MIN_WINDOW_MS = 60 * 60 * 1000;
/** GDELT free tier allows ~1 request per 5 s per IP — pace items. */
const INTER_ITEM_DELAY_MS = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface WatchlistPollResult {
  itemsChecked: number;
  alertsCreated: number;
  skippedDuplicates: number;
  errors: Array<{ term: string; error: string }>;
}

interface GdelArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  tone?: number;
}

interface GdelDocResponse {
  articles?: GdelArticle[];
}

/** Date → GDELT startdatetime ("20260715083000"). */
function gdeltDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/** Quoted phrase query; strip embedded quotes so GDELT syntax stays intact. */
function phraseQuery(term: string): string {
  return `"${term.replace(/"/g, "").trim()}"`;
}

/** https first, then plain http — both hosts rate-limit independently. */
async function fetchWithFallback(params: URLSearchParams): Promise<GdelDocResponse> {
  let lastError: unknown;
  for (const candidate of [DOC_BASE, DOC_BASE.replace(/^https:/, "http:")]) {
    try {
      return await fetchDoc(`${candidate}?${params}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** Sweep every watchlist item once; returns per-item outcomes. */
export async function pollWatchlist(): Promise<WatchlistPollResult> {
  const result: WatchlistPollResult = { itemsChecked: 0, alertsCreated: 0, skippedDuplicates: 0, errors: [] };
  const items = await prisma.watchlistItem.findMany({ orderBy: { createdAt: "asc" } });

  for (const item of items) {
    try {
      const now = Date.now();
      const since = item.lastCheck ?? new Date(now - MAX_WINDOW_MS);
      const windowStart = new Date(
        Math.min(Math.max(since.getTime(), now - MAX_WINDOW_MS), now - MIN_WINDOW_MS),
      );

      const params = new URLSearchParams({
        query: phraseQuery(item.term),
        mode: "artlist",
        format: "json",
        maxrecords: String(MAX_ALERTS_PER_ITEM),
        startdatetime: gdeltDatetime(windowStart),
      });

      const data = await fetchWithFallback(params);
      const articles = (data.articles ?? []).filter((article) => article.url);

      if (articles.length > 0) {
        const urls = articles.map((article) => article.url!);
        const existing = await prisma.watchlistAlert.findMany({
          where: { watchlistId: item.id, url: { in: urls } },
          select: { url: true },
        });
        const known = new Set(existing.map((row) => row.url));
        const fresh = articles.filter((article) => !known.has(article.url!));

        if (fresh.length > 0) {
          // PrismaNeonHttp adapter rejects createMany (it runs as a
          // transaction) — create per row instead.
          await Promise.all(
            fresh.map((article) =>
              prisma.watchlistAlert.create({
                data: {
                  watchlistId: item.id,
                  headline: article.title ?? "Untitled article",
                  source: article.domain ?? "",
                  url: article.url,
                  tone: article.tone ?? null,
                },
              }),
            ),
          );
          result.alertsCreated += fresh.length;
          result.skippedDuplicates += articles.length - fresh.length;
        }
      }

      await prisma.watchlistItem.update({ where: { id: item.id }, data: { lastCheck: new Date() } });
      result.itemsChecked += 1;
    } catch (error) {
      result.errors.push({
        term: item.term,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (items.length > 1) await sleep(INTER_ITEM_DELAY_MS);
  }

  return result;
}
