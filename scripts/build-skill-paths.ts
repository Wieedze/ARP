/** Build `apps/web/src/data/skill-paths.json`: where each skill's SKILL.md sits inside its repository.
 *
 *      bun run scripts/build-skill-paths.ts
 *
 *  Reads one committed measurement, writes one file. No network.
 *
 *  The path is not a function of `(repo, skill)`: `scripts/measure/skill-layouts.ts` found 19
 *  layouts across the 31 repositories, and 8 of them use more than one. So the skill page cannot
 *  build the URL of a SKILL.md, it has to look it up, and this is the table it looks it up in.
 *
 *  Two kinds of entry are kept, the same two `packages/protocol/src/content-path.ts` serves:
 *  a skill with exactly one file, and a skill whose several files are byte-identical (the first is
 *  taken, which asserts nothing since the bytes are the same). A skill whose files differ, and a
 *  skill whose file is not in the repository, get no entry, and the page says it has none rather
 *  than reading somebody else's file under its name.
 */
import {writeFileSync} from "node:fs";

import layouts from "../data/measurements/skill-layouts-2026-10-29T2200.json";

type Located = {repo: string; skill: string; path: string};
type Ambiguous = {repo: string; skill: string; paths: string[]; sameContent: boolean};

const data = layouts as {measuredAt: string; located: Located[]; ambiguous: Ambiguous[]};

const paths: Record<string, string> = {};
for (const row of data.located) paths[`github.com/${row.repo}?skill=${row.skill}`] = row.path;
let identical = 0;
for (const row of data.ambiguous) {
    const first = row.paths[0];
    if (!row.sameContent || first === undefined) continue;
    paths[`github.com/${row.repo}?skill=${row.skill}`] = first;
    identical += 1;
}

const out = {
    _note:
        "Where each skill's SKILL.md sits in its repository, built by scripts/build-skill-paths.ts " +
        "from a committed measurement — do not edit by hand. Keyed by the skill atom's label.",
    _measuredAt: data.measuredAt,
    _source: "api.github.com/repos/{repo}/git/trees/HEAD?recursive=1",
    paths,
};

const path = "apps/web/src/data/skill-paths.json";
writeFileSync(path, `${JSON.stringify(out)}\n`);
console.log(`${data.located.length} located, ${identical} with identical copies, ${Object.keys(paths).length} in all`);
console.log(`written to ${path}`);

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
