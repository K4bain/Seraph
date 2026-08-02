import { describe, expect, it } from "vitest";
import {
  geohash,
  geohashFingerprint,
  levenshtein,
  nameFingerprint,
  nameSimilarity,
  networkFingerprint,
  normalizeName,
  shouldProposeMerge,
} from "@/core/graph/dedup";

describe("normalizeName", () => {
  it("folds case, strips diacritics and collapses whitespace", () => {
    expect(normalizeName("  IGOR  VOLKOV ")).toBe("igor volkov");
    expect(normalizeName("José-María")).toBe("jose-maria");
    expect(normalizeName("Nurkez\n\tVessel")).toBe("nurkez vessel");
  });

  it("drops common legal suffixes", () => {
    expect(normalizeName("Northwind Trading LLC")).toBe("northwind trading");
    expect(normalizeName("DYNEX CAPITAL INC")).toBe("dynex capital");
    expect(normalizeName("Great Plains Energy Inc.")).toBe("great plains energy");
    expect(normalizeName("Lola Lolita 1110, S. De R.L. De C.V.")).toBe(
      "lola lolita 1110, s. de r.l. de c.v",
    );
  });

  it("keeps names that only differ by suffix equal", () => {
    expect(nameFingerprint("Star Dragon Corp.")).toBe(nameFingerprint("Star Dragon Corporation"));
  });
});

describe("networkFingerprint", () => {
  it("strips scheme, port and path", () => {
    expect(networkFingerprint("https://example.com:8443/path?q=1")).toBe("example.com");
    expect(networkFingerprint("HTTPS://EXAMPLE.COM/")).toBe("example.com");
    expect(networkFingerprint("192.168.1.10:8080")).toBe("192.168.1.10");
  });
});

describe("geohash", () => {
  it("returns known reference hashes", () => {
    expect(geohash(52.52, 13.405, 5)).toBe("u33dc");
    expect(geohash(40.7128, -74.006, 4)).toBe("dr5r");
  });

  it("buckets nearby points at coarse precision", () => {
    const a = geohashFingerprint(48.38, 31.17, 3);
    const b = geohashFingerprint(48.39, 31.18, 3);
    expect(a).toBe(b);
    const far = geohashFingerprint(-30.5, 22.9, 3);
    expect(far).not.toBe(a);
  });
});

describe("levenshtein / nameSimilarity", () => {
  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
  });

  it("scores identical and unrelated names", () => {
    expect(nameSimilarity("Igor Volkov", "igor volkov")).toBe(1);
    expect(nameSimilarity("Northwind Trading LLC", "Myanmar Yatai")).toBeLessThan(0.3);
  });
});

describe("shouldProposeMerge", () => {
  it("proposes a merge only above the threshold", () => {
    expect(shouldProposeMerge("Nurkez", "nurkez", 0.92)).toBe(true);
    expect(shouldProposeMerge("Nurkez", "Nurkez II", 0.92)).toBe(false);
  });
});
