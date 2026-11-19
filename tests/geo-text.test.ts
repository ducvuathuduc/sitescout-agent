import { describe, expect, it } from "vitest";
import { fold, foldKey, normalize, slugify } from "../src/geo/text.js";

describe("text helpers", () => {
  it("normalize trims and collapses whitespace, keeps diacritics", () => {
    expect(normalize("  Nguyễn   Huệ ")).toBe("Nguyễn Huệ");
  });

  it("fold strips diacritics and maps đ/Đ", () => {
    expect(fold("Đà Nẵng")).toBe("Da Nang");
  });

  it("foldKey lowercases the folded form", () => {
    expect(foldKey("  Quận Thủ Đức ")).toBe("quan thu duc");
  });

  it("slugify produces ASCII hyphenated identifiers", () => {
    expect(slugify("Thảo Điền, Quận 2")).toBe("thao-dien-quan-2");
    expect(slugify("  -- ")).toBe("");
  });
});
