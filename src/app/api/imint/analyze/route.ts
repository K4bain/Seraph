/**
 * POST /api/imint/analyze
 *
 * Accepts a multipart/form-data image upload, extracts embedded metadata
 * (EXIF / container headers) client-side w/ `exifr` and returns a normalized
 * analyst view: { metadata, aiSummary? }.
 *
 * - GPS/EXIF is reverse-geocoded lazily only when a geocoder key is set; with
 *   no key we return the raw decimal coords plus a friendly hint, we never
 *   call an external API blindly.
 * - The AI summary is generated from the metadata (not the raw image) only if
 *   OPENROUTER_API_KEY is configured; otherwise `aiSummary` is omitted
 *   (never an error).
 */

import { extractImageMetadata, formatCoordinates, locationHint } from "@/core/imint/extract";
import { summarizeImageMetadata } from "@/core/imint/summarize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const bodySizeLimit = "6mb";

const MAX_BYTES = 6 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { error: "invalid_form", hint: "Send the image as multipart/form-data." },
      { status: 400 },
    );
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return Response.json(
      { error: "image_required", hint: "Include an image file under the field name 'image'." },
      { status: 400 },
    );
  }

  if (file.size === 0 || file.size > MAX_BYTES) {
    return Response.json(
      {
        error: "image_too_large",
        hint: `Image must be non-empty and under ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`,
      },
      { status: 413 },
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const { metadata, hasLocation } = await extractImageMetadata(buffer);

  const coords = formatCoordinates(metadata);
  const hint = hasLocation ? locationHint(metadata) : undefined;

  let aiSummary: string | undefined;
  if (Object.keys(metadata).length > 0) {
    aiSummary = await summarizeImageMetadata(metadata);
    if (!aiSummary) aiSummary = undefined;
  }

  return Response.json({
    file: {
      name: file.name || undefined,
      type: file.type || undefined,
      bytes: file.size,
    },
    metadata,
    coords: coords ?? null,
    geocode: { hint },
    ...(aiSummary ? { aiSummary } : {}),
  });
}