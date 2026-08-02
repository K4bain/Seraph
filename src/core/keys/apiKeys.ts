/**
 * API key management for the MCP endpoint and programmatic access.
 *
 * Only an HMAC-SHA256 hash of each token is persisted; the plaintext
 * `seraph_<id>.<secret>` token is shown to the caller exactly once.
 * Verification is timing-safe on both the hit and miss paths so key
 * lookups are not a timing oracle.
 *
 * Server-only: imports Prisma and reads env at call time (lazy, so a
 * missing signing secret never breaks `next build`).
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "../db";

const TOKEN_PREFIX = "seraph_";
const SECRET_BYTES = 32;
const ID_BYTES = 8;

export interface GeneratedKey {
  /** `seraph_<id>` — the DB lookup handle, stored plaintext. */
  prefix: string;
  /** 43 url-safe chars from 32 random bytes — shown once, never stored. */
  secret: string;
  /** HMAC-SHA256(signingKey, fullToken) hex — the persisted credential. */
  keyHash: string;
  /** `seraph_<id>.<secret>` — the full bearer token, shown once. */
  token: string;
}

export interface AuthenticatedKey {
  keyId: string;
  keyName: string;
}

function getSigningKey(): string {
  const dedicated = process.env.API_KEY_HMAC_SECRET;
  const fallback = process.env.AUTH_SECRET;
  const key = dedicated ?? fallback;
  if (!key) {
    throw new Error("API_KEY_HMAC_SECRET (or AUTH_SECRET) must be set");
  }
  return key;
}

function hmacHex(token: string): string {
  return createHmac("sha256", getSigningKey()).update(token).digest("hex");
}

export function generateApiKey(): GeneratedKey {
  const id = randomBytes(ID_BYTES).toString("base64url");
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const prefix = `${TOKEN_PREFIX}${id}`;
  const token = `${prefix}.${secret}`;
  return { prefix, secret, keyHash: hmacHex(token), token };
}

/**
 * lastUsedAt write throttle: at most one DB write per key per minute,
 * fire-and-forget. Per-replica; fine at Seraph's scale, move to Redis
 * if the app ever multi-replicates.
 */
const lastUsedThrottle = new Map<string, number>();
const THROTTLE_MS = 60_000;
const THROTTLE_TTL_MS = THROTTLE_MS * 2;

function recordLastUsed(keyId: string): void {
  const now = Date.now();
  if (now - (lastUsedThrottle.get(keyId) ?? 0) <= THROTTLE_MS) return;
  lastUsedThrottle.set(keyId, now);
  for (const [k, ts] of lastUsedThrottle) {
    if (now - ts > THROTTLE_TTL_MS) lastUsedThrottle.delete(k);
  }
  void prisma.apiKey
    .update({ where: { id: keyId }, data: { lastUsedAt: new Date() } })
    .catch(() => {
      /* intentional — never block the request on telemetry */
    });
}

/**
 * Resolve an `Authorization: Bearer seraph_<id>.<secret>` header to its
 * key. Returns null on every failure path (missing header, malformed
 * token, unknown id, revoked key, wrong secret, DB outage).
 */
export async function authenticateApiKey(
  request: Request,
): Promise<AuthenticatedKey | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice(7).trim();
  const dotIdx = token.indexOf(".");
  if (dotIdx === -1) return null;
  const prefix = token.slice(0, dotIdx);
  const fullToken = token; // hash the whole thing, not just the secret

  let row: { id: string; name: string; keyHash: string; revokedAt: Date | null } | null;
  try {
    row = await prisma.apiKey.findUnique({
      where: { id: prefix },
      select: { id: true, name: true, keyHash: true, revokedAt: true },
    });
  } catch (err) {
    console.warn("[apiKeys] DB error during key lookup:", err instanceof Error ? err.name : "unknown");
    return null;
  }

  const supplied = Buffer.from(hmacHex(fullToken), "hex");
  const stored = Buffer.from(row?.keyHash ?? hmacHex("__seraph_dummy__"), "hex");
  const valid = timingSafeEqual(supplied, stored);

  if (!row || !valid || row.revokedAt) return null;

  recordLastUsed(row.id);
  return { keyId: row.id, keyName: row.name };
}
