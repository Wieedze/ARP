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
import {formatTrust} from "./trust-format";

/**
 * Staking on a term's vault — whichever Intuition chain the caller names.
 *
 * ## It was mainnet-only, and the chain is now a parameter
 *
 * Every function here took the mainnet MultiVault from a module constant. The user's instruction
 * (2026-10-27) was that the toggle has to reach the writes: _« si c'est du trust on paye en trust,
 * si c'est sur testnet il n'y a que du tTRUST, car on lit **et agit** sur testnet obligatoirement,
 * sinon aucun intérêt d'avoir un toggle »_. A reader on testnet seeing `tTRUST` beside a button
 * that deposits mainnet `TRUST` is the clearest possible way to lose money on this surface.
 *
 * So the chain travels **on the quote** rather than beside it. A quote is the thing built against
 * one chain's vault at one moment, and `submitStake` re-derives the MultiVault address, the viem
 * chain and the guard's expected id from `quote.chain`. There is no second argument that could
 * disagree with it, and a quote built on testnet cannot be signed on mainnet.
 *
 * `security.md` is unchanged by this and worth re-reading: ARP's own funds are never signed for
 * automatically, and the mainnet row of its table is "a human in the panel, ADR `0017`, seven
 * safeguards". A toggle the user operates is that human. What this removes is the accident of
 * *silently* defaulting to mainnet, not any safeguard.
 *
 * Authorised by ADR 0017, which also fixes the seven safeguards this module
 * implements. Each one is marked below so a reviewer can find it:
 *
 *   1. chain guard        → `assertWalletOnChain`, called by `submitStake`
 *   2. no spending default→ `parseStakeAmount` returns `empty` for `""`
 *   3. hard ceiling       → `resolveMaxStakeWei` / `parseStakeAmount`
 *   4. confirmation step  → the UI's job; `quoteStake` supplies what it states
 *   5. never auto-stake   → nothing here runs on import; every write needs an
 *                           explicit `submitStake` call from a click handler
 *   6. show the real cost → `quoteStake` returns shares *and* assets after fees
 *   7. minShares          → `deriveMinShares`, which refuses to return 0
 *
 * **Two target shapes, because a triple and an atom are not the same market.** A triple has a
 * counter vault the MultiVault creates alongside it, so it can be opposed. An atom has none — there
 * is no assertion to contradict — so it takes a deposit and nothing else. ADR `0056`. There is no
 * third mechanism and none is invented here.
 */

/**
 * The chain a stake is built against.
 *
 * Declared here rather than imported from `lib/chain-choice.ts` because a service may not import
 * React (`rules/code.md`), and `ChainChoice` carries a context. `ChainChoice` satisfies this
 * structurally, so the provider's value is passed straight in.
 */
export type StakeChain = {
    /** For viem's `chain` argument on a write. */
    chain: Chain;
    /** What the wallet must report before a transaction is built. */
    chainId: number;
    /** The MultiVault on this chain. Addresses differ; a default would be a chain constant. */
    multiVault: Address;
    /** `TRUST` or `tTRUST`, so a guard message names the token the user is actually spending. */
    symbol: string;
    /**
     * Where to look a hash up, and whether the value is real.
     *
     * Not used by anything in this module — they ride along because a **quote is the record of
     * what was priced and where**, and the receipt that renders from it must link to the same
     * chain the deposit went to. The alternative was a component reading the live toggle to build
     * the link, which would point at the wrong explorer for anyone who switched after signing.
     */
    explorerUrl: string;
    isMainnet: boolean;
};

export type StakeSide = "support" | "oppose";

/**
 * What a deposit is addressed to.
 *
 * A union rather than a `Hex` plus a flag: the two cases differ in what sides exist, and the type
 * is what stops `oppose` being built for an atom at a call site that has not thought about it.
 */
export type StakeTarget = {kind: "triple"; tripleId: Hex} | {kind: "atom"; atomId: Hex};

/** The term a **support** deposit lands in. For a triple's counter, see `resolveStakeTermId`. */
export function targetTermId(target: StakeTarget): Hex {
    return target.kind === "triple" ? target.tripleId : target.atomId;
}

const TERM_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/**
 * A `bytes32` term id as an indexer prints it, or `null`.
 *
 * Checked rather than asserted, and **here** rather than at each call site: a term id becomes the
 * address a deposit is sent to, and a malformed one reverts with no message — the hardest failure
 * on this surface to diagnose. The repo had this predicate in three places and two of them reached
 * `StakeControl`, one validated and one asserted.
 */
export function asStakeTermId(value: string | null | undefined): Hex | null {
    // Safe: the pattern establishes the `0x${string}` shape `Hex` denotes.
    return typeof value === "string" && TERM_ID_PATTERN.test(value) ? (value as Hex) : null;
}

/** Chain-level constants, stable within a session. Read once, reused. */
export type StakeSession = {
    curveId: bigint;
    minDeposit: bigint;
    minShare: bigint;
};

export type StakeLimits = {
    minDeposit: bigint;
    maxStake: bigint;
    /** The chain's native symbol. Every message below quotes an amount, so every one needs it. */
    symbol: string;
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
        return {
            status: "invalid",
            message: `Enter an amount in ${limits.symbol}, for example 0.05.`,
        };
    }

    let value: bigint;
    try {
        value = parseEther(trimmed);
    } catch {
        return {
            status: "invalid",
            message: `Enter an amount in ${limits.symbol}, for example 0.05.`,
        };
    }

    if (value <= 0n) {
        return {status: "invalid", message: "Enter an amount greater than zero."};
    }
    if (value < limits.minDeposit) {
        return {
            status: "below-min",
            value,
            message: `The MultiVault rejects deposits below its minDeposit of ${formatTrust(limits.minDeposit)} ${limits.symbol}.`,
        };
    }
    if (value > limits.maxStake) {
        return {
            status: "above-max",
            value,
            message: `This panel refuses more than ${formatTrust(limits.maxStake)} ${limits.symbol} per transaction (VITE_MAX_STAKE_TRUST).`,
        };
    }
    return {status: "ok", value};
}

export type StakeGuardCode =
    | "exceeds-holding"
    | "no-counter-vault"
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

/** The contract handle for one chain's MultiVault. Was a module constant pinned to mainnet. */
function vaultAt(multiVault: Address) {
    return {address: multiVault, abi: multiVaultAbi} as const;
}

/** `getBondingCurveConfig()` and `getGeneralConfig()` — queried, never hardcoded. */
export async function readStakeSession(
    publicClient: PublicClient,
    multiVault: Address,
): Promise<StakeSession> {
    const vault = vaultAt(multiVault);
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
 * The vault a stake goes into: the term itself to support it, a triple's
 * counter-triple to oppose it.
 *
 * An atom has no counter vault, so `oppose` is refused here rather than resolved to something.
 * Returning the atom's own id for both sides would send an opposing deposit into the vault it
 * meant to bet against.
 */
export async function resolveStakeTermId(
    publicClient: PublicClient,
    params: {target: StakeTarget; side: StakeSide; multiVault: Address},
): Promise<Hex> {
    if (params.side === "support") return targetTermId(params.target);
    if (params.target.kind === "atom") {
        throw new StakeGuardError(
            "no-counter-vault",
            "An atom has no counter vault, so there is no side to oppose it from. Nothing was sent.",
        );
    }
    return publicClient.readContract({
        ...vaultAt(params.multiVault),
        functionName: "getCounterIdFromTripleId",
        args: [params.target.tripleId],
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
    params: {termId: Hex; curveId: bigint; account?: Address | null; multiVault: Address},
): Promise<VaultPosition> {
    const vault = vaultAt(params.multiVault);
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
    target: StakeTarget;
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
    /** The chain this quote was built against. `submitStake` reads the guard from here. */
    chain: StakeChain;
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
        target: StakeTarget;
        side: StakeSide;
        assets: bigint;
        receiver: Address;
        session: StakeSession;
        toleranceBps?: bigint;
        chain: StakeChain;
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
        target: params.target,
        side: params.side,
        multiVault: params.chain.multiVault,
    });

    const [preview, position] = await Promise.all([
        publicClient.readContract({
            ...vaultAt(params.chain.multiVault),
            functionName: "previewDeposit",
            args: [termId, params.session.curveId, params.assets],
        }),
        readVaultPosition(publicClient, {
            termId,
            curveId: params.session.curveId,
            account: params.receiver,
            multiVault: params.chain.multiVault,
        }),
    ]);

    const [expectedShares, assetsAfterFees] = preview;

    return {
        side: params.side,
        target: params.target,
        termId,
        curveId: params.session.curveId,
        receiver: params.receiver,
        assets: params.assets,
        expectedShares,
        assetsAfterFees,
        feeAssets: params.assets - assetsAfterFees,
        minShares: deriveMinShares(expectedShares, params.toleranceBps),
        vault: position,
        chain: params.chain,
    };
}

/**
 * Safeguard 1. A deposit built against one chain and signed on another is the most plausible way to
 * lose funds on this surface, so the chain id is checked immediately before the transaction is
 * built — not only in the UI, where a stale render could lie about it.
 *
 * Called twice by `submitStake`, against two different answers. A wallet client's `chain` is
 * whatever it was configured with, which is not evidence about where the user's wallet actually is;
 * `getChainId()` asks the wallet.
 *
 * `expected` comes off the **quote**, so the guard cannot be pointed at a different chain from the
 * one the deposit was priced against. It was `assertMainnetWallet` with the id hardcoded.
 */
export function assertWalletOnChain(expected: StakeChain, chainId: number | undefined): void {
    if (chainId !== expected.chainId) {
        throw new StakeGuardError(
            "wrong-chain",
            `Your wallet is on chain ${chainId ?? "unknown"}. This deposit was priced on ${expected.chain.name} (${expected.chainId}) and must be signed there.`,
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
            ...vaultAt(quote.chain.multiVault),
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
    assertWalletOnChain(quote.chain, walletClient.chain?.id);
    // …and what the wallet itself says right now, which is the only answer that
    // catches a user who switched networks after the quote was built.
    assertWalletOnChain(quote.chain, await walletClient.getChainId());

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
        ...vaultAt(quote.chain.multiVault),
        functionName: "deposit",
        args: [quote.receiver, quote.termId, quote.curveId, quote.minShares],
        value: quote.assets,
        chain: quote.chain.chain,
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
    params: {tripleId: Hex; curveId: bigint; account?: Address | null; multiVault: Address},
): Promise<ClaimVaults> {
    const counterTermId = await resolveStakeTermId(publicClient, {
        target: {kind: "triple", tripleId: params.tripleId},
        side: "oppose",
        multiVault: params.multiVault,
    });
    const [support, opposition] = await Promise.all([
        readVaultPosition(publicClient, {
            termId: params.tripleId,
            curveId: params.curveId,
            account: params.account,
            multiVault: params.multiVault,
        }),
        readVaultPosition(publicClient, {
            termId: counterTermId,
            curveId: params.curveId,
            account: params.account,
            multiVault: params.multiVault,
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

/**
 * The exit. A position is **withdrawable**, which is what makes this a market rather than a
 * signal — ADR `0056`, and the user's own framing: either you put money on an agent or you take it
 * back off.
 *
 * Deliberately not folded into the deposit path. A redeem is denominated in **shares** rather than
 * in TRUST, has no side to choose, carries no `msg.value`, and its slippage floor runs the other
 * way — `minAssets` instead of `minShares`. One component holding both would branch on mode in
 * every step of a flow whose whole purpose is that each step is explicit.
 *
 * The safeguards that apply here, mapped to ADR `0017`'s numbering:
 *
 *   1. chain guard        → `assertWalletOnChain`, called twice by `submitRedeem`
 *   2. no default         → the UI's amount starts empty; nothing here seeds it
 *   3. ceiling            → `maxRedeem`, read from the chain, and a redeem above it is refused
 *   4. confirmation       → `quoteRedeem` supplies what the UI states
 *   5. never automatic    → one call from one click handler; no effect, no retry
 *   6. show the real cost → `assetsAfterFees`, so the exit fee is visible before signing
 *   7. slippage floor     → `deriveMinAssets`, which refuses to return 0
 *
 * Safeguard 3 differs in kind from the deposit's: a deposit needs a ceiling because a typo spends
 * money, while a redeem can only ever return the account's own. The ceiling here exists so the
 * transaction fails in the browser with a sentence rather than on-chain with a bare revert.
 */
export type RedeemQuote = {
    termId: Hex;
    curveId: bigint;
    receiver: Address;
    /** The chain this quote was built against. `submitRedeem` reads the guard from here. */
    chain: StakeChain;
    /** Shares being burned. */
    shares: bigint;
    /** TRUST the account receives, after the exit and protocol fees. */
    assetsAfterFees: bigint;
    /** What `previewRedeem` says the burn actually consumes. Compared against `shares` by the UI. */
    sharesUsed: bigint;
    /** Everything the account holds in this vault, so the UI can offer "all of it". */
    maxShares: bigint;
    minAssets: bigint;
};

/**
 * Derive the slippage floor for an exit.
 *
 * Never returns 0, for the same reason `deriveMinShares` does not: `0` as `minAssets` disables
 * slippage protection, and a preview that yields nothing is refused rather than silently downgraded
 * to an unprotected redemption.
 */
export function deriveMinAssets(
    expectedAssets: bigint,
    toleranceBps: bigint = MIN_SHARES_TOLERANCE_BPS,
): bigint {
    if (expectedAssets <= 0n) {
        throw new StakeGuardError(
            "no-slippage-floor",
            "previewRedeem returned no assets, so there is no floor to protect. Nothing was sent.",
        );
    }
    const floor = (expectedAssets * (10_000n - toleranceBps)) / 10_000n;
    return floor > 0n ? floor : 1n;
}

/**
 * Parse a share amount against what the account holds.
 *
 * `empty` rather than zero for `""`, the same distinction `parseStakeAmount` makes and for the same
 * reason: the initial state is "no amount chosen", not "withdraw nothing". The ceiling is the
 * holding itself, read from the chain by `readMaxRedeem` — a redemption can only ever return the
 * account's own, so there is no configured maximum here as there is on the way in.
 */
export type ShareCheck =
    | {status: "empty"}
    | {status: "unparseable"}
    /** Zero **or negative**: `parseEther("-1")` succeeds and returns -1e18, so both land here. */
    | {status: "not-positive"}
    | {status: "over"; held: bigint}
    | {status: "ok"; value: bigint};

export function parseShareAmount(input: string, held: bigint): ShareCheck {
    const trimmed = input.trim();
    if (trimmed === "") return {status: "empty"};
    let value: bigint;
    try {
        value = parseEther(trimmed);
    } catch {
        return {status: "unparseable"};
    }
    if (value <= 0n) return {status: "not-positive"};
    if (value > held) return {status: "over", held};
    return {status: "ok", value};
}

/** How many shares the account can take out of this vault. Read, never derived from a balance. */
export function readMaxRedeem(
    publicClient: PublicClient,
    params: {termId: Hex; curveId: bigint; account: Address; multiVault: Address},
): Promise<bigint> {
    return publicClient.readContract({
        ...vaultAt(params.multiVault),
        functionName: "maxRedeem",
        args: [params.account, params.termId, params.curveId],
    });
}

/** Everything the confirmation step needs for an exit, read from the chain. */
export async function quoteRedeem(
    publicClient: PublicClient,
    params: {
        termId: Hex;
        curveId: bigint;
        shares: bigint;
        receiver: Address;
        toleranceBps?: bigint;
        chain: StakeChain;
    },
): Promise<RedeemQuote> {
    if (params.shares <= 0n) {
        throw new StakeGuardError("zero-amount", "Enter a number of shares greater than zero.");
    }
    if (params.receiver === zeroAddress) {
        throw new StakeGuardError(
            "zero-receiver",
            `No connected account to receive the ${params.chain.symbol}. Connect a wallet first.`,
        );
    }

    const [preview, maxShares] = await Promise.all([
        publicClient.readContract({
            ...vaultAt(params.chain.multiVault),
            functionName: "previewRedeem",
            args: [params.termId, params.curveId, params.shares],
        }),
        readMaxRedeem(publicClient, {
            termId: params.termId,
            curveId: params.curveId,
            account: params.receiver,
            multiVault: params.chain.multiVault,
        }),
    ]);

    if (params.shares > maxShares) {
        throw new StakeGuardError(
            "exceeds-holding",
            `You hold ${formatTrust(maxShares)} shares in this vault and asked to redeem ${formatTrust(params.shares)}. Nothing was sent.`,
        );
    }

    const [assetsAfterFees, sharesUsed] = preview;

    return {
        termId: params.termId,
        curveId: params.curveId,
        receiver: params.receiver,
        chain: params.chain,
        shares: params.shares,
        assetsAfterFees,
        sharesUsed,
        maxShares,
        minAssets: deriveMinAssets(assetsAfterFees, params.toleranceBps),
    };
}

/** `eth_call` the redemption before signing. Read-only; returns what the call would pay out. */
export function simulateRedeem(
    publicClient: PublicClient,
    quote: RedeemQuote,
    account: Address,
): Promise<bigint> {
    return publicClient
        .simulateContract({
            ...vaultAt(quote.chain.multiVault),
            functionName: "redeem",
            args: [quote.receiver, quote.termId, quote.curveId, quote.shares, quote.minAssets],
            account,
        })
        .then((result) => result.result);
}

/**
 * Sign and broadcast the redemption.
 *
 * Every guard is re-checked here rather than trusted from the render that produced the quote, and
 * the chain is asked twice — once as the client was built, once as the wallet actually is.
 */
export async function submitRedeem(params: {
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
    quote: RedeemQuote;
}): Promise<Hex> {
    const {walletClient, publicClient, quote} = params;

    assertWalletOnChain(quote.chain, walletClient.chain?.id);
    assertWalletOnChain(quote.chain, await walletClient.getChainId());

    const sender = walletClient.account.address;
    if (quote.receiver === zeroAddress) {
        throw new StakeGuardError("zero-receiver", "The receiver address is zero. Nothing sent.");
    }
    if (quote.receiver.toLowerCase() !== sender.toLowerCase()) {
        throw new StakeGuardError(
            "receiver-mismatch",
            `The ${quote.chain.symbol} must go to the connected account. Redeeming to another address is not offered here.`,
        );
    }
    if (quote.shares <= 0n) {
        throw new StakeGuardError("zero-amount", "Refusing to send a zero-share redemption.");
    }
    if (quote.shares > quote.maxShares) {
        throw new StakeGuardError(
            "exceeds-holding",
            "The quote asks for more shares than the account holds. Nothing sent.",
        );
    }
    if (quote.minAssets <= 0n) {
        throw new StakeGuardError(
            "no-slippage-floor",
            "Refusing to send a redemption with no slippage floor.",
        );
    }

    await simulateRedeem(publicClient, quote, sender);

    return walletClient.writeContract({
        ...vaultAt(quote.chain.multiVault),
        functionName: "redeem",
        args: [quote.receiver, quote.termId, quote.curveId, quote.shares, quote.minAssets],
        chain: quote.chain.chain,
    });
}
