/**
 * OpenSanctions connector — sanctions/PEPS watchlist entities.
 *
 * Free, no key. Streams a dataset's `targets.simple.csv` from the
 * public data lake (data.opensanctions.org): line-based, so huge
 * watchlists are consumed incrementally and we stop after
 * `maxRecords`. `configure({ dataset })` picks the list
 * (e.g. "us_ofac_sdn", "eu_fsf", "peps").
 *
 * Docs: https://www.opensanctions.org/docs/developers/
 */

import { defineConnector } from "meridian-connector-sdk";
import type { EntityStreamEvent, EntityType } from "meridian-graph-types";

const INDEX_BASE = "https://data.opensanctions.org/datasets/latest";
const FETCH_TIMEOUT_MS = 60_000;

/** OpenSanctions schema → canonical EntityType. Unknown schemas are skipped. */
const SCHEMA_TO_TYPE: Record<string, EntityType> = {
  Person: "person",
  Company: "organization",
  Organization: "organization",
  LegalEntity: "organization",
  Vessel: "vessel",
  Aircraft: "aircraft",
  Location: "location",
  PostalAddress: "location",
  Domain: "domain",
};

/** Minimal RFC-4180 line parser: quoted fields, "" escapes, commas inside quotes. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

function splitList(value: string | undefined): string[] | undefined {
  const parts = (value ?? "").split(";").map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export const opensanctionsConnector = defineConnector({
  manifest: {
    id: "opensanctions",
    name: "OpenSanctions",
    version: "0.1.0",
    description: "Sanctions, PEP and crime-watchlist entities (free, no key)",
    author: "meridian",
    pollIntervalMs: 3_600_000,
    webhookSupported: false,
    entityTypes: ["person", "organization", "location", "vessel", "aircraft", "domain"],
  },

  config: {
    dataset: "us_ofac_sdn",
    maxRecords: "100",
  },

  async configure(config) {
    this.config = { ...this.config, ...config };
  },

  /** Resolve the dataset's targets CSV URL from its index (robust to layout drift). */
  async resolveTargetsUrl(dataset: string): Promise<string> {
    const res = await fetch(`${INDEX_BASE}/${dataset}/index.json`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`opensanctions: dataset "${dataset}" not found (${res.status})`);
    const index = (await res.json()) as {
      resources?: { name?: string; url?: string }[];
    };
    const targets = index.resources?.find((r) => r.name === "targets.simple.csv") ??
      index.resources?.find((r) => r.name === "targets.json");
    if (targets?.url) return targets.url;
    return `${INDEX_BASE}/${dataset}/targets.json`;
  },

  async *poll() {
    const dataset = this.config.dataset.trim() || "us_ofac_sdn";
    const maxRecords = Math.min(Number(this.config.maxRecords) || 100, 500);
    const targetsUrl = await this.resolveTargetsUrl(dataset);

    const res = await fetch(targetsUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`opensanctions: targets ${res.status}`);
    if (!res.body) throw new Error("opensanctions: no response body");

    const fetchedAt = new Date().toISOString();
    let emitted = 0;
    let header: string[] | null = null;
    let buffer = "";

    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim() === "") continue;
        if (!header) {
          header = parseCsvLine(line);
          continue;
        }
        if (emitted >= maxRecords) return;

        const fields = parseCsvLine(line);
        const col = (name: string): string | undefined => {
          const index = header!.indexOf(name);
          return index >= 0 ? fields[index] : undefined;
        };

        const type = SCHEMA_TO_TYPE[col("schema") ?? ""];
        const name = col("name");
        if (!type || !name) continue;

        const sourceRef = {
          connectorId: this.manifest.id,
          title: `OpenSanctions — ${col("dataset") ?? dataset}`,
          url: `https://www.opensanctions.org/entities/${col("id")}/`,
          fetchedAt,
        };

        const event: EntityStreamEvent = {
          connectorId: this.manifest.id,
          entityType: type,
          entity: {
            externalId: col("id"),
            type,
            name,
            aliases: splitList(col("aliases")),
            attributes: {
              countries: splitList(col("countries")),
              birthDate: col("birth_date") || undefined,
              addresses: splitList(col("addresses")),
              programIds: splitList(col("program_ids")),
            },
            firstSeen: col("first_seen") || undefined,
            lastSeen: col("last_seen") || undefined,
            sources: [sourceRef],
          },
          relationships: [],
          sourceUrl: sourceRef.url,
          fetchedAt,
          confidence: 0.9,
        };
        emitted += 1;
        yield event;
      }
    }
  },
});
