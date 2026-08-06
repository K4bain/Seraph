"use client";

import { useCallback, useRef, useState } from "react";
import {
  Camera,
  Copy,
  Loader2,
  MapPin,
  ImageUp,
  ScanLine,
  Sparkles,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface ImgMetadata {
  takenAt?: string;
  gpsLat?: number;
  gpsLon?: number;
  cameraMake?: string;
  cameraModel?: string;
  width?: number;
  height?: number;
}

interface AnalyzeResult {
  file?: { name?: string; type?: string; bytes?: number };
  metadata?: ImgMetadata;
  coords?: string | null;
  geocode?: { hint?: string };
  aiSummary?: string;
  error?: string;
  hint?: string;
}

const FIELD_KEYS = ["takenAt", "gpsLat", "gpsLon", "cameraMake", "cameraModel", "width", "height"] as const;

function readableLabel(key: string): string {
  switch (key) {
    case "takenAt":
      return "Captured";
    case "gpsLat":
      return "Latitude";
    case "gpsLon":
      return "Longitude";
    case "cameraMake":
      return "Camera make";
    case "cameraModel":
      return "Camera model";
    case "width":
      return "Width";
    case "height":
      return "Height";
    default:
      return key;
  }
}

function formatValue(key: string, value: string | number | undefined): string {
  if (value === undefined || value === null) return "—";
  if (key === "takenAt") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";
  }
  if (key === "gpsLat" || key === "gpsLon") {
    return String(Number(value).toFixed(6)) + "°";
  }
  if (key === "width") return `${value} px`;
  if (key === "height") return `${value} px`;
  return String(value);
}

export default function ImintPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [copied, setCopied] = useState(false);

  const onDrop = useCallback((dropped: File | null) => {
    if (!dropped) return;
    setFile(dropped);
    setFileName(dropped.name);
    setResult(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(dropped));
  }, [preview]);

  async function analyze() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    const fd = new FormData();
    fd.append("image", file);
    try {
      const res = await fetch("/api/imint/analyze", { method: "POST", body: fd });
      const body = (await res.json()) as AnalyzeResult;
      if (!res.ok) {
        setResult({ error: body.error ?? "analyze_error", hint: body.hint });
      } else {
        setResult(body);
      }
    } catch {
      setResult({ error: "network_error", hint: "The analyze request failed. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function copyCoords() {
    if (!result?.coords) return;
    try {
      await navigator.clipboard.writeText(result.coords);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  const rows = FIELD_KEYS
    .map((k) => ({ key: k, value: result?.metadata?.[k] }))
    .filter((r) => r.value !== undefined && r.value !== null);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="IMINT"
        eyebrowIcon={ScanLine}
        title="Image Intelligence"
        subtitle="Upload an image to extract embedded EXIF/GPS metadata and receive an analyst summary when the AI layer is configured."
      />

      <Card>
        <CardHeader>
          <CardTitle>Upload image</CardTitle>
          <CardDescription>
            Drag &apos;n&apos; drop a photo or pick one — JPEG, PNG, HEIC and WebP are read for EXIF and container
            metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(e.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors hover:border-primary/60",
              preview ? "py-4" : "py-10",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onDrop(e.target.files?.[0] ?? null)}
            />
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt={fileName ?? "image preview"}
                className="max-h-56 max-w-full rounded-lg object-contain"
              />
            ) : (
              <>
                <ImageUp className="size-8 text-muted-foreground" strokeWidth={1.5} />
                <div className="text-sm">
                  Drop an image here or <span className="text-primary">browse</span>
                </div>
              </>
            )}
          </div>

          {fileName && <div className="font-mono text-xs text-muted-foreground">{fileName}</div>}

          <div className="flex items-center gap-3">
            <Button onClick={() => void analyze()} disabled={!file || busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
              {busy ? "Analyzing…" : "Analyze"}
            </Button>
            {file && (
              <Button
                variant="outline"
                onClick={() => {
                  setFile(null);
                  setFileName(null);
                  setResult(null);
                  if (preview) URL.revokeObjectURL(preview);
                  setPreview(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {result?.error && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-2 p-6 text-sm text-destructive">
            <Camera className="mt-0.5 size-4" />
            <div>
              <div className="font-medium">{result.error}</div>
              {result.hint && <div className="text-muted-foreground">{result.hint}</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {result?.metadata && !result.error && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Metadata</CardTitle>
                <CardDescription>
                  {rows.length === 0
                    ? "No embedded metadata found in this file."
                    : `${rows.length} field${rows.length === 1 ? "" : "s"} extracted.`}
                </CardDescription>
              </div>
            </CardHeader>
            {rows.length > 0 && (
              <CardContent>
                <Table>
                  <TableBody>
                    {rows.map(({ key, value }) => (
                      <TableRow key={key}>
                        <TableHead className="w-1/3">{readableLabel(key)}</TableHead>
                        <TableCell className="font-mono text-sm">{formatValue(key, value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4" />
                Coordinates
              </CardTitle>
              <CardDescription>
                Raw WGS84 decimal degrees pulled from EXIF GPS. Reverse-geocoding is skipped unless a geocoder key is
                configured.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.coords ? (
                <div className="flex flex-wrap items-center gap-3">
                  <code className="rounded bg-muted px-3 py-2 font-mono text-sm">{result.coords}</code>
                  <Button variant="outline" size="sm" onClick={() => void copyCoords()}>
                    {copied ? <Copy className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No GPS coordinates embedded in this file.</div>
              )}
              {result.geocode?.hint && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Upload className="mt-0.5 size-3.5" />
                  {result.geocode.hint}
                </div>
              )}
            </CardContent>
          </Card>

          {result.aiSummary && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4" />
                  Analyst summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">{result.aiSummary}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}