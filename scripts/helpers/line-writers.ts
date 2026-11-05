/** Who wrote the result lines and the `uses` edges on testnet 13579, and each line as the graph holds it. Holds no key. */
import {getAddress, stringToHex, type Hex} from "viem";

import deployment from "../../data/deployments/13579.json";
import {multiVaultReads} from "../../packages/protocol/src/declare/multivault.ts";
import {BECAUSE_LABEL, HAS_OUTCOME_LABEL} from "../../packages/protocol/src/declare/usage-context.ts";

/** The signers recorded in `data/measurements/pulse-walk-2026-11-05.jsonl`: the user's own key and ARP's treasury. */
const OUR_WALLETS = ["0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f", "0xE596096F4176b682E300d73963e7B04B383C1AA1"] as const;
export const OURS = new Set(OUR_WALLETS.map((wallet) => wallet.toLowerCase()));
export const USES = "0x5c0bde1cc696456c0268248c4656acdf9621fdb39e605bc99b0a83dc8ff6e800"; // as in `scripts/measure/line-cost.ts`
const PAGE = 250;

const reads = multiVaultReads({address: deployment.intuition.multiVault as Hex, chainId: 13579, rpcUrl: deployment.chain.rpcUrl}); // an address in this repo's record

export const hasOutcomeAtom = () => reads.atomId(stringToHex(HAS_OUTCOME_LABEL));

export async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(deployment.chain.graphqlUrl, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({query, variables}),
        signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json()) as {data?: T; errors?: unknown}; // checked on the next line
    if (body.data === undefined) throw new Error(`graphql: ${JSON.stringify(body.errors)}`);
    return body.data;
}

/** Every page of a list, so a figure is a count and not the size of the first page. */
async function everyRow<T>(read: (offset: number) => Promise<T[]>): Promise<T[]> {
    const rows: T[] = [];
    for (;;) {
        const page = await read(rows.length);
        rows.push(...page);
        if (page.length < PAGE) return rows;
    }
}

export type Writers = {total: number; ours: number; others: number; otherWallets: number; holdersOutsideOurs: number};

export async function writers(predicate: string): Promise<Writers> {
    const rows = await everyRow((offset) =>
        graphql<{triples: {creator_id: string; positions: {account_id: string}[]}[]}>(
            `query($p: String!, $l: Int!, $o: Int!) { triples(where: {predicate_id: {_eq: $p}}, order_by: {term_id: asc}, limit: $l, offset: $o) { creator_id positions(where: {shares: {_gt: "0"}}) { account_id } } }`,
            {p: predicate, l: PAGE, o: offset},
        ).then((data) => data.triples),
    );
    const creators = rows.map((row) => row.creator_id.toLowerCase());
    const others = creators.filter((creator) => !OURS.has(creator));
    const holders = new Set(rows.flatMap((row) => row.positions.map((position) => position.account_id.toLowerCase())).filter((holder) => !OURS.has(holder)));
    return {total: creators.length, ours: creators.length - others.length, others: others.length, otherWallets: new Set(others).size, holdersOutsideOurs: holders.size};
}

type TripleNode = {term_id: string; predicate: {label: string} | null; object: {label: string} | null; subject: {label: string} | null; subject_term: {triple: TripleNode | null} | null};

export type ResultLine = {
    /** T3, the `has outcome` triple. */
    termId: string;
    transaction: string;
    at: string;
    creator: string;
    outcome: string;
    /** T1, `(agent, uses, tool)`. */
    usesTerm: string | null;
    agent: string | null;
    tool: string | null;
    /** T2, present when the line names a domain. */
    domainTerm: string | null;
    domain: string | null;
    /** T4, present when a failure names its reason. */
    reasonTerm: string | null;
    reason: string | null;
    holders: string[];
};

const NODE = `term_id predicate { label } object { label } subject { label }`;

/** Every result line, oldest first, walked from T3 back to T1 and on to T4. */
export async function readResultLines(hasOutcome: string): Promise<ResultLine[]> {
    const rows = await everyRow((offset) =>
        graphql<{triples: (TripleNode & {transaction_hash: string; created_at: string; creator_id: string; positions: {account_id: string}[]})[]}>(
            `query($p: String!, $l: Int!, $o: Int!) { triples(where: {predicate_id: {_eq: $p}}, order_by: [{created_at: asc}, {term_id: asc}], limit: $l, offset: $o) {
                transaction_hash created_at creator_id positions(where: {shares: {_gt: "0"}}) { account_id } ${NODE}
                subject_term { triple { ${NODE} subject_term { triple { ${NODE} } } } }
            } }`,
            {p: hasOutcome, l: PAGE, o: offset},
        ).then((data) => data.triples),
    );
    const because = await reads.atomId(stringToHex(BECAUSE_LABEL));
    const reasons = rows.length === 0 ? [] : await graphql<{triples: {term_id: string; subject_id: string; object: {label: string} | null}[]}>(
        `query($p: String!, $s: [String!]!) { triples(where: {predicate_id: {_eq: $p}, subject_id: {_in: $s}}) { term_id subject_id object { label } } }`,
        {p: because, s: rows.map((row) => row.term_id)},
    ).then((data) => data.triples);
    return rows.map((row) => {
        const parent = row.subject_term?.triple ?? null;
        const isContext = parent?.predicate?.label === "in context of";
        const uses = isContext ? (parent?.subject_term?.triple ?? null) : parent;
        const reason = reasons.find((entry) => entry.subject_id === row.term_id);
        return {
            termId: row.term_id,
            transaction: row.transaction_hash,
            at: row.created_at,
            creator: row.creator_id,
            outcome: row.object?.label ?? "",
            usesTerm: uses?.term_id ?? null,
            agent: uses?.subject?.label ?? null,
            tool: uses?.object?.label ?? null,
            domainTerm: isContext ? (parent?.term_id ?? null) : null,
            domain: isContext ? (parent?.object?.label ?? null) : null,
            reasonTerm: reason?.term_id ?? null,
            reason: reason?.object?.label ?? null,
            holders: row.positions.map((position) => position.account_id),
        };
    });
}

/**
 * Who stands behind the result lines, apart from the wallets above. `arp line` deposits in an agent's name, so a
 * holder our treasury paid for is one of our test agents: the sponsoring service runs on one machine (ADR `0144`).
 * A holder it did not pay for is the first sign of somebody else, and is printed as such.
 */
export async function holdersOf(lines: readonly ResultLine[]): Promise<{paidByUs: string[]; independent: string[]}> {
    const outside = [...new Set(lines.flatMap((line) => line.holders).filter((holder) => !OURS.has(holder.toLowerCase())))];
    if (outside.length === 0) return {paidByUs: [], independent: []};
    const {deposits} = await graphql<{deposits: {receiver_id: string}[]}>(
        `query($r: [String!]!, $s: [String!]!, $t: [String!]!) { deposits(where: {receiver_id: {_in: $r}, sender_id: {_in: $s}, term_id: {_in: $t}}) { receiver_id } }`,
        {r: outside.map((holder) => getAddress(holder)), s: [...OUR_WALLETS], t: lines.map((line) => line.termId)},
    );
    const paid = new Set(deposits.map((row) => row.receiver_id.toLowerCase()));
    return {paidByUs: outside.filter((holder) => paid.has(holder.toLowerCase())), independent: outside.filter((holder) => !paid.has(holder.toLowerCase()))};
}

/** A line's tool label names a skill when it carries `?skill=`. The graph's other tools and agents do not. */
export const aboutASkill = (line: ResultLine): boolean => line.tool?.includes("?skill=") === true;
