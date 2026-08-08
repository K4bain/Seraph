export interface GeomCandidate {
  lat: number;
  lon: number;
  score: number;
  provenance: { type: "faiss"; id: number };
}

export interface GeoMetadata {
  exif?: Record<string, unknown>;
}

export interface GeoLocationResult {
  query_hash: string;
  candidates: GeomCandidate[];
  metadata?: GeoMetadata;
  hint?: string;
}

export interface GeoErrorResponse {
  error: string;
  code?: string;
  message?: string;
}