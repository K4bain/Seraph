/**
 * Offline gazetteer search — pure, no React, no network.
 * Fuzzy substring matching over a built-in place list (capitals, major
 * cities, countries, regions, notable straits / seas / canals).
 *
 * Import this from any client module; it is side-effect free.
 */

import type { CesiumNS } from "./cesiumLoader";
import { flyToPosition } from "./cameraPresets";

export interface SearchResult {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  kind: "city" | "country" | "region" | "sea-sat";
}

/** Normalise a string for case- and diacritic-insensitive matching. */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** True when needle appears in haystack or as a fuzzy subsequence. */
function matches(query: string, haystack: string): boolean {
  if (haystack.includes(query)) return true;
  let qi = 0;
  for (let i = 0; i < haystack.length && qi < query.length; i += 1) {
    if (haystack[i] === query[qi]) qi += 1;
  }
  return qi === query.length;
}

const GAZETTEER: SearchResult[] = [
  // Cities — world capitals + majors
  { name: "Tokyo", lat: 35.6762, lon: 139.6503, country: "Japan", kind: "city" },
  { name: "New York", lat: 40.7128, lon: -74.006, country: "United States", kind: "city" },
  { name: "London", lat: 51.5074, lon: -0.1278, country: "United Kingdom", kind: "city" },
  { name: "Paris", lat: 48.8566, lon: 2.3522, country: "France", kind: "city" },
  { name: "Beijing", lat: 39.9042, lon: 116.4074, country: "China", kind: "city" },
  { name: "Shanghai", lat: 31.2304, lon: 121.4737, country: "China", kind: "city" },
  { name: "Delhi", lat: 28.6139, lon: 77.209, country: "India", kind: "city" },
  { name: "Mumbai", lat: 19.076, lon: 72.8777, country: "India", kind: "city" },
  { name: "Los Angeles", lat: 34.0522, lon: -118.2437, country: "United States", kind: "city" },
  { name: "Chicago", lat: 41.8781, lon: -87.6298, country: "United States", kind: "city" },
  { name: "Mexico City", lat: 19.4326, lon: -99.1332, country: "Mexico", kind: "city" },
  { name: "Santiago", lat: -33.4489, lon: -70.6693, country: "Chile", kind: "city" },
  { name: "Buenos Aires", lat: -34.6037, lon: -58.3816, country: "Argentina", kind: "city" },
  { name: "São Paulo", lat: -23.5505, lon: -46.6333, country: "Brazil", kind: "city" },
  { name: "Rio de Janeiro", lat: -22.9068, lon: -43.1729, country: "Brazil", kind: "city" },
  { name: "Lima", lat: -12.0464, lon: -77.0428, country: "Peru", kind: "city" },
  { name: "Bogotá", lat: 4.711, lon: -74.0721, country: "Colombia", kind: "city" },
  { name: "Toronto", lat: 43.6532, lon: -79.3832, country: "Canada", kind: "city" },
  { name: "Vancouver", lat: 49.2827, lon: -123.1207, country: "Canada", kind: "city" },
  { name: "Moscow", lat: 55.7558, lon: 37.6173, country: "Russia", kind: "city" },
  { name: "St Petersburg", lat: 59.9343, lon: 30.3351, country: "Russia", kind: "city" },
  { name: "Istanbul", lat: 41.0082, lon: 28.9784, country: "Turkey", kind: "city" },
  { name: "Berlin", lat: 52.52, lon: 13.405, country: "Germany", kind: "city" },
  { name: "Madrid", lat: 40.4168, lon: -3.7038, country: "Spain", kind: "city" },
  { name: "Rome", lat: 41.9028, lon: 12.4964, country: "Italy", kind: "city" },
  { name: "Cairo", lat: 30.0444, lon: 31.2357, country: "Egypt", kind: "city" },
  { name: "Cape Town", lat: -33.9249, lon: 18.4241, country: "South Africa", kind: "city" },
  { name: "Nairobi", lat: -1.2921, lon: 36.8219, country: "Kenya", kind: "city" },
  { name: "Lagos", lat: 6.5244, lon: 3.3792, country: "Nigeria", kind: "city" },
  { name: "Sydney", lat: -33.8688, lon: 151.2093, country: "Australia", kind: "city" },
  { name: "Melbourne", lat: -37.8136, lon: 144.9631, country: "Australia", kind: "city" },
  { name: "Auckland", lat: -36.8509, lon: 174.7645, country: "New Zealand", kind: "city" },
  { name: "Singapore", lat: 1.3521, lon: 103.8198, country: "Singapore", kind: "city" },
  { name: "Hong Kong", lat: 22.3193, lon: 114.1694, country: "China", kind: "city" },
  { name: "Bangkok", lat: 13.7563, lon: 100.5018, country: "Thailand", kind: "city" },
  { name: "Jakarta", lat: -6.2088, lon: 106.8456, country: "Indonesia", kind: "city" },
  { name: "Manila", lat: 14.5995, lon: 120.9842, country: "Philippines", kind: "city" },
  { name: "Seoul", lat: 37.5665, lon: 126.978, country: "South Korea", kind: "city" },
  { name: "Tehran", lat: 35.6892, lon: 51.389, country: "Iran", kind: "city" },
  { name: "Riyadh", lat: 24.7136, lon: 46.6753, country: "Saudi Arabia", kind: "city" },
  { name: "Dubai", lat: 25.2048, lon: 55.2708, country: "United Arab Emirates", kind: "city" },
  { name: "Doha", lat: 25.2854, lon: 51.531, country: "Qatar", kind: "city" },
  { name: "Johannesburg", lat: -26.2041, lon: 28.0473, country: "South Africa", kind: "city" },
  { name: "Algiers", lat: 36.7538, lon: 3.0588, country: "Algeria", kind: "city" },
  { name: "Vienna", lat: 48.2082, lon: 16.3738, country: "Austria", kind: "city" },
  { name: "Stockholm", lat: 59.3293, lon: 18.0686, country: "Sweden", kind: "city" },
  { name: "Oslo", lat: 59.9139, lon: 10.7522, country: "Norway", kind: "city" },
  { name: "Helsinki", lat: 60.1699, lon: 24.9384, country: "Finland", kind: "city" },
  { name: "Copenhagen", lat: 55.6761, lon: 12.5683, country: "Denmark", kind: "city" },
  { name: "Amsterdam", lat: 52.3676, lon: 4.9041, country: "Netherlands", kind: "city" },
  { name: "Brussels", lat: 50.8503, lon: 4.3517, country: "Belgium", kind: "city" },
  { name: "Zurich", lat: 47.3769, lon: 8.5417, country: "Switzerland", kind: "city" },
  { name: "Geneva", lat: 46.2044, lon: 6.1432, country: "Switzerland", kind: "city" },
  { name: "Lisbon", lat: 38.7223, lon: -9.1393, country: "Portugal", kind: "city" },
  { name: "Athens", lat: 37.9838, lon: 23.7275, country: "Greece", kind: "city" },
  { name: "Warsaw", lat: 52.2297, lon: 21.0122, country: "Poland", kind: "city" },
  { name: "Kiev", lat: 50.4501, lon: 30.5234, country: "Ukraine", kind: "city" },

  // Countries
  { name: "United States", lat: 38.0, lon: -97.0, kind: "country" },
  { name: "Canada", lat: 56.1304, lon: -106.3468, kind: "country" },
  { name: "Mexico", lat: 23.6345, lon: -102.5528, kind: "country" },
  { name: "Brazil", lat: -14.235, lon: -51.9253, kind: "country" },
  { name: "Argentina", lat: -38.4161, lon: -63.6167, kind: "country" },
  { name: "Chile", lat: -35.6751, lon: -71.543, kind: "country" },
  { name: "Colombia", lat: 4.5709, lon: -74.2973, kind: "country" },
  { name: "United Kingdom", lat: 55.3781, lon: -3.436, kind: "country" },
  { name: "France", lat: 46.2276, lon: 2.2137, kind: "country" },
  { name: "Germany", lat: 51.1657, lon: 10.4515, kind: "country" },
  { name: "Spain", lat: 40.4637, lon: -3.7492, kind: "country" },
  { name: "Italy", lat: 41.8719, lon: 12.5674, kind: "country" },
  { name: "Russia", lat: 61.524, lon: 105.3188, kind: "country" },
  { name: "China", lat: 35.8617, lon: 104.1954, kind: "country" },
  { name: "India", lat: 20.5937, lon: 78.9629, kind: "country" },
  { name: "Japan", lat: 36.2048, lon: 138.2529, kind: "country" },
  { name: "Australia", lat: -25.2744, lon: 133.7751, kind: "country" },
  { name: "New Zealand", lat: -40.9006, lon: 174.886, kind: "country" },
  { name: "Egypt", lat: 26.8206, lon: 30.8025, kind: "country" },
  { name: "Nigeria", lat: 9.082, lon: 8.6753, kind: "country" },
  { name: "South Africa", lat: -30.5595, lon: 22.9375, kind: "country" },
  { name: "Kenya", lat: -1.2921, lon: 36.8219, kind: "country" },
  { name: "Indonesia", lat: -0.7893, lon: 113.9213, kind: "country" },
  { name: "Thailand", lat: 15.87, lon: 100.9925, kind: "country" },
  { name: "Turkey", lat: 38.9637, lon: 35.2433, kind: "country" },
  { name: "Iran", lat: 32.4279, lon: 53.688, kind: "country" },
  { name: "Saudi Arabia", lat: 23.8859, lon: 45.0792, kind: "country" },
  { name: "Norway", lat: 60.472, lon: 8.4689, kind: "country" },
  { name: "Sweden", lat: 60.1282, lon: 18.6435, kind: "country" },
  { name: "Iceland", lat: 64.9631, lon: -19.0208, kind: "country" },

  // Regions
  { name: "Siberia", lat: 62.0, lon: 105.0, country: "Russia", kind: "region" },
  { name: "Amazon Rainforest", lat: -4.0, lon: -60.0, country: "Brazil", kind: "region" },
  { name: "Sahara Desert", lat: 23.0, lon: 12.0, country: "North Africa", kind: "region" },
  { name: "Alaska", lat: 64.2008, lon: -149.4937, country: "United States", kind: "region" },
  { name: "Antarctica", lat: -82.0, lon: 0.0, kind: "region" },
  { name: "Arctic", lat: 80.0, lon: 0.0, kind: "region" },
  { name: "Sahel", lat: 15.0, lon: 15.0, country: "Africa", kind: "region" },
  { name: "Himalayas", lat: 28.0, lon: 84.0, country: "Asia", kind: "region" },
  { name: "Andes", lat: -32.0, lon: -70.0, country: "South America", kind: "region" },
  { name: "Midwest", lat: 41.0, lon: -93.0, country: "United States", kind: "region" },
  { name: "Nordic", lat: 61.0, lon: 15.0, country: "Northern Europe", kind: "region" },

  // Sea lanes, straits, canals
  { name: "Strait of Hormuz", lat: 26.6, lon: 56.2, country: "Iran/Oman", kind: "sea-sat" },
  { name: "South China Sea", lat: 12.0, lon: 115.0, country: "SE Asia", kind: "sea-sat" },
  { name: "Panama Canal", lat: 9.0, lon: -79.5, country: "Panama", kind: "sea-sat" },
  { name: "Suez Canal", lat: 30.5, lon: 32.3, country: "Egypt", kind: "sea-sat" },
  { name: "Strait of Malacca", lat: 2.5, lon: 102.0, country: "Malaysia/Indonesia", kind: "sea-sat" },
  { name: "English Channel", lat: 50.0, lon: -1.0, country: "UK/France", kind: "sea-sat" },
  { name: "Strait of Gibraltar", lat: 36.0, lon: -5.5, country: "Spain/Morocco", kind: "sea-sat" },
  { name: "Bosporus", lat: 41.1, lon: 29.0, country: "Turkey", kind: "sea-sat" },
  { name: "Red Sea", lat: 22.0, lon: 38.0, country: "Middle East", kind: "sea-sat" },
  { name: "Persian Gulf", lat: 26.0, lon: 51.0, country: "Middle East", kind: "sea-sat" },
  { name: "Mediterranean Sea", lat: 36.0, lon: 15.0, country: "Europe/N Africa", kind: "sea-sat" },
  { name: "Caribbean Sea", lat: 18.0, lon: -74.0, country: "Caribbean", kind: "sea-sat" },
  { name: "Gulf of Aden", lat: 12.0, lon: 48.0, country: "Yemen/Somalia", kind: "sea-sat" },
  { name: "Cape Horn", lat: -55.98, lon: -67.27, country: "Chile", kind: "sea-sat" },
  { name: "Bering Strait", lat: 66.0, lon: -169.0, country: "Russia/USA", kind: "sea-sat" },
  { name: "Falkland Islands", lat: -51.8, lon: -59.5, country: "South Atlantic", kind: "sea-sat" },
];

/**
 * Search the offline gazetteer. Case- and diacritic-insensitive fuzzy
 * substring match; results are ordered by best match (exact-prefix first).
 */
export function searchPlaces(query: string, limit = 8): SearchResult[] {
  const q = normalize(query);
  if (!q) return [];

  const scored: { r: SearchResult; score: number }[] = [];
  for (const entry of GAZETTEER) {
    const name = normalize(entry.name);
    const country = entry.country ? normalize(entry.country) : "";
    const hay = `${name} ${country}`;
    if (!matches(q, hay)) continue;

    let score = matches(q, name) ? 2 : 1;
    if (name.startsWith(q)) score += 2;
    if (matches(q, country)) score += 1;
    scored.push({ r: entry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.r);
}

/**
 * Fly the globe camera to a search result, capping the cruise altitude at
 * 400 km so the destination is clearly in view.
 */
export function flyToResult(cesium: CesiumNS, viewer: unknown, r: SearchResult): void {
  flyToPosition(cesium, viewer, r.lat, r.lon, 400_000);
}