/** Which catalogued skills carry no category the index reads (task 59, item 6).
 *
 *      bun run scripts/measure/untagged-skills.ts
 *      bun run scripts/measure/untagged-skills.ts --json data/measurements/untagged-skills-<stamp>.json
 *
 *  Read-only against the testnet 13579 **indexer**. Signs nothing, no RPC.
 *
 *  `data/catalogue/skills-13579.json` says 61 of 662, but it is a record of one attestor at one
 *  date, and the index has read both ARP addresses since ADR `0124`. So this asks the chain: each
 *  catalogued skill's atom, found by its data (`toolAtomUri`), against every `has tag` triple
 *  either address holds shares in. A tag only somebody else backs does not count, because the
 *  index does not read it.
 */
import {readFileSync, writeFileSync} from "node:fs";

import {ARP_DOMAIN_ATTESTORS} from "../../packages/protocol/src/arp/attestors.js";
import {toolAtomUri} from "../../packages/protocol/src/declare/tool-thing.js";
import {HAS_TAG} from "../../packages/protocol/src/sources/intuition/terms.js";

const GRAPHQL = "https://testnet.intuition.sh/v1/graphql";
/** The indexer caps `positions` at 100 rows and `atoms` at 250 (`packages/graphql` `domains.ts`). */
const PAGE = 100;

type CatalogueRow = {repo: string; skill: string; url: string};
const catalogue = JSON.parse(
    readFileSync(new URL("../../data/catalogue/skills-13579.json", import.meta.url), "utf8"),
) as {skills: CatalogueRow[]}; // the file this repo writes, `record-skills-catalogue.ts`
const facts = JSON.parse(
    readFileSync(new URL("../../data/catalogue/skill-facts.json", import.meta.url), "utf8"),
) as {facts: Record<string, {description?: string}>}; // `build-skill-facts.ts`

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

async function ask<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        const response = await fetch(GRAPHQL, {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({query, variables}),
            signal: AbortSignal.timeout(60000),
        });
        if (response.status === 429 && attempt < 5) {
            await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
            continue;
        }
        if (!response.ok) throw new Error(`indexer answered ${response.status}`);
        const body = (await response.json()) as {data?: T; errors?: unknown};
        if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
        if (body.data === undefined) throw new Error("indexer answered without data");
        return body.data;
    }
}

const ATOMS_Q = `query($data: [String!]!) { atoms(where: {data: {_in: $data}}, limit: 250) { term_id data } }`;
const TAGS_Q = `query($who: [String!]!, $pid: String!, $subjects: [String!]!, $limit: Int!, $offset: Int!) {
  positions(
    where: {account_id: {_in: $who}, shares: {_gt: "0"},
            term: {triple: {predicate_id: {_eq: $pid}, subject_id: {_in: $subjects}}}}
    limit: $limit offset: $offset order_by: {id: asc}
  ) { term { triple { subject_id object { label } } } }
}`;

const byData = new Map(catalogue.skills.map((row) => [toolAtomUri(row.url), row]));
const atomOf = new Map<string, string>();
const datas = [...byData.keys()];
for (let i = 0; i < datas.length; i += 200) {
    const page = await ask<{atoms: {term_id: string; data: string}[]}>(ATOMS_Q, {
        data: datas.slice(i, i + 200),
    });
    for (const atom of page.atoms) {
        const row = byData.get(atom.data);
        if (row !== undefined) atomOf.set(row.url, atom.term_id);
    }
}

const ids = [...atomOf.values()];
const tagsOf = new Map<string, Set<string>>();
for (let i = 0; i < ids.length; i += 200) {
    const subjects = ids.slice(i, i + 200);
    for (let offset = 0; ; offset += PAGE) {
        const page = await ask<{
            positions: {term: {triple: {subject_id: string; object: {label: string}}}}[];
        }>(TAGS_Q, {who: ARP_DOMAIN_ATTESTORS, pid: HAS_TAG, subjects, limit: PAGE, offset});
        for (const {term} of page.positions) {
            const set = tagsOf.get(term.triple.subject_id) ?? new Set<string>();
            set.add(term.triple.object.label);
            tagsOf.set(term.triple.subject_id, set);
        }
        if (page.positions.length < PAGE) break;
    }
}

const rows = catalogue.skills.map((row) => {
    const atom = atomOf.get(row.url) ?? null;
    const key = row.url.replace(/^https:\/\//, "");
    return {
        url: row.url,
        atom,
        tags: atom === null ? [] : [...(tagsOf.get(atom) ?? [])].sort(),
        description: facts.facts[key]?.description ?? null,
    };
});
const missing = rows.filter((row) => row.atom === null);
const untagged = rows.filter((row) => row.atom !== null && row.tags.length === 0);

const measuredAt = new Date().toISOString();
console.log(`testnet 13579, ${measuredAt}, attestors ${ARP_DOMAIN_ATTESTORS.join(", ")}`);
console.log(
    `${catalogue.skills.length} catalogued skills: ${rows.length - missing.length - untagged.length} tagged, ${untagged.length} untagged, ${missing.length} with no atom on chain`,
);
for (const row of untagged) console.log(`  ${row.url}\n      ${row.description ?? "(no description)"}`);

const out = arg("json");
if (out !== undefined) {
    writeFileSync(
        out,
        `${JSON.stringify({measuredAt, chainId: 13579, attestors: ARP_DOMAIN_ATTESTORS, script: "scripts/measure/untagged-skills.ts", catalogued: catalogue.skills.length, untagged, missing}, null, 2)}\n`,
    );
    console.log(`\nwrote ${out}`);
}
