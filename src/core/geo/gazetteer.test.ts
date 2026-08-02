import { describe, expect, it } from "vitest";
import { countryCentroid, entityPoint } from "@/core/geo/gazetteer";

describe("countryCentroid", () => {
  it("resolves ISO codes", () => {
    expect(countryCentroid("UA")).toEqual({ lat: 48.38, lon: 31.17 });
    expect(countryCentroid("us")).toEqual({ lat: 39.83, lon: -98.58 });
  });

  it("resolves common aliases", () => {
    expect(countryCentroid("UK")).toEqual({ lat: 54.7, lon: -2.94 });
    expect(countryCentroid("NORTH KOREA")).toEqual({ lat: 40.34, lon: 127.51 });
    expect(countryCentroid("UAE")).toEqual({ lat: 23.42, lon: 53.85 });
  });

  it("returns null for unknown codes", () => {
    expect(countryCentroid("")).toBeNull();
    expect(countryCentroid("ZZ")).toBeNull();
  });
});

describe("entityPoint", () => {
  it("prefers an explicit geo point over a country centroid", () => {
    const point = entityPoint({
      geo: { lat: 1.35, lon: 103.82 },
      attributes: { countries: ["SG"] },
    });
    expect(point).toEqual({ lat: 1.35, lon: 103.82, approximate: false });
  });

  it("falls back to the first country centroid, marked approximate", () => {
    const point = entityPoint({ attributes: { countries: ["RU", "UA"] } });
    expect(point).toEqual({ lat: 61.52, lon: 105.32, approximate: true });
  });

  it("returns null when nothing geolocatable is present", () => {
    expect(entityPoint({})).toBeNull();
    expect(entityPoint({ attributes: { countries: [] } })).toBeNull();
    expect(entityPoint({ attributes: {} })).toBeNull();
  });
});
