import { describe, expect, it } from "vitest";
import {
  ASEAN6_RENT_INDEX,
  cityCostIndex,
  medianRentIndex,
  rentToCostIndex,
  type RentIndexEntry,
} from "../src/data/numbeo-rent-index.js";

describe("rentToCostIndex", () => {
  it("returns 0.5 at the median", () => {
    expect(rentToCostIndex(20, 20)).toBeCloseTo(0.5, 12);
  });
  it("stays strictly inside (0, 1) and is increasing in rent", () => {
    const a = rentToCostIndex(1, 20);
    const b = rentToCostIndex(20, 20);
    const c = rentToCostIndex(1000, 20);
    expect(a).toBeGreaterThan(0);
    expect(c).toBeLessThan(1);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
  it("matches r / (r + median) exactly", () => {
    expect(rentToCostIndex(75, 25)).toBeCloseTo(75 / 100, 12);
  });
  it("rejects non-positive or non-finite rent", () => {
    expect(() => rentToCostIndex(0, 20)).toThrow(RangeError);
    expect(() => rentToCostIndex(-1, 20)).toThrow(RangeError);
    expect(() => rentToCostIndex(Number.NaN, 20)).toThrow(RangeError);
  });
  it("rejects non-positive or non-finite median", () => {
    expect(() => rentToCostIndex(10, 0)).toThrow(RangeError);
    expect(() => rentToCostIndex(10, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("medianRentIndex", () => {
  const entry = (cityId: string, rentIndex: number | null): RentIndexEntry => ({
    cityId,
    city: cityId,
    country: "XX",
    rentIndex,
    sourceNote: "test",
  });

  it("returns the middle value for an odd count", () => {
    expect(medianRentIndex([entry("a", 3), entry("b", 1), entry("c", 2)])).toBe(2);
  });
  it("returns the mean of the two middle values for an even count", () => {
    expect(medianRentIndex([entry("a", 1), entry("b", 2), entry("c", 3), entry("d", 4)])).toBe(2.5);
  });
  it("ignores null, zero, negative and non-finite values", () => {
    expect(
      medianRentIndex([entry("a", null), entry("b", 0), entry("c", -5), entry("d", 10), entry("e", Number.NaN)]),
    ).toBe(10);
  });
  it("returns undefined when no valid value exists", () => {
    expect(medianRentIndex([entry("a", null)])).toBeUndefined();
    expect(medianRentIndex([])).toBeUndefined();
  });
  it("computes the median of the shipped ASEAN-6 table", () => {
    // values: 75, 27.5, 20, 19, 16.5, 16.5, 15.5 -> sorted middle is 19
    expect(medianRentIndex(ASEAN6_RENT_INDEX)).toBe(19);
  });
});

describe("cityCostIndex (ASEAN-6 lookup)", () => {
  it("covers all seven key cities by stable id", () => {
    const ids = ASEAN6_RENT_INDEX.map((e) => e.cityId).sort();
    expect(ids).toEqual([
      "id-jakarta",
      "my-kl",
      "ph-manila",
      "sg-singapore",
      "th-bangkok",
      "vn-hanoi",
      "vn-hcmc",
    ]);
  });
  it("returns the normalised index for a known city", () => {
    // median 19; HCMC 20 -> 20 / 39
    expect(cityCostIndex("vn-hcmc")).toBeCloseTo(20 / 39, 12);
  });
  it("ranks Singapore as the most expensive and Hanoi as the cheapest", () => {
    const sg = cityCostIndex("sg-singapore")!;
    const hn = cityCostIndex("vn-hanoi")!;
    for (const e of ASEAN6_RENT_INDEX) {
      const c = cityCostIndex(e.cityId)!;
      expect(c).toBeLessThanOrEqual(sg);
      expect(c).toBeGreaterThanOrEqual(hn);
    }
  });
  it("returns undefined for an unknown city", () => {
    expect(cityCostIndex("xx-nowhere")).toBeUndefined();
  });
  it("returns undefined when the city's rent index is missing", () => {
    const table: RentIndexEntry[] = [
      { cityId: "a", city: "A", country: "XX", rentIndex: null, sourceNote: "" },
      { cityId: "b", city: "B", country: "XX", rentIndex: 10, sourceNote: "" },
    ];
    expect(cityCostIndex("a", table)).toBeUndefined();
    expect(cityCostIndex("b", table)).toBeCloseTo(0.5, 12);
  });
});
