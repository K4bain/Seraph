/**
 * World events feed (server-only).
 *
 * GDELT DOC 2.0 is the only GDELT surface reachable from this network —
 * the GEO API 404s behind the TLS filter — so "world events" are a
 * broad-topic DOC query. HTTPS first, plain-HTTP fallback, rate-limit
 * backoff, exactly like the gdelt connector.
 */

const API_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const FETCH_TIMEOUT_MS = 20_000;
const WORLD_QUERY = "(attack OR crisis OR protest OR election OR war OR sanctions OR disaster OR outbreak)";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class RateLimitedError extends Error {}

/** GDELT seendate ("20260715T083000Z") → ISO string. */
export function parseSeendate(seendate: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seendate);
  if (!match) return seendate;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

export interface FeedEvent {
  id: string;
  title: string;
  url: string;
  domain: string;
  language: string;
  /** GDELT composite tone, −100..100. */
  tone: number;
  date: string;
}

interface GdelArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  language?: string;
  tone?: number;
}

interface GdelDocResponse {
  articles?: GdelArticle[];
}

/** One URL, up to 4 attempts with backoff; 429s surface as RateLimitedError. */
export async function fetchDoc(url: string): Promise<GdelDocResponse> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(5_000 * 2 ** (attempt - 1));
    const res = await fetch(url, {
      headers: { "User-Agent": "seraph-feed/0.1 (OSINT research)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (res.status === 429) {
      if (attempt === 3) throw new RateLimitedError("gdelt feed: rate limited after retries (429)");
      continue;
    }
    if (!res.ok) throw new Error(`gdelt feed: API returned ${res.status} ${res.statusText}`);

    const text = await res.text();
    try {
      return JSON.parse(text) as GdelDocResponse;
    } catch {
      const snippet = text.slice(0, 160).replace(/\s+/g, " ").trim();
      if (/queries|limit requests|please try again/i.test(snippet)) {
        throw new RateLimitedError(`gdelt feed: throttled — ${snippet}`);
      }
      throw new Error(`gdelt feed: unexpected response — ${snippet}`);
    }
  }
  throw new RateLimitedError("gdelt feed: rate limited after retries (429)");
}

/** Latest world news events (last 12h). */
export async function getWorldEvents(): Promise<FeedEvent[]> {
  const params = new URLSearchParams({
    query: WORLD_QUERY,
    mode: "artlist",
    format: "json",
    maxrecords: "50",
    timespan: "12h",
  });

  const candidates = [API_BASE, API_BASE.replace(/^https:/, "http:")];
  let data: GdelDocResponse | undefined;
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      data = await fetchDoc(`${candidate}?${params}`);
      break;
    } catch (error) {
      lastError = error;
      if (error instanceof RateLimitedError) throw error;
    }
  }
  if (!data) throw lastError;

  return (data.articles ?? [])
    .filter((article) => article.url)
    .map((article, index) => ({
      id: article.url ?? `gdelt-${index}`,
      title: article.title ?? "Untitled article",
      url: article.url!,
      domain: article.domain ?? "",
      language: article.language ?? "",
      tone: article.tone ?? 0,
      date: article.seendate ? parseSeendate(article.seendate) : new Date().toISOString(),
    }));
}

/** Tone → pill palette. */
export function toneLevel(tone: number): "positive" | "negative" | "neutral" {
  if (tone > 5) return "positive";
  if (tone < -5) return "negative";
  return "neutral";
}
