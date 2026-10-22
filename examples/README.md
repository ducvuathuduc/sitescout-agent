# Examples — real runs, 2026-10-22

| Folder | Question |
|---|---|
| [`thaodien-coffee/`](thaodien-coffee/) | Where should I open a specialty coffee shop in Thảo Điền? |
| [`binhthanh-pharmacy/`](binhthanh-pharmacy/) | Where should I open a pharmacy in Bình Thạnh? |
| [`saigon-lunch/`](saigon-lunch/) | Where should I open an office-lunch restaurant in District 1? |

Each folder: `report.md`, `report.html` (interactive map), `map.jpg` (Geoapify Static Maps), `result.json`,
`trace.jsonl` (one line per Geoapify call, no key). Re-create one with
`node dist/cli.js scout "<question>" --id <folder>`.

`site-selection/` holds output of the older MCP-only `ask` pipeline, kept for reference.
