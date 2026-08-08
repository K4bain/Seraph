"use client";

import { useCallback, useState } from "react";
import { Database, Loader2, MapPin, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImageDropzone } from "@/components/geolocate/ImageDropzone";
import { GeolocateResults } from "@/components/geolocate/GeolocateResults";
import type { GeolocateResponse } from "@/components/geolocate/types";

interface ApiError {
  error: string;
  code?: string;
  status: number;
}

export default function GeolocatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GeolocateResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const onSelect = useCallback(
    (selected: File | null) => {
      if (!selected) return;
      setFile(selected);
      setFileName(selected.name);
      setResult(null);
      setError(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(selected));
    },
    [preview],
  );

  const clear = () => {
    setFile(null);
    setFileName(null);
    setResult(null);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  async function findLocation() {
    if (!file || busy) return;
    setBusy(true);
    setResult(null);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/geolocate", { method: "POST", body: fd });
      const body = (await res.json()) as GeolocateResponse;
      if (!res.ok) {
        setError({
          error: body.error ?? "geolocate_error",
          code: body.code,
          status: res.status,
        });
      } else {
        setResult(body);
      }
    } catch {
      setError({
        error: "network_error",
        status: 0,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="GEO"
        eyebrowIcon={MapPin}
        title="Geolocate"
        subtitle="Upload a photo to search the CLIP + FAISS index for the location it was most likely taken."
      />

      <Card>
        <CardContent className="space-y-4 p-6">
          <ImageDropzone
            preview={preview}
            fileName={fileName}
            disabled={busy}
            onSelect={onSelect}
          />
          {fileName && <div className="font-mono text-xs text-muted-foreground">{fileName}</div>}
          <div className="flex items-center gap-3">
            <Button onClick={() => void findLocation()} disabled={!file || busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
              {busy ? "Searching…" : "Find location"}
            </Button>
            {file && (
              <Button variant="outline" onClick={clear}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 p-6 text-sm">
            {error.status === 502 || error.code === "GEO_UNAVAILABLE" ? (
              <Database className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-medium text-destructive">
                {error.status === 502 || error.code === "GEO_UNAVAILABLE"
                  ? "Index not reachable"
                  : error.error}
              </div>
              <div className="text-muted-foreground">
                {error.status === 502 || error.code === "GEO_UNAVAILABLE"
                  ? "The geolocate service could not be reached. The search index may be down or still starting up — try again shortly."
                  : "The geolocate request was rejected. Check the image and try again."}
              </div>
              <div className="font-mono text-xs text-muted-foreground">{error.error}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {result && !error && <GeolocateResults result={result} />}
    </div>
  );
}
