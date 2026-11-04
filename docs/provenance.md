# Provenance — third-party code and data in SiteScout

SiteScout application code is distributed under the [MIT license](../LICENSE).
Third-party code, fonts and geospatial data retain their own licenses and terms:

| Component | License | Use | Attribution |
|---|---|---|---|
| Leaflet | BSD-2-Clause | Web demo map; older MCP HTML reports load CDN version 1.9.4 | [Web dependency](../package.json), [MCP report renderer](../src/report/map.ts) |
| Inter font (Google Fonts) | SIL Open Font License 1.1 | Older MCP report typography | Loaded from CDN; system-ui fallback offline |
| Be Vietnam Pro | SIL Open Font License 1.1 | Web demo typography | [Bundled font license](../web/public/fonts/OFL-LICENSE.txt), [font declarations](../web/src/style.css) |
| Open Sans font family | Not bundled; family name only | `scout` HTML report typography | [Renderer](../src/engine/render.ts) declares the family but does not bundle or download the font |
| Geoapify raster tiles (`maps.geoapify.com`) | Geoapify Terms | Web demo and older MCP report basemaps | `Powered by Geoapify` + `© OpenStreetMap contributors` in map attribution |
| OpenStreetMap data (via Geoapify) | ODbL 1.0 | Geocoding/places/routing/tiles | Attribution rendered on every visual report per Geoapify + OSM requirements |
| zod, dotenv, typescript, vitest, eslint, typescript-eslint | MIT / Apache-2.0 | Dependencies (see `package.json`) | Pinned in `package-lock.json` |

The `scout` HTML report embeds a static map image; the web demo and older MCP HTML reports use Leaflet.
Inter is used by the older MCP reports. The demo credits OpenMapTiles for its basemap style.
UI layout references CARTO Builder public maps; the [design notes](design/DESIGN_SYSTEM.md) describe that
reference. No CARTO code or assets are used.

**Data:** the 2025 ward-rename alias table (`src/geo/vietnam-address.ts`,
`ALIASES_VERSION = "2025-07"`) covers the sample regions from public
knowledge of the 2025-07-01 reorganization; unknown mappings return
`unmapped`. This sample table is not an authoritative administrative register. Extend only with sourced data.

Recorded Geoapify responses and traces live in [examples/](../examples/) and
[tests/fixtures/live/](../tests/fixtures/live/). Their dates describe the recordings; new requests can return
different results. See the [tutorial's trace guide](tutorial.md#5-follow-a-number-back-to-its-source-3-min)
and [Geoapify feedback](FEEDBACK.md) for how those records support reported findings.

**No vendored snippets.** If a snippet is ever vendored, it is recorded here
with its source URL and license before it ships.
