import type {Address, Hex} from "viem";

/**
 * The guard rails on a hire, built from the **framework's own** enforcers.
 *
 * ## Why not ARP's enforcer
 *
 * `tasks/25` flagged this as undecided: "`DomainScopeEnforcer` on 1155 is inert and there is no
 * `ModuleRegistry` there (ADR `0025`) — the domain bound must come from somewhere else, and working
 * that out is part of this task."
 *
 * It is settled by a measurement rather than a design: the MetaMask Delegation Framework **is**
 * deployed on both Intuition chains at version 1.3.0, so its standard enforcers are callable on
 * mainnet 1155 where no ARP contract is or will be. Read from
 * `@metamask/delegation-deployments` on 2026-10-27 — 39 contracts on 1155, including every enforcer
 * named below, with the `DelegationManager` at `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`.
 *
 * That is the property worth having. ARP's `TrustStakeCapEnforcer` is deployed on testnet 13579 and
 * nowhere else, so a hire bounded by it would work in the rehearsal and not in the thing
 * (`rules/portability.md` point 4: never rely on controlling the registry). A hire bounded by the
 * framework works identically on both.
 *
 * ## What each one bounds, and what none of them bounds
 *
 * | enforcer | bounds |
 * | --- | --- |
 * | `NativeTokenTransferAmountEnforcer` | the **total** TRUST the seller may move. The budget |
 * | `AllowedTargetsEnforcer` | which contracts it may call. The MultiVault and nothing else |
 * | `AllowedMethodsEnforcer` | which functions. Deposit and term creation, never `redeem` |
 * | `TimestampEnforcer` | when the authority expires |
 *
 * **Nothing bounds the destination inside the MultiVault.** The seller may deposit the budget on
 * any term, including one it owns. That is the same gap ADR `0040` records for ARP's own enforcer —
 * "nothing on-chain checks that a deposit lands on the edge rather than somewhere else" — and it is
 * inherent: a caveat sees the calldata, and one `deposit` call looks like another. The buyer is
 * trusting the seller with the budget, bounded in amount and in kind but not in aim. Stated here
 * because a hire is where a reader will assume otherwise.
 *
 * `redeem` is excluded from the method list for exactly that reason: a seller that could redeem
 * could return the buyer's deposits to itself as the receiver.
 */

/** One bound, with the sentence a UI or an agent shows before the buyer signs. */
export type HireBound = {
    enforcer: Address;
    terms: Hex;
    args: Hex;
    /** The enforcer's name in the framework's registry, for a reader and for a test. */
    name: string;
    /** What it bounds, in one sentence. Shown; never a paragraph. */
    describes: string;
};

/**
 * The MultiVault functions a hired agent may call.
 *
 * `deposit` is the rating. `createAtoms` and `createTriples` are what a declaration needs when the
 * term does not exist yet. **`redeem` is deliberately absent** — see the module note.
 */
export const HIRE_SELECTORS: readonly string[] = [
    "function deposit(address,bytes32,uint256,uint256)",
    "function createAtoms(bytes[],uint256[])",
    "function createTriples(bytes32[],bytes32[],bytes32[],uint256[])",
];
