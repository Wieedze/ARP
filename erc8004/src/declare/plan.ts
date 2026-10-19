import type {Address, Hex} from "viem";

import {USES} from "../sources/intuition/terms.js";
import type {AgentIdentityAtom} from "../verify/subject.js";
import {
    atomDataForUri,
    encodeCreateAtom,
    encodeCreateTriple,
    encodeDeposit,
    type MultiVaultReads,
} from "./multivault.js";
import {derivesItsOwnAtom, type ToolAtomCandidate, type ToolAtomLookup} from "./tool-atom.js";
import type {DeclarePlan, PlannedStake, PlannedTool, PreparedCall, StakePlan} from "./types.js";

/** A plan was asked for with nothing to plan. A caller bug, not a chain state. */
export class EmptyPlanError extends Error {
    constructor(what: string) {
        super(`nothing to plan: ${what}`);
        this.name = "EmptyPlanError";
    }
}

/** An amount that cannot be deposited. Zero is not a cheap attestation, it is no attestation. */
export class NonPositiveAmountError extends Error {
    readonly tripleId: Hex;

    constructor(tripleId: Hex, amount: bigint) {
        super(
            `a deposit of ${amount} on ${tripleId} would put nothing behind the claim; ` +
                `an edge with no stake carries no weight at all (docs/14)`,
        );
        this.name = "NonPositiveAmountError";
        this.tripleId = tripleId;
    }
}

/**
 * More than one atom already claims this tool's URL, so there is no single right object.
 *
 * Deliberately an error rather than "take the first". Measured on mainnet 2026-10-19:
 * `https://github.com` resolves to **five** `Thing` atoms — two labelled `GitHub` and three
 * `github.com`. Picking one would write a permanent edge onto an arbitrary id, split the tool's
 * reputation, and be unfixable — Intuition has no deletion. `sources/intuition/terms.ts` exists
 * because of this exact failure on predicates.
 *
 * The remedy is for the caller to pass the `ipfs://` URI of the atom it means.
 */
export class AmbiguousToolAtomError extends Error {
    readonly uri: string;
    readonly candidates: readonly ToolAtomCandidate[];

    constructor(uri: string, candidates: readonly ToolAtomCandidate[]) {
        super(
            `${candidates.length} atoms already claim ${uri} — ` +
                candidates.map((c) => `${c.termId} (${c.label ?? "no label"})`).join(", ") +
                `. Refusing to choose: a \`uses\` edge on the wrong one is permanent. ` +
                `Pass the \`ipfs://\` URI of the atom you mean.`,
        );
        this.name = "AmbiguousToolAtomError";
        this.uri = uri;
        this.candidates = candidates;
    }
}

/**
 * An amount below the protocol's configured floor.
 *
 * Separate from {@link NonPositiveAmountError} because the floor is **chain state, not zero**:
 * 1e16 (0.01 TRUST) on mainnet 1155 against 1e15 (0.001) on testnet 13579, measured 2026-10-19. An
 * amount tuned on testnet is a tenth of the mainnet floor.
 *
 * The floor is `getGeneralConfig().minDeposit`, read per plan. `previewDeposit` does not catch an
 * amount below it — it returns a value for 0.001 TRUST on mainnet — so this read is the check.
 */
export class BelowMinDepositError extends Error {
    readonly tripleId: Hex;

    constructor(tripleId: Hex, amount: bigint, minDeposit: bigint) {
        super(
            `a deposit of ${amount} wei on ${tripleId} is below the protocol's minimum of ` +
                `${minDeposit} wei on this chain. The floor is chain state and differs 10× between ` +
                `mainnet and testnet, so an amount that works on one may not on the other.`,
        );
        this.name = "BelowMinDepositError";
        this.tripleId = tripleId;
    }
}

/** Read a value at most once per plan, however many tools need it. */
function once<T>(read: () => Promise<T>): () => Promise<T> {
    let pending: Promise<T> | null = null;
    return () => (pending ??= read());
}

/**
 * Which atom a tool's URI should resolve to, and whether a new one has to be created.
 *
 * `atomData` is `null` when an existing atom is reused — there is nothing to encode.
 */
async function resolveToolAtom(
    uri: string,
    reads: MultiVaultReads,
    lookup: ToolAtomLookup | undefined,
): Promise<{
    atomId: Hex;
    atomSource: PlannedTool["atomSource"];
    atomData: Hex | null;
    bareUrlWarning?: string;
}> {
    const derive = async (warning?: string) => {
        const atomData = atomDataForUri(uri);
        return {
            atomId: await reads.atomId(atomData),
            atomSource: "derived-from-uri" as const,
            atomData,
            ...(warning === undefined ? {} : {bareUrlWarning: warning}),
        };
    };

    if (derivesItsOwnAtom(uri)) return derive();

    if (lookup === undefined) {
        return derive(
            `${uri} is a location, not a content address, and no lookup was given. The atom this ` +
                `plan would create carries no pinned metadata, and 77 of the 78 tool atoms on ` +
                `mainnet \`uses\` edges do. Pass a lookup to reuse the tool's real atom.`,
        );
    }

    const candidates = await lookup.findByUrl(uri);
    if (candidates.length > 1) throw new AmbiguousToolAtomError(uri, candidates);
    const only = candidates[0];
    if (only === undefined) {
        return derive(
            `no atom on the graph carries ${uri} in a pinned Thing, so this plan creates a bare ` +
                `URL atom with no metadata. If the tool later gets a pinned atom, its reputation ` +
                `splits across two ids and Intuition has no deletion.`,
        );
    }
    return {atomId: only.termId as Hex, atomSource: "existing-thing" as const, atomData: null};
}

/**
 * Plan the `(agent, uses, tool)` edges for what an agent says it used.
 *
 * The declaration is self-reported, and that is acceptable for exactly one reason: it costs. A
 * triple is 0.1 TRUST on mainnet 1155 — a fee, not a deposit, and unrecoverable. `totalValue` is
 * on the returned plan so a caller sees that before signing and not after.
 *
 * What this does not do: sign, send, estimate gas, or decide an amount. It reads the chain, works
 * out which terms are missing, and hands back calls (ADR `0038`).
 *
 * @param params.subject   The agent's ERC-8004 identity atom, branded by `asAgentIdentityAtom`.
 *                         ADR `0032`: an edge written on an operating account's CAIP-10 atom is
 *                         permanent and invisible to every reader following the partner guide.
 * @param params.tools     Canonical tool URIs. The atom id derives from the URI (ADR `0008`), so
 *                         no pinning and no API key — the unlock that makes this usable by a third
 *                         party.
 * @param params.predicate Defaults to the frozen canonical `uses`. Overridable for tests, not as
 *                         an invitation: minting a predicate produced a node this repo's own
 *                         connector could not read (ADR `0030`).
 */
export async function prepareDeclareUsed(params: {
    subject: AgentIdentityAtom;
    tools: readonly string[];
    reads: MultiVaultReads;
    predicate?: Hex;
    /**
     * Finds the atom a tool already has, for URIs that are a **location** rather than a content
     * address. Optional, and strongly recommended whenever any tool is an `https://` endpoint: see
     * {@link ToolAtomLookup} for the measurement, and `bareUrlWarning` for what a plan says when it
     * is absent.
     */
    lookup?: ToolAtomLookup;
}): Promise<DeclarePlan> {
    const predicate = params.predicate ?? (USES as Hex);
    const uris = [
        ...new Set(params.tools.map((uri) => uri.trim()).filter((uri) => uri.length > 0)),
    ];
    if (uris.length === 0) throw new EmptyPlanError("no tool URI survived trimming");

    const atomCost = once(() => params.reads.atomCost());
    const tripleCost = once(() => params.reads.tripleCost());
    const chainId = params.reads.chainId;

    const tools: PlannedTool[] = [];
    const calls: PreparedCall[] = [];
    const existingTerms: Hex[] = [];

    for (const uri of uris) {
        const {atomId, atomSource, atomData, bareUrlWarning} = await resolveToolAtom(
            uri,
            params.reads,
            params.lookup,
        );
        const tripleId = await params.reads.tripleId(params.subject, predicate, atomId);
        const [atomExists, tripleExists] = await Promise.all([
            params.reads.termExists(atomId),
            params.reads.termExists(tripleId),
        ]);

        tools.push({
            uri,
            atomId,
            atomSource,
            tripleId,
            atomExists,
            tripleExists,
            ...(bareUrlWarning === undefined ? {} : {bareUrlWarning}),
        });

        if (atomExists) {
            existingTerms.push(atomId);
        } else if (atomData === null) {
            // An atom the graph says exists that the chain says does not. Only reachable if the
            // indexer is ahead of the chain it indexes, and there is no calldata to build for it.
            throw new EmptyPlanError(
                `the graph reports an atom for ${uri} that \`isTermCreated\` denies: ${atomId}`,
            );
        } else {
            const cost = await atomCost();
            calls.push({
                kind: "create-atom",
                chainId,
                to: params.reads.address,
                value: cost,
                data: encodeCreateAtom(atomData, cost),
                why:
                    bareUrlWarning === undefined
                        ? `create the atom for ${uri}`
                        : `create a BARE URL atom for ${uri} — no pinned metadata`,
            });
        }

        if (tripleExists) {
            existingTerms.push(tripleId);
        } else {
            const cost = await tripleCost();
            calls.push({
                kind: "create-triple",
                chainId,
                to: params.reads.address,
                value: cost,
                data: encodeCreateTriple(params.subject, predicate, atomId, cost),
                why: `declare that this agent uses ${uri}`,
            });
        }
    }

    return {
        subject: params.subject,
        predicate,
        tools,
        calls,
        existingTerms,
        totalValue: calls.reduce((sum, call) => sum + call.value, 0n),
        chainId: params.reads.chainId,
    };
}

/**
 * Plan deposits that put TRUST behind declarations already on chain.
 *
 * The deposit lands on the **triple**, which is the claim, and not on the tool's atom, which is a
 * market on the tool in general. See {@link StakePlan} for the mainnet measurement behind that —
 * including the 74 edges whose stake sits where ARP's own reader cannot see it.
 *
 * A triple that is not on chain yet is reported with `exists: false` and gets no call, rather than
 * raising: declaring and staking are separate transactions, and a caller may legitimately plan the
 * stake before the declaration has confirmed.
 *
 * @param params.receiver  Who receives the shares. Not defaulted — in direct mode this is the
 *                         signing account, in delegated mode it is the delegator whose TRUST is
 *                         being spent, and guessing wrong sends the position to the wrong party.
 * @param params.minShares Slippage floor. Defaults to 0, which accepts whatever the curve returns.
 *                         The caller's decision, stated rather than hidden.
 */
export async function prepareStakeOnUsed(params: {
    targets: readonly {tripleId: Hex; amount: bigint}[];
    receiver: Address;
    reads: MultiVaultReads;
    minShares?: bigint;
}): Promise<StakePlan> {
    if (params.targets.length === 0) throw new EmptyPlanError("no stake target given");
    const minShares = params.minShares ?? 0n;
    const [curveId, minDeposit] = await Promise.all([
        params.reads.defaultCurveId(),
        params.reads.minDeposit(),
    ]);

    const calls: PreparedCall[] = [];
    const targets: PlannedStake[] = [];

    for (const target of params.targets) {
        if (target.amount <= 0n) throw new NonPositiveAmountError(target.tripleId, target.amount);
        if (target.amount < minDeposit) {
            throw new BelowMinDepositError(target.tripleId, target.amount, minDeposit);
        }
        const exists = await params.reads.termExists(target.tripleId);
        targets.push({
            tripleId: target.tripleId,
            receiver: params.receiver,
            amount: target.amount,
            exists,
        });
        if (!exists) continue;
        calls.push({
            kind: "deposit",
            chainId: params.reads.chainId,
            to: params.reads.address,
            value: target.amount,
            data: encodeDeposit(params.receiver, target.tripleId, curveId, minShares),
            why: `stake behind the claim ${target.tripleId}`,
        });
    }

    return {
        calls,
        targets,
        totalValue: calls.reduce((sum, call) => sum + call.value, 0n),
        chainId: params.reads.chainId,
        curveId,
        minDeposit,
    };
}
