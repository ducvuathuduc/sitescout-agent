import { describe, expect, it } from "vitest";
import { resolvePlace } from "../src/engine/scout.js";
import type { GeoapifyApi, GeocodeResult } from "../src/engine/geoapify.js";

// Regression for bench/hcmc-addresses (2026-10-22): "57A Tháp Mười, Phường 2, Quận 6" matched
// "175/2 Nguyễn Tri Phương" because "Phường 2" reduced to the token "2".
const binhTay: GeocodeResult = { formatted: "Chợ Bình Tây, 57A, Đường Tháp Mười, Phường Bình Tây, Hồ Chí Minh", lat: 10.7497, lon: 106.651, result_type: "amenity" };
const alley: GeocodeResult = { formatted: "175/2, Đường Nguyễn Tri Phương, Phường An Đông, Hồ Chí Minh", lat: 10.757, lon: 106.668, result_type: "building" };

function fakeApi(results: GeocodeResult[]) {
  const texts: string[] = [];
  let seq = 0;
  const api = {
    autocomplete: async (text: string) => { texts.push(`ac:${text}`); return { results, seq: seq++ }; },
    geocode: async (text: string) => { texts.push(`gc:${text}`); return { results, seq: seq++ }; },
  } as unknown as GeoapifyApi;
  return { api, texts };
}

describe("resolvePlace with pre-2025 admin units", () => {
  it("drops 'Phường 2, Quận 6' from the query it sends", async () => {
    const { api, texts } = fakeApi([alley, binhTay]);
    await resolvePlace(api, "57A Tháp Mười, Phường 2, Quận 6, Thành phố Hồ Chí Minh");
    expect(texts[0]).toBe("ac:57A Tháp Mười, Thành phố Hồ Chí Minh");
    expect(texts.join(" ")).not.toMatch(/Phường 2|Quận 6/);
  });
  it("does not let a bare number match an alley address", async () => {
    const { api } = fakeApi([alley, binhTay]);
    const { hit } = await resolvePlace(api, "57A Tháp Mười, Phường 2, Quận 6, Thành phố Hồ Chí Minh");
    expect(hit?.formatted).toMatch(/Chợ Bình Tây/);
  });
  it("keeps new (named) wards in the query", async () => {
    const { api, texts } = fakeApi([binhTay]);
    await resolvePlace(api, "57A Tháp Mười, Phường Bình Tây, Thành phố Hồ Chí Minh");
    expect(texts[0]).toBe("ac:57A Tháp Mười, Phường Bình Tây");
  });
});
