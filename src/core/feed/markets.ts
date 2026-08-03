/**
 * Markets feed (server-only).
 *
 * yahoo-finance2 (v4) quotes for the core symbols, 30-day daily closes
 * for sparklines, and daily gainers/losers as top movers. Every Yahoo
 * call is bounded by a timeout — a slow or blocked API degrades that
 * section to empty instead of hanging the feed.
 */

import yahooFinance from "yahoo-finance2";

const CALL_TIMEOUT_MS = 12_000;

interface QuoteRow {
  symbol?: string;
  shortName?: string;
  regularMarketPrice?: number | null;
  regularMarketChangePercent?: number | null;
}

interface ChartRow {
  symbol?: string;
  meta?: { symbol?: string; shortName?: string };
  quotes?: Array<{ close?: number | null }>;
}

interface ScreenerRow {
  symbol?: string;
  shortName?: string;
  regularMarketPrice?: number | null;
  regularMarketChangePercent?: number | null;
}

interface YahooClient {
  quote(symbols: string[]): Promise<QuoteRow[]>;
  chart(symbol: string, options: { period1: number; interval: "1d" }): Promise<ChartRow>;
  screener(options: { scrIds: string; count?: number }): Promise<{ quotes?: ScreenerRow[] }>;
}

const yahooClient: YahooClient = new (yahooFinance as unknown as new (opts?: {
  suppressNotices?: string[];
}) => YahooClient)({ suppressNotices: ["yahooSurvey"] });

export const CORE_MARKETS: Array<{ symbol: string; name: string }> = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^IXIC", name: "Nasdaq" },
  { symbol: "^DJI", name: "Dow Jones" },
  { symbol: "BTC-USD", name: "Bitcoin" },
  { symbol: "ETH-USD", name: "Ethereum" },
];

export interface MarketSnapshot {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  /** Downsampled 30-day daily closes (≤20 points) for sparklines. */
  sparkline: number[];
}

export interface MarketsFeed {
  fetchedAt: string;
  core: MarketSnapshot[];
  movers: Array<{ symbol: string; name: string; price: number | null; changePercent: number | null }>;
  error?: string;
}

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), CALL_TIMEOUT_MS)),
  ]);
}

function downsample(values: number[], max = 20): number[] {
  if (values.length <= max) return values;
  const step = values.length / max;
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(values[Math.floor(i * step)]!);
  return out;
}

export async function getMarketsFeed(): Promise<MarketsFeed> {
  const fetchedAt = new Date().toISOString();
  const errors: string[] = [];

  let quotes: QuoteRow[] = [];
  try {
    quotes = await withTimeout(
      yahooClient.quote(CORE_MARKETS.map((market) => market.symbol)),
      [],
    );
  } catch (error) {
    errors.push(`quote: ${error instanceof Error ? error.message : String(error)}`);
  }

  const charts = await Promise.all(
    CORE_MARKETS.map(async (market) => {
      try {
        const chart = await withTimeout(
          yahooClient.chart(market.symbol, {
            period1: Math.floor(Date.now() / 1000) - 30 * 86_400,
            interval: "1d",
          }),
          null,
        );
        return {
          symbol: market.symbol,
          closes: (chart?.quotes ?? [])
            .map((quote) => quote.close)
            .filter((close): close is number => typeof close === "number"),
        };
      } catch (error) {
        errors.push(`chart ${market.symbol}: ${error instanceof Error ? error.message : String(error)}`);
        return { symbol: market.symbol, closes: [] };
      }
    }),
  );

  const core: MarketSnapshot[] = CORE_MARKETS.map((market) => {
    const quote = quotes.find((row) => row.symbol === market.symbol);
    const sparkline = downsample(charts.find((row) => row.symbol === market.symbol)?.closes ?? []);
    return {
      symbol: market.symbol,
      name: market.name,
      price: quote?.regularMarketPrice ?? null,
      changePercent: quote?.regularMarketChangePercent ?? null,
      sparkline,
    };
  });

  let movers: MarketsFeed["movers"] = [];
  try {
    const screen = await withTimeout(
      yahooClient.screener({ scrIds: "day_gainers", count: 5 }),
      null,
    );
    movers = (screen?.quotes ?? []).slice(0, 5).map((row) => ({
      symbol: row.symbol ?? "?",
      name: row.shortName ?? row.symbol ?? "?",
      price: row.regularMarketPrice ?? null,
      changePercent: row.regularMarketChangePercent ?? null,
    }));
  } catch (error) {
    errors.push(`movers: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { fetchedAt, core, movers, ...(errors.length > 0 ? { error: errors.join("; ") } : {}) };
}
