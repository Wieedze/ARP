-- `since()` filters on `at` alone; the (target, at) index cannot serve it, so a 30-day window
-- scanned the whole table. Rows are never deleted (0001), which is why this one matters.
CREATE INDEX readings_at ON readings (at);
