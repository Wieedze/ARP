import {
    AGENT_IDENTITIES_QUERY,
    ATTACHED_DOCUMENTS_QUERY,
    createGraphqlTransport,
    IDENTITY_CLAIMS_QUERY,
    DEFAULT_TIMEOUT_MS,
    defaultFetch,
    type FetchLike,
    type GraphqlTransport,
    isRecord,
    PULSE_DOMAIN_EDGES_QUERY,
    PULSE_EDGE_TOOLS_QUERY,
    readRecord,
    readString,
} from "@arp-protocol/graphql";
import {getAddress, isHex, type Address, type Hex} from "viem";

import {parseCaip19, toCaip19} from "./caip.js";
import {canonicalAgentThing, thingUri} from "./declare/agent-atom.js";
import {atomDataForUri} from "./declare/multivault.js";
import {asAgentIdentityAtom} from "./verify/subject.js";
import {resolveIdentityAtomStrict, type StrictIdentityAtom} from "./declare/resolve-subject.js";
import {verifyHireReceipt, type SignedHireReceipt} from "./hire-receipt.js";
import type {ResolvedAgentRef} from "./types.js";
import {SAME_AS, USES} from "./sources/intuition/terms.js";
import {readIpfsJson} from "./verify/probe.js";

/**
 * The pulse for agents reached through a node (task 65): who used an agent in a domain, and what stands
 * behind each line.
 *
 * ```
 * ((hirer, uses, agent), in context of, document)   the line, from ADR `0135`
 * (receipt, in context of, (hirer, uses, agent))    the receipt the hired node signed
 * ```
 *
 * **What a checked receipt says is that two keys dealt with each other**: a payment was mined, the hired
 * node signed for it, and the wallet that paid wrote the line and controls the agent the line names. It does not say those keys belong to
 * different people, and nothing here tries to (the user, 2026-11-05: Sybil comes later). `checks` are
 * returned one by one, so a reader sees which held.
 *
 * **Anyone can attach anything to a line**, since a triple's subject carries no authorisation (ADR `0032`).
 * So a document counts by what it proves, never by being attached, and a false one fails the checks.
 */
export type AgentInDomain = {
    atomId: string;
    label: string | null;
    /** `null` when the atom names several identities, or when they do not resolve back to it. */
    caip19: string | null;
    ambiguous: boolean;
};

export type LineReceipt = {
    document: string;
    signature: "valid" | "invalid" | "unreadable";
    signer: Address | null;
    checks: {
        signerIsABoundNode: boolean;
        namesThisLine: boolean;
        requesterStandsBehindTheLine: boolean;
        /** The wallet that paid is the owner or the declared wallet of the agent the line is about. */
        requesterControlsTheSubject: boolean;
        paymentMined: boolean;
        paymentFromRequester: boolean;
        paymentToSigner: boolean;
        namesThisAgent: boolean;
    };
    /** `unknown` when no single identity for the line's subject can be read on this chain. */
    subjectControl: SubjectControl;
    /** The chain could not be read, which is not the same as a false payment. */
    paymentUnread: boolean;
    paidWei: string | null;
};

export type SubjectControl = "yes" | "no" | "unknown";

export type LineReceipts = {
    receipts: LineReceipt[];
    /** Documents the writers attached that no source served. Not read is not absent. */
    unreadable: {document: string; reason: string}[];
    /** Attachments by other wallets, not read. Anybody can write one. */
    othersNotRead: number;
};

export type PaymentFacts = {status: "success" | "reverted"; from: Address; to: Address | null; value: bigint};

type ReadConfig = {
    graphqlUrl: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    transport?: GraphqlTransport;
};

const transportOf = (config: ReadConfig): GraphqlTransport =>
    config.transport ??
    createGraphqlTransport({
        url: config.graphqlUrl,
        fetch: config.fetch ?? defaultFetch(),
        timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

const rowsOf = (data: Record<string, unknown>): Record<string, unknown>[] =>
    Array.isArray(data["triples"]) ? data["triples"].filter(isRecord) : [];

const LIMIT = 250;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const MAX_AGENTS = 25;

const canonicalUri = (ref: ResolvedAgentRef) => thingUri(canonicalAgentThing(ref.chainId, ref.tokenId));

/**
 * Whether this atom is the canonical one for this agent. A strict read does not say so: mint token 7, write
 * `(agent 2's atom, same as, token 7)`, and agent 2's atom is token 7's only claimant, so agent 2's record would
 * read as token 7's. The canonical id has no registry in it, so a token with the same number on a registry
 * somebody deployed would match too, and the registry has to be one this reader knows. `atomIdOf` is the
 * multivault's own derivation.
 */
export async function atomIsCanonicalFor(
    atom: string,
    ref: ResolvedAgentRef,
    knownRegistries: readonly string[],
    atomIdOf: (data: Hex) => Promise<string>,
): Promise<boolean> {
    if (!knownRegistries.some((registry) => same(registry, ref.registry))) return false;
    return same(await atomIdOf(atomDataForUri(canonicalUri(ref))), atom);
}

/**
 * The agent's atom when several claim its identity, so one stranger's `same as` cannot blank an agent.
 *
 * `same as` is permissionless and nothing is deleted, so stopping at "ambiguous" hands anyone a permanent
 * off switch for about one triple's fee. In order:
 *
 * 1. the only atom claimed by the token's owner or declared wallet, which a stranger cannot write;
 * 2. the atom whose document is the canonical one for the chain and token id.
 *
 * Otherwise it stays ambiguous, with no address. Anyone can create a canonical atom, since its bytes are public
 * (ADR `0047`), so step 2 comes second, and a claim only Intuition's mirror wrote can lose to a stranger's
 * canonical atom. That shows the wrong lines and cannot divert a payment, because a binding must name the agent.
 */
export async function resolveAgentAtom(
    ref: ResolvedAgentRef,
    config: ReadConfig & {
        controllersOf?: (ref: ResolvedAgentRef) => Promise<readonly string[]>;
        strict?: (ref: ResolvedAgentRef) => Promise<StrictIdentityAtom>;
    },
): Promise<StrictIdentityAtom> {
    const strict = config.strict ?? ((agent: ResolvedAgentRef) => resolveIdentityAtomStrict({agent, graphqlUrl: config.graphqlUrl}));
    const first = await strict(ref);
    if (first.status !== "ambiguous") return first;
    const claims = rowsOf(
        await transportOf(config).request(IDENTITY_CLAIMS_QUERY, {caip19: toCaip19(ref), sameAs: SAME_AS, limit: LIMIT}),
    ).flatMap((row) => {
        const subject = readRecord(row, "subject");
        const atom = subject === null ? null : readString(subject, "term_id");
        return subject === null || atom === null
            ? []
            : [{atom, data: readString(subject, "data"), creator: readString(row, "creator_id") ?? ""}];
    });
    if (config.controllersOf !== undefined) {
        const controllers = await config.controllersOf(ref);
        const byController = new Set(
            claims.filter((claim) => controllers.some((wallet) => same(wallet, claim.creator))).map((claim) => claim.atom),
        );
        const only = byController.size === 1 ? [...byController][0] : undefined;
        if (only !== undefined) return found(only, ref);
    }
    const uri = canonicalUri(ref);
    const canonical = claims.find((claim) => claim.data === uri);
    if (canonical !== undefined) return found(canonical.atom, ref);
    return first;
}

function found(atom: string, ref: ResolvedAgentRef): StrictIdentityAtom {
    return {status: "found", atom: asAgentIdentityAtom(atom as Hex, toCaip19(ref))}; // the graph's term_id, a 32-byte hex
}

/**
 * The identity an atom holds: the one its document is canonical for, or none. **Even when only one is named**,
 * since anyone can mint a token on a known registry and write `(somebody's atom, same as, my token)`, and the
 * atom's record would then lead to their address. An agent whose atom carries registration metadata reads as
 * none until that is compared too.
 */
function identityOfAtom(refs: readonly ResolvedAgentRef[], atomData: string | null): ResolvedAgentRef | undefined {
    const matching = refs.filter((ref) => canonicalUri(ref) === atomData);
    return matching.length === 1 ? matching[0] : undefined;
}

const dataOfSubject = (row: Record<string, unknown>): string | null => {
    const subject = readRecord(row, "subject");
    return subject === null ? null : readString(subject, "data");
};

/**
 * Whether a wallet controls the agent a line is about: the token's owner or its declared wallet, read now.
 *
 * A triple's subject carries no authorisation (ADR `0032`), so without this a wallet pays a real node, writes
 * `(somebody else, uses, agent)` and attaches a valid receipt to it. **A stranger's identity on the atom never
 * answers `yes`**: anyone can add `(atom, same as, a token of their own)`, so only the identity the atom's
 * document is canonical for counts, and if none stands out the answer is `unknown`. An owner who later sells the token reads `no` on earlier lines.
 */
export async function walletControlsSubject(
    subjectAtom: string,
    wallet: string,
    config: ReadConfig & {
        chainId: number;
        /** The token's owner and declared wallet, read from its registry on `chainId`. */
        controllersOf(ref: ResolvedAgentRef): Promise<readonly string[]>;
        /** The identity registries this reader accepts on `chainId`, from its deployment record. */
        knownRegistries: readonly string[];
        resolveStrict?: (ref: ResolvedAgentRef) => Promise<StrictIdentityAtom>;
    },
): Promise<SubjectControl> {
    const rows = rowsOf(
        await transportOf(config).request(AGENT_IDENTITIES_QUERY, {atoms: [subjectAtom], sameAs: SAME_AS, limit: LIMIT}),
    );
    const refs = new Map<string, ResolvedAgentRef>();
    for (const row of rows) {
        const ref = caipOfIdentity(row);
        if (ref !== null) refs.set(toCaip19(ref), ref);
    }
    const atomData = rows[0] === undefined ? null : dataOfSubject(rows[0]);
    if (refs.size === 0) return "no";
    const real = knownIdentities([...refs.values()], {chainId: config.chainId, registries: config.knownRegistries});
    if (real.length === 0) return "no";
    const only = identityOfAtom(real, atomData);
    if (only === undefined) return "unknown";
    const resolve =
        config.resolveStrict ??
        ((ref: ResolvedAgentRef) => resolveAgentAtom(ref, {...config, controllersOf: config.controllersOf}));
    const back = await resolve(only);
    if (back.status !== "found") return back.status === "ambiguous" ? "unknown" : "no";
    if (!same(back.atom, subjectAtom)) return "no";
    const controllers = await config.controllersOf(only);
    return controllers.some((controller) => same(controller, wallet)) ? "yes" : "no";
}

/**
 * The identities on a registry this reader knows. A registry is a contract anybody can deploy, with an `ownerOf`
 * that says what its author wants, so an identity on any other is not one. That also drops a `same as` to an
 * address with no contract, which agent 13579/6's own wallet wrote (`scripts/measure/agent-identity-canonical.ts`).
 */
function knownIdentities(
    refs: readonly ResolvedAgentRef[],
    known: {chainId: number; registries: readonly string[]},
): ResolvedAgentRef[] {
    return refs.filter(
        (ref) => ref.chainId === known.chainId && known.registries.some((registry) => same(registry, ref.registry)),
    );
}

function caipOfIdentity(row: Record<string, unknown>): ResolvedAgentRef | null {
    const object = readRecord(row, "object");
    if (object === null) return null;
    const thing = readRecord(readRecord(object, "value") ?? {}, "thing");
    const name = (thing === null ? null : readString(thing, "name")) ?? readString(object, "label");
    return name === null ? null : parseCaip19(name);
}

/**
 * The agents with a `uses` line in these domains.
 *
 * **`same as` does not make an atom an agent**, since anyone can write it: most such edges on 13579 are not
 * about agents at all. So an edge counts only when its object parses as CAIP-19, and an identity counts only
 * when it resolves back to this atom, strictly. An atom naming two identities is reported as ambiguous with no
 * address to follow, because a caller decides whom to pay on this (the divert ADR `0095` §7 closed).
 */
export async function findAgentsInDomains(
    domains: readonly string[],
    config: ReadConfig & {
        inContextOf: string;
        chainId: number;
        knownRegistries: readonly string[];
        resolveStrict?: (ref: ResolvedAgentRef) => Promise<StrictIdentityAtom>;
    },
): Promise<{agents: AgentInDomain[]; truncated: boolean}> {
    if (domains.length === 0) return {agents: [], truncated: false};
    const transport = transportOf(config);
    const edgeRows = rowsOf(
        await transport.request(PULSE_DOMAIN_EDGES_QUERY, {domains: [...domains], predicate: config.inContextOf, limit: LIMIT}),
    );
    const edges = edgeRows.map((row) => readString(row, "subject_id")).filter((id): id is string => id !== null);
    if (edges.length === 0) return {agents: [], truncated: false};
    const objects = new Map<string, string | null>();
    for (const row of rowsOf(await transport.request(PULSE_EDGE_TOOLS_QUERY, {edges, uses: USES, limit: LIMIT}))) {
        const object = readRecord(row, "object");
        const id = object === null ? null : readString(object, "term_id");
        if (id !== null && object !== null) objects.set(id, readString(object, "label"));
    }
    if (objects.size === 0) return {agents: [], truncated: edgeRows.length >= LIMIT};
    const identities = rowsOf(
        await transport.request(AGENT_IDENTITIES_QUERY, {atoms: [...objects.keys()], sameAs: SAME_AS, limit: LIMIT}),
    );
    const refs = new Map<string, Map<string, ResolvedAgentRef>>();
    const atomData = new Map<string, string | null>();
    for (const row of identities) {
        const atomId = readString(row, "subject_id");
        if (atomId !== null) atomData.set(atomId, dataOfSubject(row));
        const ref = caipOfIdentity(row);
        if (atomId === null || ref === null) continue;
        const seen = refs.get(atomId) ?? new Map<string, ResolvedAgentRef>();
        seen.set(toCaip19(ref), ref);
        refs.set(atomId, seen);
    }
    const resolve =
        config.resolveStrict ??
        ((ref: ResolvedAgentRef) => resolveAgentAtom(ref, config));
    const agents: AgentInDomain[] = [];
    for (const [atomId, named] of [...refs].slice(0, MAX_AGENTS)) {
        const label = objects.get(atomId) ?? null;
        const real = knownIdentities([...named.values()], {chainId: config.chainId, registries: config.knownRegistries});
        if (real.length === 0) continue;
        const only = identityOfAtom(real, atomData.get(atomId) ?? null);
        if (only === undefined) {
            agents.push({atomId, label, caip19: null, ambiguous: true});
            continue;
        }
        const back = await resolve(only);
        if (back.status === "ambiguous") {
            agents.push({atomId, label, caip19: null, ambiguous: true});
        } else if (back.status === "found" && same(back.atom, atomId)) {
            agents.push({atomId, label, caip19: toCaip19(only), ambiguous: false});
        }
        // Otherwise the identity belongs to another atom, and this one only claims it.
    }
    return {agents, truncated: edgeRows.length >= LIMIT || identities.length >= LIMIT || refs.size > MAX_AGENTS};
}

function isSignedReceipt(value: unknown): value is SignedHireReceipt {
    return (
        isRecord(value) &&
        isRecord(value["receipt"]) &&
        typeof value["signature"] === "string" &&
        typeof value["agent"] === "string"
    );
}

/**
 * The receipts on one line, each checked against the chain.
 *
 * Only what the line's wallets and the bound nodes attached is read, at most `limit`, oldest first. A
 * stranger's attachments are counted and not read, so five of them cannot silence a line. A document that
 * is not a receipt is skipped, because `in context of` attaches other things too.
 */
export async function readLineReceipts(
    line: {tripleId: string; writer: string; holders?: readonly string[]},
    config: ReadConfig & {
        inContextOf: string;
        agentRegistry: string;
        agentId: string;
        /** Every node key a bound address of this agent names. */
        boundNodes: readonly string[];
        /** The chain this reader's `getPayment` reads. A receipt about another chain fails `paymentMined`. */
        chainId: number;
        getPayment(hash: Hex): Promise<PaymentFacts | null>;
        /** Whether a wallet controls the agent this line is about. See {@link walletControlsSubject}. */
        subjectControl(wallet: string): Promise<SubjectControl>;
        limit?: number;
        fetchDocument?: (uri: string) => Promise<unknown>;
    },
): Promise<LineReceipts> {
    const transport = transportOf(config);
    const fetcher = config.fetch ?? defaultFetch();
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchDocument = config.fetchDocument ?? ((uri: string) => readIpfsJson(uri, fetcher, timeoutMs));
    const data = await transport.request(ATTACHED_DOCUMENTS_QUERY, {
        term: line.tripleId,
        inContextOf: config.inContextOf,
        creators: [...new Set([line.writer, ...(line.holders ?? []), ...config.boundNodes])],
        limit: config.limit ?? 5,
    });
    const aggregate = readRecord(readRecord(data, "others") ?? {}, "aggregate");
    const count = aggregate?.["count"];
    const out: LineReceipts = {receipts: [], unreadable: [], othersNotRead: typeof count === "number" ? count : 0};
    for (const row of rowsOf(data)) {
        const subject = readRecord(row, "subject");
        const uri = subject === null ? null : readString(subject, "data");
        if (uri === null || subject === null || !uri.startsWith("ipfs://")) continue;
        // The index is not trusted for the document: a receipt stands on its signature and the chain.
        let document: unknown = readRecord(readRecord(subject, "value") ?? {}, "json_object")?.["data"] ?? null;
        if (document === null) {
            try {
                document = await fetchDocument(uri);
            } catch (error) {
                out.unreadable.push({document: uri, reason: error instanceof Error ? error.message : String(error)});
                continue;
            }
        }
        if (isSignedReceipt(document)) out.receipts.push(await checkReceipt(uri, document, line, config));
    }
    return out;
}

async function checkReceipt(
    uri: string,
    document: SignedHireReceipt,
    line: {tripleId: string; writer: string; holders?: readonly string[]},
    config: {
        agentRegistry: string;
        agentId: string;
        boundNodes: readonly string[];
        chainId: number;
        getPayment(hash: Hex): Promise<PaymentFacts | null>;
        subjectControl(wallet: string): Promise<SubjectControl>;
    },
): Promise<LineReceipt> {
    let signature: LineReceipt["signature"] = "unreadable";
    let signer: Address | null = null;
    try {
        const verdict = await verifyHireReceipt(document);
        if (verdict.status === "valid") {
            signature = "valid";
            signer = getAddress(verdict.signer);
        } else {
            signature = "invalid";
        }
    } catch {
        signature = "unreadable";
    }
    const receipt = document.receipt;
    const paymentHash = typeof receipt.payment === "string" ? receipt.payment : "";
    let payment: PaymentFacts | null = null;
    let paymentUnread = false;
    if (document.chainId === config.chainId && isHex(paymentHash) && paymentHash.length === 66) {
        try {
            payment = await config.getPayment(paymentHash);
        } catch {
            paymentUnread = true;
        }
    }
    const verifiedSigner = signer ?? "";
    const requester = typeof receipt.requester === "string" ? receipt.requester : "";
    const subjectControl = await config.subjectControl(requester).catch((): SubjectControl => "unknown");
    return {
        document: uri,
        signature,
        signer,
        checks: {
            signerIsABoundNode: signer !== null && config.boundNodes.some((node) => same(node, verifiedSigner)),
            namesThisLine: typeof receipt.termId === "string" && same(receipt.termId, line.tripleId),
            requesterStandsBehindTheLine: [line.writer, ...(line.holders ?? [])].some((wallet) => same(wallet, requester)),
            requesterControlsTheSubject: subjectControl === "yes",
            paymentMined: payment?.status === "success",
            paymentFromRequester: payment !== null && same(payment.from, requester),
            paymentToSigner: payment !== null && payment.to !== null && signer !== null && same(payment.to, signer),
            namesThisAgent: same(String(receipt.agentRegistry), config.agentRegistry) && String(receipt.agentId) === config.agentId,
        },
        subjectControl,
        paymentUnread,
        paidWei: payment === null ? null : payment.value.toString(),
    };
}

/** Whether every check on a receipt held. Says nothing about who holds the keys. */
export function receiptHolds(receipt: LineReceipt): boolean {
    return receipt.signature === "valid" && Object.values(receipt.checks).every(Boolean);
}
