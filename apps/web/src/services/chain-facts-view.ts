import type {RecentDeclaration, RecentStake} from "@arp-protocol/core";
import type {Hex} from "viem";

/**
 * What every identified agent did on one chain, as `/activity` lists it: declarations and the
 * stakes on them, merged into one list, newest first.
 *
 * It is read from the indexer, so it is the same for every visitor and survives a reload — unlike
 * the local feed, which is one machine's record and lives in memory.
 */
export type ChainFact = {
    key: string;
    kind: "declared" | "deposit" | "redeem";
    at: string;
    agent: string;
    tool: string;
    tx: Hex | null;
    /**
     * Wei, as a decimal string. On a declaration it is the deposit made in the same transaction, the
     * position it was written with; a later stake is its own row. `null` when there is none.
     */
    assets: string | null;
    /** Who signed the deposit or redemption. Not the agent: one operator signs for several. */
    account: string | null;
    /** Whose position it is, which differs from `account` when a sponsor signed (ADR `0094`). */
    receiver: string | null;
};

const HASH = /^0x[0-9a-fA-F]{64}$/;

function txOf(hash: string | null): Hex | null {
    // Matched against a 32-byte hex pattern first.
    return hash !== null && HASH.test(hash) ? (hash as Hex) : null;
}

const name = (end: {atomId: string; label: string | null}) => end.label ?? end.atomId;

/**
 * The instant before which the merged list is incomplete. Each read is capped at `limit` on its own,
 * so once one list is full, older rows of the other kinds would stand with nothing of that kind
 * beside them, which reads as "none" when they were only cut off. `null` when no list is full.
 */
function cutoff(lists: readonly (readonly {at: string}[])[], limit: number): number | null {
    let latest: number | null = null;
    for (const list of lists) {
        if (list.length < limit) continue;
        const oldest = Math.min(...list.map((row) => Date.parse(row.at)));
        latest = latest === null ? oldest : Math.max(latest, oldest);
    }
    return latest;
}

export function chainFacts(
    declarations: readonly RecentDeclaration[],
    stakes: readonly RecentStake[],
    limit: number,
): ChainFact[] {
    const from = cutoff(
        [
            declarations,
            stakes.filter((row) => row.kind === "deposit"),
            stakes.filter((row) => row.kind === "redeem"),
        ],
        limit,
    );
    const kept = <T extends {at: string}>(rows: readonly T[]) =>
        from === null ? rows : rows.filter((row) => Date.parse(row.at) >= from);

    // A deposit in the transaction that wrote the declaration is the position it was written with,
    // so it is shown on that row rather than as a second line with the same hash.
    const opening = new Map<string, RecentStake>();
    for (const row of stakes) {
        if (row.kind === "deposit" && row.txHash !== null)
            opening.set(`${row.txHash}:${row.tripleId}`, row);
    }
    const folded = new Set<string>();

    const facts: ChainFact[] = [
        ...kept(declarations).map((row): ChainFact => {
            const first =
                row.txHash === null ? undefined : opening.get(`${row.txHash}:${row.tripleId}`);
            if (first !== undefined) folded.add(first.id);
            return {
                key: `declared:${row.tripleId}`,
                kind: "declared",
                at: row.at,
                agent: name(row.subject),
                tool: name(row.object),
                tx: txOf(row.txHash),
                assets:
                    first === undefined || first.assets === null ? null : first.assets.toString(),
                account: first?.account ?? null,
                receiver: first?.receiver ?? null,
            };
        }),
        ...kept(stakes)
            .filter((row) => !folded.has(row.id))
            .map(
                (row): ChainFact => ({
                    key: `${row.kind}:${row.id}`,
                    kind: row.kind,
                    at: row.at,
                    agent: name(row.subject),
                    tool: name(row.object),
                    tx: txOf(row.txHash),
                    assets: row.assets === null ? null : row.assets.toString(),
                    account: row.account,
                    receiver: row.receiver,
                }),
            ),
    ];
    // Compared as instants: the two reads need not format their offsets alike.
    return facts.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/**
 * Whether a public row is the connected wallet's own: it signed the transaction, or the position is
 * in its name (a sponsor signs and the operator holds, ADR `0094`). Addresses compare without case.
 * A declaration written with no deposit carries no address, so it is nobody's here.
 */
export function isOwnFact(fact: ChainFact, address: string | null | undefined): boolean {
    if (address === null || address === undefined) return false;
    const own = address.toLowerCase();
    return fact.account?.toLowerCase() === own || fact.receiver?.toLowerCase() === own;
}

/** The kinds a reader can narrow the public table to, in the operator's words (ADR `0103`). */
export const FACT_FILTERS: readonly {id: ChainFact["kind"] | "all"; label: string}[] = [
    {id: "all", label: "All"},
    {id: "declared", label: "Declared"},
    {id: "deposit", label: "Supported"},
    {id: "redeem", label: "Withdrawn"},
];

export function factsOfKind(
    facts: readonly ChainFact[],
    kind: ChainFact["kind"] | "all",
): ChainFact[] {
    return kind === "all" ? [...facts] : facts.filter((fact) => fact.kind === kind);
}
