import {
    parseEther,
    zeroAddress,
    type Account,
    type Address,
    type Chain,
    type Hex,
    type PublicClient,
    type Transport,
    type WalletClient,
} from "viem";

import {multiVaultAbi} from "../lib/abi/multi-vault";
import {
    INTUITION_MAINNET_CHAIN_ID,
    INTUITION_MAINNET_MULTIVAULT,
    intuitionMainnet,
} from "../lib/intuition-mainnet";

/**
 * Staking on a `has trust provider` claim — Intuition **mainnet**, real TRUST.
 *
 * Authorised by ADR 0017, which also fixes the seven safeguards this module
 * implements. Each one is marked below so a reviewer can find it:
 *
 *   1. chain guard        → `assertMainnetWallet`, called by `submitStake`
 *   2. no spending default→ `parseStakeAmount` returns `empty` for `""`
 *   3. hard ceiling       → `resolveMaxStakeWei` / `parseStakeAmount`
 *   4. confirmation step  → the UI's job; `quoteStake` supplies what it states
 *   5. never auto-stake   → nothing here runs on import; every write needs an
 *                           explicit `submitStake` call from a click handler
 *   6. show the real cost → `quoteStake` returns shares *and* assets after fees
 *   7. minShares          → `deriveMinShares`, which refuses to return 0
 *
 * Support is a deposit into the triple's own vault. Opposition is a deposit
 * into its counter-triple, which the MultiVault creates alongside every triple.
 * There is no third mechanism and none is invented here.
 */

export type StakeSide = "support" | "oppose";

/** Chain-level constants, stable within a session. Read once, reused. */
export type StakeSession = {
    curveId: bigint;
    minDeposit: bigint;
    minShare: bigint;
};

export type StakeLimits = {
    minDeposit: bigint;
    maxStake: bigint;
};

/** Slippage floor, in basis points below the previewed share count. */
export const MIN_SHARES_TOLERANCE_BPS = 100n;

/** The ceiling's fallback when `VITE_MAX_STAKE_TRUST` is unset or unparseable. */
export const DEFAULT_MAX_STAKE_TRUST = "1";

/**
 * Parse the per-transaction ceiling from the environment.
 *
 * A malformed or non-positive value falls back to 1 TRUST rather than to "no
 * limit" — a typo in a deploy environment must not remove the backstop.
 */
export function resolveMaxStakeWei(raw: string | undefined): bigint {
    const candidate = (raw ?? "").trim();
    if (candidate === "") return parseEther(DEFAULT_MAX_STAKE_TRUST);
    try {
        const value = parseEther(candidate);
        return value > 0n ? value : parseEther(DEFAULT_MAX_STAKE_TRUST);
    } catch {
        return parseEther(DEFAULT_MAX_STAKE_TRUST);
    }
}

export const MAX_STAKE_WEI = resolveMaxStakeWei(import.meta.env.VITE_MAX_STAKE_TRUST);

export type AmountCheck =
    | {status: "empty"}
    | {status: "invalid"; message: string}
    | {status: "below-min"; value: bigint; message: string}
    | {status: "above-max"; value: bigint; message: string}
    | {status: "ok"; value: bigint};

/**
 * Validate what the user typed, against the on-chain minimum and the UI's
 * ceiling.
 *
 * An empty field is `empty`, never zero and never a default — safeguard 2 is
 * that nothing in this app proposes an amount on the user's behalf.
 */
export function parseStakeAmount(input: string, limits: StakeLimits): AmountCheck {
    const trimmed = input.trim();
    if (trimmed === "") return {status: "empty"};
    if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") {
        return {status: "invalid", message: "Enter an amount in TRUST, for example 0.05."};
    }

    let value: bigint;
    try {
        value = parseEther(trimmed);
    } catch {
        return {status: "invalid", message: "Enter an amount in TRUST, for example 0.05."};
    }

    if (value <= 0n) {
        return {status: "invalid", message: "Enter an amount greater than zero."};
    }
    if (value < limits.minDeposit) {
        return {
            status: "below-min",
            value,
            message: `The MultiVault rejects deposits below its minDeposit of ${formatWeiPlain(limits.minDeposit)} TRUST.`,
        };
    }
    if (value > limits.maxStake) {
        return {
            status: "above-max",
            value,
            message: `This panel refuses more than ${formatWeiPlain(limits.maxStake)} TRUST per transaction (VITE_MAX_STAKE_TRUST).`,
        };
    }
    return {status: "ok", value};
}

/** 18-decimal wei to a plain decimal string, trailing zeros trimmed. */
function formatWeiPlain(wei: bigint): string {
    const whole = wei / 10n ** 18n;
    const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
    return fraction === "" ? whole.toString() : `${whole}.${fraction}`;
}

export type StakeGuardCode =
    | "wrong-chain"
    | "zero-receiver"
    | "receiver-mismatch"
    | "no-slippage-floor"
    | "zero-amount";

/** A guard refused to build or send the transaction. Carries a code the UI branches on. */
export class StakeGuardError extends Error {
    readonly code: StakeGuardCode;

    constructor(code: StakeGuardCode, message: string) {
        super(message);
        this.name = "StakeGuardError";
        this.code = code;
    }
}

/**
 * Derive the slippage floor from the preview.
 *
 * Never returns 0. Passing 0 as `minShares` disables slippage protection
 * outright, so a preview that yields no shares is refused rather than
 * silently downgraded to an unprotected deposit.
 */
export function deriveMinShares(
    expectedShares: bigint,
    toleranceBps: bigint = MIN_SHARES_TOLERANCE_BPS,
): bigint {
    if (expectedShares <= 0n) {
        throw new StakeGuardError(
            "no-slippage-floor",
            "previewDeposit returned no shares, so there is no floor to protect. Nothing was sent.",
        );
    }
    const floor = (expectedShares * (10_000n - toleranceBps)) / 10_000n;
    return floor > 0n ? floor : 1n;
}

const vault = {address: INTUITION_MAINNET_MULTIVAULT, abi: multiVaultAbi} as const;

/** `getBondingCurveConfig()` and `getGeneralConfig()` — queried, never hardcoded. */
export async function readStakeSession(publicClient: PublicClient): Promise<StakeSession> {
    const [curveConfig, generalConfig] = await Promise.all([
        publicClient.readContract({...vault, functionName: "getBondingCurveConfig"}),
        publicClient.readContract({...vault, functionName: "getGeneralConfig"}),
    ]);
    return {
        curveId: curveConfig.defaultCurveId,
        minDeposit: generalConfig.minDeposit,
        minShare: generalConfig.minShare,
    };
}

/**
 * The vault a stake goes into: the triple itself to support it, its
 * counter-triple to oppose it.
 */
export async function resolveStakeTermId(
    publicClient: PublicClient,
    params: {tripleId: Hex; side: StakeSide},
): Promise<Hex> {
    if (params.side === "support") return params.tripleId;
    return publicClient.readContract({
        ...vault,
        functionName: "getCounterIdFromTripleId",
        args: [params.tripleId],
    });
}

export type VaultPosition = {
    termId: Hex;
    curveId: bigint;
    totalAssets: bigint;
    totalShares: bigint;
    sharePrice: bigint;
    /** The connected account's own shares, or `null` when no account is connected. */
    shares: bigint | null;
};

/** On-chain vault state for one side. Read live so the panel agrees with the chain. */
export async function readVaultPosition(
    publicClient: PublicClient,
    params: {termId: Hex; curveId: bigint; account?: Address | null},
): Promise<VaultPosition> {
    const [totals, sharePrice, shares] = await Promise.all([
        publicClient.readContract({
            ...vault,
            functionName: "getVault",
            args: [params.termId, params.curveId],
        }),
        publicClient.readContract({
            ...vault,
            functionName: "currentSharePrice",
            args: [params.termId, params.curveId],
        }),
        params.account === undefined || params.account === null
            ? Promise.resolve(null)
            : publicClient.readContract({
                  ...vault,
                  functionName: "getShares",
                  args: [params.account, params.termId, params.curveId],
              }),
    ]);

    return {
        termId: params.termId,
        curveId: params.curveId,
        totalAssets: totals[0],
        totalShares: totals[1],
        sharePrice,
        shares,
    };
}

export type StakeQuote = {
    side: StakeSide;
    tripleId: Hex;
    termId: Hex;
    curveId: bigint;
    receiver: Address;
    assets: bigint;
    expectedShares: bigint;
    assetsAfterFees: bigint;
    /** `assets - assetsAfterFees`: what the fee layers take. Displayed, never hidden. */
    feeAssets: bigint;
    minShares: bigint;
    vault: VaultPosition;
};

/**
 * Everything the confirmation step needs, read from the chain.
 *
 * `previewDeposit` runs on every quote — safeguard 6. Protocol fee, entry fee
 * and the atom deposit fraction for triples all apply, so `assetsAfterFees` is
 * materially below `assets` and the curve makes `expectedShares` non-linear in
 * it. Showing only the deposit amount would imply a 1:1 conversion that does
 * not exist.
 */
export async function quoteStake(
    publicClient: PublicClient,
    params: {
        tripleId: Hex;
        side: StakeSide;
        assets: bigint;
        receiver: Address;
        session: StakeSession;
        toleranceBps?: bigint;
    },
): Promise<StakeQuote> {
    if (params.assets <= 0n) {
        throw new StakeGuardError("zero-amount", "Enter an amount greater than zero.");
    }
    if (params.receiver === zeroAddress) {
        throw new StakeGuardError(
            "zero-receiver",
            "No connected account to receive the shares. Connect a wallet first.",
        );
    }

    const termId = await resolveStakeTermId(publicClient, {
        tripleId: params.tripleId,
        side: params.side,
    });

    const [preview, position] = await Promise.all([
        publicClient.readContract({
            ...vault,
            functionName: "previewDeposit",
            args: [termId, params.session.curveId, params.assets],
        }),
        readVaultPosition(publicClient, {
            termId,
            curveId: params.session.curveId,
            account: params.receiver,
        }),
    ]);

    const [expectedShares, assetsAfterFees] = preview;

    return {
        side: params.side,
        tripleId: params.tripleId,
        termId,
        curveId: params.session.curveId,
        receiver: params.receiver,
        assets: params.assets,
        expectedShares,
        assetsAfterFees,
        feeAssets: params.assets - assetsAfterFees,
        minShares: deriveMinShares(expectedShares, params.toleranceBps),
        vault: position,
    };
}

/**
 * Safeguard 1. A deposit built against mainnet and signed on another chain is
 * the most plausible way to lose funds on this surface, so the chain id is
 * checked immediately before the transaction is built — not only in the UI,
 * where a stale render could lie about it.
 *
 * Called twice by `submitStake`, against two different answers. A wallet
 * client's `chain` is whatever it was configured with, which is not evidence
 * about where the user's wallet actually is; `getChainId()` asks the wallet.
 */
export function assertMainnetWallet(chainId: number | undefined): void {
    if (chainId !== INTUITION_MAINNET_CHAIN_ID) {
        throw new StakeGuardError(
            "wrong-chain",
            `Your wallet is on chain ${chainId ?? "unknown"}. Staking requires Intuition mainnet (${INTUITION_MAINNET_CHAIN_ID}).`,
        );
    }
}

/**
 * `eth_call` the deposit before signing anything.
 *
 * Read-only: nothing is broadcast. A revert here is the difference between a
 * clear message and a failed transaction the user paid for. Returns the shares
 * the call would mint.
 */
export function simulateStake(
    publicClient: PublicClient,
    quote: StakeQuote,
    account: Address,
): Promise<bigint> {
    return publicClient
        .simulateContract({
            ...vault,
            functionName: "deposit",
            args: [quote.receiver, quote.termId, quote.curveId, quote.minShares],
            value: quote.assets,
            account,
        })
        .then((result) => result.result);
}

/**
 * Sign and broadcast the deposit. The only write in the panel.
 *
 * Reached from one click handler on the confirmation step and nowhere else:
 * no effect, no retry and no navigation calls it (safeguard 5). Every guard is
 * re-checked here rather than trusted from the render that produced the quote.
 */
export async function submitStake(params: {
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
    quote: StakeQuote;
}): Promise<Hex> {
    const {walletClient, publicClient, quote} = params;

    // What the client was built with…
    assertMainnetWallet(walletClient.chain?.id);
    // …and what the wallet itself says right now, which is the only answer that
    // catches a user who switched networks after the quote was built.
    assertMainnetWallet(await walletClient.getChainId());

    const sender = walletClient.account.address;
    if (quote.receiver === zeroAddress) {
        throw new StakeGuardError("zero-receiver", "The receiver address is zero. Nothing sent.");
    }
    if (quote.receiver.toLowerCase() !== sender.toLowerCase()) {
        throw new StakeGuardError(
            "receiver-mismatch",
            "The shares receiver must be the connected account. Depositing for someone else needs their prior approval on the MultiVault.",
        );
    }
    if (quote.minShares <= 0n) {
        throw new StakeGuardError(
            "no-slippage-floor",
            "Refusing to send a deposit with no slippage floor.",
        );
    }
    if (quote.assets <= 0n) {
        throw new StakeGuardError("zero-amount", "Refusing to send a zero-value deposit.");
    }

    await simulateStake(publicClient, quote, sender);

    return walletClient.writeContract({
        ...vault,
        functionName: "deposit",
        args: [quote.receiver, quote.termId, quote.curveId, quote.minShares],
        value: quote.assets,
        chain: intuitionMainnet,
    });
}

export type ClaimVaults = {
    tripleId: Hex;
    counterTermId: Hex;
    curveId: bigint;
    support: VaultPosition;
    opposition: VaultPosition;
};

/**
 * Both sides of one claim's market, read from the chain rather than from the
 * indexer.
 *
 * The indexer's numbers and these agree today, but the vault is what a deposit
 * actually lands in, and after a stake the chain is right before the indexer
 * is. The panel shows indexer-sourced position counts alongside these, which is
 * why both are read rather than one being derived from the other.
 */
export async function readClaimVaults(
    publicClient: PublicClient,
    params: {tripleId: Hex; curveId: bigint; account?: Address | null},
): Promise<ClaimVaults> {
    const counterTermId = await resolveStakeTermId(publicClient, {
        tripleId: params.tripleId,
        side: "oppose",
    });
    const [support, opposition] = await Promise.all([
        readVaultPosition(publicClient, {
            termId: params.tripleId,
            curveId: params.curveId,
            account: params.account,
        }),
        readVaultPosition(publicClient, {
            termId: counterTermId,
            curveId: params.curveId,
            account: params.account,
        }),
    ]);
    return {
        tripleId: params.tripleId,
        counterTermId,
        curveId: params.curveId,
        support,
        opposition,
    };
}
