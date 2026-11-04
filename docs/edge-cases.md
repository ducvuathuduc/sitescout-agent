# Edge cases: failures and fallbacks

SiteScout has separate REST and MCP pipelines. The behavior below comes from the linked source;
it does not imply that every failure was reproduced against a live account. Recorded findings are in
[Geoapify feedback](FEEDBACK.md).

## The scout engine, web demo and SiteScout MCP server

These use [the REST engine](../src/engine/scout.ts) and [Geoapify client](../src/engine/geoapify.ts).

| Failure | Behavior |
|---|---|
| Area cannot be resolved | The engine throws an error rather than inventing coordinates |
| Boundaries fails or returns no ward | The report records a limitation and uses available geocoder information; candidate generation can fall back to a disk |
| Candidate reverse geocoding fails | The candidate retains a synthetic label |
| Walking isoline fails | Places are counted inside a 600 m circle instead; the report records the fallback and uses the circle's area |
| Places returns no results | Counts remain zero; this engine has no insufficient-data exclusion rule, so inspect coverage before using the ranking |
| Route Matrix fails or has no reachable cells for a candidate | Missing drive time is shown as unavailable and access receives the neutral score 0.5 |
| HTTP 401 | The REST client records the error and throws without retrying; the calling engine phase determines whether the run stops or uses a fallback |
| HTTP 429, server error or timeout | The REST client makes up to 3 attempts. A demo quota response marked `x-sitescout-fallback` is not retried |
| Network failure other than timeout | The REST client records and throws it; the calling phase may stop or fall back |
| Static Maps fails in the CLI | The CLI prints a warning and still writes the reports, result and trace; `map.jpg` may be absent |

The CLI defaults to `--credit-cap 300`. The engine checks accumulated estimated credits before a request,
so the final request can cross the threshold. Output is written after the analysis completes, rather than
streamed to disk as each request finishes; an aborted `scout` run may have terminal evidence without an output trace.
See [the CLI writer](../src/scout-cli.ts).

The public demo offers a recorded run when its daily caps are reached. Caps are not atomic, and credits
are estimates. Details: [demo proxy limits](demo-proxy.md#8-known-limits).

## The older ask and smoke MCP pipeline

This pipeline uses [the MCP client](../src/mcp/client.ts), [agent](../src/agent/run.ts) and
[scoring model](../src/scoring/model.ts). Its circular catchments differ from the walking isolines above.

| Failure | Behavior |
|---|---|
| Empty geocode results after fallbacks | The candidate is marked unevaluable and excluded from ranking |
| Insufficient place data | The scoring model's data-density floor excludes candidates with fewer than 5 POIs |
| Buffer, measure or spatial-relation call fails | The agent can use the analytic circle area and discloses the approximation |
| Invalid tool arguments | Strict schemas reject the call before it reaches Geoapify |
| Estimated budget would exceed `--budget` | The budget tracker rejects the planned call before sending it |

MCP traces are appended to `logs/<question-id>.jsonl`; cached results and the run manifest are in
`logs/results/<question-id>/`. These paths are gitignored. See [trace paths and formats](tutorial.md#where-traces-and-logs-are-written).

## Offline checks and output formats

| Situation | Behavior |
|---|---|
| `report` is missing the local MCP trace or manifest | The CLI names the missing files and the `ask` command needed to produce them |
| HTML re-render requested from an MCP manifest | The CLI reports that HTML re-render is unsupported; Markdown is supported for site selection |
| Corrupted MCP JSONL trace | `trace validate` checks JSON, schema and consecutive sequence numbers and reports errors by line |
| REST `scout` trace passed to `trace validate` | Validation fails because the validator expects the older MCP schema |
| `scout --help` | No subcommand help is implemented; use [the options table](tutorial.md#3-install-and-run-it-yourself-5-min) |

Committed recordings in [examples/](../examples/) can be inspected without a network connection or API key.
