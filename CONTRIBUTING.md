# Contributing to SiteScout

Thanks for helping. SiteScout is small on purpose; these rules keep it trustworthy.

## Ground rules

- **No citation, no claim.** Any new number in a report must come from a traced Geoapify call (`[Tn]`).
- **Never commit keys.** `GEOAPIFY_API_KEY` comes from the environment; `.env.local` is gitignored.
- **Keep failures honest.** If a run fails or a model misbehaves, keep the evidence and write down what changed.
- **HCMC first.** New cities are welcome as separate question packs with their own benchmark.

## Setup

```sh
npm ci
npm run typecheck && npm run lint && npm test && npm run build
```

Tests run offline against recorded fixtures in `tests/fixtures/` — no key needed.
To run a live analysis, export `GEOAPIFY_API_KEY` and use `node dist/cli.js scout "<question>"`.

## Pull requests

1. Open an issue first for anything bigger than a bug fix.
2. One topic per PR; include a test for engine or scoring changes.
3. If you change scoring weights, bump the weights version in `src/engine/scout.ts` and re-record the examples.
4. CI (typecheck, lint, test, build) must be green.

## Reporting Geoapify findings

Product observations go to `docs/FEEDBACK.md` in the format
**observation → impact → reproduction → suggestion**, with the raw data committed.
