import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GEOLOCATE_DEFAULT_URL = "http://localhost:8000/geolocate";
const GEOLOCATE_TIMEOUT_MS = 12_000;

/**
 * POST /api/geolocate
 *
 * Accepts a multipart image (field `file`) plus an optional `k` (default 5)
 * and proxies it to the geolocate microservice (CLIP + FAISS search).
 * Returns the service JSON verbatim.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing image file (field: file)" }, { status: 400 });
  }

  const kRaw = form.get("k");
  const k = Number.isFinite(Number(kRaw)) && Number(kRaw) > 0 ? Number(kRaw) : 5;

  const upstream = new FormData();
  upstream.append("file", file, file.name);
  upstream.append("k", String(k));

  const url = process.env.GEOLOCATE_URL ?? GEOLOCATE_DEFAULT_URL;

  try {
    const res = await fetch(url, {
      method: "POST",
      body: upstream,
      signal: AbortSignal.timeout(GEOLOCATE_TIMEOUT_MS),
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "geolocate service unavailable", code: "GEO_UNAVAILABLE" },
      { status: 502 },
    );
  }
}
