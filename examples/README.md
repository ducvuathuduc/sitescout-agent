# Examples — real runs, 2026-10-22

The site-selection scope is one city, Ho Chi Minh City, with these three recorded questions.

| Folder | Question |
|---|---|
| [`thaodien-coffee/`](thaodien-coffee/) | Where should I open a specialty coffee shop in Thảo Điền? |
| [`binhthanh-pharmacy/`](binhthanh-pharmacy/) | Where should I open a pharmacy in Bình Thạnh? |
| [`saigon-lunch/`](saigon-lunch/) | Where should I open an office-lunch restaurant in District 1? |

Each folder contains `report.md`, `report.html` (with a static map image), `map.jpg` (Geoapify Static Maps),
`result.json` and `trace.jsonl` (one line per Geoapify call, without the key).
Read the [tutorial](../docs/tutorial.md#3-install-and-run-it-yourself-5-min) to build the CLI and set
`GEOAPIFY_API_KEY` in your shell or gitignored `.env.local` file. Use `YOUR_KEY` as the placeholder.

To run the coffee question again, use a new output ID so the committed recording is preserved:

```sh
node dist/cli.js scout "Where should I open a specialty coffee shop in Thảo Điền?" --id my-coffee
```

This spends credits and writes to `examples/my-coffee/`. New results can differ; `map.jpg` is optional
if Static Maps fails. The recorded credit estimates predate the
[credit-rule corrections](../docs/demo-proxy.md#how-credits-are-counted).

`site-selection/` holds output of the older MCP-only `ask` pipeline, kept for reference.
That pipeline writes local traces to the gitignored `logs/<question-id>.jsonl`; committed sample traces
live here in `examples/`. See [trace formats and paths](../docs/tutorial.md#where-traces-and-logs-are-written)
and [Geoapify feedback](../docs/FEEDBACK.md).
