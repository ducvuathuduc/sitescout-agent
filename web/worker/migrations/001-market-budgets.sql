-- 001-market-budgets.sql — per-market daily budgets (Task 10, prepared only).
--
-- Run ONCE, BEFORE deploying the worker that reads the market column:
--   npm run demo:migrate:markets
-- (wrangler d1 execute sitescout-demo --remote -c web/wrangler.toml
--  --file web/worker/migrations/001-market-budgets.sql)
--
-- Why a rebuild, not a plain ALTER TABLE: totals' PRIMARY KEY is (day), so a
-- second row for the same day (the other market) would violate it even with
-- an added market column and a unique index. SQLite cannot ALTER a PRIMARY
-- KEY, so the table is rebuilt with PRIMARY KEY (day, market). Existing rows
-- are preserved as market='hcmc' (the demo was HCMC-only until this change).
-- Fresh databases need no migration: web/worker/schema.sql already has the
-- new shape.
-- A re-run fails safely at the INSERT (duplicate day/market) before any DROP,
-- so it cannot lose data — but run it once and check the output.
CREATE TABLE totals_new (day TEXT NOT NULL, market TEXT NOT NULL DEFAULT 'hcmc', credits INTEGER NOT NULL DEFAULT 0, tiles INTEGER NOT NULL DEFAULT 0, plans INTEGER NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, market));
INSERT INTO totals_new (day, market, credits, tiles, plans, calls) SELECT day, 'hcmc', credits, tiles, plans, calls FROM totals;
DROP TABLE totals;
ALTER TABLE totals_new RENAME TO totals;
