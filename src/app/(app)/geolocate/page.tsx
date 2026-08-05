"use client";

import * as React from "react";
import { useRef, useState } from "react";
import { Loader2, MapPin, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Candidate {
  lat: number | null;
  lon: number | null;
  score: number;
  provenance?: { type?: string; id?: number };
}

interface GeolocateResult {
  query_hash?: string | null;
  candidates?: Candidate[];
  metadata?: { exif?: Record<string, string> };
  error?: string;
  code?: string;
}

export default function GeolocatePage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [k, setK] = useState(5);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GeolocateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyFile(next: File | undefined | null) {
    if (!next || !next.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError(null);
    setFile(next);
    setResult(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(next));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    applyFile(e.dataTransfer.files?.[0]);
  }

  async function analyze() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file, file.name);
      body.append("k", String(k));
      const res = await fetch("/api/geolocate", { method: "POST", body });
      const data = (await res.json()) as GeolocateResult;
      if (!res.ok || data.error) {
        setError(data.error ?? `geolocate failed (${res.status})`);
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "geolocate failed");
    } finally {
      setBusy(false);
    }
  }

  const exif = result?.metadata?.exif ?? {};

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="Lenses"
        eyebrowIcon={MapPin}
        title="Geolocate"
        subtitle="Run a CLIP + FAISS image search against the geolocate index to rank candidate coordinates."
      />

      <Card>
        <CardHeader>
          <CardTitle>Query image</CardTitle>
          <CardDescription>Drop an image or pick one from your machine.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className={cn(
              "flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground transition-colors hover:border-primary",
              preview ? "border-solid" : "border-muted-foreground/30",
            )}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="query preview"
                className="max-h-64 max-w-full rounded-lg object-contain"
              />
            ) : (
              <span className="flex items-center gap-2 font-mono uppercase tracking-widest">
                <Upload className="size-5" />
                Drop image / click to browse
              </span>
            )}
            <Input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => applyFile(e.target.files?.[0])}
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <label
                htmlFor="geo-k"
                className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground"
              >
                Neighbors (k)
              </label>
              <Input
                id="geo-k"
                type="number"
                min={1}
                max={50}
                value={k}
                onChange={(e) => setK(Number(e.target.value))}
                className="w-28"
              />
            </div>
            <Button onClick={() => void analyze()} disabled={!file || busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {busy ? "Analyzing…" : "Analyze"}
            </Button>
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {result && !error ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Candidates</CardTitle>
              <CardDescription>
                Nearest-index matches, ranked by CLIP similarity score.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.candidates && result.candidates.length > 0 ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {result.candidates.map((c, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-border bg-card p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs uppercase text-primary">#{i + 1}</span>
                        <span className="ml-auto font-mono text-xs text-muted-foreground">
                          score&nbsp;{c.score.toFixed(4)}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-muted-foreground">
                        {c.lat != null ? `${c.lat.toFixed(6)}, ${c.lon?.toFixed(6)}` : "—"}
                      </div>
                      {c.provenance ? (
                        <div className="mt-1 font-mono text-[11px] text-muted-foreground/70">
                          {c.provenance.type ?? "faiss"} · idx {c.provenance.id}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No matches — the index may be empty. Seed it via the geolocate microservice.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Query metadata</CardTitle>
              <CardDescription>Query image hash and embedded EXIF.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm">
                query hash:{" "}
                <span className="text-muted-foreground">{result.query_hash ?? "—"}</span>
              </p>
              <div className="mt-4 overflow-x-auto">
                {Object.keys(exif).length > 0 ? (
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {Object.entries(exif).map(([key, value]) => (
                        <tr key={key} className="border-b border-border last:border-0">
                          <th className="py-1 pr-4 align-top font-mono text-xs font-normal text-muted-foreground">
                            {key}
                          </th>
                          <td className="py-1 font-mono text-muted-foreground">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted-foreground">No EXIF metadata found.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}