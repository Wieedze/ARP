import type {GraphqlReply} from "./shapes.js";
/** The object side of `has tag`: how many distinct tags, and is any of it hierarchical?
 *
 *  `classification-vocabulary.ts` establishes that one predicate carries essentially all the
 *  classification on Intuition. This script asks the next question — whether what it points at is a
 *  vocabulary or a free-text field — because the answer decides whether ARP reuses the predicate
 *  (yes) and whether it can reuse the objects (no).
 *
 *      bun run scripts/measure/tag-object-discipline.ts
 *
 *  Read-only. Signs nothing. Paginates at 250/page, the indexer's own cap, with a pause between
 *  pages: the public endpoint allows 75 requests a minute and this is somebody else's.
 */
const HAS_TAG = "0x7ec36d201c842dc787b45cb5bb753bea4cf849be3908fb1b0a7d067c3c3cc1f5";

const PAGE = 250;
/** 40 pages = 10,000 distinct objects. A cap, not a count: the script says when it hit it. */
const MAX_PAGES = 40;

const OBJECTS_Q = `query($pid: String!, $limit: Int!, $offset: Int!) {
  triples(where: {predicate_id: {_eq: $pid}}, distinct_on: object_id, limit: $limit, offset: $offset) {
    object_id
    object { label type }
  }
}`;

/** Are these atoms themselves tagged? A tag that is itself tagged is a hierarchy edge in all but
 *  name, so this is the measurement that decides whether one exists in practice. */
const AS_SUBJECT_Q = `query($pid: String!, $ids: [String!]) {
  triples(where: {predicate_id: {_eq: $pid}, subject_id: {_in: $ids}}, distinct_on: subject_id, limit: 250) {
    subject_id
  }
}`;

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

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** A label that is a sentence, a question or an exhortation is not a vocabulary term. Crude on
 *  purpose — it is a floor on the mess, not a classifier. */
function looksLikeProse(label: string): boolean {
    return label.split(/\s+/).length > 4 || /[?!,]/.test(label);
}

type ObjectRow = {object_id: string; object: {label: string | null; type: string} | null};

for (const [net, url] of NETS) {
    console.log(`\n================ ${net} ================`);
    const rows: ObjectRow[] = [];
    let page = 0;
    for (; page < MAX_PAGES; page++) {
        const got = await ask<{triples: ObjectRow[]}>(url, OBJECTS_Q, {
            pid: HAS_TAG,
            limit: PAGE,
            offset: page * PAGE,
        });
        rows.push(...got.triples);
        if (got.triples.length < PAGE) break;
        await sleep(300);
    }
    const truncated = page === MAX_PAGES;
    console.log(
        `distinct tag objects: ${rows.length}${truncated ? ` (TRUNCATED at the ${MAX_PAGES}-page cap — the real number is higher)` : ""}`,
    );

    const labels = rows.map((r) => r.object?.label ?? "").filter((l) => l.length > 0);

    // The same label on two atoms is two nodes with two markets — ADR 0054's fragmentation,
    // applied to vocabulary rather than to tool URLs. This is the number that decides whether an
    // existing tag can be reused: a label carried by two atoms cannot be, because picking either
    // one picks a side.
    const byExactLabel = new Map<string, Set<string>>();
    for (const row of rows) {
        const label = row.object?.label ?? "";
        if (label.length === 0) continue;
        const set = byExactLabel.get(label) ?? new Set<string>();
        set.add(row.object_id);
        byExactLabel.set(label, set);
    }
    const splitLabels = [...byExactLabel.entries()].filter(([, ids]) => ids.size > 1);
    const splitAtoms = splitLabels.reduce((n, [, ids]) => n + ids.size, 0);
    console.log(
        `  distinct labels: ${byExactLabel.size} · labels carried by MORE THAN ONE atom: ${splitLabels.length} (${splitAtoms} atoms)`,
    );
    if (splitLabels.length > 0) {
        console.log(
            `    e.g. ${splitLabels
                .sort((a, b) => b[1].size - a[1].size)
                .slice(0, 8)
                .map(([label, ids]) => `${JSON.stringify(label)}×${ids.size}`)
                .join(" · ")}`,
        );
    }
    const prose = labels.filter(looksLikeProse).length;
    const caseVariants = new Map<string, Set<string>>();
    for (const l of labels) {
        const key = l.toLowerCase().trim();
        const set = caseVariants.get(key) ?? new Set<string>();
        set.add(l);
        caseVariants.set(key, set);
    }
    const duped = [...caseVariants.values()].filter((s) => s.size > 1);
    console.log(`  labels that read as prose (>4 words or ?!,): ${prose}/${labels.length}`);
    console.log(`  labels differing only by case or whitespace: ${duped.length} groups`);
    if (duped.length > 0) {
        console.log(
            `    e.g. ${duped
                .slice(0, 5)
                .map((s) => [...s].map((v) => JSON.stringify(v)).join(" / "))
                .join(" · ")}`,
        );
    }

    // Hierarchy in practice: of a sample of tag objects, how many are themselves tagged?
    const sample = rows.slice(0, 250).map((r) => r.object_id);
    const asSubject = await ask<{triples: {subject_id: string}[]}>(url, AS_SUBJECT_Q, {
        pid: HAS_TAG,
        ids: sample,
    });
    console.log(
        `  of ${sample.length} sampled tag objects, ${asSubject.triples.length} are themselves the subject of a \`has tag\` edge`,
    );
}

// A module, not a global script — see the note in predicate-objects.ts.
export {};
