import type {GraphqlReply} from "./shapes.js";
/** For each term ARP wants, is it already on the chain, and in what state?
 *
 *      bun run scripts/measure/term-availability.ts
 *
 *  Read-only. Two GraphQL queries per chain. Signs nothing.
 *
 *  The user's rule, 2026-10-28: find the terms that are **useful to us** first, and where one is
 *  already on the chain take that one — but never bend the list to fit what happens to be there.
 *  So this script does not propose terms. It takes the list the catalogue dictates and answers one
 *  question per term, which is the question that decides whether we mint:
 *
 *    - **REUSE**  — a plain-string atom exists. Take it. Its id is a pure function of the label, so
 *                   it is the same node for everybody and it cost nothing to agree on.
 *    - **MINT**   — nothing carries the label. Create a plain string.
 *    - **SPLIT**  — the label exists only as pinned `Thing`s, and more than one of them. Minting a
 *                   plain string adds a node to a vocabulary that is already fragmented, and
 *                   picking one of the existing ones picks a side of a split nobody declared.
 *                   This is the case that needs a human.
 *
 *  Measured 2026-10-28, mainnet 1155: 53 labels are carried by more than one atom, 118 atoms in all
 *  (`tag-object-discipline.ts`). Every one inspected by hand was a pinned `Thing` — `Infra`'s two
 *  differ only by a description somebody wrote and by a `url` that is the literal string `"null"`
 *  in one of them. That is why construction, not just the label, is reported here.
 */

/** The terms the 53 tools in `catalogue/tools.json` actually dictate, one cluster each.
 *
 *  Singular, lowercase, hyphenated — the normalisation rule. Singular is not a style choice: `tool`
 *  and `payment` were already on both chains as plain strings while `tools` and `payments` were
 *  not, so the plural would have minted the near-duplicate this whole construction avoids. */
const CANDIDATES = [
    // the root
    "tool",
    // what the catalogue clusters into, by what the tools say they do
    "payment",
    "database",
    "browser-automation",
    "web-scraping",
    "code-quality",
    "blockchain",
    "design",
    "project-management",
    "observability",
    "infrastructure",
    "api-testing",
    "website-builder",
    "workflow-automation",
    "video-generation",
    "marketing",
    "software-development",
    // the hierarchy predicate itself — subject to the same question as any other term
    "is a sub-domain of",
];

/** Shorter or more common spellings for the terms the first pass said to mint.
 *
 *  Run for one reason: the user's rule is "if it is already on the chain, take the same one", and a
 *  hyphenated compound nobody else would write is the spelling least likely to be there. The point
 *  is not to prefer a shorter word — it is to find out whether the concept already has a node. A
 *  spelling that violates the normalisation rule (`Developer tools`, with a space and a capital) is
 *  reported and **not** adopted: bending the rule to reuse a node is how `Design` and `design`
 *  happened. */
const ALTERNATIVES = [
    // A second axis: what the tool IS, as against what it does. The catalogue already carries it
    // unused — `kind: "mcp-server" | "skill-repo"`, 22 against 31.
    "agent",
    "mcp",
    "skill",
    "cli",
    "server",
    "library",
    "human",
    // One-word replacements for the two labels the one-word rule rejects: `code-quality`, and
    // `card-payment`, which is already on 13579 and breaks it.
    "quality",
    "lint",
    "linting",
    "audit",
    "review",
    "card",
    "checkout",
    "browser",
    "automation",
    "scraping",
    "data-extraction",
    "code",
    "security",
    "testing",
    "productivity",
    "collaboration",
    "monitoring",
    "analytics",
    "api",
    "website",
    "web",
    "cms",
    "integration",
    "video",
    "media",
    "development",
    "software",
    "engineering",
    "devtools",
    "developer-tools",
    "developer tools",
    "indexing",
];

/** Plain-string atoms: the indexer stores the string itself in `data`. */
const PLAIN_Q = `query($labels: [String!]) {
  atoms(where: {data: {_in: $labels}}, limit: 300) {
    term_id
    data
    type
    as_object_triples_aggregate { aggregate { count } }
    term { vaults { position_count } }
  }
}`;

/** Every atom carrying the label, however it was constructed. */
const ANY_Q = `query($labels: [String!]) {
  atoms(where: {label: {_in: $labels}}, limit: 300) {
    term_id
    label
    type
    as_object_triples_aggregate { aggregate { count } }
  }
}`;

const NETS: [string, string][] = [
    ["mainnet 1155 ", "https://mainnet.intuition.sh/v1/graphql"],
    ["testnet 13579", "https://testnet.intuition.sh/v1/graphql"],
];

async function ask<T>(url: string, query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(url, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({query, variables}),
        signal: AbortSignal.timeout(60000),
    });
    const body = (await response.json()) as GraphqlReply<T>;
    if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
    return body.data as T;
}

type PlainRow = {
    term_id: string;
    data: string;
    type: string;
    as_object_triples_aggregate: {aggregate: {count: number} | null} | null;
    term: {vaults: {position_count: number}[]} | null;
};
type AnyRow = {
    term_id: string;
    label: string;
    type: string;
    as_object_triples_aggregate: {aggregate: {count: number} | null} | null;
};

const ALL = [...CANDIDATES, ...ALTERNATIVES];

for (const [net, url] of NETS) {
    const [plain, any] = await Promise.all([
        ask<{atoms: PlainRow[]}>(url, PLAIN_Q, {labels: ALL}),
        ask<{atoms: AnyRow[]}>(url, ANY_Q, {labels: ALL}),
    ]);

    const plainBy = new Map<string, PlainRow>();
    for (const row of plain.atoms) plainBy.set(row.data, row);

    // Case-insensitive, because `Design` beside `design` is the collision that matters and an exact
    // label filter would report them as two unrelated terms.
    const anyBy = new Map<string, AnyRow[]>();
    for (const row of any.atoms) {
        const key = row.label.toLowerCase().trim();
        anyBy.set(key, [...(anyBy.get(key) ?? []), row]);
    }

    console.log(`\n================ ${net} ================`);
    console.log(
        `${"term".padEnd(22)}${"verdict".padEnd(9)}${"uses".padEnd(6)}${"pos".padEnd(5)}other atoms carrying the label`,
    );

    const tally = {REUSE: 0, MINT: 0, SPLIT: 0};
    for (const label of ALL) {
        if (label === ALTERNATIVES[0]) console.log(`${"-".repeat(22)} alternatives ${"-".repeat(22)}`);
        const exact = plainBy.get(label);
        const siblings = (anyBy.get(label.toLowerCase()) ?? []).filter(
            (row) => row.term_id !== exact?.term_id,
        );
        const verdict = exact !== undefined ? "REUSE" : siblings.length > 1 ? "SPLIT" : "MINT";
        if (CANDIDATES.includes(label)) tally[verdict] += 1;

        const uses = exact?.as_object_triples_aggregate?.aggregate?.count ?? 0;
        const positions = Math.max(0, ...(exact?.term?.vaults ?? []).map((v) => v.position_count));
        const others =
            siblings.length === 0
                ? "—"
                : siblings
                      .map(
                          (row) =>
                              `${row.label}·${row.type}·${row.as_object_triples_aggregate?.aggregate?.count ?? 0} uses`,
                      )
                      .join("  ");

        console.log(
            `${label.padEnd(22)}${verdict.padEnd(9)}${String(uses).padEnd(6)}${String(positions).padEnd(5)}${others}`,
        );
    }
    console.log(
        `\n  of the ${CANDIDATES.length} terms the catalogue dictates: REUSE ${tally.REUSE} · MINT ${tally.MINT} · SPLIT ${tally.SPLIT}`,
    );
}

// A module, not a global script — see the note in predicate-objects.ts.
export {};
