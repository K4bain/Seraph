"use client";

/**
 * Live satellite overlay — a compact two-body orbital propagator.
 *
 * Real SGP4+TLE propagation is out of scope for an embedded lens; this uses
 * classical Keplerian elements (mean motion, inclination, RAAN, argument of
 * perigee, eccentricity) with a 3-step Newton solve for the eccentric
 * anomaly, then a GMST rotation into a geodetic track. Accurate enough for a
 * live instrument view and smooth under playback scrubbing.
 */

export interface OrbitalElements {
  /** Semi-major axis in kilometres. */
  semiMajorKm: number;
  /** Inclination in degrees. */
  inclinationDeg: number;
  /** Right ascension of ascending node in degrees. */
  raanDeg: number;
  /** Argument of perigee in degrees. */
  argPerigeeDeg: number;
  /** Eccentricity. */
  eccentricity: number;
  /** Mean anomaly at epoch in degrees. */
  meanAnomalyDeg: number;
  /** Epoch as a Date. */
  epoch: Date;
}

export interface SatelliteDef {
  id: string;
  name: string;
  color: string;
  elements: OrbitalElements;
}

export interface GroundTrack {
  lat: number;
  lon: number;
  altKm: number;
}

const EARTH_RADIUS_KM = 6378.137;
const MU_KM3_S2 = 398600.4418;
const J2000_JD = 2451545.0;
const UNIX_JD_OFFSET = 2440587.5;

function meanMotionRevPerDay(semiMajorKm: number): number {
  const periodSec = 2 * Math.PI * Math.sqrt((semiMajorKm ** 3) / MU_KM3_S2);
  return 86400 / periodSec;
}

/** Fractional days since the J2000 epoch (UTC≈UT1 for display purposes). */
function daysSinceJ2000(date: Date): number {
  const jd = date.getTime() / 86400000 + UNIX_JD_OFFSET;
  return jd - J2000_JD;
}

/** Greenwich mean sidereal time in radians. */
function gmstRad(date: Date): number {
  const d = daysSinceJ2000(date);
  const g = 280.46061837 + 360.98564736629 * d;
  return (g * Math.PI) / 180;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function solveEccentricAnomaly(meanAnomalyRad: number, ecc: number): number {
  let e = meanAnomalyRad;
  for (let i = 0; i < 4; i++) {
    e = e - (e - ecc * Math.sin(e) - meanAnomalyRad) / (1 - ecc * Math.cos(e));
  }
  return e;
}

/** Propagate orbital elements to a ground track at `date`. */
export function propagateSatellite(def: SatelliteDef, date: Date): GroundTrack {
  const { elements } = def;
  const a = elements.semiMajorKm;
  const nRadPerSec = 2 * Math.PI * meanMotionRevPerDay(a) / 86400;
  const ecc = elements.eccentricity;

  const dtSec = (date.getTime() - elements.epoch.getTime()) / 1000;
  const M = degToRad(elements.meanAnomalyDeg) + nRadPerSec * dtSec;
  const E = solveEccentricAnomaly(M, ecc);

  const nu = Math.atan2(Math.sqrt(1 - ecc * ecc) * Math.sin(E), Math.cos(E) - ecc);
  const r = a * (1 - ecc * Math.cos(E));

  const inc = degToRad(elements.inclinationDeg);
  const raan = degToRad(elements.raanDeg);
  const argPeri = degToRad(elements.argPerigeeDeg);
  const u = nu + argPeri;

  // Orbital plane -> ECI.
  const x = r * (Math.cos(u) * Math.cos(raan) - Math.sin(u) * Math.sin(raan) * Math.cos(inc));
  const y = r * (Math.cos(u) * Math.sin(raan) + Math.sin(u) * Math.cos(raan) * Math.cos(inc));
  const z = r * Math.sin(u) * Math.sin(inc);

  // ECI -> ECEF via GMST rotation, then lat/lon.
  const gmst = gmstRad(date);
  const lonRad = Math.atan2(y, x) - gmst;
  let lon = (lonRad * 180) / Math.PI;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  const lat = (Math.asin(z / r) * 180) / Math.PI;
  const altKm = r - EARTH_RADIUS_KM;

  return { lat, lon, altKm };
}

/** Rolling history buffer for a satellite's ground track. */
export class TrailBuffer {
  readonly maxPoints: number;
  readonly sampleIntervalMs: number;
  private points: GroundTrack[] = [];
  private lastSampleAt = -Infinity;

  constructor(maxPoints = 240, sampleIntervalMs = 30000) {
    this.maxPoints = maxPoints;
    this.sampleIntervalMs = sampleIntervalMs;
  }

  /** Append a point when enough simulated time has elapsed. */
  push(track: GroundTrack, atMs: number): void {
    if (atMs - this.lastSampleAt < this.sampleIntervalMs) return;
    this.lastSampleAt = atMs;
    this.points.push(track);
    if (this.points.length > this.maxPoints) this.points.shift();
  }

  get(): GroundTrack[] {
    return this.points;
  }

  clear(): void {
    this.points = [];
    this.lastSampleAt = -Infinity;
  }
}

const EPOCH = new Date(Date.UTC(2026, 0, 1));

/** Build orbital elements for a circular-ish orbit at `altKm` above the surface. */
function orbit(altKm: number, inclinationDeg: number, raanDeg: number, argPerigeeDeg: number, eccentricity: number, meanAnomalyDeg: number): OrbitalElements {
  return {
    semiMajorKm: altKm + EARTH_RADIUS_KM,
    inclinationDeg,
    raanDeg,
    argPerigeeDeg,
    eccentricity,
    meanAnomalyDeg,
    epoch: EPOCH,
  };
}

/** Deterministic constellation generator — indexes spread the orbital planes. */
function constellation(
  idPrefix: string,
  count: number,
  altKm: number,
  inclinationDeg: number,
  color: string,
  raanStart: number,
  raanStep: number,
  maStep: number,
  name: (i: number) => string,
  eccentricity = 0.0002,
  argPerigeeDeg = 0,
): SatelliteDef[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${idPrefix}-${i + 1}`,
    name: name(i),
    color,
    elements: orbit(
      altKm,
      inclinationDeg,
      (raanStart + i * raanStep) % 360,
      argPerigeeDeg,
      eccentricity,
      (i * maStep) % 360,
    ),
  }));
}

const STARLINK: SatelliteDef[] = constellation(
  "starlink",
  25,
  550,
  53,
  "#61afef",
  5,
  14,
  83,
  (i) => `STARLINK-${3000 + ((i * 37) % 900)}`,
);

const GPS: SatelliteDef[] = constellation(
  "gps-2f",
  9,
  20180,
  55,
  "#c9a36a",
  40,
  29,
  37,
  (i) => `GPS 2F-${String(i + 1).padStart(2, "0")}`,
  0.003,
  1,
);

const GLONASS: SatelliteDef[] = constellation(
  "glonass",
  6,
  19130,
  64.8,
  "#d19a66",
  130,
  47,
  61,
  (i) => `GLONASS M-${700 + i}`,
  0.0015,
);

const GALILEO: SatelliteDef[] = constellation(
  "galileo",
  5,
  23222,
  56,
  "#98c379",
  240,
  53,
  91,
  (i) => `GALILEO GSAT-${201 + i}`,
  0.0008,
);

const IRIDIUM: SatelliteDef[] = constellation(
  "iridium",
  7,
  780,
  86.4,
  "#c9a36a",
  250,
  41,
  73,
  (i) => `IRIDIUM ${i + 2}`,
  0.001,
);

export const SATELLITE_CATALOG: SatelliteDef[] = [
  {
    id: "iss",
    name: "ISS",
    color: "#f0883e",
    elements: { semiMajorKm: 6793, inclinationDeg: 51.64, raanDeg: 122, argPerigeeDeg: 0, eccentricity: 0.0005, meanAnomalyDeg: 96, epoch: EPOCH },
  },
  {
    id: "tiangong",
    name: "TIANGONG",
    color: "#7ea8d4",
    elements: { semiMajorKm: 6760, inclinationDeg: 41.5, raanDeg: 210, argPerigeeDeg: 0, eccentricity: 0.0006, meanAnomalyDeg: 12, epoch: EPOCH },
  },
  {
    id: "hubble",
    name: "HUBBLE",
    color: "#7ea8d4",
    elements: { semiMajorKm: 6915, inclinationDeg: 28.5, raanDeg: 300, argPerigeeDeg: 0, eccentricity: 0.0003, meanAnomalyDeg: 41, epoch: EPOCH },
  },
  {
    id: "terra",
    name: "TERRA",
    color: "#7ea8d4",
    elements: { semiMajorKm: 7083, inclinationDeg: 98.2, raanDeg: 12, argPerigeeDeg: 0, eccentricity: 0.0001, meanAnomalyDeg: 180, epoch: EPOCH },
  },
  {
    id: "aqua",
    name: "AQUA",
    color: "#7ea8d4",
    elements: { semiMajorKm: 7083, inclinationDeg: 98.2, raanDeg: 15, argPerigeeDeg: 0, eccentricity: 0.0001, meanAnomalyDeg: 267, epoch: EPOCH },
  },
  {
    id: "sentinel2",
    name: "SENTINEL-2A",
    color: "#7ea8d4",
    elements: { semiMajorKm: 7163, inclinationDeg: 98.6, raanDeg: 108, argPerigeeDeg: 0, eccentricity: 0.0001, meanAnomalyDeg: 22, epoch: EPOCH },
  },
  {
    id: "landsat8",
    name: "LANDSAT-8",
    color: "#7ea8d4",
    elements: { semiMajorKm: 7083, inclinationDeg: 98.2, raanDeg: 40, argPerigeeDeg: 0, eccentricity: 0.0001, meanAnomalyDeg: 333, epoch: EPOCH },
  },
  {
    id: "noaa20",
    name: "NOAA-20",
    color: "#7ea8d4",
    elements: { semiMajorKm: 7202, inclinationDeg: 98.7, raanDeg: 75, argPerigeeDeg: 0, eccentricity: 0.0001, meanAnomalyDeg: 150, epoch: EPOCH },
  },
  {
    id: "gps-13",
    name: "GPS BIIR-13",
    color: "#c9a36a",
    elements: { semiMajorKm: 26560, inclinationDeg: 55, raanDeg: 255, argPerigeeDeg: 0, eccentricity: 0.003, meanAnomalyDeg: 45, epoch: EPOCH },
  },
  {
    id: "iridium-0",
    name: "IRIDIUM 1",
    color: "#c9a36a",
    elements: { semiMajorKm: 7158, inclinationDeg: 86.4, raanDeg: 190, argPerigeeDeg: 0, eccentricity: 0.001, meanAnomalyDeg: 200, epoch: EPOCH },
  },
  ...STARLINK,
  ...GPS,
  ...GLONASS,
  ...GALILEO,
  ...IRIDIUM,
];
