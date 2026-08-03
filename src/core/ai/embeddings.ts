/**
 * Voyage AI embeddings client — server-only.
 *
 * Calls the Voyage AI embeddings API to generate vector embeddings for
 * entity names/attributes. Embeddings power semantic dedup beyond the
 * string fingerprints in src/core/graph/dedup.ts.
 *
 * Activates when VOYAGE_API_KEY is set. No key is required to boot.
 */

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const DEFAULT_MODEL = "voyage-3-lite";
const EMBEDDING_DIM = 512;

export class EmbeddingsNotConfiguredError extends Error {
  constructor() {
    super("VOYAGE_API_KEY is not set. Add it to .env to enable semantic dedup.");
    this.name = "EmbeddingsNotConfiguredError";
  }
}

export interface EmbeddingResult {
  embedding: number[];
  usage: { totalTokens: number };
}

export class EmbeddingsClient {
  private readonly apiKey: string | undefined;

  constructor(apiKey = process.env.VOYAGE_API_KEY) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async embed(text: string, inputType: "document" | "query" = "document"): Promise<EmbeddingResult> {
    if (!this.apiKey) throw new EmbeddingsNotConfiguredError();

    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: [text],
        model: process.env.VOYAGE_MODEL ?? DEFAULT_MODEL,
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Voyage API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
      usage: { total_tokens: number };
    };

    return {
      embedding: data.data[0]?.embedding ?? [],
      usage: { totalTokens: data.usage?.total_tokens ?? 0 },
    };
  }

  async embedBatch(texts: string[], inputType: "document" | "query" = "document"): Promise<EmbeddingResult[]> {
    if (!this.apiKey) throw new EmbeddingsNotConfiguredError();
    if (texts.length === 0) return [];

    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: process.env.VOYAGE_MODEL ?? DEFAULT_MODEL,
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Voyage API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
      usage: { total_tokens: number };
    };

    return (data.data ?? []).map((d) => ({
      embedding: d.embedding,
      usage: { totalTokens: data.usage?.total_tokens ?? 0 },
    }));
  }
}

let _client: EmbeddingsClient | undefined;

export function getEmbeddingsClient(): EmbeddingsClient {
  _client ??= new EmbeddingsClient();
  return _client;
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export const EMBEDDING_DIMENSIONS = EMBEDDING_DIM;
