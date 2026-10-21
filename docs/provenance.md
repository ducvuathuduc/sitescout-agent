# Provenance — third-party code and data in SiteScout

All application code in `src/` is original, written for this project (MIT).
No copyleft and no unlicensed copy-paste. Third-party components:

| Component | License | Use | Attribution |
|---|---|---|---|
| Leaflet 1.9.4 (CDN, unpkg) | BSD-2-Clause | Interactive map in `report.html` | Loaded from CDN at render; version pinned in `src/report/map.ts` |
| Inter font (Google Fonts) | SIL Open Font License 1.1 | Report typography | Loaded from CDN; system-ui fallback offline |
| Geoapify raster tiles (`maps.geoapify.com`) | Geoapify Terms | Basemap in `report.html` | `Powered by Geoapify` + `© OpenStreetMap contributors` on every map (tile layer + footer) |
| OpenStreetMap data (via Geoapify) | ODbL 1.0 | Geocoding/places/routing/tiles | Attribution rendered on every visual report per Geoapify + OSM requirements |
| zod, dotenv, typescript, vitest, eslint, typescript-eslint | MIT / Apache-2.0 | Dependencies (see `package.json`) | Pinned in `package-lock.json` |

**Data:** the 2025 ward-rename alias table (`src/geo/vietnam-address.ts`,
`ALIASES_VERSION = "2025-07"`) covers the sample regions from public
knowledge of the 2025-07-01 reorganization; unknown mappings return
`unmapped` — nothing is invented. Extend only with sourced data.

**No vendored snippets.** If a snippet is ever vendored, it is recorded here
with its source URL and license before it ships.
