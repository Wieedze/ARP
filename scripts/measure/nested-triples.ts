import type {GraphqlReply} from "./shapes.js";
/** How much of the graph is **nested** — a triple used as the subject, predicate or object of
 *  another triple?
 *
 *      bun run scripts/measure/nested-triples.ts
 *
 *  Read-only. Signs nothing.
 *
 *  `createTriples` takes three `bytes32` term ids and a triple *has* a term id, so the contract
 *  permits it by construction. That is not evidence anybody does it, and the indexer answers the
 *  question directly: its `subject` / `predicate` / `object` relations resolve to an **atom**, so a
 *  nested position comes back `null` while `subject_id` still holds the term. A null here is
 *  therefore not missing data — it is the nesting.
 *
 *  Found while checking the user's statement that nested triples exist before drawing them in a
 *  schema: a query asking for `subject { label }` on `in context of` threw on a null subject.
 */
const Q = `query($pid: String!, $offset: Int!) {
  triples(where: {predicate_id: {_eq: $pid}}, limit: 250, offset: $offset, order_by: {term_id: asc}) {
    term_id
    subject_id
    subject { term_id }
    predicate_id
    predicate { term_id }
    object_id
    object { term_id }
  }
}`;

/** The predicates worth asking about: the three ARP writes or reads, plus the one that looks most
 *  like a nesting predicate by name. */
const PREDICATES: [string, string][] = [
    ["in context of", "0x892054b01d389bfe566166120470f572a56e3d4cd88c599b52c4708949625390"],
    ["has tag      ", "0x7ec36d201c842dc787b45cb5bb753bea4cf849be3908fb1b0a7d067c3c3cc1f5"],
    ["has type     ", "0xa632a94306ab1d56911cff8c06473659a7caa2dfec6de3921bc23ec8ebf96ced"],
    ["uses         ", "0x5c0bde1cc696456c0268248c4656acdf9621fdb39e605bc99b0a83dc8ff6e800"],
];

const NETS: [string, string][] = [
    ["mainnet 1155 ", "https://mainnet.intuition.sh/v1/graphql"],
    ["testnet 13579", "https://testnet.intuition.sh/v1/graphql"],
];

type Row = {
    term_id: string;
    subject_id: string;
    subject: {term_id: string} | null;
    predicate_id: string;
    predicate: {term_id: string} | null;
    object_id: string;
    object: {term_id: string} | null;
};

/** Paginated, and that is not incidental.
 *
 *  The first version of this script read one page of 250 and reported **0** nested objects for
 *  `in context of`. A second query over the same predicate, ordered differently, returned 36 rows
 *  whose object did not resolve. Both were right about their own sample and the 0 was about to be
 *  drawn in a schema as a property of the predicate. `rules/claims.md` §2: one number, one
 *  population — so this reads the whole population instead of a page of it. */
const PAGE = 250;
const MAX_PAGES = 40;

async function countNesting(
    url: string,
    pid: string,
): Promise<{n: number; subject: number; predicate: number; object: number; truncated: boolean}> {
    const total = {n: 0, subject: 0, predicate: 0, object: 0, truncated: false};
    for (let page = 0; page < MAX_PAGES; page++) {
        const response = await fetch(url, {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({query: Q, variables: {pid, offset: page * PAGE}}),
            signal: AbortSignal.timeout(60000),
        });
        const body = (await response.json()) as GraphqlReply<{triples: Row[]}>;
        if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
        const rows = body.data?.triples ?? [];
        total.n += rows.length;
        total.subject += rows.filter((row) => row.subject === null).length;
        total.predicate += rows.filter((row) => row.predicate === null).length;
        total.object += rows.filter((row) => row.object === null).length;
        if (rows.length < PAGE) return total;
        await new Promise((done) => setTimeout(done, 250));
        total.truncated = page === MAX_PAGES - 1;
    }
    return total;
}

for (const [net, url] of NETS) {
    console.log(`\n================ ${net} ================`);
    for (const [name, pid] of PREDICATES) {
        const got = await countNesting(url, pid);
        console.log(
            `  ${name}  n=${String(got.n).padStart(5)}${got.truncated ? " (TRUNCATED)" : ""}  ` +
                `nested subject ${got.subject}  predicate ${got.predicate}  object ${got.object}`,
        );
    }
}

// A module, not a global script — see the note in predicate-objects.ts.
export {};
