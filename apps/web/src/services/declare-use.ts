import {
    EmptyPlanError,
    multiVaultReads,
    prepareDeclareUsed,
    resolveDeclarationSubject,
    ZeroPositionError,
    type AgentIdentityAtom,
    type PreparedCall,
} from "@arp-protocol/core";
import type {Account, Address, Chain, Hex, PublicClient, Transport, WalletClient} from "viem";

import {verifyAgentOwnership} from "./agent-import";
import {MAX_STAKE_WEI, type StakeChain} from "./trust-stake";

/**
 * Declare a use: write `(your agent, uses, this atom)` from the atom's own page.
 *
 * ## The cell this fills, and the one it deliberately does not
 *
 * `docs/12` point 3 — _"it deposits TRUST on the modules it actually used"_ — had no page. It
 * existed in `scripts/agent/agent-declare-used.ts` and in the MCP server, so the centre of the mechanism
 * was reachable by an agent and not by the human holding the agent's key. `tool-register.ts`'s own
 * table names the gap from the other side: a person registers the tool's atom *here*, and an agent
 * writes the edge "through the MCP or the skill". This is that row, with a human signer.
 *
 * What it does **not** add is a control to deposit more on the edge afterwards. ADR `0056` §1 is
 * explicit — _"ARP offers no control to deposit on the edge, and no copy calling it contestable"_ —
 * and the user's reason was measured: nobody takes the other side of `X used Y`, so a solicited
 * deposit there is a fee for nothing. The position this write carries is the one ADR `0053` makes
 * every term be born with, and it is the whole of the stake.
 *
 * ## Who may speak for an agent
 *
 * A `uses` edge's subject is the **agent's** identity atom (ADR `0032`), and a human reading an
 * atom page is not an agent. `FUTURE.md` flagged this as the thing to decide before building:
 * _"a human pasting a URL is not an agent. Decide whose claim the screen writes."_
 *
 * The answer here is the same proof `/agent/import` already uses, and it needs no new mechanism: the
 * ERC-8004 registry names the token's `owner`, so the connected wallet matching it **is** the
 * authority to declare on that agent's behalf. One `eth_call`, free, and it fails closed — an
 * operator who names an agent they do not own gets `not-the-owner`, with the real owner in the
 * message so they can see they connected the wrong wallet.
 *
 * ARP is still not a party (ADR `0035`): the plan comes from `@arp-protocol/core`, which holds no
 * key, and the operator's own wallet signs it. The only thing this module adds to the package's plan
 * is the app's two human safeguards — the per-transaction ceiling and the chain guard.
 *
 * ## Chain
 *
 * On the declaration, never read from the toggle at signing time (ADR `0061`). Note the asymmetry a
 * reader will hit: the **ownership** read goes to the agent's own chain (Base 8453 for the canonical
 * registry), while the **identity atom** is on whichever Intuition chain is selected. A Base agent
 * whose atom the mirror has not reached does not exist on 1155 at all, and 14 agents in 15 are in
 * that state (ADR `0047`) — so `no-identity-atom` is the common outcome, not the rare one, and its
 * message has to say what to do about it rather than reading as a failure.
 */
export type DeclaredUse = {
    /** The chain this was priced on, and the only place the write reads it from. */
    chain: StakeChain;
    /** The agent the claim is about, as the operator named it. */
    agent: AgentTokenRef;
    /** The agent's canonical identity atom — the subject of the edge (ADR `0032`). */
    subject: AgentIdentityAtom;
    /** The atom being declared used: the page the operator is standing on. */
    object: Hex;
    /** The `(agent, uses, object)` edge id, computable before the edge exists. */
    tripleId: Hex;
    /** True when this exact claim is already on this chain, so there is nothing to write. */
    exists: boolean;
    /** In execution order, from the package's planner. Empty when {@link exists}. */
    calls: PreparedCall[];
    /** Native TRUST the whole write sends. Fee plus birth deposit. */
    totalValue: bigint;
    /**
     * The flat creation fee, which the protocol keeps.
     *
     * ADR `0056` §1 calls this "the whole of the skin in the game" — an operator who declares a use
     * that did not happen pays this per lie, permanently.
     *
     * **It is not the only thing spent, and a first version of this screen implied it was.** The
     * entry fee and the triple's atom-deposit fraction come out of the *deposit* too, so
     * `totalValue - creationFee` is **not** what the operator ends up holding. That subtraction was
     * rendered as "Your position" and was wrong by the entry fee: on 13579 it printed 0.001 tTRUST
     * directly above "Shares minted 0.00099". `tool-register.ts` records the identical correction
     * already made once on `/register` — "the chain takes **three** bites and an earlier version of
     * this screen described two" — and `claims.md` §5 is why it had to be made twice.
     */
    creationFee: bigint;
    /**
     * What actually reaches the vault, from `previewTripleCreate`. **Read, never computed.**
     *
     * The entry fee is a governance parameter and the curve is not linear in assets on curve 2, so
     * no arithmetic derives this from {@link totalValue}. ADR `0017` safeguard 6 asks for the
     * numbers rather than a sentence about them, for exactly this reason.
     */
    assetsAfterFees: bigint;
    /** Everything the fees take: `totalValue - assetsAfterFees`. Displayed, never hidden. */
    feeAssets: bigint;
    /** What the birth deposit buys, from `previewTripleCreate`. Zero means no position (ADR `0053`). */
    shares: bigint;
};

/**
 * An ERC-8004 identity the operator typed, after parsing.
 *
 * **Not** `@arp-protocol/core`'s `ResolvedAgentRef`, which `agent-import.ts` imports two files away
 * and which means something else: *registry resolved*, with a required `registry: Address`. This is
 * shaped like the package's `AgentRef` minus its optional registry — what a person can type — so it
 * is named for the token rather than for a resolution it has not had.
 */
export type AgentTokenRef = {chainId: number; tokenId: string};

export class DeclareUseGuardError extends Error {
    readonly code:
        | "bad-agent-ref"
        | "agent-not-found"
        | "not-the-owner"
        | "no-identity-atom"
        | "object-not-on-chain"
        | "already-declared"
        | "cost-above-ceiling"
        | "mainnet-not-authorised"
        | "no-position"
        | "planner-returned-nothing"
        | "wrong-chain";

    /**
     * The facts behind the message, so a screen can lay them out instead of printing a sentence.
     *
     * `not-the-owner`'s message names two 42-character addresses, and rendered as prose it wrapped
     * to three lines of mono inside a bordered box — the single least legible thing on the atom
     * page. The message stays, because a CLI and the MCP node read `message` and have nowhere to
     * put rows; the UI reads these.
     */
    readonly detail: ReadonlyArray<{label: string; value: string}>;

    constructor(
        code: DeclareUseGuardError["code"],
        message: string,
        detail: ReadonlyArray<{label: string; value: string}> = [],
    ) {
        super(message);
        this.name = "DeclareUseGuardError";
        this.code = code;
        this.detail = detail;
    }
}

/**
 * `8453/1380` into its parts, with nothing guessed.
 *
 * A bare token id is **rejected rather than defaulted** to Base. The registry is deployed at the
 * same address on several chains (ADR `0027`), so id 1380 names a different agent on each one, and a
 * defaulted chain would silently declare for a stranger. `docs/12`'s own examples are written
 * `8453/1380` for this reason.
 */
export function parseAgentRef(input: string): AgentTokenRef {
    const trimmed = input.trim();
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec(trimmed);
    if (match === null || match[1] === undefined || match[2] === undefined) {
        throw new DeclareUseGuardError(
            "bad-agent-ref",
            `"${trimmed}" is not an agent reference. Write it as chain/token — 8453/1380 for a ` +
                `Base agent, 13579/3 for one on the testnet rig.`,
        );
    }
    return {chainId: Number(match[1]), tokenId: match[2]};
}

/**
 * Everything about the claim before anything is signed: one registry read, one graph read, and the
 * package's planner.
 *
 * Every dependency is injectable for the same reason `planToolRegistration`'s `lookup` is: ADR
 * `0017`'s build rule says a guard that refuses a real transaction is verified by unit tests over a
 * mocked client, not by trying it.
 */
export async function planUseDeclaration(params: {
    agent: AgentTokenRef;
    connected: Address;
    /** The atom being declared used. Must already exist — a plan never mints one here. */
    object: Hex;
    publicClient: PublicClient;
    chain: StakeChain;
    graphqlUrl?: string;
    /** Injected in tests. Defaults to the ERC-8004 registry client inside `agent-import`. */
    ownership?: typeof verifyAgentOwnership;
    /** Injected in tests. Defaults to the package's Intuition-backed resolver. */
    subject?: typeof resolveDeclarationSubject;
}): Promise<DeclaredUse> {
    // Refused before the first read, so nothing is planned that cannot be signed.
    //
    // `security.md` authorises a human in the panel to sign on mainnet under **ADR `0017`**, and
    // that ADR scopes itself to deposits into existing `has trust provider` vaults. A `uses` triple
    // is a different predicate and a *creation* rather than a deposit, so it is **not yet
    // authorised** — which that rule is explicit is not the same as forbidden, and it says to read
    // the ADR before widening it. Widening it is the user's decision, not this module's.
    //
    // It matters because `lib/chain-choice.ts` defaults to **mainnet**, where this write costs
    // 0.11 TRUST of which 0.1 never comes back. Shipping it open by default would spend real money
    // under an authorisation nobody wrote. Deleting this guard plus one ADR turns it on.
    if (params.chain.isMainnet) {
        throw new DeclareUseGuardError(
            "mainnet-not-authorised",
            `Declaring a use on ${params.chain.chain.name} is not authorised yet — ADR 0017 ` +
                `covers a human depositing into a trust-provider vault, not creating a \`uses\` ` +
                `edge. Switch the chain to the testnet to write it there. Nothing was read.`,
        );
    }

    const verify = params.ownership ?? verifyAgentOwnership;
    const verdict = await verify({ref: params.agent, connected: params.connected});
    if (verdict.status === "not-found") {
        throw new DeclareUseGuardError(
            "agent-not-found",
            `${verdict.caip19} is not in the ERC-8004 registry on chain ${params.agent.chainId}. ` +
                `Nothing was read further.`,
            [
                {label: "Agent", value: `${params.agent.chainId}/${params.agent.tokenId}`},
                {label: "Identity", value: verdict.caip19},
            ],
        );
    }
    if (verdict.status === "owner-mismatch") {
        throw new DeclareUseGuardError(
            "not-the-owner",
            `${verdict.caip19} is owned by ${verdict.owner}, and the connected wallet is ` +
                `${verdict.connected}. Only the owner may declare what this agent used.`,
            [
                {label: "Owner", value: verdict.owner},
                {label: "Connected", value: verdict.connected},
            ],
        );
    }

    const resolve = params.subject ?? resolveDeclarationSubject;
    let subject: AgentIdentityAtom;
    try {
        subject = await resolve({
            agent: params.agent,
            ...(params.graphqlUrl === undefined ? {} : {graphqlUrl: params.graphqlUrl}),
        });
    } catch (caught) {
        // `NoAgentIdentityError` is the package's deliberate refusal to fall back onto the
        // operating wallet's `caip10:` atom — 21 such triples exist on testnet and Intuition has no
        // deletion (ADR `0032`). Re-typed rather than re-thrown so the screen can say what the
        // remedy is: `/agent/import` writes the missing atom.
        throw new DeclareUseGuardError(
            "no-identity-atom",
            `This agent has no identity atom on ${params.chain.chain.name}, so there is no subject ` +
                `to write the claim under. Write it first on the agent page, then come back. ` +
                `(${caught instanceof Error ? caught.message : String(caught)})`,
        );
    }

    const reads = multiVaultReads({
        address: params.chain.multiVault,
        chainId: params.chain.chainId,
        client: params.publicClient,
    });

    // The planner owns two refusals this screen has to be able to state, so they are re-typed here
    // rather than re-implemented after the call — a second `shares === 0n` check downstream would
    // be unreachable, which `rules/claims.md` §1 is about: a guard nothing can reach is not one.
    let plan;
    try {
        plan = await prepareDeclareUsed({
            subject,
            tools: [],
            // The atom is the page the operator is on, so it exists by construction and must not be
            // derived a second time from anything. `objects` is the parameter that says so, and it
            // raises rather than creating — which is what ADR `0054` exists to prevent.
            objects: [params.object],
            reads,
        });
    } catch (caught) {
        if (caught instanceof ZeroPositionError) {
            throw new DeclareUseGuardError(
                "no-position",
                `This claim would be born with no position — it would exist on the chain and not ` +
                    `exist as a market (ADR 0053). Nothing was sent. (${caught.message})`,
            );
        }
        if (caught instanceof EmptyPlanError) {
            // Reachable, and not only in theory: the page decides to show this control from the
            // **indexer**, while the planner asks the **chain**. An indexer ahead of the chain it
            // indexes puts the two one block apart, and the atom page is the one that is wrong.
            throw new DeclareUseGuardError(
                "object-not-on-chain",
                `${params.chain.chain.name} does not hold this atom yet, though the graph lists ` +
                    `it. Nothing was sent. (${caught.message})`,
            );
        }
        throw caught;
    }

    // **Type narrowing, not a guard.** `prepareDeclareUsed` pushes one `PlannedTool` per target and
    // raises `EmptyPlanError` when there are none, so this is unreachable; it exists because
    // `noUncheckedIndexedAccess` is on. It carried `no-position`'s code, which would have handed a
    // caller branching on that discriminator a message about a missing target — the ADR's own
    // standard applied to itself: a guard nothing can reach is not one, and must not pose as one.
    const tool = plan.tools[0];
    if (tool === undefined) {
        throw new DeclareUseGuardError(
            "planner-returned-nothing",
            "The planner returned no target for this atom. Nothing was sent.",
        );
    }

    const exists = tool.tripleExists;
    const creationFee = exists ? 0n : await reads.tripleCost();
    // Both figures off the **same** preview object. Taking `shares` and dropping `assetsAfterFees`
    // from it is what left the panel computing the position by subtraction.
    const preview = plan.calls.find((call) => call.kind === "create-triple")?.preview;
    const shares = preview?.shares ?? 0n;
    const assetsAfterFees = preview?.assetsAfterFees ?? 0n;

    if (!exists) {
        // Known here rather than at submit time: a button that states a cost and then opens a
        // wallet only to refuse is a worse disclosure than no button. `submitUseDeclaration`
        // re-checks, because a plan can be held while the chain's costs move.
        if (plan.totalValue > MAX_STAKE_WEI) {
            throw new DeclareUseGuardError(
                "cost-above-ceiling",
                `Declaring this use would cost ${plan.totalValue} wei, above this app's ` +
                    `per-transaction ceiling of ${MAX_STAKE_WEI} wei (VITE_MAX_STAKE_TRUST). ` +
                    `Nothing was sent.`,
            );
        }
    }

    return {
        chain: params.chain,
        agent: params.agent,
        subject,
        object: params.object,
        tripleId: tool.tripleId,
        exists,
        calls: plan.calls,
        totalValue: plan.totalValue,
        creationFee,
        assetsAfterFees,
        feeAssets: plan.totalValue - assetsAfterFees,
        shares,
    };
}

/**
 * Write the claim. One call in practice, looped because the plan's type allows more.
 *
 * Each call carries its own `chainId` and is checked against the wallet before it is sent. That is
 * not belt-and-braces: measured 2026-10-19, each MultiVault is **codeless on the other chain**, and
 * a value-bearing call to a codeless address does not revert — it is a plain transfer that succeeds,
 * with no event and nothing to notice. A wallet is handed one call at a time, so the guard belongs
 * on the call.
 */
export async function submitUseDeclaration(params: {
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
    declaration: DeclaredUse;
}): Promise<Hex> {
    const {walletClient, publicClient, declaration} = params;

    assertChain(declaration.chain, walletClient.chain?.id);
    assertChain(declaration.chain, await walletClient.getChainId());

    if (declaration.exists) {
        throw new DeclareUseGuardError(
            "already-declared",
            "This agent has already declared using this atom. The claim is a receipt, not a " +
                "market — writing it twice pays the fee twice and says nothing new (ADR 0056).",
        );
    }
    if (declaration.totalValue > MAX_STAKE_WEI) {
        throw new DeclareUseGuardError(
            "cost-above-ceiling",
            "Declaring would cost more than this app's per-transaction ceiling " +
                "(VITE_MAX_STAKE_TRUST). Nothing was sent.",
        );
    }

    let last: Hex | null = null;
    for (const call of declaration.calls) {
        if (call.chainId !== declaration.chain.chainId) {
            throw new DeclareUseGuardError(
                "wrong-chain",
                `A call in this plan is valid on chain ${call.chainId} and the plan is priced on ` +
                    `${declaration.chain.chainId}. Nothing was sent.`,
            );
        }
        await publicClient.call({
            account: walletClient.account.address,
            to: call.to,
            data: call.data,
            value: call.value,
        });
        const hash = await walletClient.sendTransaction({
            to: call.to,
            data: call.data,
            value: call.value,
            chain: declaration.chain.chain,
        });
        await publicClient.waitForTransactionReceipt({hash});
        last = hash;
    }

    if (last === null) {
        throw new DeclareUseGuardError(
            "already-declared",
            "The plan had nothing to send. Nothing was sent.",
        );
    }
    return last;
}

function assertChain(expected: StakeChain, chainId: number | undefined): void {
    if (chainId !== expected.chainId) {
        throw new DeclareUseGuardError(
            "wrong-chain",
            `This claim was priced on ${expected.chain.name} (${expected.chainId}). Your wallet ` +
                `reports ${chainId ?? "no chain"}. Nothing was sent.`,
        );
    }
}
