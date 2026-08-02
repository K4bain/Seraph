import { describe, expect, it } from "vitest";
import { parseCsvLine } from "@/connectors/opensanctions/connector";

describe("parseCsvLine", () => {
  it("splits plain fields", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
    expect(parseCsvLine("single")).toEqual(["single"]);
  });

  it("handles quoted fields with commas and quotes", () => {
    expect(parseCsvLine('"Smith, John",42,"x"')).toEqual(["Smith, John", "42", "x"]);
    expect(parseCsvLine('"He said ""hi"""')).toEqual(['He said "hi"']);
  });

  it("keeps embedded whitespace and empty trailing fields", () => {
    expect(parseCsvLine(" a , b ")).toEqual([" a ", " b "]);
    expect(parseCsvLine("a,,b,")).toEqual(["a", "", "b", ""]);
  });

  it("handles a realistic OpenSanctions row", () => {
    const row = parseCsvLine(
      'Q1,Person,"Volkov, Igor","Igor V.;I. Volkov",1974-01-01,RU;UA,"Moscow, Tverskaya 1",sdns:ru-ru,',
    );
    expect(row[0]).toBe("Q1");
    expect(row[1]).toBe("Person");
    expect(row[2]).toBe("Volkov, Igor");
    expect(row[3]).toBe("Igor V.;I. Volkov");
    expect(row[4]).toBe("1974-01-01");
    expect(row[5]).toBe("RU;UA");
    expect(row[6]).toBe("Moscow, Tverskaya 1");
    expect(row[7]).toBe("sdns:ru-ru");
    expect(row[8]).toBe("");
  });
});
