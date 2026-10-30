-- One row per target per cycle. Append only: the history is the point (ADR 0089).
CREATE TABLE readings (
  target  TEXT    NOT NULL, -- the atom's label: the URL without its scheme
  kind    TEXT    NOT NULL, -- 'endpoint' | 'npm' | 'pypi'
  at      TEXT    NOT NULL, -- ISO 8601, when the read finished
  outcome TEXT    NOT NULL, -- see `Outcome` in src/probe.ts
  http    INTEGER,          -- the status, when there was one
  ms      INTEGER,          -- how long the read took
  detail  TEXT              -- a registry's version and date, or why the read failed; never a body
);
CREATE INDEX readings_target_at ON readings (target, at);
