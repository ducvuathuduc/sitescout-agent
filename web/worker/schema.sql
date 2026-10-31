CREATE TABLE IF NOT EXISTS totals (day TEXT PRIMARY KEY, credits INTEGER NOT NULL DEFAULT 0, tiles INTEGER NOT NULL DEFAULT 0, plans INTEGER NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ip_usage (day TEXT NOT NULL, ip TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, ip));
-- Edge-cache statistics. The Worker also creates this table on first use, so existing databases need no migration.
CREATE TABLE IF NOT EXISTS cache_stats (day TEXT PRIMARY KEY, hits INTEGER NOT NULL DEFAULT 0, tile_hits INTEGER NOT NULL DEFAULT 0, saved REAL NOT NULL DEFAULT 0);
-- /api/share also creates its table on first use.
CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, day TEXT NOT NULL, ip TEXT NOT NULL, body TEXT NOT NULL);
