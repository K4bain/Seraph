/**
 * Object storage client — MinIO/S3 compatible.
 *
 * Stores fetched documents (PDFs, HTML snapshots, images) for connectors
 * and server-side exports. Activates when S3_ENDPOINT is set; otherwise
 * falls back to a no-op stub that returns empty URLs.
 *
 * Server-only (imports aws-sdk, which is Node-only).
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.S3_BUCKET ?? "seraph";
const PREFIX = process.env.S3_PREFIX ?? "docs/";
const PUBLIC_BASE = process.env.S3_PUBLIC_BASE ?? "";

let _client: S3Client | null = null;

function getClient(): S3Client | null {
  if (_client) return _client;
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION ?? "us-east-1";
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKey || !secretKey) return null;

  _client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: true,
  });
  return _client;
}

export function isStorageConfigured(): boolean {
  return getClient() !== null;
}

export interface StoredObject {
  key: string;
  url: string;
  size: number;
}

export async function putObject(
  key: string,
  body: Buffer | string,
  contentType: string,
): Promise<StoredObject | null> {
  const client = getClient();
  if (!client) return null;

  const fullKey = `${PREFIX}${key}`;
  const buffer = typeof body === "string" ? Buffer.from(body) : body;

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: fullKey,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  const url = PUBLIC_BASE
    ? `${PUBLIC_BASE}/${fullKey}`
    : `${process.env.S3_ENDPOINT}/${BUCKET}/${fullKey}`;

  return { key: fullKey, url, size: buffer.length };
}

export async function getObject(key: string): Promise<Buffer | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: `${PREFIX}${key}` }),
    );
    if (!response.Body) return null;
    return Buffer.from(await response.Body.transformToByteArray());
  } catch {
    return null;
  }
}
