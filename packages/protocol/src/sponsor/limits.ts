import {getAddress, type Address, type Hex} from "viem";

/**
 * The limits on what ARP's sponsoring service spends, and the decisions they make. Pure: the
 * records come from the service's ledger and the clock is a parameter.
 *
 * ADR `0092` item 3 set three of them, and ADR `0094` §3 extends them from publications to
 * deposits: 2 per delegator (or agent) per day, about 1 tTRUST a day overall, registered ERC-8004
 * agents only (the last is a chain read, so it lives in the service). The **global budget** is what
 * protects the treasury; the per-subject count keeps one operator from using all of it; the
 * service's own balance is the hard limit behind both.
 *
 * Two values the user has **not** set are required configuration rather than defaults: the amount
 * of one sponsored deposit and the gas sent for the one-time `approve`. And the withdrawal threshold
 * is `null` until the user sets it, which this module reads as "not enforced" and the service's
 * info route prints as unset.
 */
export type SponsorLimits = {
    /** The fixed amount of one sponsored deposit, in wei. Never a share of a payment (ADR `0094` §4). */
    depositAmount: bigint;
    depositsPerAgentPerDay: number;
    publicationsPerDelegatorPerDay: number;
    /**
     * The `value` the service sends in one UTC day, in wei: deposits, the approval-gas transfers,
     * publication fees. The gas the service's own transactions burn is **not** counted; the
     * service's balance is what bounds that.
     */
    dailyBudget: bigint;
    /** Sent once, ever, to each registered agent, for its own `approve` transaction. */
    approvalGas: bigint;
    /**
     * Past this share of its sponsored shares withdrawn, in basis points, an agent is no longer
     * sponsored. `null`: not set by the user, not enforced.
     */
    withdrawalThresholdBps: number | null;
};

/** The three values ADR `0092` item 3 fixed. The other three have no default on purpose. */
export const ADR_0092_LIMITS = {
    depositsPerAgentPerDay: 2,
    publicationsPerDelegatorPerDay: 2,
    /** "About 1 tTRUST a day overall." */
    dailyBudget: 10n ** 18n,
} as const;

/** One thing the service paid for. `subject` is the agent for a deposit or gas, the delegator for a publication. */
export type SponsorRecord = {
    kind: "deposit" | "gas" | "publish";
    subject: Address;
    /** The `value` the service sent for it, in wei. A publication's term fees are in it; the gas of the transaction is not. */
    value: bigint;
    /** Milliseconds since the epoch. */
    at: number;
    /** A deposit's proof id (`ProvenProof.id`); a publication's delegation hash. */
    key?: string;
    termId?: Hex;
    curveId?: bigint;
    /** Shares the deposit minted for the agent, read before and after it. */
    shares?: bigint;
};

export type LimitDecision = {ok: true} | {ok: false; reason: string};

const DAY_MS = 86_400_000;

/** The UTC day a moment falls in. Counts reset at 00:00 UTC, the same instant for every operator. */
export function utcDay(ms: number): number {
    return Math.floor(ms / DAY_MS);
}

function same(a: Address, b: Address): boolean {
    return getAddress(a) === getAddress(b);
}

/** Wei the service sent on the UTC day `ms` falls in. */
export function spentOnDay(records: readonly SponsorRecord[], ms: number): bigint {
    const day = utcDay(ms);
    return records.filter((r) => utcDay(r.at) === day).reduce((sum, r) => sum + r.value, 0n);
}

function countOnDay(
    records: readonly SponsorRecord[],
    kind: SponsorRecord["kind"],
    subject: Address,
    ms: number,
): number {
    const day = utcDay(ms);
    return records.filter(
        (r) => r.kind === kind && utcDay(r.at) === day && same(r.subject, subject),
    ).length;
}

function budget(
    records: readonly SponsorRecord[],
    value: bigint,
    now: number,
    limits: SponsorLimits,
) {
    const spent = spentOnDay(records, now);
    if (spent + value > limits.dailyBudget) {
        return {
            ok: false as const,
            reason: `the daily budget of ${limits.dailyBudget} wei is spent (${spent} today)`,
        };
    }
    return null;
}

/**
 * Basis points of an agent's sponsored shares that it no longer holds, from 0 to 10,000.
 *
 * Per position, `max(0, sponsored − held)`: shares the agent bought itself on the same vault mask a
 * withdrawal of sponsored ones, which errs toward sponsoring. Zero sponsored shares is zero.
 */
export function withdrawnBps(
    positions: readonly {sponsoredShares: bigint; heldShares: bigint}[],
): number {
    let sponsored = 0n;
    let withdrawn = 0n;
    for (const p of positions) {
        sponsored += p.sponsoredShares;
        if (p.heldShares < p.sponsoredShares) withdrawn += p.sponsoredShares - p.heldShares;
    }
    if (sponsored === 0n) return 0;
    return Number((withdrawn * 10_000n) / sponsored);
}

/**
 * The sponsored positions of one agent, summed per `(termId, curveId)`, for {@link withdrawnBps}.
 */
export function sponsoredPositions(
    records: readonly SponsorRecord[],
    agent: Address,
): {termId: Hex; curveId: bigint; shares: bigint}[] {
    const byVault = new Map<string, {termId: Hex; curveId: bigint; shares: bigint}>();
    for (const r of records) {
        if (r.kind !== "deposit" || !same(r.subject, agent)) continue;
        if (r.termId === undefined || r.curveId === undefined || r.shares === undefined) continue;
        const key = `${r.termId.toLowerCase()}:${r.curveId}`;
        const held = byVault.get(key);
        if (held === undefined)
            byVault.set(key, {termId: r.termId, curveId: r.curveId, shares: r.shares});
        else held.shares += r.shares;
    }
    return [...byVault.values()];
}

/** Whether one more sponsored deposit for `agent` fits. `withdrawn` is {@link withdrawnBps} of it. */
export function checkDepositLimits(
    records: readonly SponsorRecord[],
    params: {agent: Address; now: number; limits: SponsorLimits; withdrawn: number},
): LimitDecision {
    const {agent, now, limits, withdrawn} = params;
    if (countOnDay(records, "deposit", agent, now) >= limits.depositsPerAgentPerDay) {
        return {
            ok: false,
            reason: `${limits.depositsPerAgentPerDay} sponsored deposits a day per agent, reached`,
        };
    }
    if (limits.withdrawalThresholdBps !== null && withdrawn > limits.withdrawalThresholdBps) {
        return {
            ok: false,
            reason: `${withdrawn} bps of the sponsored shares were withdrawn, past ${limits.withdrawalThresholdBps}`,
        };
    }
    return budget(records, limits.depositAmount, now, limits) ?? {ok: true};
}

/** Whether `agent` may still receive its one-time gas. Once ever, not once a day. */
export function checkGasLimits(
    records: readonly SponsorRecord[],
    params: {agent: Address; now: number; limits: SponsorLimits},
): LimitDecision {
    const {agent, now, limits} = params;
    if (records.some((r) => r.kind === "gas" && same(r.subject, agent))) {
        return {ok: false, reason: "this agent already received its approval gas"};
    }
    return budget(records, limits.approvalGas, now, limits) ?? {ok: true};
}

/** Whether one more publication for `delegator`, costing `value`, fits. */
export function checkPublishLimits(
    records: readonly SponsorRecord[],
    params: {delegator: Address; value: bigint; now: number; limits: SponsorLimits},
): LimitDecision {
    const {delegator, value, now, limits} = params;
    if (countOnDay(records, "publish", delegator, now) >= limits.publicationsPerDelegatorPerDay) {
        return {
            ok: false,
            reason: `${limits.publicationsPerDelegatorPerDay} sponsored publications a day per delegator, reached`,
        };
    }
    return budget(records, value, now, limits) ?? {ok: true};
}
