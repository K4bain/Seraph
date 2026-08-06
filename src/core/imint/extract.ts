/**
 * IMINT metadata extraction — server-only.
 *
 * Reads EXIF / image container metadata off an uploaded image buffer with
 * `exifr` (no heavy native deps like sharp). Returns a normalized, analyst-
 * friendly view: capture time, GPS coordinates, camera make/model and the
 * pixel dimensions. GPS is resolved to decimal degrees lazily via exifr's
 * `gps()` reader; when a file carries no location we simply omit it —
 * never guess, never call out to an external API here.
 */

import { parse, gps } from "exifr";

export interface ImageMetadata {
  /** Capture time as an ISO string, when the camera/tool recorded one. */
  takenAt?: string;
  /** WGS84 latitude in decimal degrees (when the file has GPS). */
  gpsLat?: number;
  /** WGS84 longitude in decimal degrees (when the file has GPS). */
  gpsLon?: number;
  cameraMake?: string;
  cameraModel?: string;
  width?: number;
  height?: number;
}

export interface NormalizedMeta {
  metadata: ImageMetadata;
  /** True if the file carried embedded GPS coordinates. */
  hasLocation: boolean;
}

type RawExif = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  return undefined;
}

/**
 * Normalize date-like EXIF values (ISO string, JS Date, or "YYYY:MM:DD
 * HH:MM:SS" GPS-style strings) into an ISO timestamp.
 */
function normalizeDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return value.toISOString();
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!Number.isNaN(new Date(trimmed).getTime())) return new Date(trimmed).toISOString();
  // exifr emits "YYYY:MM:DD HH:MM:SS" (& variants — the EXIF date format).
  const m = trimmed.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

/**
 * Extract normalized image metadata from a raw file buffer.
 * Never throws for unsupported/opaque files — returns an empty metadata
 * object so callers can present a "no embedded metadata" result.
 */
export async function extractImageMetadata(input: Uint8Array | Buffer | ArrayBuffer): Promise<NormalizedMeta> {
  try {
    const raw = (await parse(input)) as RawExif | undefined;
    let gpsLat: number | undefined;
    let gpsLon: number | undefined;
    try {
      const loc = await gps(input);
      gpsLat = asNumber(loc?.latitude);
      gpsLon = asNumber(loc?.longitude);
    } catch {
      // no GPS segment — coordinates stay undefined
    }

    const takenAt = normalizeDate(
      (raw as RawExif)?.DateTimeOriginal ?? (raw as RawExif)?.CreateDate ?? (raw as RawExif)?.DateTime,
    );

    const metadata: ImageMetadata = {
      takenAt,
      gpsLat,
      gpsLon,
      cameraMake: asString((raw as RawExif)?.Make),
      cameraModel: asString((raw as RawExif)?.Model),
      width: asNumber((raw as RawExif)?.ImageWidth ?? (raw as RawExif)?.PixelXDimension),
      height: asNumber((raw as RawExif)?.ImageHeight ?? (raw as RawExif)?.PixelYDimension),
    };

    const hasLocation = gpsLat !== undefined && gpsLon !== undefined;
    return { metadata, hasLocation };
  } catch {
    // Unsupported format / corrupt file — treat as "no metadata".
    return { metadata: {}, hasLocation: false };
  }
}

/** Render decimal degrees as a copy-friendly "lat, lon" string. */
export function formatCoordinates(meta: ImageMetadata): string | undefined {
  if (meta.gpsLat === undefined || meta.gpsLon === undefined) return undefined;
  const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
  return `${round(meta.gpsLat % 360)}, ${round(((meta.gpsLon % 360) + 360) % 360)}`;
}

/** Human-friendly hint shown when a file carries GPS but no geocoder key. */
export function locationHint(meta: ImageMetadata): string | undefined {
  if (meta.gpsLat === undefined || meta.gpsLon === undefined) return undefined;
  return "Embedded GPS found — raw decimal coordinates returned. Configure a geocoder key to reverse-geocode an address.";
}