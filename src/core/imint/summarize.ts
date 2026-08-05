/**
 * IMINT analyst summary — server-only.
 *
 * Feeds the normalized image *metadata* (never the raw pixels) to the AI
 * layer to produce a short analyst-style note. Reuses the shared OpenRouter
 * client from src/core/ai/client.ts. If no OPENROUTER_API_KEY is configured
 * the function returns an empty string — the API route then omits the
 * `aiSummary` field entirely rather than surfacing an error.
 *
 * Geocoding is intentionally NOT attempted here: no external API is called
 * without a configured key, so the model simply reasons over the raw coords
 * and we let the UI show the friendly geocoder hint.
 */

import { getAiClient } from "@/core/ai/client";
import { formatCoordinates, type ImageMetadata } from "./extract";

const SYSTEM_PROMPT =
  "You are an OSINT image analyst. Read the embedded EXIF metadata capture for a " +
  "photograph and write a short, professional analyst note (2-4 sentences). " +
  "State what can be established (camera, capture time, location) and flag what is " +
  "uncertain, e.g. that EXIF timestamp/geotags can be spoofed and prove only the " +
  "device that wrote the file, not who took the image. Never invent fields absent " +
  "from the metadata. No disclaimers preamble.";

/**
 * Produce a short analyst summary from image metadata, or "" when the AI
 * layer is not configured. Never throws for missing config.
 */
export async function summarizeImageMetadata(meta: ImageMetadata): Promise<string> {
  const ai = getAiClient();
  if (!ai.isConfigured()) return "";

  const coords = formatCoordinates(meta);
  const transcript: Record<string, string> = {
    captured: meta.takenAt ? new Date(meta.takenAt).toISOString() : "unknown",
    latitude: meta.gpsLat !== undefined ? String(meta.gpsLat) : "unknown",
    longitude: meta.gpsLon !== undefined ? String(meta.gpsLon) : "unknown",
    camera_make: meta.cameraMake ?? "unknown",
    camera_model: meta.cameraModel ?? "unknown",
    dimensions:
      meta.width !== undefined && meta.height !== undefined ? `${meta.width}x${meta.height}` : "unknown",
  };

  try {
    const response = await ai.complete({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `EXIF metadata capture:\n${Object.entries(transcript)
            .map(([k, v]) => `- ${k}: ${v}`)
            .join("\n")}${coords ? `\n- coordinates: ${coords}` : ""}`,
        },
      ],
      maxTokens: 400,
    });
    return response.text.trim();
  } catch {
    // A failure to reach the model must never break the imint route.
    return "";
  }
}