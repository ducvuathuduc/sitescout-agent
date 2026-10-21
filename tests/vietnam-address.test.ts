import { describe, expect, it } from "vitest";
import {
  ALIASES_VERSION,
  candidateQueries,
  fold,
  normalize,
  resolveWardAlias,
} from "../src/geo/vietnam-address.js";

describe("normalize", () => {
  it("trims and collapses whitespace, keeps diacritics", () => {
    expect(normalize("  Nguyễn   Huệ,  Quận 1 ")).toBe("Nguyễn Huệ, Quận 1");
  });
});

describe("fold", () => {
  it("strips diacritics and maps đ/Đ", () => {
    expect(fold("Nguyễn Huệ, Phường Bến Nghé")).toBe("Nguyen Hue, Phuong Ben Nghe");
    expect(fold("Đà Nẵng")).toBe("Da Nang");
  });
});

describe("resolveWardAlias", () => {
  it("maps legacy Quận 1 to current wards (2025-07 aliases)", () => {
    const r = resolveWardAlias("Quận 1");
    expect(r.status).toBe("mapped");
    if (r.status === "mapped") {
      expect(r.current).toContain("Phường Sài Gòn");
      expect(r.aliasesVersion).toBe(ALIASES_VERSION);
    }
  });

  it("matches folded input too", () => {
    expect(resolveWardAlias("quan 1").status).toBe("mapped");
  });

  it("returns unmapped explicitly — never invents", () => {
    const r = resolveWardAlias("Quận 99");
    expect(r.status).toBe("unmapped");
  });
});

describe("candidateQueries", () => {
  it("orders canonical → folded → alias-expanded, deduplicated", () => {
    const qs = candidateQueries("123 Nguyễn Huệ, Quận 1, Hồ Chí Minh");
    expect(qs[0]).toBe("123 Nguyễn Huệ, Quận 1, Hồ Chí Minh");
    expect(qs).toContain("123 Nguyen Hue, Quan 1, Ho Chi Minh");
    expect(qs.some((x) => x.includes("Phường Sài Gòn"))).toBe(true);
    expect(new Set(qs).size).toBe(qs.length);
  });
});
