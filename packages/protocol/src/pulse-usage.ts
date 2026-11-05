import {
    createGraphqlTransport,
    DEFAULT_TIMEOUT_MS,
    defaultFetch,
    type FetchLike,
    type GraphqlTransport,
    isRecord,
    PULSE_ATOMS_QUERY,
    PULSE_QUALIFIERS_QUERY,
    PULSE_USES_QUERY,
    readRecord,
    readString,
} from "@arp-protocol/graphql";

import {USAGE_OUTCOMES} from "./declare/usage-context.js";
import {USES} from "./sources/intuition/terms.js";

/**
 * What agents wrote about a tool: the lines of a pulse that come from them (task 63, ADR `0135`).
 *
 * **A qualifier counts for an agent only when the wallet that declared the use stands behind it**:
 * it created the triple or holds a position on it. A triple's subject carries no authorisation (ADR
 * `0032`), so anybody can write `(your edge, has outcome, failed)` for the price of a triple, and
 * anybody who writes it first holds the creator's slot. Positions are why that slot does not silence
 * the declarer. Others' lines are returned apart in `byOthers`, because who wrote what is the fact.
 *
 * **Nothing here proves a wallet controls the agent it writes about.** So the count a list is ordered
 * on is of distinct wallets, and one wallet buying lines about ten agents counts once. Several wallets
 * can still buy several lines (ADR `0135`).
 *
 * Nothing here says a use happened or that a skill is good. It is what wallets paid to write.
 */
export type PulseDeclaration = {
    tripleId: string;
    agent: {atomId: string; label: string | null};
    writer: string;
    declaredAt: string | null;
    domains: string[];
    outcomes: string[];
};

export type PulseUsage = {
    declarations: PulseDeclaration[];
    /** Distinct subjects. A wallet can write about several, so read it with `wallets`. */
    agents: number;
    /** Distinct wallets that declared. A person can hold several, so this is not a count of people. */
    wallets: number;
    /** Declarations per domain the declarer named. */
    byDomain: Record<string, number>;
    /** Declarations per outcome the declarer stated. */
    byOutcome: Record<string, number>;
    byOthers: {tripleId: string; writer: string; predicate: "context" | "outcome"; value: string}[];
    /** The read stopped at its limit, so these are a floor. */
    truncated: boolean;
};

export type PulseUsageConfig = {
    graphqlUrl: string;
    inContextOf: string;
    hasOutcome: string;
    limit?: number;
    fetch?: FetchLike;
    timeoutMs?: number;
    transport?: GraphqlTransport;
};

/** The testnet index returned 250 rows when asked for 500, so a larger limit could never say it was cut. */
const DEFAULT_LIMIT = 250;

const rowsOf = (data: Record<string, unknown>): Record<string, unknown>[] =>
    Array.isArray(data["triples"]) ? data["triples"].filter(isRecord) : [];

/**
 * The atoms that exist for these URIs, as a map from URI to id. One query, so a long list of search
 * results costs no chain read per result. A URI with no atom is simply absent: nobody wrote about it.
 */
export async function findToolAtoms(
    uris: readonly string[],
    config: Pick<PulseUsageConfig, "graphqlUrl" | "fetch" | "timeoutMs" | "transport">,
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (uris.length === 0) return out;
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
    const data = await transport.request(PULSE_ATOMS_QUERY, {uris: [...uris], limit: uris.length});
    const rows = Array.isArray(data["atoms"]) ? data["atoms"].filter(isRecord) : [];
    for (const row of rows) {
        const id = readString(row, "term_id");
        const uri = readString(row, "data");
        if (id !== null && uri !== null) out.set(uri, id);
    }
    return out;
}

/** How many distinct wallets named this domain and said it worked. The one fact a list is ordered on. */
export function workedInDomain(usage: PulseUsage | undefined, domain: string): number {
    const rows = (usage?.declarations ?? []).filter(
        (row) => row.domains.includes(domain) && row.outcomes.includes("worked"),
    );
    return new Set(rows.map((row) => row.writer.toLowerCase())).size;
}

/** Read every tool's usage in two queries. A tool nobody declared comes back empty, not missing. */
export async function getPulseUsage(
    toolAtomIds: readonly string[],
    config: PulseUsageConfig,
): Promise<Map<string, PulseUsage>> {
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
    const limit = config.limit ?? DEFAULT_LIMIT;
    const key = (id: string) => id.toLowerCase();
    const empty = (): PulseUsage => ({
        declarations: [],
        agents: 0,
        wallets: 0,
        byDomain: {},
        byOutcome: {},
        byOthers: [],
        truncated: false,
    });
    const out = new Map<string, PulseUsage>(toolAtomIds.map((id) => [key(id), empty()]));
    if (toolAtomIds.length === 0) return out;

    const edgeRows = rowsOf(await transport.request(PULSE_USES_QUERY, {tools: [...toolAtomIds], uses: USES, limit}));
    const edges = new Map<string, {tool: string; declaration: PulseDeclaration}>();
    for (const row of edgeRows) {
        const tripleId = readString(row, "term_id");
        const tool = readString(row, "object_id");
        const writer = readString(row, "creator_id");
        const subject = readRecord(row, "subject");
        const atomId = subject === null ? null : readString(subject, "term_id");
        if (tripleId === null || tool === null || writer === null || subject === null || atomId === null) continue;
        edges.set(key(tripleId), {
            tool: key(tool),
            declaration: {
                tripleId,
                agent: {atomId, label: readString(subject, "label")},
                writer,
                declaredAt: readString(row, "created_at"),
                domains: [],
                outcomes: [],
            },
        });
    }

    let qualifierRows: Record<string, unknown>[] = [];
    if (edges.size > 0) {
        qualifierRows = rowsOf(
            await transport.request(PULSE_QUALIFIERS_QUERY, {
                edges: [...edges.values()].map((edge) => edge.declaration.tripleId),
                predicates: [config.inContextOf, config.hasOutcome],
                limit,
            }),
        );
    }
    const truncated = edgeRows.length >= limit || qualifierRows.length >= limit;
    for (const row of qualifierRows) {
        const subjectId = readString(row, "subject_id");
        const predicateId = readString(row, "predicate_id");
        const writer = readString(row, "creator_id");
        const object = readRecord(row, "object");
        const value = object === null ? null : readString(object, "label");
        const edge = subjectId === null ? undefined : edges.get(key(subjectId));
        if (edge === undefined || predicateId === null || writer === null || value === null) continue;
        const predicate = key(predicateId) === key(config.hasOutcome) ? "outcome" : "context";
        // A label outside the two words is not part of this vocabulary, whoever wrote it.
        if (predicate === "outcome" && !USAGE_OUTCOMES.some((word) => word === value)) continue;
        const holders = Array.isArray(row["positions"]) ? row["positions"].filter(isRecord) : [];
        const backed = holders.some((holder) => key(readString(holder, "account_id") ?? "") === key(edge.declaration.writer));
        if (key(writer) === key(edge.declaration.writer) || backed) {
            (predicate === "outcome" ? edge.declaration.outcomes : edge.declaration.domains).push(value);
        } else {
            out.get(edge.tool)?.byOthers.push({
                tripleId: readString(row, "term_id") ?? "",
                writer,
                predicate,
                value,
            });
        }
    }

    for (const {tool, declaration} of edges.values()) out.get(tool)?.declarations.push(declaration);
    for (const usage of out.values()) {
        usage.truncated = truncated;
        usage.agents = new Set(usage.declarations.map((declaration) => key(declaration.agent.atomId))).size;
        usage.wallets = new Set(usage.declarations.map((declaration) => key(declaration.writer))).size;
        for (const declaration of usage.declarations) {
            for (const domain of declaration.domains) usage.byDomain[domain] = (usage.byDomain[domain] ?? 0) + 1;
            for (const outcome of declaration.outcomes) usage.byOutcome[outcome] = (usage.byOutcome[outcome] ?? 0) + 1;
        }
    }
    return out;
}
