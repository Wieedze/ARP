import type {Address, Hex} from "viem";

import {prepareDeclareUsed, prepareStakeOnUsed} from "./plan.js";
import type {AgentIdentityAtom} from "../verify/subject.js";
import type {MultiVaultReads} from "./multivault.js";
import type {DeclarePlan, StakePlan} from "./types.js";

/**
 * Declaring that you used an **agent**: the same edge, pointed at an agent instead of a tool.
 *
 * It sat under `hire/` and the name was the error (ADR `0060`). Nothing about this needs a hire:
 * what makes the claim credible is that writing it costs 0.1 TRUST that does not come back, not
 * that a salary was paid. An agent that composed with another agent declares it here exactly as it
 * declares a tool.
 *
 * `tasks/25`: _"`rate` is `prepareDeclareUsed` plus `prepareStakeOnUsed` where the 'tool' is an
 * agent. Atoms can be agents or tools or both."_ This is that, and deliberately nothing more — the
 * hard constraint in the same task is **do not invent an agent-rating predicate**, because
 * `tasks/09` records what happened when ARP minted its own: a node its own connector could not read
 * (ADR `0030`). The predicate is `uses`, unchanged.
 *
 * ## The one thing that could not be reused as it stood
 *
 * `prepareDeclareUsed` derived every object's atom from a URI. A hired agent **already has one** —
 * it reached the graph through `same as` from its ERC-8004 token — so deriving a second would be
 * the fragmentation ADR `0054` exists to prevent, and would give the agent two reputations that
 * never merge. The fix is one parameter on that function, `objects`, rather than a second planner
 * here: a parallel implementation is a second place for the edge's shape to drift.
 *
 * ## Why this is two transactions and not one
 *
 * The declaration creates the edge **with a position already behind it** (ADR `0053`), so a rating
 * that stops there is already a staked claim. `rateStake` is for adding to it, and it needs the
 * edge on chain first: `previewDeposit` reverts on a term that does not exist. A caller who wants
 * one transaction should use the declaration alone and set `birthDeposit` to the rating amount.
 *
 * ## No `oppose` here
 *
 * `tasks/25` names `rate(candidate, {amount, side})`. The side is not implemented, and that is a
 * decision rather than an omission: measured on mainnet 1155 on 2026-10-21, **1 of 185** `uses`
 * edges has ever carried a counter-position (ADR `0056`). A verb called `rate` whose main documented
 * option is the one nobody uses would be describing a mechanism rather than a market. Opposing an
 * edge is still possible through the MultiVault directly; it is not what this surface is for.
 */

export type RatePlan = {
    /** Creates the edge if it is not there, with its first position. */
    declare: DeclarePlan;
    /** The edge `(hirer, uses, agent)`, computable before either term exists. */
    tripleId: Hex;
    /** True when the edge was already on chain, so `declare.calls` is empty. */
    alreadyDeclared: boolean;
};

/**
 * Plan the declaration half of a rating.
 *
 * @param params.hirer      The **buyer's** identity atom. The subject, per ADR `0032`: a claim is
 *                          attributable only because its subject names who made it, and a shared
 *                          subject would collapse every client's claim into one vault (ADR `0056`).
 * @param params.agentAtom  The hired agent's existing atom. Raises if the chain does not have it.
 * @param params.amount     The position the edge is born with. Defaults to the chain's `minDeposit`,
 *                          which is the floor and not a recommendation.
 */
export async function prepareRate(params: {
    hirer: AgentIdentityAtom;
    agentAtom: Hex;
    reads: MultiVaultReads;
    amount?: bigint;
    predicate?: Hex;
}): Promise<RatePlan> {
    const declare = await prepareDeclareUsed({
        subject: params.hirer,
        tools: [],
        objects: [params.agentAtom],
        reads: params.reads,
        ...(params.predicate === undefined ? {} : {predicate: params.predicate}),
        ...(params.amount === undefined ? {} : {birthDeposit: params.amount}),
    });

    const planned = declare.tools[0];
    if (planned === undefined) {
        throw new Error("prepareRate: the declaration planned no edge, which cannot happen");
    }

    return {declare, tripleId: planned.tripleId, alreadyDeclared: planned.tripleExists};
}

/**
 * Plan adding to a rating already on chain.
 *
 * Separate from {@link prepareRate} because it is a separate transaction and a separate decision:
 * the edge carries a position from the moment it is declared, and this is for putting more behind
 * it later — after the work landed, say, rather than when it was commissioned.
 */
export function prepareRateStake(params: {
    tripleId: Hex;
    amount: bigint;
    receiver: Address;
    reads: MultiVaultReads;
    minShares?: bigint;
    curveId?: bigint;
}): Promise<StakePlan> {
    return prepareStakeOnUsed({
        targets: [{tripleId: params.tripleId, amount: params.amount}],
        receiver: params.receiver,
        reads: params.reads,
        ...(params.minShares === undefined ? {} : {minShares: params.minShares}),
        ...(params.curveId === undefined ? {} : {curveId: params.curveId}),
    });
}
