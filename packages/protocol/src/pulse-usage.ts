import {
    createGraphqlTransport,
    DEFAULT_TIMEOUT_MS,
    defaultFetch,
    type FetchLike,
    type GraphqlTransport,
    isRecord,
    PULSE_ATOMS_QUERY,
    PULSE_DOMAIN_EDGES_QUERY,
    PULSE_EDGE_TOOLS_QUERY,
    PULSE_EDGE_WRITERS_QUERY,
    PULSE_QUALIFIERS_QUERY,
    PULSE_USES_QUERY,
    readRecord,
    readString,
} from "@arp-protocol/graphql";

import {USAGE_OUTCOMES, USAGE_REASONS, type UsageOutcome, type UsageReason} from "./declare/usage-context.js";
import {USES} from "./sources/intuition/terms.js";
import {readIpfsJson} from "./verify/probe.js";

/**
 * What agents wrote about a tool: the lines of a pulse that come from them (task 63, ADR `0135`).
 *
 * **A wallet declares a use by creating the edge, or by holding a position on it and standing behind a
 * domain or a result on it** (ADR `0138`). A position alone is support. One edge can so have several
 * declarers, each with its own lines, and that is one row per wallet in `declarations`.
 * **A qualifier counts for a wallet only when that wallet declared the use and stands behind it**:
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
export type PulseLine = {
    /** `null` when the outcome names no domain. */
    domain: string | null;
    outcome: UsageOutcome;
    reasons: UsageReason[];
    /** `nested` is form B (ADR `0138`). `sibling` is form A: the outcome sits on the edge, so it applies to each domain there. */
    form: "nested" | "sibling";
    /**
     * A receipt was verified for this line. Nothing here sets it: reading a receipt is not in this package yet, so
     * every real line reads as unproven, and the simulation is what sets it (`docs/tasks/66`).
     */
    proven?: boolean;
};

export type PulseDeclaration = {
    tripleId: string;
    agent: {atomId: string; label: string | null};
    writer: string;
    /** Wallets holding a position on the line. A triple has one creator, so a later declarer is here. */
    holders?: string[];
    declaredAt: string | null;
    domains: string[];
    outcomes: string[];
    /** Each outcome with its domain and reasons. What the score reads. */
    lines: PulseLine[];
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
    /** Reasons the declarer gave for a failure. */
    byReason: Record<string, number>;
    byOthers: {tripleId: string; writer: string; predicate: "context" | "outcome" | "reason"; value: string}[];
    /** The read stopped at its limit, so these are a floor. */
    truncated: boolean;
};

export type PulseUsageConfig = {
    graphqlUrl: string;
    inContextOf: string;
    hasOutcome: string;
    because: string;
    /**
     * Wallets that pay for lines and say nothing by it: the sponsoring service creates the terms of a
     * sponsored line, so as a creator it would read as saying every one of them (ADR `0144`). Their row
     * stays, since they did write the edge, and they stand behind no qualifier.
     */
    payers?: readonly string[];
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

/**
 * The tools declared in these domains, even ones a search did not return, so what agents learned can reach
 * the next agent. An atom may read `Unknown`: the indexer does not retry after a failed resolve, so an atom
 * created before its document was pinned keeps that label. Then its URL comes from the document itself.
 */
export async function findDeclaredTools(
    domains: readonly string[],
    config: Pick<PulseUsageConfig, "graphqlUrl" | "inContextOf" | "fetch" | "timeoutMs" | "transport"> & {
        readThing?: (uri: string) => Promise<string | null>;
    },
): Promise<{atomId: string; url: string}[]> {
    if (domains.length === 0) return [];
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
    const edges = rowsOf(
        await transport.request(PULSE_DOMAIN_EDGES_QUERY, {domains: [...domains], predicate: config.inContextOf, limit: DEFAULT_LIMIT}),
    )
        .map((row) => readString(row, "subject_id"))
        .filter((id): id is string => id !== null);
    if (edges.length === 0) return [];
    const rows = rowsOf(await transport.request(PULSE_EDGE_TOOLS_QUERY, {edges, uses: USES, limit: DEFAULT_LIMIT}));
    const out = new Map<string, {atomId: string; url: string}>();
    for (const row of rows) {
        const object = readRecord(row, "object");
        const atomId = object === null ? null : readString(object, "term_id");
        if (object === null || atomId === null || out.has(atomId)) continue;
        const label = readString(object, "label");
        const uri = readString(object, "data");
        const fromLabel = label !== null && label.includes("?skill=") ? `https://${label.replace(/^https?:\/\//, "")}` : null;
        const url = fromLabel ?? (uri === null || config.readThing === undefined ? null : await config.readThing(uri));
        if (url !== null) out.set(atomId, {atomId, url});
    }
    return [...out.values()];
}

/** The URL in a tool's pinned document, read from a public IPFS gateway. `null` for anything else. */
export async function readThingUrl(uri: string, fetcher: FetchLike = defaultFetch()): Promise<string | null> {
    if (!uri.startsWith("ipfs://")) return null;
    try {
        const body = await readIpfsJson(uri, fetcher, DEFAULT_TIMEOUT_MS);
        const url = isRecord(body) ? readString(body, "url") : null;
        return url !== null && url.includes("?skill=") ? url : null;
    } catch {
        return null;
    }
}

/** How many distinct wallets named this domain and said it worked. The one fact a list is ordered on. */
export function workedInDomain(usage: PulseUsage | undefined, domain: string): number {
    const rows = (usage?.declarations ?? []).filter((row) =>
        row.lines.some((line) => line.domain === domain && line.outcome === "worked"),
    );
    return new Set(rows.map((row) => row.writer.toLowerCase())).size;
}

/**
 * Who wrote each of these `uses` edges. Another wallet's detail counts only if it holds a position on the
 * edge (ADR `0138`), so a planner knows when one has to be deposited.
 */
export async function readEdgeWriters(
    edges: readonly string[],
    config: Pick<PulseUsageConfig, "graphqlUrl" | "fetch" | "timeoutMs" | "transport">,
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (edges.length === 0) return out;
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
    const rows = rowsOf(await transport.request(PULSE_EDGE_WRITERS_QUERY, {edges: [...edges], limit: edges.length}));
    for (const row of rows) {
        const id = readString(row, "term_id");
        const writer = readString(row, "creator_id");
        if (id !== null && writer !== null) out.set(id.toLowerCase(), writer);
    }
    return out;
}

/** Read every tool's usage, one query per level of a line (ADR `0138`). A tool nobody declared comes back empty, not missing. */
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
    // Above the index's cap, a read could never say it was cut.
    const limit = Math.min(config.limit ?? DEFAULT_LIMIT, DEFAULT_LIMIT);
    const key = (id: string) => id.toLowerCase();
    const empty = (): PulseUsage => ({
        declarations: [],
        agents: 0,
        wallets: 0,
        byDomain: {},
        byOutcome: {},
        byReason: {},
        byOthers: [],
        truncated: false,
    });
    const out = new Map<string, PulseUsage>(toolAtomIds.map((id) => [key(id), empty()]));
    if (toolAtomIds.length === 0) return out;

    const edgeRows = rowsOf(await transport.request(PULSE_USES_QUERY, {tools: [...toolAtomIds], uses: USES, limit}));
    type Edge = {tool: string; declarers: Map<string, PulseDeclaration>};
    const edges = new Map<string, Edge>();
    /** The index caps a nested list at 100, with no order and no sign of the cut. */
    const NESTED_CAP = 100;
    let truncated = edgeRows.length >= limit;
    for (const row of edgeRows) {
        const tripleId = readString(row, "term_id");
        const tool = readString(row, "object_id");
        const writer = readString(row, "creator_id");
        const subject = readRecord(row, "subject");
        const atomId = subject === null ? null : readString(subject, "term_id");
        if (tripleId === null || tool === null || writer === null || subject === null || atomId === null) continue;
        // A triple has one creator, so a wallet that declared later is among these.
        const edgeHolders = (Array.isArray(row["positions"]) ? row["positions"].filter(isRecord) : [])
            .map((holder) => readString(holder, "account_id"))
            .filter((account): account is string => account !== null);
        const declaration = (wallet: string, declaredAt: string | null): PulseDeclaration => ({
            tripleId,
            agent: {atomId, label: readString(subject, "label")},
            writer: wallet,
            holders: edgeHolders,
            declaredAt,
            domains: [],
            outcomes: [],
            lines: [],
        });
        const declarers = new Map([[key(writer), declaration(writer, readString(row, "created_at"))]]);
        // The creator first, so it is the row always kept below. When a holder deposited is not read here.
        const holders = Array.isArray(row["positions"]) ? row["positions"].filter(isRecord) : [];
        if (holders.length >= NESTED_CAP) truncated = true;
        for (const holder of holders) {
            const wallet = readString(holder, "account_id");
            if (wallet !== null && !declarers.has(key(wallet))) declarers.set(key(wallet), declaration(wallet, null));
        }
        edges.set(key(tripleId), {tool: key(tool), declarers});
    }

    const payers = new Set((config.payers ?? []).map(key));
    const writers = [...new Set([...edges.values()].flatMap((edge) => [...edge.declarers.values()].map((row) => row.writer)))];
    const qualifiers = async (subjects: string[], predicates: string[]) =>
        subjects.length === 0
            ? []
            : rowsOf(await transport.request(PULSE_QUALIFIERS_QUERY, {edges: subjects, predicates, writers, limit}));
    const pass = (rows: Record<string, unknown>[]) => {
        truncated = truncated || rows.length >= limit;
        return rows;
    };
    /** The declarers of this edge who stand behind a level: they created it or hold a position on it. */
    const standing = (row: Record<string, unknown>, edge: Edge, below?: ReadonlySet<string>): Set<string> => {
        const holders = Array.isArray(row["positions"]) ? row["positions"].filter(isRecord) : [];
        // `$writers` holds every edge's declarers, so a row can reach the cap through other edges' wallets.
        if (holders.length >= NESTED_CAP) truncated = true;
        const wallets = [readString(row, "creator_id"), ...holders.map((holder) => readString(holder, "account_id"))];
        return new Set(
            wallets
                .filter((wallet): wallet is string => wallet !== null)
                .map(key)
                .filter(
                    (wallet) =>
                        edge.declarers.has(wallet) && !payers.has(wallet) && (below === undefined || below.has(wallet)),
                ),
        );
    };
    const parts = (row: Record<string, unknown>) => {
        const object = readRecord(row, "object");
        return {
            termId: readString(row, "term_id"),
            subjectId: readString(row, "subject_id"),
            predicateId: readString(row, "predicate_id"),
            writer: readString(row, "creator_id"),
            value: object === null ? null : readString(object, "label"),
        };
    };
    const isOutcome = (value: string): value is UsageOutcome => USAGE_OUTCOMES.some((word) => word === value);
    const isReason = (value: string): value is UsageReason => USAGE_REASONS.some((word) => word === value);

    type Found = {
        edge: Edge;
        domain: string | null;
        form: PulseLine["form"];
        outcome: UsageOutcome;
        wallets: Set<string>;
        reasons: Map<string, UsageReason[]>;
    };
    const contexts = new Map<string, {edge: Edge; domain: string; wallets: Set<string>}>();
    const outcomes = new Map<string, Found>();
    const others = (edge: Edge, row: ReturnType<typeof parts>, predicate: "context" | "outcome" | "reason") =>
        out.get(edge.tool)?.byOthers.push({
            tripleId: row.termId ?? "",
            writer: row.writer ?? "",
            predicate,
            value: row.value ?? "",
        });

    // Level 2: what sits on the edge. A domain, or form A's outcome, or an outcome with no domain.
    const onEdge = pass(await qualifiers([...edges.keys()], [config.inContextOf, config.hasOutcome]));
    for (const row of onEdge) {
        const line = parts(row);
        const edge = line.subjectId === null ? undefined : edges.get(key(line.subjectId));
        if (edge === undefined || line.predicateId === null || line.writer === null || line.value === null || line.termId === null) continue;
        const isOutcomeLine = key(line.predicateId) === key(config.hasOutcome);
        // A label outside the two words is not part of this vocabulary, whoever wrote it.
        if (isOutcomeLine && !isOutcome(line.value)) continue;
        const wallets = standing(row, edge);
        if (wallets.size === 0) {
            others(edge, line, isOutcomeLine ? "outcome" : "context");
        } else if (isOutcomeLine && isOutcome(line.value)) {
            outcomes.set(key(line.termId), {edge, domain: null, form: "sibling", outcome: line.value, wallets, reasons: new Map()});
        } else {
            contexts.set(key(line.termId), {edge, domain: line.value, wallets});
        }
    }

    // Level 3, form B: an outcome on a domain.
    const onContext = pass(await qualifiers([...contexts.keys()], [config.hasOutcome]));
    for (const row of onContext) {
        const line = parts(row);
        const context = line.subjectId === null ? undefined : contexts.get(key(line.subjectId));
        if (context === undefined || line.value === null || line.termId === null || !isOutcome(line.value)) continue;
        const wallets = standing(row, context.edge, context.wallets);
        if (wallets.size === 0) {
            others(context.edge, line, "outcome");
        } else {
            outcomes.set(key(line.termId), {edge: context.edge, domain: context.domain, form: "nested", outcome: line.value, wallets, reasons: new Map()});
        }
    }

    // Level 4: the reason for a failure, in the closed list.
    const failures = [...outcomes.entries()].filter(([, found]) => found.outcome === "failed").map(([id]) => id);
    const onOutcome = pass(await qualifiers(failures, [config.because]));
    for (const row of onOutcome) {
        const line = parts(row);
        const found = line.subjectId === null ? undefined : outcomes.get(key(line.subjectId));
        if (found === undefined || line.value === null || !isReason(line.value)) continue;
        const wallets = standing(row, found.edge, found.wallets);
        if (wallets.size === 0) others(found.edge, line, "reason");
        for (const wallet of wallets) {
            const given = found.reasons.get(wallet) ?? [];
            if (!given.includes(line.value)) given.push(line.value);
            found.reasons.set(wallet, given);
        }
    }

    for (const {edge, domain, wallets} of contexts.values()) {
        for (const wallet of wallets) edge.declarers.get(wallet)?.domains.push(domain);
    }
    // Nested first, so a use written in both forms keeps form B's line, and its reason.
    const ordered = [...outcomes.values()].sort((a, b) => Number(b.form === "nested") - Number(a.form === "nested"));
    for (const found of ordered) {
        for (const wallet of found.wallets) {
            const declaration = found.edge.declarers.get(wallet);
            if (declaration === undefined) continue;
            const reasons = found.reasons.get(wallet) ?? [];
            if (!declaration.outcomes.includes(found.outcome)) declaration.outcomes.push(found.outcome);
            const domains = found.form === "nested" ? [found.domain] : declaration.domains.length > 0 ? declaration.domains : [null];
            for (const domain of domains) {
                const same = declaration.lines.find((line) => line.domain === domain && line.outcome === found.outcome);
                if (same === undefined) {
                    declaration.lines.push({domain, outcome: found.outcome, reasons, form: found.form});
                } else {
                    same.reasons = [...new Set([...same.reasons, ...reasons])];
                }
            }
        }
    }

    // ADR `0138`: a position alone is support. It declares once its wallet stands behind a domain or a result.
    for (const {tool, declarers} of edges.values()) {
        const rows = [...declarers.values()].filter(
            (row, at) => at === 0 || row.domains.length > 0 || row.lines.length > 0,
        );
        out.get(tool)?.declarations.push(...rows);
    }
    for (const usage of out.values()) {
        usage.truncated = truncated;
        usage.agents = new Set(usage.declarations.map((declaration) => key(declaration.agent.atomId))).size;
        usage.wallets = new Set(usage.declarations.map((declaration) => key(declaration.writer))).size;
        for (const declaration of usage.declarations) {
            for (const domain of declaration.domains) usage.byDomain[domain] = (usage.byDomain[domain] ?? 0) + 1;
            for (const outcome of declaration.outcomes) usage.byOutcome[outcome] = (usage.byOutcome[outcome] ?? 0) + 1;
            for (const reason of new Set(declaration.lines.flatMap((line) => line.reasons))) {
                usage.byReason[reason] = (usage.byReason[reason] ?? 0) + 1;
            }
        }
    }
    return out;
}
