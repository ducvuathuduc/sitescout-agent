import { describe, expect, it } from "vitest";
import {
  COUNTRY_PROFILES,
  biasLonLat,
  detectCountryFromPoint,
  detectCountryFromText,
  findProfileByName,
  getProfile,
} from "../src/geo/profiles/index.js";

const CODES = ["SG", "VN", "TH", "MY", "ID", "PH"] as const;

describe("country profile registry", () => {
  it("contains exactly the six ASEAN markets with unique codes", () => {
    expect(COUNTRY_PROFILES.map((p) => p.code).sort()).toEqual([...CODES].sort());
    expect(new Set(COUNTRY_PROFILES.map((p) => p.code)).size).toBe(6);
  });

  it("every bbox is well-formed", () => {
    for (const p of COUNTRY_PROFILES) {
      expect(p.bbox.minLon).toBeLessThan(p.bbox.maxLon);
      expect(p.bbox.minLat).toBeLessThan(p.bbox.maxLat);
    }
  });

  it("getProfile throws for unknown codes", () => {
    expect(() => getProfile("XX" as never)).toThrow(/Unknown country code/);
    expect(getProfile("VN").name).toBe("Vietnam");
  });

  it("findProfileByName matches English, local and code names", () => {
    expect(findProfileByName("Việt Nam")?.code).toBe("VN");
    expect(findProfileByName("vietnam")?.code).toBe("VN");
    expect(findProfileByName("th")?.code).toBe("TH");
    expect(findProfileByName("Atlantis")).toBeUndefined();
  });

  it("detects country from text, including diacritic-free and Vietnamese forms", () => {
    expect(detectCountryFromText("Quận 1, Hồ Chí Minh")?.code).toBe("VN");
    expect(detectCountryFromText("Sukhumvit Soi 11, Bangkok")?.code).toBe("TH");
    expect(detectCountryFromText("Makati, Manila, Philippines")?.code).toBe("PH");
    expect(detectCountryFromText("Kuala Lumpur City Centre")?.code).toBe("MY");
    expect(detectCountryFromText("Jalan Sudirman, Jakarta")?.code).toBe("ID");
    expect(detectCountryFromText("Orchard Road, Singapore")?.code).toBe("SG");
    expect(detectCountryFromText("Somewhere unknown")).toBeUndefined();
  });

  it("detects country from coordinates", () => {
    expect(detectCountryFromPoint(10.7769, 106.7009)?.code).toBe("VN"); // Ho Chi Minh City
    expect(detectCountryFromPoint(13.7563, 100.5018)?.code).toBe("TH"); // Bangkok
    expect(detectCountryFromPoint(14.5995, 120.9842)?.code).toBe("PH"); // Manila
    expect(detectCountryFromPoint(3.139, 101.6869)?.code).toBe("MY"); // Kuala Lumpur
    expect(detectCountryFromPoint(-6.2088, 106.8456)?.code).toBe("ID"); // Jakarta
    expect(detectCountryFromPoint(1.2897, 103.8501)?.code).toBe("SG"); // Singapore, inside ID box too
    expect(detectCountryFromPoint(-40, 0)).toBeUndefined();
  });

  it("bias point lies inside its own bbox", () => {
    for (const p of COUNTRY_PROFILES) {
      const [lon, lat] = biasLonLat(p);
      expect(detectCountryFromPoint(lat, lon)?.code).toBe(p.code);
    }
  });
});
