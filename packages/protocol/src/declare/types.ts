import type {Address, Hex} from "viem";

/**
 * One transaction an agent's own runtime may sign and send, and nothing more.
 *
 * The connector builds these and never sends one. That is not a limitation worked around later —
 * it is the design (ADR `0038`): ARP is not a party to the loop (ADR `0035`), so it must never be
 * able to move an operator's TRUST, and the cheapest way to guarantee that is to hold no key and
 * expose no send path. What crosses the boundary is a plan.
 *
 * `why` exists because a caller is being asked to sign something it did not encode. A plan a
 * runtime cannot explain to its operator is a plan the operator should refuse.
 */
export type PreparedCall = {
    /** What the call does. Discriminated so a caller can render a plan without decoding calldata. */
    kind: "create-atom" | "create-triple" | "deposit";
    /**
     * The chain this call is valid on, **on the call and not only on the plan**.
     *
     * Measured 2026-10-19: each MultiVault is **codeless on the other chain** — `eth_getCode` of
     * the 1155 address on 13579 returns `0x`, and vice versa. A value-bearing call to a codeless
     * address does **not** revert; it is a plain transfer that succeeds. So a plan built for one
     * chain and signed against the other sends the fee to an address nobody controls, with no
     * revert, no event and nothing to notice.
     *
     * A wallet is handed one call at a time, so the guard has to be on the call. Check it against
     * your signer's chain before sending.
     */
    chainId: number;
    /** The contract to call. Always the MultiVault for these three kinds. */
    to: Address;
    /** Native TRUST this call sends. A fee for the two creates; the stake for a deposit. */
    value: bigint;
    data: Hex;
    /** One line, for a human or an operator reading the plan before authorising it. */
    why: string;
    /**
     * What the chain says this call will buy, read with `preview*` before anything is signed.
     *
     * `shares` is the load-bearing field. **Zero means the term ends up with no position** — it
     * exists on the chain and does not exist as a market (ADR `0053`). The Intuition skill's "always
     * preview" instruction was unimplemented here until 2026-10-21, which meant the one invariant
     * this project holds about term creation was held by discipline instead of by a read.
     *
     * Absent only when no preview was possible: `previewDeposit` reverts on a term that does not
     * exist, so a deposit planned for a triple the caller has not created yet carries none.
     */
    preview?: {shares: bigint; assetsAfterFees: bigint};
};

/**
 * What a plan would create, what already exists, and what it costs — before anything is signed.
 *
 * Idempotency is **reported, not implied**. `existingTerms` is the list of ids the chain already
 * has, so a caller can tell "nothing to do" from "failed to plan", and so a second run over the
 * same tools is visibly a no-op rather than a silent one.
 */
export type DeclarePlan = {
    /** The subject every triple in this plan carries: the agent's ERC-8004 identity atom. */
    subject: Hex;
    /** The predicate. The frozen canonical `uses`, never one ARP minted (ADR `0030`). */
    predicate: Hex;
    tools: PlannedTool[];
    /**
     * In execution order. `create-atom` precedes the `create-triple` that references it, because
     * `MultiVault.createTriples` reverts with `MultiVault_TermDoesNotExist` otherwise.
     */
    calls: PreparedCall[];
    /** Term ids the chain already carries, so no call was planned for them. */
    existingTerms: Hex[];
    /**
     * Native TRUST the whole plan sends, so a caller can compare it against its delegation's cap
     * **before** signing rather than discovering the overrun as a revert.
     *
     * Read from the chain per plan and never carried as a constant (`rules/portability.md` rule
     * 3). Measured 2026-10-19 through `multiVaultReads`, which is how to re-read them:
     *
     * | chain        | `getAtomCost()` | `getTripleCost()` |
     * | ------------ | --------------- | ----------------- |
     * | 1155 mainnet | 0.100000000001  | 0.100000000002    |
     * | 13579 test   | 0.001000000001  | 0.001000000002    |
     *
     * 100× apart, so no budget tuned on testnet transfers. An earlier draft of this comment said
     * the mainnet atom cost 0.01 — that is `minDeposit`, a different value, and recoverable.
     */
    totalValue: bigint;
    /** The chain this plan is valid on. A plan built against 13579 must not be signed against 1155. */
    chainId: number;
};

/** One tool in a declaration, with the ids the plan resolved for it. */
export type PlannedTool = {
    /** What the caller asked for, trimmed. A URL, an MCP endpoint, an `ipfs://` doc. */
    uri: string;
    /**
     * The URI the atom's id actually derives from, which is **not always** {@link uri}.
     *
     * For `derived-thing` it is the `ipfs://` CID of a document computed from the URL, so a caller
     * displaying "the atom for X" has the right string to show and to pin.
     */
    atomUri: string;
    /** The atom used as the triple's object. */
    atomId: Hex;
    /**
     * Where that atom came from.
     *
     * `derived-from-uri` — `calculateAtomId(stringToHex(uri))`. Correct and canonical for a content
     * address, because the URI *is* the pinned document (ADR `0008`).
     *
     * `existing-thing` — an atom already on the graph whose pinned Thing carries this exact `url`,
     * found by {@link ToolAtomLookup}. Used so a location URL does not mint a second atom beside
     * the tool's real one.
     *
     * `derived-thing` — a canonical Thing computed from the normalised URL (`tool-thing.ts`), whose
     * every field is a pure function of that URL. The atom nobody has created yet, in the one form
     * that cannot fork: a free-text `name` inside a hashed document is why `https://github.com`
     * already has five atoms. `pinDocument` carries the bytes that make it readable.
     */
    atomSource: "derived-from-uri" | "existing-thing" | "derived-thing";
    /** The `(agent, uses, tool)` triple id. Computable before either term exists. */
    tripleId: Hex;
    atomExists: boolean;
    tripleExists: boolean;
    /**
     * The exact JSON to pin for this atom's metadata to resolve. Set iff `derived-thing`.
     *
     * The atom can be created, staked and read as an id without it; pinning is what makes a reader
     * see a name instead of a hash. Separate from the plan on purpose — pinning needs a credential
     * (ADR `0016`) and the plan needs none, so the two cannot share a step.
     */
    pinDocument?: string;
    /**
     * Set when the plan is about to create a **bare URI atom** — no pinned Thing, so no metadata
     * for any reader.
     *
     * Now reachable only for a URI that is neither a content address nor an http(s) URL: a `did:`,
     * an `npm:` specifier, a bare name. An http(s) URL takes the `derived-thing` path instead, which
     * is what this warning used to exist for.
     *
     * Measured by `scripts/measure/tool-atom-shape.ts` on mainnet: of the 84 tool atoms on `uses`
     * edges, 78 are `ipfs://` and 77 of those resolve a `value.thing`; the only two raw-URL atoms
     * are schema.org vocabulary terms, not tools. So this is off the cohort's canon, and if the tool
     * later gets a proper pinned atom the reputation splits across two ids permanently. Not an
     * error — sometimes it is the only option — but the caller is told before it signs.
     */
    bareUrlWarning?: string;
};

/**
 * A plan to put TRUST behind declarations already on chain.
 *
 * **The deposit goes on the triple, not on the tool's atom**, and that is the load-bearing choice
 * in this module. Measured on mainnet 1155 on 2026-10-19 with
 * `scripts/measure/stake-vault-placement.ts` over the 185 `uses` edges that exist:
 *
 * | vault             | edges with positions | assets, all curves                     |
 * | ----------------- | -------------------- | -------------------------------------- |
 * | the edge (triple) | 110 of 185           | 245.776495 TRUST                       |
 * | the object's atom | 146 of 185           | 2,673,997 TRUST over 84 distinct atoms |
 *
 * The atom's vault is larger and answers a different question: it is a market on the tool itself,
 * open to anyone for any reason, and a deposit in it is not attributable to any usage claim. The
 * edge's vault is a market on *this* claim, it gets a counter-vault for free so the claim can be
 * contested, and it is the vault `getToolUsage` prices. 74 of those 185 edges carry stake only on
 * the atom — deposits ARP's own reader cannot see.
 */
export type StakePlan = {
    calls: PreparedCall[];
    targets: PlannedStake[];
    totalValue: bigint;
    chainId: number;
    /** The bonding curve the deposits price on, read from the chain, not assumed. */
    curveId: bigint;
    /** The protocol's minimum deposit on this chain, read per plan. 10× apart between chains. */
    minDeposit: bigint;
};

/** One deposit in a stake plan. */
export type PlannedStake = {
    /** The `(agent, uses, tool)` triple being backed. */
    tripleId: Hex;
    /** Who receives the shares. The agent's own operating account unless a caller overrides it. */
    receiver: Address;
    amount: bigint;
    /**
     * False when the triple is not on chain yet, in which case no call was planned for it: a
     * deposit on a term that does not exist reverts, and declaring is a separate transaction the
     * caller may not have sent yet.
     */
    exists: boolean;
    /**
     * Shares this deposit buys, from `previewDeposit`. Absent when `exists` is false, because the
     * preview reverts there.
     *
     * It is not `amount` minus a constant: the entry fee is a governance parameter and the curve is
     * not linear in assets on curve 2. Read, not computed.
     */
    shares?: bigint;
};
