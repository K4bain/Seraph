/**
 * WHOIS connector — search-only, domain lookups via whois-json
 * (free, no key; talks to the IANA server registry). Returns
 * registrant/registrar/creation/expiry fields for a domain.
 *
 * Note: the underlying whois package contacts whois servers over
 * port 43 — network-dependent; failures surface as status "error".
 */

import { defineConnector } from "seraph-connector-sdk";
import type { SearchResponse, SearchResultItem } from "seraph-connector-sdk";
import whoisJson from "whois-json";

const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;

function pick(result: Record<string, string | string[] | undefined>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    for (const [field, value] of Object.entries(result)) {
      if (field.toLowerCase().includes(key.toLowerCase()) && typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return undefined;
}

export const whoisConnector = defineConnector({
  manifest: {
    id: "whois",
    name: "WHOIS",
    version: "0.1.0",
    description: "Domain registration records (free, no key)",
    author: "seraph",
    webhookSupported: false,
    entityTypes: ["domain"],
  },

  async configure() {
    // No config surface — keyless, stateless lookups.
  },

  async search({ query }): Promise<SearchResponse> {
    // Bare terms ("google") are almost always the .com registration
    // people mean on a domain search — try the exact term first, then
    // the .com suffix. Explicit non-domain input still errors.
    const trimmed = query.trim().toLowerCase();
    const candidates = DOMAIN_PATTERN.test(trimmed)
      ? [trimmed]
      : trimmed.includes(".") && !trimmed.endsWith(".")
        ? [trimmed, `${trimmed}.com`]
        : [`${trimmed}.com`];
    if (!trimmed || /[\s/\\]/.test(trimmed)) {
      throw new Error(`whois: "${query}" is not a valid domain`);
    }

    let lastError: unknown;
    for (const domain of candidates) {
      try {
        return await lookup(domain);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error(`whois: lookup failed for "${query}"`);
  },
});

async function lookup(domain: string): Promise<SearchResponse> {
  const raw = await whoisJson(domain, { follow: 2, timeout: 15_000 });
    const result = Array.isArray(raw)
      ? raw.map((entry) => entry.data).reduce<Record<string, string | string[] | undefined>>(
          (acc, entry) => ({ ...acc, ...entry }),
          {},
        )
      : raw;

    const registrar = pick(result, "registrar");
    const registrant = pick(result, "registrant organization", "registrant name", "registrant");
    const created = pick(result, "creation date", "created");
    const expiry = pick(result, "registry expiry date", "expiration date", "expiry");
    const updated = pick(result, "updated date", "last updated");

    const details = [
      registrant ? `Registrant: ${registrant}` : undefined,
      registrar ? `Registrar: ${registrar}` : undefined,
      created ? `Created: ${created}` : undefined,
      expiry ? `Expires: ${expiry}` : undefined,
    ].filter(Boolean);

    const results: SearchResultItem[] = [
      {
        title: domain,
        description: details.join(" · ") || "Domain registration record",
        url: `https://${domain}`,
        category: "domain",
        source: "WHOIS",
        entityType: "domain",
        name: domain,
        date: created ? toIso(created) : undefined,
        metadata: {
          registrant,
          registrar,
          created,
          expiry,
          updated,
        },
      },
    ];
    return { results };
}

/** whois servers return free-form dates ("2024-01-01", "20240101", "Jan 1 2024"). */
function toIso(value: string): string {
  const normalized = value.replace(/\./g, "-").replace(/\//g, "-");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}
