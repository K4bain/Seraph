/**
 * Deduplication fingerprints — pure functions used by the graph
 * engine to detect that two RawEntities refer to the same real-world
 * thing. No DB access; unit-testable in isolation.
 */

/** Fold case, strip diacritics, collapse whitespace, drop common suffixes. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(inc|inc\.|llc|ltd|limited|corp|corporation|gmbh|sa|sarl|co|company|s\.l\.?)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical dedup key: normalized name of the entity's primary attribute. */
export function nameFingerprint(name: string): string {
  return normalizeName(name);
}

/** Fingerprint for an IP or domain type — strip protocol, ports, trailing slashes. */
export function networkFingerprint(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/:\d+$/, "")
    .replace(/\/.*$/, "")
    .trim();
}

/** Fingerprint for a location — coarse geohash prefix bucketing. */
export function geohashFingerprint(lat: number, lon: number, precision = 4): string {
  return geohash(lat, lon, precision);
}

/* ------------------------------------------------------------------ */
/* Minimal geohash (Base32, interleaved bits)                          */
/* ------------------------------------------------------------------ */

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function geohash(lat: number, lon: number, precision = 7): string {
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) {
        ch = (ch << 1) | 1;
        lonMin = mid;
      } else {
        ch = ch << 1;
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch = ch << 1;
        latMax = mid;
      }
    }
    even = !even;
    bit += 1;
    if (bit === 5) {
      hash += BASE32[ch] ?? "0";
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/* ------------------------------------------------------------------ */
/* Fuzzy name similarity (Levenshtein)                                 */
/* ------------------------------------------------------------------ */

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array<number>(n + 1);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}

/** Similarity in [0, 1] between two normalized names. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x === y) return 1;
  const dist = levenshtein(x, y);
  const maxLen = Math.max(x.length, y.length, 1);
  return 1 - dist / maxLen;
}

/**
 * Decision helper: should `a` be treated as the same entity as `b`?
 * Above the confirm threshold the engine proposes a merge (never
 * auto-merges — human confirmation required, see design principles).
 */
export function shouldProposeMerge(a: string, b: string, threshold = 0.92): boolean {
  return nameSimilarity(a, b) >= threshold;
}
