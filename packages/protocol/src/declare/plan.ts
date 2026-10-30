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
import {isToolUrl, normaliseToolUrl, toolAtomUri, toolThingDocument} from "./tool-thing.js";
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

/**
 * A term this plan would create with **no position** — on the chain, and not a market.
 *
 * Caught by a read rather than by arithmetic. `previewAtomCreate` and `previewTripleCreate` are
 * callable on a term that does not exist and return `shares = 0` for a deposit that is all fee,
 * measured on both chains 2026-10-21 by `scripts/measure/preview-before-create.ts`. So ADR `0053`'s
 * rule is now checked before signing instead of discovered after.
 *
 * Not thrown when the caller passed `birthDeposit: 0n`, which is the documented way of asking for
 * exactly this. The error is for the accident, not for the choice.
 */
export class ZeroPositionError extends Error {
    readonly termId: Hex;

    constructor(what: string, termId: Hex, assets: bigint) {
        super(
            `creating the ${what} ${termId} with ${assets} wei would buy 0 shares, so the term ` +
                `would be born with no position — it would exist on the chain and not exist as a ` +
                `market (ADR 0053). The creation fee comes out of \`assets\`, so raise it above ` +
                `the fee by at least the chain's \`minDeposit\`. Pass \`birthDeposit: 0n\` if a ` +
                `positionless term is genuinely what you want.`,
        );
        this.name = "ZeroPositionError";
        this.termId = termId;
    }
}

/** Read a value at most once per plan, however many tools need it. */
function once<T>(read: () => Promise<T>): () => Promise<T> {
    let pending: Promise<T> | null = null;
    return () => (pending ??= read());
}

/**
 * Every atom already on the graph that claims either spelling of this URL.
 *
 * Both are asked for because an atom carries whatever URL its creator typed, which is usually not
 * the normalised one — so searching only the normalised form misses the atom it exists to reuse,
 * and searching only the raw form misses it whenever the caller's spelling differs. Merged by
 * `termId`, since one atom answering both queries is the common case.
 */
async function findExistingToolAtoms(
    lookup: ToolAtomLookup,
    raw: string,
    normalised: string,
): Promise<ToolAtomCandidate[]> {
    const spellings = raw === normalised ? [raw] : [raw, normalised];
    const found = new Map<string, ToolAtomCandidate>();
    for (const url of spellings) {
        for (const candidate of await lookup.findByUrl(url)) {
            found.set(candidate.termId, candidate);
        }
    }
    return [...found.values()];
}

/**
 * Which atom a tool's URI should resolve to, and whether a new one has to be created.
 *
 * Three paths, in order of preference:
 *
 * 1. **The URI is a content address** (`ipfs://`, `ar://`) — it *is* the pinned document, so the
 *    derived id and the canon are the same thing (ADR `0008`). Nothing to look up.
 * 2. **An atom already carries this URL** — reuse it, so a location URL does not mint a second atom
 *    beside the tool's real one. Two spellings are searched; more than one hit is an error, not a
 *    coin flip.
 * 3. **An http(s) URL with no atom yet** — derive the canonical Thing from the normalised URL
 *    (`tool-thing.ts`). Same URL always yields the same atom id, which is the property a free-text
 *    `name` destroys: `https://github.com` has five atoms today.
 *
 * Anything else — a `did:`, an `npm:` specifier, a bare name — falls back to a bare URI atom with
 * `bareUrlWarning`, because there is no URL to normalise and nothing to derive a document from.
 *
 * The 84/78/77 figures in the warning string come from `scripts/measure/tool-atom-shape.ts`.
 */
async function resolveToolAtom(
    uri: string,
    reads: MultiVaultReads,
    lookup: ToolAtomLookup | undefined,
): Promise<{
    atomId: Hex;
    atomUri: string;
    atomSource: PlannedTool["atomSource"];
    atomData: Hex | null;
    pinDocument?: string;
    bareUrlWarning?: string;
}> {
    const derive = async (
        atomUri: string,
        atomSource: PlannedTool["atomSource"],
        extra: {pinDocument?: string; bareUrlWarning?: string} = {},
    ) => {
        const atomData = atomDataForUri(atomUri);
        return {atomId: await reads.atomId(atomData), atomUri, atomSource, atomData, ...extra};
    };

    if (derivesItsOwnAtom(uri)) return derive(uri, "derived-from-uri");

    if (!isToolUrl(uri)) {
        return derive(uri, "derived-from-uri", {
            bareUrlWarning:
                `${uri} is neither a content address nor an http(s) URL, so there is no URL to ` +
                `normalise and no document to derive. This plan creates a bare URI atom with no ` +
                `pinned metadata, while 78 of the 84 tool atoms on mainnet \`uses\` edges are ` +
                `\`ipfs://\` and 77 of those carry a pinned Thing. If the tool later gets a proper ` +
                `pinned atom, its reputation splits across two ids and Intuition has no deletion.`,
        });
    }

    const normalised = normaliseToolUrl(uri);

    if (lookup !== undefined) {
        const candidates = await findExistingToolAtoms(lookup, uri, normalised);
        if (candidates.length > 1) throw new AmbiguousToolAtomError(uri, candidates);
        const only = candidates[0];
        if (only !== undefined) {
            // Same boundary as `resolve-subject`: a `term_id` off the indexer is a 32-byte hex
            // string by schema, typed `string` on `ToolAtomCandidate` because the lookup is a graph
            // read and not a chain read. It is passed straight to `calculateTripleId`, which would
            // revert on a malformed one rather than silently mis-encode.
            return {
                atomId: only.termId as Hex,
                atomUri: only.uri ?? normalised,
                atomSource: "existing-thing" as const,
                atomData: null,
            };
        }
    }

    return derive(toolAtomUri(normalised), "derived-thing", {
        pinDocument: toolThingDocument(normalised),
    });
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
    /**
     * Objects whose atom **already exists** and must not be derived.
     *
     * The case a hired agent is in: it reached the graph through `same as` from its ERC-8004 token
     * and already has an identity atom, so deriving a second one from a URL would be the
     * fragmentation ADR `0054` exists to prevent. `rate` in `src/hire/` is this parameter and
     * nothing else — `docs/tasks/25` says rating is `prepareDeclareUsed` plus `prepareStakeOnUsed`, and
     * a parallel implementation would be a second place for the edge's shape to drift.
     *
     * An atom here that the chain does not have raises rather than being created: a plan cannot
     * mint an identity on someone's behalf.
     */
    objects?: readonly Hex[];
    reads: MultiVaultReads;
    predicate?: Hex;
    /**
     * Finds the atom a tool already has, for URIs that are a **location** rather than a content
     * address. Optional, and strongly recommended whenever any tool is an `https://` endpoint: see
     * {@link ToolAtomLookup} for the measurement, and `bareUrlWarning` for what a plan says when it
     * is absent.
     */
    lookup?: ToolAtomLookup;
    /**
     * The deposit every term this plan creates is born with. Defaults to the chain's `minDeposit`.
     *
     * Not optional in effect, only in the signature: a term created without one has **zero
     * positions**, which means it exists on the chain and does not exist as a market (ADR `0053`).
     * Passing `0n` is allowed and produces exactly that, so a caller who wants it has to say so.
     */
    birthDeposit?: bigint;
}): Promise<DeclarePlan> {
    // `USES` is declared `as const` in `terms.ts`, so it is a literal string type rather than
    // `Hex`. The bytes are the same; the cast only widens the literal.
    const predicate = params.predicate ?? (USES as Hex);
    /**
     * Deduplicated on the **normalised** URL, not the string the caller passed.
     *
     * `github.com/x` and `https://github.com/x` survive a plain `Set` as two entries, resolve to
     * one atom id and one triple id, and would produce two identical creates — the second of which
     * reverts with `MultiVault_AtomExists` after the first has already been paid for.
     */
    const byIdentity = new Map<string, string>();
    for (const raw of params.tools) {
        const uri = raw.trim();
        if (uri.length === 0) continue;
        const key = isToolUrl(uri) ? normaliseToolUrl(uri) : uri;
        if (!byIdentity.has(key)) byIdentity.set(key, uri);
    }
    const uris = [...byIdentity.values()];

    /**
     * The two input kinds in one list, deduplicated separately because they cannot collide: a URI
     * is a string the caller wrote and an atom id is 32 bytes the chain already holds.
     */
    type Target = {kind: "uri"; uri: string} | {kind: "atom"; atomId: Hex};
    const targets: Target[] = [
        ...uris.map((uri): Target => ({kind: "uri", uri})),
        ...[...new Set((params.objects ?? []).map((id) => id.toLowerCase()))].map(
            (id): Target => ({kind: "atom", atomId: id as Hex}),
        ),
    ];
    if (targets.length === 0) throw new EmptyPlanError("no tool URI or object atom was given");

    const atomCost = once(() => params.reads.atomCost());
    const tripleCost = once(() => params.reads.tripleCost());
    /**
     * Every term is born with a position.
     *
     * `createAtoms`/`createTriples` take the **deposit** as `assets` and take the fee out of it, so
     * passing the fee alone seeds the vault with `minShare` and leaves the term at **zero
     * positions** — existing on the chain and not existing as a market (ADR `0053`). Measured on
     * testnet: `cost` gives 1,000,000 wei and 0 positions; `cost + minDeposit` gives
     * 980,000,001,000,000 wei and 1.
     *
     * `birthDeposit` defaults to the chain's `minDeposit`, read rather than assumed — it is 0.01
     * TRUST on mainnet 1155 against 0.001 on testnet 13579.
     */
    const birthDeposit = once(async () => params.birthDeposit ?? (await params.reads.minDeposit()));
    const chainId = params.reads.chainId;

    const tools: PlannedTool[] = [];
    const calls: PreparedCall[] = [];
    const existingTerms: Hex[] = [];

    for (const target of targets) {
        const uri = target.kind === "uri" ? target.uri : target.atomId;
        const {atomId, atomUri, atomSource, atomData, pinDocument, bareUrlWarning} =
            target.kind === "uri"
                ? await resolveToolAtom(target.uri, params.reads, params.lookup)
                : {
                      atomId: target.atomId,
                      atomUri: target.atomId,
                      atomSource: "given-atom" as const,
                      // `null` is what makes the branch below raise rather than create: there is no
                      // calldata to mint someone else's identity, and that is the point.
                      atomData: null,
                      pinDocument: undefined,
                      bareUrlWarning: undefined,
                  };
        const tripleId = await params.reads.tripleId(params.subject, predicate, atomId);
        const [atomExists, tripleExists] = await Promise.all([
            params.reads.termExists(atomId),
            params.reads.termExists(tripleId),
        ]);

        tools.push({
            uri,
            atomUri,
            atomId,
            atomSource,
            tripleId,
            atomExists,
            tripleExists,
            ...(pinDocument === undefined ? {} : {pinDocument}),
            ...(bareUrlWarning === undefined ? {} : {bareUrlWarning}),
        });

        if (atomExists) {
            existingTerms.push(atomId);
        } else if (atomData === null) {
            // An atom the graph says exists that the chain says does not. Only reachable if the
            // indexer is ahead of the chain it indexes, and there is no calldata to build for it.
            throw new EmptyPlanError(
                target.kind === "atom"
                    ? `atom ${atomId} does not exist on chain ${chainId}, and a plan will not ` +
                      `create one for an object it was handed — deriving a second identity is ` +
                      `the fragmentation ADR 0054 exists to prevent`
                    : `the graph reports an atom for ${uri} that \`isTermCreated\` denies: ${atomId}`,
            );
        } else {
            const assets = (await atomCost()) + (await birthDeposit());
            const preview = await params.reads.previewAtomCreate(atomId, assets);
            if (preview.shares === 0n && params.birthDeposit !== 0n) {
                throw new ZeroPositionError("atom", atomId, assets);
            }
            calls.push({
                kind: "create-atom",
                chainId,
                to: params.reads.address,
                value: assets,
                data: encodeCreateAtom(atomData, assets),
                why:
                    bareUrlWarning === undefined
                        ? `create the atom for ${uri} (${atomUri})`
                        : `create a BARE URI atom for ${uri} — no pinned metadata`,
                preview: {shares: preview.shares, assetsAfterFees: preview.assetsAfterFees},
            });
        }

        if (tripleExists) {
            existingTerms.push(tripleId);
        } else {
            const assets = (await tripleCost()) + (await birthDeposit());
            const preview = await params.reads.previewTripleCreate(tripleId, assets);
            if (preview.shares === 0n && params.birthDeposit !== 0n) {
                throw new ZeroPositionError("edge", tripleId, assets);
            }
            calls.push({
                kind: "create-triple",
                chainId,
                to: params.reads.address,
                value: assets,
                data: encodeCreateTriple(params.subject, predicate, atomId, assets),
                // The deposit is in this call, so a declared edge carries a position from its first
                // transaction. `prepareStakeOnUsed` is for adding to it, not for starting it.
                why: `declare that this agent uses ${uri}, with a position behind it`,
                preview: {shares: preview.shares, assetsAfterFees: preview.assetsAfterFees},
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
 * @param params.curveId   Which bonding curve the position is taken on. Defaults to the chain's
 *                         `defaultCurveId`, and **the default is not the interesting curve.**
 *
 *                         Measured on mainnet 1155, 2026-10-20, over the 185 `uses` edges: the
 *                         registry holds exactly two curves — 1 "Linear Curve" and 2 "Offset
 *                         Progressive Curve" — and `defaultCurveId` is 1. Curve 1 carries 185
 *                         vaults, 26.20 TRUST and a share price of 1.000–1.060. Curve 2 carries 28
 *                         vaults, **219.54 TRUST** and a share price of 3.000–4.181.
 *
 *                         So the default is where the vaults are and curve 2 is where the money and
 *                         the upside are. A caller who wants a position that appreciates has to say
 *                         so, which is why this is a parameter and not a new default: changing the
 *                         default would silently move every existing caller's money to a different
 *                         market.
 */
export async function prepareStakeOnUsed(params: {
    targets: readonly {tripleId: Hex; amount: bigint}[];
    receiver: Address;
    reads: MultiVaultReads;
    minShares?: bigint;
    curveId?: bigint;
}): Promise<StakePlan> {
    if (params.targets.length === 0) throw new EmptyPlanError("no stake target given");
    const minShares = params.minShares ?? 0n;
    const [defaultCurveId, minDeposit] = await Promise.all([
        params.reads.defaultCurveId(),
        params.reads.minDeposit(),
    ]);
    const curveId = params.curveId ?? defaultCurveId;

    const calls: PreparedCall[] = [];
    const targets: PlannedStake[] = [];

    for (const target of params.targets) {
        if (target.amount <= 0n) throw new NonPositiveAmountError(target.tripleId, target.amount);
        if (target.amount < minDeposit) {
            throw new BelowMinDepositError(target.tripleId, target.amount, minDeposit);
        }
        const exists = await params.reads.termExists(target.tripleId);
        if (!exists) {
            // No preview: `previewDeposit` reverts on a term that does not exist (measured on both
            // chains 2026-10-21). Nothing is planned for it either, so there is nothing to price.
            targets.push({
                tripleId: target.tripleId,
                receiver: params.receiver,
                amount: target.amount,
                exists,
            });
            continue;
        }
        // On the curve the deposit will actually price against, not the default: curve 2's share
        // price was 3.000–4.181 against curve 1's 1.000–1.060 on mainnet, so the same amount buys
        // very different holdings and the caller is told which before signing.
        const preview = await params.reads.previewDeposit(target.tripleId, curveId, target.amount);
        targets.push({
            tripleId: target.tripleId,
            receiver: params.receiver,
            amount: target.amount,
            exists,
            shares: preview.shares,
        });
        calls.push({
            kind: "deposit",
            chainId: params.reads.chainId,
            to: params.reads.address,
            value: target.amount,
            data: encodeDeposit(params.receiver, target.tripleId, curveId, minShares),
            why: `stake behind the claim ${target.tripleId} on curve ${curveId}`,
            preview: {shares: preview.shares, assetsAfterFees: preview.assetsAfterFees},
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
