"use client";

import { MapPin, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import type { GeolocateResponse } from "@/components/geolocate/types";

interface GeolocateResultsProps {
  result: GeolocateResponse;
}

function osmHref(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`;
}

export function GeolocateResults({ result }: GeolocateResultsProps) {
  const candidates = result.candidates ?? [];
  const exif = result.metadata?.exif;
  const exifEntries = exif ? Object.entries(exif) : [];
  const hasCandidates = candidates.length > 0;

  return (
    <div className="space-y-6">
      {result.hint && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          <span>{result.hint}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-4" />
            Candidates
          </CardTitle>
          <CardDescription>
            Top matches from the CLIP + FAISS index, ranked by similarity score.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasCandidates ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Latitude</TableHead>
                  <TableHead>Longitude</TableHead>
                  <TableHead>Provenance</TableHead>
                  <TableHead className="text-right">Map</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c, i) => (
                  <TableRow key={`${c.lat}-${c.lon}-${c.provenance.id}`}>
                    <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono">{c.score.toFixed(3)}</TableCell>
                    <TableCell className="font-mono">{c.lat.toFixed(6)}</TableCell>
                    <TableCell className="font-mono">{c.lon.toFixed(6)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {c.provenance.type} · #{c.provenance.id}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <a
                        href={osmHref(c.lat, c.lon)}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border border-primary/60 px-2.5 py-1 text-xs font-medium",
                          "text-primary transition-colors hover:bg-primary/10",
                        )}
                      >
                        Locate
                        <Search className="size-3" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-start gap-2 py-2 text-sm">
              <div className="font-medium">No candidates returned</div>
              <div className="text-muted-foreground">
                The query was accepted but the search index returned no matches — it may not be
                seeded yet. Run the geolocate seeding job, then retry.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {exifEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>EXIF metadata</CardTitle>
            <CardDescription>
              Embedded tags read from the uploaded file.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {exifEntries.map(([key, value]) => (
                  <TableRow key={key}>
                    <TableHead className="w-1/3">{key}</TableHead>
                    <TableCell className="font-mono text-sm">{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {result.query_hash && (
        <div className="font-mono text-xs text-muted-foreground">
          query_hash: {result.query_hash}
        </div>
      )}
    </div>
  );
}
