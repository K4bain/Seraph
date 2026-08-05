/**
 * Whatsmyname connector — username-existence search.
 *
 * Search-only. Uses the public WebBreacher/WhatsMyName dataset
 * (https://raw.githubusercontent.com/WebBreacher/WhatsMyName/master/wmn-data.json,
 * ~720 platforms, CC BY-SA). The task description's legacy
 * `webmint/WhatsMyName` mirror is gone; this default points at the
 * maintained upstream, and `configure({ dataUrl })` overrides it.
 *
 * Each site entry encodes the "claimed vs unclaimed" comparison the
 * dataset is famous for as a pair of signatures:
 *   - e_code/e_string — HTTP status + body marker when the account EXISTS
 *   - m_code/m_string — HTTP status + body marker when the account is MISSING
 * We fetch the check URI for the queried account, read status + body,
 * and compare against both signatures. This is strictly more reliable
 * than the naive "200 + page contains the username" heuristic because
 * many platforms (Instagram, X, eBay…) return 200 for missing accounts
 * too. Sites that expose a literal `username_unclaimed` (legacy
 * schema) get a true diff fallback: fetch the unclaimed URI and
 * compare — different status or materially different body ⇒ exists.
 *
 * Site-level failures (timeout, 403, bad template) are swallowed and
 * logged; the query itself never throws for a single broken site.
 */

import { defineConnector } from "seraph-connector-sdk";
import type { SearchResponse, SearchResultItem } from "seraph-connector-sdk";

const DEFAULT_DATA_URL = "https://raw.githubusercontent.com/WebBreacher/WhatsMyName/master/wmn-data.json";
const FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_SITES = 40;
const MAX_CONCURRENCY = 8;
/** Refresh the site catalog once an hour at most (it's ~400 KB). */
const DATA_TTL_MS = 3_600_000;

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** True for any username-shaped query (letters, digits, ._- up to 50). */
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/;

/**
 * Curated allowlist of well-known platforms (names as they appear in
 * wmn-data). Kept to ~50 GET-only sites so a search stays within a
 * sane latency budget; every check is short-timed (5 s) and runs
 * 8-at-a-time. Add/remove names here to tune coverage.
 */
const CURATED_SITES = new Set([
  "X", "Reddit", "Instagram", "Facebook", "Telegram", "Steam", "TikTok",
  "Twitch", "Keybase", "VK", "Snapchat", "Threads", "Pinterest", "tumblr",
  "Flickr", "DeviantArt", "Dribbble", "GitLab", "Bitbucket", "StackOverflow",
  "dev.to", "npm", "Replit", "Codeforces", "SoundCloud", "Spotify", "Last.fm",
  "Bandcamp", "Medium", "YouTube Channel", "Vimeo", "Etsy", "eBay",
  "Kickstarter", "Patreon", "Venmo", "MySpace", "Gravatar", "Fandom",
  "itch.io", "Strava", "tripadvisor", "Duolingo", "MyAnimeList", "Discogs",
  "CodeSandbox", "Hacker News", "Mixcloud", "Producthunt",
]);

interface WhatsMyNameSite {
  name?: string;
  uri_check?: string;
  check_uri?: string;
  uri_construction?: string;
  uri_pretty?: string;
  e_code?: string | number;
  e_string?: string;
  m_code?: string | number;
  m_string?: string;
  strip_bad_char?: string;
  post_body?: string;
  headers?: Record<string, string>;
  cat?: string;
  username_unclaimed?: string;
}

/** Remove per-site characters that must never appear in the account. */
export function stripAccount(site: WhatsMyNameSite, account: string): string {
  const bad = site.strip_bad_char;
  if (!bad) return account;
  return [...account].filter((char) => !bad.includes(char)).join("");
}

/** Build the check URL from whatever template field the dataset uses. */
export function buildCheckUri(site: WhatsMyNameSite, account: string): string | undefined {
  const template = site.uri_check ?? site.check_uri ?? site.uri_construction;
  if (!template) return undefined;
  return template.replace(/\{account\}/gi, encodeURIComponent(stripAccount(site, account)));
}

function toCode(value: string | number | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const code = Number(value);
  return Number.isInteger(code) && code > 0 ? code : undefined;
}

/**
 * Decide existence from the fetched status + body against the site's
 * e_* (exists) and m_* (missing) signatures. Returns true (exists),
 * false (missing), or null (indeterminate — neither signature hit).
 */
export function decideSite(
  status: number,
  body: string,
  site: WhatsMyNameSite,
): boolean | null {
  const eCode = toCode(site.e_code) ?? 200;
  const mCode = toCode(site.m_code);
  const eString = site.e_string?.trim() ?? "";
  const mString = site.m_string?.trim() ?? "";

  const eMatch = status === eCode && (eString === "" || body.includes(eString));
  const mMatch = (mCode !== undefined && status === mCode) || (mString !== "" && body.includes(mString));

  if (eMatch) return true;
  if (mMatch) return false;
  return null;
}

/** True when the claimed response materially differs from the unclaimed one. */
function differsFromUnclaimed(
  claimedStatus: number,
  claimedBody: string,
  unclaimedStatus: number,
  unclaimedBody: string,
): boolean {
  if (claimedStatus !== unclaimedStatus) return true;
  const a = claimedBody.length;
  const b = unclaimedBody.length;
  return Math.abs(a - b) > Math.max(32, a * 0.05);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

const siteCache = new Map<string, { fetchedAt: number; sites: WhatsMyNameSite[] }>();

async function fetchCatalog(dataUrl: string): Promise<WhatsMyNameSite[]> {
  const cached = siteCache.get(dataUrl);
  if (cached && Date.now() - cached.fetchedAt < DATA_TTL_MS) return cached.sites;

  const res = await fetch(dataUrl, {
    headers: { "User-Agent": BROWSER_UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`whatsmyname: dataset fetch failed (${res.status})`);
  const data = (await res.json()) as { sites?: WhatsMyNameSite[] };
  const sites = data.sites ?? [];
  siteCache.set(dataUrl, { fetchedAt: Date.now(), sites });
  return sites;
}

export const whatsmynameConnector = defineConnector({
  manifest: {
    id: "whatsmyname",
    name: "Whatsmyname",
    version: "0.1.0",
    description: "Username existence across ~50 platforms (free, no key)",
    author: "seraph",
    webhookSupported: false,
    entityTypes: ["person"],
  },

  config: {
    dataUrl: DEFAULT_DATA_URL,
    maxSites: String(DEFAULT_MAX_SITES),
  },

  async configure(config) {
    this.config = { ...this.config, ...config };
  },

  async search({ query }): Promise<SearchResponse> {
    const account = query.trim();
    if (!USERNAME_PATTERN.test(account)) {
      // Not a username-shaped term — the other connectors may still
      // hit, so surface this as an empty (not error) source.
      return { results: [] };
    }

    let sites: WhatsMyNameSite[];
    try {
      const catalog = await fetchCatalog(this.config.dataUrl || DEFAULT_DATA_URL);
      sites = catalog.filter((site) => CURATED_SITES.has(site.name ?? "") && !site.post_body);
    } catch (error) {
      console.warn(`[whatsmyname] catalog unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return { results: [] };
    }

    const maxSites = Math.min(Number(this.config.maxSites) || DEFAULT_MAX_SITES, DEFAULT_MAX_SITES);
    const ordered = sites
      .sort((a, b) => (CURATED_SITES.has(a.name ?? "") ? 0 : 1) - (CURATED_SITES.has(b.name ?? "") ? 0 : 1))
      .slice(0, maxSites);

    const checked = await mapLimit(ordered, MAX_CONCURRENCY, async (site): Promise<SearchResultItem | null> => {
      try {
        const url = buildCheckUri(site, account);
        if (!url) return null;

        const headers: Record<string, string> = { "User-Agent": BROWSER_UA, Accept: "text/html,application/json,*/*" };
        for (const [name, value] of Object.entries(site.headers ?? {})) headers[name] = value;

        const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        const status = res.status;
        const body = await res.text();

        let exists: boolean | null = decideSite(status, body, site);

        // Legacy-schema sites carry an explicit unclaimed account: do a
        // true claimed-vs-unclaimed diff when the signatures were silent.
        if (exists === null && site.username_unclaimed) {
          const unclaimedUrl = buildCheckUri(site, site.username_unclaimed);
          if (unclaimedUrl) {
            try {
              const unclaimed = await fetch(unclaimedUrl, {
                headers: { "User-Agent": BROWSER_UA },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
              });
              exists = differsFromUnclaimed(status, body, unclaimed.status, await unclaimed.text());
            } catch {
              exists = null;
            }
          }
        }
        if (exists !== true) return null;

        const pretty = site.uri_pretty
          ? site.uri_pretty.replace(/\{account\}/gi, encodeURIComponent(stripAccount(site, account)))
          : url;
        return {
          title: `${site.name ?? "Platform"} — ${account}`,
          description: `${site.name ?? "Platform"} profile for "${account}"${site.cat ? ` · ${site.cat}` : ""}`,
          url: pretty,
          category: site.cat ?? site.name ?? "profile",
          source: "Whatsmyname",
          entityType: "person",
          name: account,
          externalId: `${site.name ?? "unknown"}:${account}`,
          metadata: {
            site: site.name,
            statusCode: status,
            matchedString: site.e_string ?? undefined,
          },
        };
      } catch (error) {
        // Site-level failures (timeout/403/bot-wall) never sink the query.
        console.warn(
          `[whatsmyname] ${site.name ?? "unknown"} check failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    });

    return { results: checked.filter((item): item is SearchResultItem => item !== null) };
  },
});
