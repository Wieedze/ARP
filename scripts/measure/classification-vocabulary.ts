import type {GraphqlReply} from "../helpers/shapes.js";
/** What classification vocabulary already exists on Intuition, and how much is actually used?
 *
 *  The evidence for the domain-tree design question: ARP needs one vocabulary to say what a tool is
 *  about, what an agent may spend on, and what it is searching for. Before inventing one, measure
 *  which predicate the graph already carries and whether a hierarchy predicate exists at all.
 *
 *      bun run scripts/measure/classification-vocabulary.ts
 *
 *  Read-only: four GraphQL queries per chain. Signs nothing.
 *
 *  Two populations are reported separately and must never be summed: mainnet 1155 and testnet
 *  13579 are different chains with different populations.
 */
const PREDICATE_Q = `query($labels: [String!]) {
  atoms(where: {label: {_in: $labels}}, limit: 400) {
    term_id
    label
    type
    as_predicate_triples_aggregate { aggregate { count } }
  }
}`;

const OBJECTS_Q = `query($pid: String!) {
  triples(where: {predicate_id: {_eq: $pid}}, limit: 1000) {
    object { label type }
    subject { type }
  }
}`;

const TYPE_Q = `query($types: [atom_type!]) {
  atoms_aggregate(where: {type: {_in: $types}}) { aggregate { count } }
}`;

/** Every label this repo, the ontology repo, or the liquid-democracy repo might use for
 *  "this thing is about that subject" or "that subject sits under this one". Exact match: an
 *  atom's label is the thing the indexer keys on, so `has tag` and `has_tag` are two atoms. */
const CANDIDATES = [
    "has tag",
    "has_tag",
    "tagged with",
    "taggedWith",
    "is a sub-domain of",
    "sub-domain of",
    "subConceptOf",
    "sub concept of",
    "is a",
    "isA",
    "has type",
    "about",
    "related to",
    "relatedTo",
    "in context of",
    "part of",
    "partOf",
    "category",
    "has category",
    "keywords",
    "topic",
    "has topic",
    "belongs to",
];

/** The indexer's own concept type. `DefinedTerm` — the type the `intuition-data-structures`
 *  classification spec uses for a concept, and the one the ontology app models against — is NOT a
 *  value of the indexer's `atom_type` enum and makes the query fail outright. Measured here so the
 *  gap between the published classification spec and what the indexer stores is on the record. */
const CONCEPT_TYPES = ["Keywords"];

const TYPES_Q = `{ atoms(distinct_on: type, limit: 100) { type } }`;

const NETS: [string, string][] = [
    ["mainnet 1155 ", "https://mainnet.intuition.sh/v1/graphql"],
    ["testnet 13579", "https://testnet.intuition.sh/v1/graphql"],
];

async function ask<T>(url: string, query: string, variables: Record<string, unknown>): Promise<T> {
    const r = await fetch(url, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({query, variables}),
        signal: AbortSignal.timeout(60000),
    });
    const j = (await r.json()) as GraphqlReply<T>;
    if (j.errors !== undefined) throw new Error(JSON.stringify(j.errors));
    return j.data as T;
}

type PredicateRow = {
    term_id: string;
    label: string;
    type: string;
    as_predicate_triples_aggregate: {aggregate: {count: number} | null} | null;
};

for (const [net, url] of NETS) {
    console.log(`\n================ ${net} ================`);

    const types = await ask<{atoms: {type: string}[]}>(url, TYPES_Q, {});
    const names = [...new Set(types.atoms.map((a) => a.type))].sort();
    console.log(`atom_type values the indexer actually stores (${names.length}): ${names.join(", ")}`);

    const preds = await ask<{atoms: PredicateRow[]}>(url, PREDICATE_Q, {labels: CANDIDATES});
    const used = preds.atoms
        .map((a) => ({
            label: a.label,
            type: a.type,
            id: a.term_id,
            n: a.as_predicate_triples_aggregate?.aggregate?.count ?? 0,
        }))
        .sort((a, b) => b.n - a.n);

    const live = used.filter((row) => row.n > 0);
    console.log(
        `candidate labels present as an atom: ${used.length} · of those used as a predicate: ${live.length}`,
    );
    for (const row of live) {
        console.log(`  ${String(row.n).padStart(6)}  ${row.label.padEnd(20)} ${row.type.padEnd(12)} ${row.id}`);
    }
    const dormant = used.filter((row) => row.n === 0).length;
    console.log(`  (${dormant} atoms carry a candidate label and have never been used as a predicate)`);

    const concepts = await ask<{atoms_aggregate: {aggregate: {count: number}}}>(url, TYPE_Q, {
        types: CONCEPT_TYPES,
    });
    console.log(`atoms typed ${CONCEPT_TYPES.join("/")}: ${concepts.atoms_aggregate.aggregate.count}`);

    // The single most-used classification predicate is the one worth describing: what does it
    // point at, and is any of it hierarchical (a tag whose object is itself tagged)?
    const top = live[0];
    if (top === undefined) continue;
    const rows = await ask<{
        triples: {object: {label: string | null; type: string} | null; subject: {type: string} | null}[];
    }>(url, OBJECTS_Q, {pid: top.id});
    const objects = new Map<string, number>();
    const objectTypes = new Map<string, number>();
    const subjectTypes = new Map<string, number>();
    for (const t of rows.triples) {
        const label = t.object?.label ?? "(null)";
        objects.set(label, (objects.get(label) ?? 0) + 1);
        objectTypes.set(t.object?.type ?? "?", (objectTypes.get(t.object?.type ?? "?") ?? 0) + 1);
        subjectTypes.set(t.subject?.type ?? "?", (subjectTypes.get(t.subject?.type ?? "?") ?? 0) + 1);
    }
    const sample = rows.triples.length;
    console.log(
        `\n  most-used: "${top.label}" (${top.type}) — ${top.n} edges, first ${sample} sampled`,
    );
    console.log(`  distinct objects in sample: ${objects.size}`);
    const fmt = (m: Map<string, number>, k: number): string =>
        [...m.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, k)
            .map(([key, v]) => `${key}×${v}`)
            .join(" · ");
    console.log(`  top objects:      ${fmt(objects, 15)}`);
    console.log(`  object types:     ${fmt(objectTypes, 8)}`);
    console.log(`  subject types:    ${fmt(subjectTypes, 8)}`);
}

// A module, not a global script — see the note in predicate-objects.ts.
export {};
