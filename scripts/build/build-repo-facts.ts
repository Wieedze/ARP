/** Build `apps/web/src/data/repo-facts.json` — the signals a reader uses to judge a repository.
 *
 *      bun run scripts/build/build-repo-facts.ts
 *
 *  Reads a committed measurement, writes one file. No network, no chain, nothing to sign.
 *
 *  ## What is here and what each one is worth
 *
 *  ```
 *  archived     the owner's own declaration that it is over. Binary and authoritative.
 *  pushed       days since the last push. Decays on its own, which no popularity count does.
 *  stars        human interest in READING it. Free to give, and they never fall.
 *  ```
 *
 *  Only the first two are strong enough to be a verdict, which is why `record-maintained.ts` writes
 *  `archived` and a 404 to the chain and leaves the rest off it (`docs/20`). Stars are here because
 *  a reader asked for a confidence marker and stars are one — a weak one, and the file says so
 *  rather than the screen.
 *
 *  Measured 2026-10-29 and the two disagree, which is the useful part: `obra/superpowers` carries
 *  307,944 stars and `101-skills/superpowers` carries 0, while both were pushed within two months.
 *
 *  ## Keyed by the repository atom's label
 *
 *  `github.com/owner/repo`, so a page looks a signal up with the string the chain already gave it:
 *  directly for a repository's own atom, and through its `source` edge for a skill's.
 */
import { writeFileSync } from 'node:fs';

import liveness from '../../data/measurements/repo-liveness-2026-10-29T2000.json';

type Fact = {
  stars: number;
  days: number | null;
  archived: boolean;
  gone: boolean;
  description: string | null;
};
type Row = Fact & { slug: string; kind: string };

const facts: Record<string, Fact> = {};
for (const row of (liveness as { rows: Row[] }).rows) {
  facts[`github.com/${row.slug}`] = {
    stars: row.stars,
    days: row.days,
    archived: row.archived,
    gone: row.gone,
    description: row.description,
  };
}

const out = {
  _note:
    'Signals about a repository, built by scripts/build/build-repo-facts.ts from a committed ' +
    "measurement — do not edit by hand. Keyed by the repository atom's label.",
  _measuredOn: '2026-10-29',
  _source: 'api.github.com/repos',
  _limits:
    'A dated copy, not a live read: the GitHub API answers CORS but at 60 requests an hour per ' +
    "visitor's IP, and a token must never ship to a browser. `stars` measure interest in " +
    'reading a repository, are free to give and never fall; `days` and `archived` are the two ' +
    "that decay or are the owner's own word, and they are the only two ARP puts on chain.",
  facts,
};

const path = 'apps/web/src/data/repo-facts.json';
writeFileSync(path, `${JSON.stringify(out, null, 0)}\n`);
console.log(`${Object.keys(facts).length} repositories`);
console.log(`written to ${path}`);

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
