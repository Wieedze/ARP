import {describe, expect, it} from "vitest";
import {parseEther, type Address, type Hex} from "viem";

import {
    BelowMinimumError,
    InsufficientSharesError,
    prepareMarketExit,
    prepareMarketPosition,
    TermNotFoundError,
} from "../src/declare/index.js";
import {fakeReads} from "./helpers.js";

/**
 * Joining a market and leaving one, as plans.
 *
 * These exist because the connector could read a market and never join it: measured 2026-10-28,
 * **2,354 TRUST across 23 positions** sits on 39 skill atoms on mainnet 1155 and none of it was
 * reachable through the node. The app has had both directions since ADR `0056`; this is the agent's.
 *
 * Every test is against a fake reader rather than a chain. ADR `0017`'s build rule: a guard that
 * refuses a real transaction is verified by unit tests over stated chain state, not by trying it.
 */

const ATOM = `0x${"ab".repeat(32)}` as Hex;
const RECEIVER = "0x0000000000000000000000000000000000000001" as Address;
const MIN_DEPOSIT = parseEther("0.001");

const onChain = (extra: Parameters<typeof fakeReads>[0] = {}) =>
    fakeReads({existing: new Set([ATOM.toLowerCase()]), minDeposit: MIN_DEPOSIT, ...extra});

describe("prepareMarketPosition", () => {
    it("prices the deposit on the chain's curve and says what it buys", async () => {
        const reads = onChain();
        const plan = await prepareMarketPosition({
            termId: ATOM,
            amount: parseEther("0.01"),
            receiver: RECEIVER,
            reads,
        });

        expect(plan.calls).toHaveLength(1);
        expect(plan.calls[0]!.kind).toBe("deposit");
        expect(plan.calls[0]!.value).toBe(parseEther("0.01"));
        expect(plan.shares).toBe(parseEther("0.01"));
        // Read per plan, never carried as a constant: `minDeposit` is 10x apart between chains and
        // the curve is governance-configurable (`rules/portability.md` rule 3).
        // The fake records the **contract call**, not the reader's method name, which is the
        // right thing to assert: what matters is that the chain was asked, not what we called it.
        expect(reads.reads).toContain("getBondingCurveConfig");
        expect(reads.reads).toContain("getGeneralConfig");
        expect(reads.reads).toContain("previewDeposit");
    });

    it("refuses an amount below the chain's own floor", async () => {
        await expect(
            prepareMarketPosition({
                termId: ATOM,
                amount: MIN_DEPOSIT - 1n,
                receiver: RECEIVER,
                reads: onChain(),
            }),
        ).rejects.toBeInstanceOf(BelowMinimumError);
    });

    it("refuses a term the chain does not have, rather than planning into nothing", async () => {
        await expect(
            prepareMarketPosition({
                termId: ATOM,
                amount: parseEther("0.01"),
                receiver: RECEIVER,
                reads: fakeReads({existing: new Set(), minDeposit: MIN_DEPOSIT}),
            }),
        ).rejects.toBeInstanceOf(TermNotFoundError);
    });

    it("prices against the curve it is given, not the chain's default", async () => {
        const plan = await prepareMarketPosition({
            termId: ATOM,
            amount: parseEther("0.01"),
            receiver: RECEIVER,
            reads: onChain({curveId: 1n}),
            curveId: 2n,
        });
        // Measured on mainnet: curve 2's share price ran 3.000–4.181 against curve 1's 1.000–1.060,
        // so the same amount buys very different holdings and the caller chose which.
        expect(plan.curveId).toBe(2n);
    });
});

describe("prepareMarketExit", () => {
    const held = {[ATOM.toLowerCase()]: parseEther("5")};

    it("redeems the whole position when no amount is named", async () => {
        const plan = await prepareMarketExit({
            termId: ATOM,
            receiver: RECEIVER,
            account: RECEIVER,
            reads: onChain({held}),
        });
        expect(plan.shares).toBe(parseEther("5"));
        expect(plan.held).toBe(parseEther("5"));
    });

    it("sends no value, which is the one call in the package that does not", async () => {
        const plan = await prepareMarketExit({
            termId: ATOM,
            receiver: RECEIVER,
            account: RECEIVER,
            reads: onChain({held}),
            shares: parseEther("1"),
        });
        // A redeem that carried value would be sending TRUST to collect TRUST.
        expect(plan.calls[0]!.value).toBe(0n);
        // And it is labelled for what it is: a caller rendering a plan by `kind` would otherwise
        // announce a withdrawal as a deposit.
        expect(plan.calls[0]!.kind).toBe("redeem");
    });

    it("reads what the exit fetches rather than computing it", async () => {
        const plan = await prepareMarketExit({
            termId: ATOM,
            receiver: RECEIVER,
            account: RECEIVER,
            reads: onChain({held, exitBps: 100n}),
            shares: parseEther("1"),
        });
        // The exit fee is a governance parameter and the curve is not linear in shares on curve 2,
        // so there is no arithmetic from a share count to an amount.
        expect(plan.assetsAfterFees).toBe(parseEther("0.99"));
        expect(plan.assetsAfterFees).not.toBe(plan.shares);
    });

    it("refuses an exit larger than the position", async () => {
        await expect(
            prepareMarketExit({
                termId: ATOM,
                receiver: RECEIVER,
                account: RECEIVER,
                reads: onChain({held}),
                shares: parseEther("6"),
            }),
        ).rejects.toBeInstanceOf(InsufficientSharesError);
    });

    it("refuses an exit from a position that does not exist", async () => {
        // `shares ?? held` is 0 here, and planning a zero redeem would be a call that reverts on
        // chain after the agent signed it.
        await expect(
            prepareMarketExit({
                termId: ATOM,
                receiver: RECEIVER,
                account: RECEIVER,
                reads: onChain(),
            }),
        ).rejects.toBeInstanceOf(InsufficientSharesError);
    });
});
