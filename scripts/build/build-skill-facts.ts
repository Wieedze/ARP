/** Build `apps/web/src/data/skill-facts.json` — the two things about a skill the chain does not carry.
 *
 *      bun run scripts/build/build-skill-facts.ts
 *
 *  Reads committed measurements, writes one file. No network, no chain, nothing to sign.
 *
 *  ## Why these two are in the bundle and not fetched
 *
 *  A skill atom carries its **normalised URL and nothing else** — name, description, image and url
 *  are all pure functions of it (ADR `0054`), because a free-text field inside a hashed document is
 *  a duplicate generator: `github.com` already resolves five distinct atoms on mainnet for exactly
 *  that reason. The id is the hash of the document, so adding a sentence now would create 662 new
 *  atoms rather than annotate the existing ones. That door is closed, deliberately.
 *
 *  So the front has to get a description from somewhere else, and measured 2026-10-29 there are
 *  three candidates and only one works in a browser:
 *
 *  ```
 *  skills.sh                   NO CORS header  — a browser cannot read it at all
 *  api.github.com              CORS *          — but 60 requests an hour, per VISITOR's IP,
 *                                                and a token must never ship to a browser
 *  raw.githubusercontent.com   CORS *          — no token, no per-visitor quota
 *  ```
 *
 *  A one-line description is small, changes rarely, and is needed for **every row in a list** —
 *  662 requests to render one page is not a design. It goes in the bundle. The SKILL.md behind it
 *  is large, changes often, and is wanted for **one** skill at a time; that one is fetched from
 *  `raw.githubusercontent.com` at detail time and cached.
 *
 *  ## What this file is not
 *
 *  Not a source of truth and not a claim ARP stakes. It is a dated copy of what skills.sh showed on
 *  2026-10-29, carried so a list can be read. The install count in particular is somebody else's
 *  number, it moves, and **it cannot tell two identical files apart** — six repositories named
 *  `superpowers` carry 86 byte-identical SKILL.md files between them
 *  (`measure/skill-content-duplicates.ts`) and the counter reports six separate successes. That is
 *  why it ranks and never tags (`docs/20`).
 */
import {writeFileSync} from "node:fs";

import installs from "../../data/measurements/skills-installs-2026-10-29.json";
import domains from "../../data/measurements/skill-domains-2026-10-29.json";

const MEASURED_ON = "2026-10-29";

/**
 * Where a description is cut, and why there is a cut at all.
 *
 * Measured over the 662: median **448** characters, p90 807, longest 1,068. Whole, they are 280 KB
 * of text and 92 KB gzipped — too much to put in front of a reader who may never open one. Cut at
 * 200 they are 116 KB, and the chunk is lazy-loaded besides.
 *
 * 200 is a judgement, not a reading: it is about two lines at the width this list gives a row, and
 * the full text is one fetch away on the detail page, where the SKILL.md itself is read.
 */
const CUT_AT = 200;

/** Cut on a word, with an ellipsis, so a row never ends mid-word. */
function shorten(text: string): string {
    if (text.length <= CUT_AT) return text;
    const head = text.slice(0, CUT_AT);
    const space = head.lastIndexOf(" ");
    return `${(space > CUT_AT - 40 ? head.slice(0, space) : head).trimEnd()}…`;
}

type InstallRow = {repo: string; skill: string; installs: number | null};
type DomainRow = {repo: string; skill: string; description: string};

const installsByKey = new Map<string, number>();
for (const row of (installs as {rows: InstallRow[]}).rows) {
    if (row.installs !== null) installsByKey.set(`${row.repo}/${row.skill}`, row.installs);
}

/**
 * Keyed by the atom's **label** — the normalised URL without its scheme — so the front looks a fact
 * up with the string the chain already gave it, and nothing has to be re-derived in the browser.
 */
const facts: Record<string, {description: string; installs: number | null}> = {};
for (const row of (domains as {rows: DomainRow[]}).rows) {
    const label = `github.com/${row.repo}?skill=${encodeURIComponent(row.skill)}`;
    facts[label] = {
        description: shorten(row.description),
        installs: installsByKey.get(`${row.repo}/${row.skill}`) ?? null,
    };
}

const out = {
    _note:
        "What a skill atom cannot carry: a description and an install count. Built by " +
        "scripts/build/build-skill-facts.ts from two committed measurements — do not edit by hand. " +
        "Keyed by the atom's label, which is its normalised URL without the scheme.",
    _measuredOn: MEASURED_ON,
    _source: "skills.sh, read from the JSON-LD its own pages publish for machines",
    _limits:
        "A dated copy, not a live read: skills.sh sends no CORS header, so a browser cannot fetch " +
        "it, and a description is cut at 200 characters — the full text is on the detail page, " +
        "which reads the SKILL.md itself. The install count is somebody else's number and cannot " +
        "tell two identical files apart: six repositories named `superpowers` carry 86 " +
        "byte-identical SKILL.md files between them and the counter reports six separate " +
        "successes. It ranks; it never tags.",
    facts,
};

const path = "apps/web/src/data/skill-facts.json";
writeFileSync(path, `${JSON.stringify(out, null, 0)}\n`);

const described = Object.values(facts).filter((fact) => fact.description.length > 0).length;
const counted = Object.values(facts).filter((fact) => fact.installs !== null).length;
console.log(`${Object.keys(facts).length} skills · ${described} with a description · ${counted} with a count`);
console.log(`written to ${path}`);

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
