export interface Candidate {
  lat: number;
  lon: number;
  score: number;
  provenance: {
    type: "faiss";
    id: number;
  };
}

export interface GeolocateResponse {
  query_hash?: string;
  candidates?: Candidate[];
  metadata?: {
    exif?: Record<string, string>;
  };
  hint?: string;
  error?: string;
  code?: string;
}
