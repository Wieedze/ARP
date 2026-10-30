/** Build `apps/web/src/data/skill-catalogue.json`: each skill's atom id and the domain ARP tagged it with.
 *
 *      bun run scripts/build/build-skill-catalogue.ts
 *
 *  Reads `data/catalogue/skills-13579.json`, writes one file. No network.
 *
 *  The repository page lists every skill a repository publishes with its domain, and counts its
 *  skills per domain. Read from the chain, that is one standing read per skill — up to 71 for one
 *  repository. The catalogue is the record of what ARP wrote, and `scripts/verify/audit-skill-tags.ts`
 *  re-reads the chain against it (601 held, 0 in disagreement, 2026-10-29). So the page reads the
 *  record, and the audit is what keeps the record honest.
 *
 *  `domain: null` is the 61 skills no keyword matched. That abstention is deliberate (`docs/20`
 *  §2), and the page shows it as `no tag`, never as a guess.
 */
import {writeFileSync} from "node:fs";

import catalogue from "../../data/catalogue/skills-13579.json";

type Row = {repo: string; skill: string; atom: string | null; domain: string | null};

const data = catalogue as {recordedAt: string; skills: Row[]};
const skills: Record<string, {atom: string | null; domain: string | null}> = {};
for (const row of data.skills) {
    skills[`github.com/${row.repo}?skill=${row.skill}`] = {atom: row.atom, domain: row.domain};
}

const out = {
    _note:
        "Each skill's atom id and ARP's domain tag, built by scripts/build/build-skill-catalogue.ts from " +
        "data/catalogue/skills-13579.json — do not edit by hand. Keyed by the skill atom's label. " +
        "Audited against the chain by scripts/verify/audit-skill-tags.ts.",
    _recordedAt: data.recordedAt,
    skills,
};

const path = "apps/web/src/data/skill-catalogue.json";
writeFileSync(path, `${JSON.stringify(out)}\n`);
const untagged = data.skills.filter((row) => row.domain === null).length;
console.log(`${data.skills.length} skills, ${untagged} with no domain tag`);
console.log(`written to ${path}`);

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
