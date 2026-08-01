/**
 * Tiny built-in gazetteer for Phase 5 geo lens: ISO 3166-1 alpha-2
 * country codes → approximate centroids. No external geocoding
 * dependency; results are labelled "approximate" in the UI.
 */

const CENTROIDS: Record<string, { lat: number; lon: number }> = {
  US: { lat: 39.83, lon: -98.58 },
  CA: { lat: 56.13, lon: -106.35 },
  MX: { lat: 23.63, lon: -102.55 },
  BR: { lat: -14.24, lon: -51.93 },
  AR: { lat: -38.42, lon: -63.62 },
  GB: { lat: 54.7, lon: -2.94 },
  DE: { lat: 51.16, lon: 10.45 },
  FR: { lat: 46.23, lon: 2.21 },
  IT: { lat: 41.87, lon: 12.57 },
  ES: { lat: 40.46, lon: -3.75 },
  NL: { lat: 52.13, lon: 5.29 },
  BE: { lat: 50.5, lon: 4.47 },
  CH: { lat: 46.82, lon: 8.23 },
  AT: { lat: 47.52, lon: 14.55 },
  SE: { lat: 60.13, lon: 18.64 },
  NO: { lat: 60.47, lon: 8.47 },
  FI: { lat: 61.92, lon: 25.75 },
  DK: { lat: 56.26, lon: 9.5 },
  IE: { lat: 53.41, lon: -8.24 },
  PL: { lat: 51.92, lon: 19.15 },
  CZ: { lat: 49.82, lon: 15.47 },
  HU: { lat: 47.16, lon: 19.5 },
  RO: { lat: 45.94, lon: 24.97 },
  BG: { lat: 42.73, lon: 25.49 },
  GR: { lat: 39.07, lon: 21.82 },
  PT: { lat: 39.4, lon: -8.22 },
  UA: { lat: 48.38, lon: 31.17 },
  RU: { lat: 61.52, lon: 105.32 },
  BY: { lat: 53.71, lon: 27.95 },
  TR: { lat: 38.96, lon: 35.24 },
  CY: { lat: 35.13, lon: 33.43 },
  MT: { lat: 35.94, lon: 14.38 },
  AE: { lat: 23.42, lon: 53.85 },
  SA: { lat: 23.89, lon: 45.08 },
  QA: { lat: 25.35, lon: 51.18 },
  KW: { lat: 29.31, lon: 47.48 },
  IL: { lat: 31.05, lon: 34.85 },
  JO: { lat: 31.28, lon: 36.84 },
  LB: { lat: 33.85, lon: 35.86 },
  IQ: { lat: 33.22, lon: 43.68 },
  IR: { lat: 32.43, lon: 53.69 },
  SY: { lat: 34.8, lon: 38.99 },
  IN: { lat: 20.59, lon: 78.96 },
  PK: { lat: 30.38, lon: 69.35 },
  AF: { lat: 33.94, lon: 67.71 },
  CN: { lat: 35.86, lon: 104.2 },
  JP: { lat: 36.2, lon: 138.25 },
  KR: { lat: 35.91, lon: 127.77 },
  KP: { lat: 40.34, lon: 127.51 },
  HK: { lat: 22.32, lon: 114.17 },
  TW: { lat: 23.7, lon: 121.0 },
  SG: { lat: 1.35, lon: 103.82 },
  MY: { lat: 4.21, lon: 101.98 },
  TH: { lat: 15.87, lon: 100.99 },
  VN: { lat: 14.06, lon: 108.28 },
  ID: { lat: -0.79, lon: 113.92 },
  PH: { lat: 12.88, lon: 121.77 },
  AU: { lat: -25.27, lon: 133.78 },
  NZ: { lat: -40.9, lon: 174.89 },
  ZA: { lat: -30.56, lon: 22.94 },
  NG: { lat: 9.08, lon: 8.68 },
  KE: { lat: 0.02, lon: 37.91 },
  EG: { lat: 26.82, lon: 30.8 },
  MA: { lat: 31.79, lon: -7.09 },
  DZ: { lat: 28.03, lon: 1.66 },
  LY: { lat: 26.34, lon: 17.23 },
  SD: { lat: 12.86, lon: 30.22 },
  ET: { lat: 9.15, lon: 40.49 },
  GH: { lat: 7.95, lon: -1.02 },
  CU: { lat: 21.52, lon: -77.78 },
  VE: { lat: 6.42, lon: -66.59 },
  CO: { lat: 4.57, lon: -74.3 },
  PE: { lat: -9.19, lon: -75.02 },
  CL: { lat: -35.68, lon: -71.54 },
  BO: { lat: -16.29, lon: -63.59 },
  PY: { lat: -23.44, lon: -58.44 },
  UY: { lat: -32.52, lon: -55.77 },
  EC: { lat: -1.83, lon: -78.18 },
  PA: { lat: 8.54, lon: -80.78 },
  CR: { lat: 9.75, lon: -83.75 },
  JM: { lat: 18.11, lon: -77.3 },
  HT: { lat: 18.97, lon: -72.29 },
  DO: { lat: 18.74, lon: -70.16 },
  BA: { lat: 43.92, lon: 17.68 },
  RS: { lat: 44.02, lon: 21.01 },
  HR: { lat: 45.1, lon: 15.2 },
  SI: { lat: 46.15, lon: 14.99 },
  SK: { lat: 48.67, lon: 19.7 },
  LT: { lat: 55.17, lon: 23.88 },
  LV: { lat: 56.88, lon: 24.6 },
  EE: { lat: 58.6, lon: 25.01 },
  MD: { lat: 47.41, lon: 28.37 },
  GE: { lat: 42.32, lon: 43.36 },
  AM: { lat: 40.07, lon: 45.04 },
  AZ: { lat: 40.14, lon: 47.58 },
  KZ: { lat: 48.02, lon: 66.92 },
  UZ: { lat: 41.38, lon: 64.59 },
  MN: { lat: 46.86, lon: 103.85 },
  NP: { lat: 28.39, lon: 84.12 },
  BD: { lat: 23.68, lon: 90.36 },
  LK: { lat: 7.87, lon: 80.77 },
  MM: { lat: 21.92, lon: 95.96 },
  KH: { lat: 12.57, lon: 104.99 },
  LA: { lat: 19.86, lon: 102.5 },
  VU: { lat: -15.38, lon: 166.96 },
  FJ: { lat: -17.71, lon: 178.07 },
  IL_PS: { lat: 31.95, lon: 35.23 },
};

const ALIASES: Record<string, string> = {
  "UK": "GB",
  "USA": "US",
  "RU": "RU",
  "SU": "RU",
  "KOREA, NORTH": "KP",
  "NORTH KOREA": "KP",
  "KOREA, SOUTH": "KR",
  "SOUTH KOREA": "KR",
  "UAE": "AE",
  "UNITED ARAB EMIRATES": "AE",
  "COTE D'IVOIRE": "CI",
  "IVORY COAST": "CI",
  "TANZANIA": "TZ",
  "MYANMAR (BURMA)": "MM",
  "BURMA": "MM",
  "BOLIVIA (PLURINATIONAL STATE OF)": "BO",
  "RUSSIAN FEDERATION": "RU",
  "SYRIAN ARAB REPUBLIC": "SY",
  "IRAN (ISLAMIC REPUBLIC OF)": "IR",
  "LAO PEOPLE'S DEMOCRATIC REPUBLIC": "LA",
  "VIET NAM": "VN",
  "MOLDOVA (REPUBLIC OF)": "MD",
  "PALESTINIAN TERRITORIES": "IL_PS",
  "PALESTINE": "IL_PS",
  "WEST BANK": "IL_PS",
  "GAZA": "IL_PS",
};

export function countryCentroid(codeOrName: string): { lat: number; lon: number } | null {
  const key = (codeOrName || "").trim().toUpperCase();
  if (!key) return null;
  const resolved = ALIASES[key] ?? key;
  return CENTROIDS[resolved] ?? null;
}

/** Best-effort point for an entity: explicit geo, else country centroid. */
export function entityPoint(entity: {
  geo?: { lat: number; lon: number } | null;
  attributes?: Record<string, unknown> | null;
}): { lat: number; lon: number; approximate: boolean } | null {
  if (entity.geo && typeof entity.geo.lat === "number" && typeof entity.geo.lon === "number") {
    return { lat: entity.geo.lat, lon: entity.geo.lon, approximate: false };
  }
  const countries = entity.attributes?.countries;
  if (Array.isArray(countries)) {
    for (const code of countries) {
      const point = typeof code === "string" ? countryCentroid(code) : null;
      if (point) return { ...point, approximate: true };
    }
  }
  return null;
}
