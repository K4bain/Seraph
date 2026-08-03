/**
 * GitHub connector — search-only. Public user search + profile fetch.
 * Free, no key; anonymous API rate limits (60 core req/hr) mean the
 * profile lookups stay capped at the top matches.
 *
 * Docs: https://docs.github.com/en/rest/search
 */

import { defineConnector } from "seraph-connector-sdk";
import type { SearchResponse, SearchResultItem } from "seraph-connector-sdk";

const SEARCH_BASE = "https://api.github.com/search/users";
const USER_BASE = "https://api.github.com/users";
const FETCH_TIMEOUT_MS = 20_000;

interface GitHubUserSearchResponse {
  items?: Array<{
    login: string;
    html_url?: string;
    type?: string;
  }>;
}

interface GitHubUserProfile {
  name?: string | null;
  bio?: string | null;
  followers?: number;
  blog?: string | null;
  location?: string | null;
}

async function githubFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "seraph-connector/0.1 (OSINT research)",
      "Accept": "application/vnd.github+json",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`github: API returned ${res.status} ${res.statusText}`);
  return res.json();
}

export const githubConnector = defineConnector({
  manifest: {
    id: "github",
    name: "GitHub",
    version: "0.1.0",
    description: "Developer/account profile search (free, no key)",
    author: "seraph",
    webhookSupported: false,
    entityTypes: ["person"],
  },

  async configure() {
    // No config surface — keyless API with anonymous rate limits.
  },

  async search({ query }): Promise<SearchResponse> {
    const data = (await githubFetch(`${SEARCH_BASE}?q=${encodeURIComponent(query)}&per_page=10`)) as GitHubUserSearchResponse;
    const items = (data.items ?? []).filter((item) => item.type === "User").slice(0, 10);

    const results: SearchResultItem[] = [];
    for (const item of items) {
      // Profile fetch is best-effort: anonymous core limits (60/hr)
      // degrade gracefully to login-only rows instead of failing.
      let profile: GitHubUserProfile | undefined;
      try {
        profile = (await githubFetch(`${USER_BASE}/${encodeURIComponent(item.login)}`)) as GitHubUserProfile;
      } catch {
        // rate limited or user gone — login-only row is still useful
      }

      const detail = [
        profile?.bio,
        profile?.followers !== undefined ? `${profile.followers} followers` : undefined,
        profile?.location,
      ].filter(Boolean);

      results.push({
        title: profile?.name ?? item.login,
        description: detail.join(" · ") || item.login,
        url: item.html_url ?? `${USER_BASE}/${item.login}`,
        category: "GitHub user",
        source: "GitHub",
        entityType: "person",
        name: item.login,
        externalId: item.login,
        metadata: {
          login: item.login,
          followers: profile?.followers,
          blog: profile?.blog ?? undefined,
          location: profile?.location ?? undefined,
        },
      });
    }
    return { results };
  },
});
