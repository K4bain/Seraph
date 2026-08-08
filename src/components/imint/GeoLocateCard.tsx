"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { GeomCandidate, GeoLocationResult } from "@/components/imint/geolocate-types";

interface GeolocateCardProps {
  file: File | null;
}

type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: GeoLocationResult }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

function formatScore(score: number): string {
  return score.toFixed(3);
}

function osmLink(c: GeomCandidate): string {
  return `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=14/${c.lat}/${c.lon}`;
}

export function GeolocateCard({ file }: GeolocateCardProps) {
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });

  async function runGeolocate() {
    if (!file) return;
    setGeo({ status: "loading" });
    const fd = new FormData();
    fd.append("file", file);
    fd.append("k", "5");
    try {
      const res = await fetch("/api/geolocate", { method: "POST", body: fd });
      const body = (await res.json()) as GeoLocationResult | { error?: string; code?: string; message?: string };
      if (res.ok) {
        setGeo({ status: "success", data: body as GeoLocationResult });
      } else if (res.status === 502) {
        setGeo({ status: "unavailable", message: (body as { message?: string }).message ?? "Geolocation service unavailable." });
      } else {
        setGeo({ status: "error", message: (body as { error?: string }).error ?? "Geolocation request failed." });
      }
    } catch {
      setGeo({ status: "unavailable", message: "Geolocation service unavailable." });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Geolocation candidates</CardTitle>
        <CardDescription>
          Estimate the capture location by searching the CLIP image index with the same uploaded file.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Button onClick={() => void runGeolocate()} disabled={!file || geo.status === "loading"}>
            {geo.status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {geo.status === "loading" ? "Geolocating…" : "Geolocate"}
          </Button>
        </div>

        {geo.status === "loading" && <div className="text-sm text-muted-foreground">Querying the image index…</div>}

        {geo.status === "unavailable" && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <div>
              <div className="font-medium">Geolocation unavailable</div>
              <div className="text-muted-foreground">{geo.message}</div>
            </div>
          </div>
        )}

        {geo.status === "error" && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
            <div>
              <div className="font-medium">Geolocation failed</div>
              <div className="text-muted-foreground">{geo.message}</div>
            </div>
          </div>
        )}

        {geo.status === "success" && <GeoContent data={geo.data} />}
      </CardContent>
    </Card>
  );
}

function GeoContent({ data }: { data: GeoLocationResult }) {
  return (
    <div className="space-y-3">
      <div className={cn("rounded-lg border border-border bg-muted/40 p-4 text-sm")}>
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Query hash</div>
          <code className="block truncate font-mono text-xs">{data.query_hash}</code>
        </div>

        {data.hint && <div className="mt-2 text-xs text-muted-foreground">{data.hint}</div>}

        {data.candidates.length === 0 && (
          <div className="mt-3">
            No matching locations returned. The image index may be empty — run the geolocate service seeder and try
            again.
          </div>
        )}
      </div>

      {data.candidates.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableBody>
              {data.candidates.map((c, i) => (
                <TableRow key={`${c.provenance?.id ?? "candidate"}-${i}`}>
                  <TableHead className="w-28">Candidate {i + 1}</TableHead>
                  <TableCell className="font-mono text-sm">
                    {c.lat.toFixed(5)}°, {c.lon.toFixed(5)}°
                  </TableCell>
                  <TableCell className="w-20 font-mono text-xs">{formatScore(c.score)}</TableCell>
                  <TableCell className="w-28">
                    <a href={osmLink(c)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      Open in OSM ↗
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}