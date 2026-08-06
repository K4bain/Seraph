"use client";

/**
 * Offline-first deterministic live feeds for the WWV lens.
 *
 * No network: a seeded PRNG produces a stable, plausible world of aircraft,
 * vessels, weather stations and events. Entities advance with `now` along a
 * heading (aircraft ~0.5 deg/min, vessels ~0.08 deg/min) using a spherical
 * direct-problem solve, wrapped at the date line; stations and events sit
 * static. IDs ("<kind>-<n>") and all base properties are stable per seed.
 */

import { FEED_KIND_COLORS, type FeedEntity } from "./entityModel";

const REF_MS = Date.UTC(2026, 0, 1);
const DEG = Math.PI / 180;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], r: number): T {
  const idx = Math.floor(r * arr.length);
  return arr[idx] ?? arr[0]!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function gcdistRad(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const phi1 = aLat * DEG;
  const phi2 = bLat * DEG;
  const dLam = (bLon - aLon) * DEG;
  const s =
    Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLam);
  return Math.acos(clamp(s, -1, 1));
}

function intermediatePoint(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
  f: number,
): { lat: number; lon: number } {
  const d = gcdistRad(aLat, aLon, bLat, bLon);
  if (d < 1e-9) return { lat: aLat, lon: aLon };
  const sinD = Math.sin(d);
  const A = Math.sin((1 - f) * d) / sinD;
  const B = Math.sin(f * d) / sinD;
  const [ax, ay, az] = latLonToVec(aLat, aLon);
  const [bx, by, bz] = latLonToVec(bLat, bLon);
  const x = A * ax + B * bx;
  const y = A * ay + B * by;
  const z = A * az + B * bz;
  return { lat: Math.atan2(z, Math.hypot(x, y)) / DEG, lon: wrapLon(Math.atan2(y, x) / DEG) };
}

function latLonToVec(lat: number, lon: number): [number, number, number] {
  const phi = lat * DEG;
  const lam = lon * DEG;
  return [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
}

function bearingDeg(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const phi1 = fromLat * DEG;
  const phi2 = toLat * DEG;
  const dLam = (toLon - fromLon) * DEG;
  const y = Math.sin(dLam) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLam);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** Spherical direct problem: move `distDeg` along a heading from (lat, lon). */
function moveAlongHeading(
  lat: number,
  lon: number,
  headingDeg: number,
  distDeg: number,
): { lat: number; lon: number } {
  const d = distDeg * DEG;
  const br = headingDeg * DEG;
  const phi1 = lat * DEG;
  const lam1 = lon * DEG;
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(d) + Math.cos(phi1) * Math.sin(d) * Math.cos(br),
  );
  const lam2 =
    lam1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(phi1),
      Math.cos(d) - Math.sin(phi1) * Math.sin(phi2),
    );
  return { lat: phi2 / DEG, lon: wrapLon(lam2 / DEG) };
}

// ----- Geography pools ------------------------------------------------------

const AIRPORTS: Record<string, [number, number]> = {
  JFK: [40.64, -73.78],
  LHR: [51.47, -0.45],
  CDG: [49.01, 2.55],
  AMS: [52.31, 4.76],
  FRA: [50.03, 8.57],
  DXB: [25.25, 55.36],
  SIN: [1.36, 103.99],
  NRT: [35.76, 140.39],
  HND: [35.55, 139.78],
  LAX: [33.94, -118.41],
  SYD: [-33.95, 151.18],
  GRU: [-23.44, -46.63],
  JNB: [-26.14, 28.25],
  DEL: [28.56, 77.1],
  PEK: [40.08, 116.58],
  DME: [55.41, 37.9],
  IST: [41.28, 28.75],
  CAI: [30.12, 31.41],
  YYZ: [43.68, -79.63],
  ATL: [33.64, -84.43],
  SFO: [37.62, -122.38],
  ANC: [61.17, -149.99],
  HNL: [21.32, -157.92],
  MAD: [40.5, -3.57],
  LIS: [38.77, -9.13],
  KEF: [64.13, -21.94],
  BOM: [19.09, 72.87],
  ICN: [37.46, 126.44],
  BKK: [13.69, 100.75],
  EWR: [40.69, -74.17],
  ORD: [41.97, -87.91],
};

const ROUTES: [string, string][] = [
  ["JFK", "LHR"],
  ["JFK", "CDG"],
  ["LAX", "NRT"],
  ["LAX", "SYD"],
  ["SFO", "HND"],
  ["LHR", "DXB"],
  ["CDG", "DEL"],
  ["AMS", "SIN"],
  ["FRA", "JNB"],
  ["DXB", "SYD"],
  ["NRT", "LHR"],
  ["ICN", "LAX"],
  ["SIN", "LHR"],
  ["DEL", "JFK"],
  ["PEK", "LAX"],
  ["IST", "NRT"],
  ["GRU", "JNB"],
  ["YYZ", "LHR"],
  ["BKK", "FRA"],
  ["SYD", "SIN"],
  ["JFK", "FRA"],
  ["LHR", "BOM"],
  ["KEF", "JFK"],
  ["ANC", "NRT"],
  ["HNL", "LAX"],
  ["MAD", "GRU"],
];

const AIRLINE_CODES = [
  "KLM", "AFR", "UAL", "DAL", "BAW", "SAS", "THY", "QTR", "EMI", "ETD",
  "SIA", "ANA", "JAL", "CPA", "CES", "ACA", "AVA", "LAN", "GLO", "AAL",
  "RYR", "EZY", "IBE", "LOT", "QFA", "SWA", "AZA", "FIN", "SVR", "AFL",
];

const SHIP_PORTS: Record<string, [number, number]> = {
  ROT: [51.92, 4.48],
  SHA: [31.23, 121.47],
  SGP: [1.29, 103.85],
  LGB: [33.73, -118.27],
  HKG: [22.32, 114.17],
  BUS: [35.1, 129.04],
  JEA: [25.0, 55.06],
  NYH: [40.5, -74.04],
  SAN: [-23.96, -46.31],
  CPT: [-33.91, 18.42],
  BOM: [18.94, 72.85],
  LAG: [6.43, 3.41],
  SYD: [-33.85, 151.21],
  VAL: [-33.04, -71.63],
  YOK: [35.4, 139.64],
  COL: [9.36, -79.9],
};

const SHIP_ROUTES: [string, string][] = [
  ["ROT", "SHA"],
  ["SHA", "LGB"],
  ["SGP", "ROT"],
  ["JEA", "SGP"],
  ["SAN", "ROT"],
  ["CPT", "SGP"],
  ["NYH", "ROT"],
  ["SHA", "SYD"],
  ["LAG", "SGP"],
  ["BUS", "LGB"],
  ["HKG", "ROT"],
  ["BOM", "SGP"],
  ["VAL", "SYD"],
  ["YOK", "ROT"],
  ["COL", "SHA"],
];

const CHOKEPOINTS: [number, number][] = [
  [29.9, 32.55],
  [26.56, 56.25],
  [2.5, 102.0],
  [9.05, -79.55],
  [49.95, -1.8],
  [35.95, -5.55],
  [41.05, 29.1],
  [12.63, 43.35],
  [65.0, -169.0],
];

const VESSEL_PREFIXES = ["MV", "MT", "SV", "NS", "CS"];
const VESSEL_NAMES = [
  "EVERGREEN", "PACIFIC ROSE", "NORDIC STAR", "GOLDEN HORIZON", "STARSHIP DAWN",
  "CORAL QUEEN", "BLUE MERIDIAN", "ARCTIC GLORY", "ATLANTIC WIND", "CAPE TRINITY",
  "DEEP OCEAN", "SOUTHERN CROSS", "MARITIME VICTORY", "RED DRAGON", "OCEAN PRINCESS",
  "HELIOS SPIRIT", "TYPHOON PRIDE", "LADY LIBERTY", "SAGAR RATNA", "EMERALD SEA",
  "NORTHERN LIGHT", "GOLDEN GATE", "INDUS SKY", "MORNING CALM",
];
const VESSEL_FLAGS = ["PA", "LR", "SG", "HK", "MH", "BS", "CY", "NL", "GI", "GR"];

const LAND_POINTS: [number, number][] = [
  [48.86, 2.35], [51.5, -0.13], [52.52, 13.4], [41.9, 12.5], [40.42, -3.7],
  [39.9, 116.4], [35.68, 139.65], [34.05, -118.24], [40.71, -74.01], [1.35, 103.82],
  [-33.87, 151.21], [25.2, 55.27], [28.61, 77.21], [30.04, 31.24], [-23.55, -46.63],
  [39.74, -104.99], [41.88, -87.63], [-1.29, 36.82], [4.71, -74.07], [-12.05, -77.04],
  [-34.6, -58.38], [64.15, -21.94], [68.97, 33.09], [47.92, 106.92], [41.3, 69.24],
  [35.7, 51.42], [24.71, 46.68], [-6.21, 106.85], [14.6, 120.98], [33.57, -7.59],
  [36.75, 3.06], [5.6, -0.19], [-4.44, 15.27], [-31.95, 115.86], [-34.93, 138.6],
  [-36.85, 174.76], [49.28, -123.12], [19.43, -99.13], [29.76, -95.37], [62.03, 129.74],
  [56.01, 92.86], [69.36, 88.2],
];

const EVENT_ANCHORS: { name: string; lat: number; lon: number }[] = [
  { name: "Suez approach", lat: 30.2, lon: 32.6 },
  { name: "Strait of Hormuz", lat: 26.6, lon: 56.3 },
  { name: "Taiwan Strait", lat: 24.8, lon: 119.8 },
  { name: "Baltic approaches", lat: 54.8, lon: 14.9 },
  { name: "South China Sea", lat: 11.5, lon: 112.0 },
  { name: "Gulf of Aden", lat: 12.6, lon: 47.0 },
  { name: "Norwegian Sea", lat: 67.0, lon: 4.0 },
  { name: "Bering Strait", lat: 65.5, lon: -169.0 },
  { name: "East China Sea", lat: 29.0, lon: 124.0 },
  { name: "Caribbean approaches", lat: 18.5, lon: -72.0 },
  { name: "Horn of Africa", lat: 4.0, lon: 51.0 },
  { name: "North Atlantic tracks", lat: 45.0, lon: -30.0 },
];

const EVENT_TEMPLATES = [
  "Possible oil sheen near {place}",
  "SAR beacon activation near {place}",
  "Port congestion alert near {place}",
  "AIS gap reported near {place}",
  "Unidentified radar contact near {place}",
  "Drone activity logged near {place}",
  "Radio blackout reported over {place}",
  "Harbor closure notice near {place}",
  "Wildfire smoke plume near {place}",
  "Vessel distress call near {place}",
];

const EVENT_SOURCES = [
  "AIS feed", "ACARS", "IEM", "HFDL", "MarineTraffic", "ASDI", "Sentinel-1",
  "Social sweep", "Radio monitor", "OSINT",
];

// ----- Builder ---------------------------------------------------------------

const AIRCRAFT_COUNT = 28;
const VESSEL_COUNT = 24;
const STATION_COUNT = 30;
const EVENT_COUNT = 8;

function buildAircraft(rand: () => number, now: Date): FeedEntity[] {
  const out: FeedEntity[] = [];
  const minutes = (now.getTime() - REF_MS) / 60000;

  for (let i = 0; i < AIRCRAFT_COUNT; i++) {
    const route = pick(ROUTES, rand());
    const a = AIRPORTS[route[0]]!;
    const b = AIRPORTS[route[1]]!;
    const f = 0.08 + rand() * 0.84;
    const mid = intermediatePoint(a[0], a[1], b[0], b[1], f);
    const probe = intermediatePoint(a[0], a[1], b[0], b[1], Math.min(f + 0.02, 0.98));
    const heading = bearingDeg(mid.lat, mid.lon, probe.lat, probe.lon);
    const baseLat = mid.lat + (rand() - 0.5) * 3;
    const baseLon = wrapLon(mid.lon + (rand() - 0.5) * 3);
    const pos = moveAlongHeading(baseLat, baseLon, heading, (minutes * 0.5) % 360);

    const code = pick(AIRLINE_CODES, rand());
    const num = 10 + Math.floor(rand() * 3890);
    const suffix = rand() > 0.75 ? String.fromCharCode(65 + Math.floor(rand() * 26)) : "";
    const label = `${code}${num}${suffix}`;
    const flightStatus = rand() < 0.08 ? "climbing" : rand() < 0.16 ? "descending" : "cruising";

    out.push({
      id: `aircraft-${i + 1}`,
      kind: "aircraft",
      label,
      lat: pos.lat,
      lon: pos.lon,
      altKm: Math.round((9 + rand() * 3) * 10) / 10,
      headingDeg: heading,
      speedKts: Math.round(380 + rand() * 140),
      status: flightStatus,
      color: FEED_KIND_COLORS.aircraft,
      properties: {
        callsign: label,
        origin: route[0],
        dest: route[1],
        status: flightStatus,
      },
    });
  }
  return out;
}

function buildVessels(rand: () => number, now: Date): FeedEntity[] {
  const out: FeedEntity[] = [];
  const minutes = (now.getTime() - REF_MS) / 60000;

  for (let i = 0; i < VESSEL_COUNT; i++) {
    let baseLat: number;
    let baseLon: number;
    let heading: number;

    if (rand() > 0.4) {
      const route = pick(SHIP_ROUTES, rand());
      const a = SHIP_PORTS[route[0]]!;
      const b = SHIP_PORTS[route[1]]!;
      const f = 0.1 + rand() * 0.8;
      const mid = intermediatePoint(a[0], a[1], b[0], b[1], f);
      const probe = intermediatePoint(a[0], a[1], b[0], b[1], Math.min(f + 0.02, 0.98));
      heading = bearingDeg(mid.lat, mid.lon, probe.lat, probe.lon);
      baseLat = mid.lat + (rand() - 0.5) * 2;
      baseLon = wrapLon(mid.lon + (rand() - 0.5) * 2);
    } else {
      const cp = pick(CHOKEPOINTS, rand());
      baseLat = cp[0] + (rand() - 0.5) * 1.5;
      baseLon = wrapLon(cp[1] + (rand() - 0.5) * 1.5);
      heading = rand() * 360;
    }

    const pos = moveAlongHeading(baseLat, baseLon, heading, (minutes * 0.08) % 360);
    const name = `${pick(VESSEL_PREFIXES, rand())} ${pick(VESSEL_NAMES, rand())}`;
    const speed = Math.round(8 + rand() * 14);

    out.push({
      id: `vessel-${i + 1}`,
      kind: "vessel",
      label: name,
      lat: pos.lat,
      lon: pos.lon,
      headingDeg: heading,
      speedKts: speed,
      status: "underway",
      color: FEED_KIND_COLORS.vessel,
      properties: {
        imo: `9${Math.floor(100000 + rand() * 900000)}`,
        flag: pick(VESSEL_FLAGS, rand()),
        course: Math.round(heading),
      },
    });
  }
  return out;
}

function buildStations(rand: () => number, now: Date): FeedEntity[] {
  const out: FeedEntity[] = [];
  const yearDay =
    ((now.getTime() - REF_MS) / (365.25 * 86400000)) * 2 * Math.PI;

  for (let i = 0; i < STATION_COUNT; i++) {
    const bp = pick(LAND_POINTS, rand());
    const lat = bp[0] + (rand() - 0.5) * 4;
    const lon = wrapLon(bp[1] + (rand() - 0.5) * 4);
    const tempBase = 32 - Math.abs(lat) * 0.6;
    const seasonal = Math.cos(yearDay) * 6;
    const tempC = clamp(Math.round(tempBase + seasonal + (rand() - 0.5) * 10), -20, 45);
    const windKts = Math.round(rand() * 55);
    const pressure = Math.round(1013 - windKts * 0.6 + (rand() - 0.5) * 16);

    out.push({
      id: `station-${i + 1}`,
      kind: "station",
      label: `STN ${20 + Math.floor(rand() * 80)}`,
      lat,
      lon,
      tempC,
      windKts,
      status: windKts > 35 ? "alert" : "active",
      color: FEED_KIND_COLORS.station,
      properties: { pressure },
    });
  }
  return out;
}

function buildEvents(rand: () => number, now: Date): FeedEntity[] {
  const out: FeedEntity[] = [];
  for (let i = 0; i < EVENT_COUNT; i++) {
    const anchor = pick(EVENT_ANCHORS, rand());
    const template = pick(EVENT_TEMPLATES, rand());
    const minutesAgo = 2 + Math.floor(rand() * 58);

    out.push({
      id: `event-${i + 1}`,
      kind: "event",
      label: "Incident",
      lat: anchor.lat,
      lon: anchor.lon,
      detail: template.replace("{place}", anchor.name),
      color: FEED_KIND_COLORS.event,
      properties: {
        source: pick(EVENT_SOURCES, rand()),
        reported: new Date(now.getTime() - minutesAgo * 60000).toISOString(),
      },
    });
  }
  return out;
}

export function buildLiveFeeds(
  now: Date,
  opts?: { seed?: number },
): FeedEntity[] {
  const seed = (opts?.seed ?? 1337) >>> 0;
  const aircraft = buildAircraft(mulberry32(seed ^ 0x101), now);
  const vessels = buildVessels(mulberry32(seed ^ 0x202), now);
  const stations = buildStations(mulberry32(seed ^ 0x303), now);
  const events = buildEvents(mulberry32(seed ^ 0x404), now);
  return [...aircraft, ...vessels, ...stations, ...events];
}

export function entityFilterOptions(): { types: string[]; statuses: string[] } {
  return {
    types: ["aircraft", "vessel", "station", "event"],
    statuses: ["cruising", "climbing", "descending", "underway", "active", "alert"],
  };
}
