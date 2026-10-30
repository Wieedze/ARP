import {describe, expect, it} from "vitest";
import type {Hex} from "viem";

import {ActivityLog} from "../activity-log";
import {recordSent, recordSettled, waitAndRecord} from "../tx-record";

const HASH: Hex = `0x${"a".repeat(64)}`;
const receipt = (status: "success" | "reverted") => ({
    status,
    blockNumber: 7n,
    gasUsed: 100n,
    effectiveGasPrice: 3n,
});

describe("tx-record", () => {
    it("records the hash when it is sent and how it settled, on the waiting client's chain", async () => {
        const log = new ActivityLog();
        const client = {
            chain: {id: 1155},
            waitForTransactionReceipt: async () => receipt("success"),
        };
        const back = await waitAndRecord(client, HASH, {label: "mint identity"}, log);
        expect(back.blockNumber).toBe(7n);
        expect(log.all()).toMatchObject([
            {stream: "mine", step: "sent", label: "mint identity", tx: HASH, chainId: 1155},
            {
                stream: "mine",
                step: "confirmed",
                label: "block 7",
                tx: HASH,
                chainId: 1155,
                costWei: "300",
            },
        ]);
    });

    it("a reverted transaction is refused, and a wait that throws is recorded and rethrown", async () => {
        const log = new ActivityLog();
        await waitAndRecord(
            {waitForTransactionReceipt: async () => receipt("reverted")},
            HASH,
            {label: "x"},
            log,
        );
        expect(log.all()[1]).toMatchObject({step: "refused", label: "reverted"});

        const other = new ActivityLog();
        const down = {
            waitForTransactionReceipt: async () => {
                throw new Error("timed out\nwith a wall of detail");
            },
        };
        await expect(
            waitAndRecord(down, HASH, {label: "x", chainId: 13579}, other),
        ).rejects.toThrow("timed out");
        expect(other.all()[1]).toMatchObject({
            step: "refused",
            label: "no receipt",
            detail: "timed out",
            chainId: 13579,
        });
    });

    it("sending and settling twice records once each", () => {
        const log = new ActivityLog();
        recordSent(HASH, {label: "deposit", chainId: 13579, valueWei: 5n}, log);
        recordSent(HASH, {label: "deposit", chainId: 13579, valueWei: 5n}, log);
        recordSettled(HASH, receipt("success"), log);
        recordSettled(HASH, receipt("success"), log);
        expect(log.all()).toHaveLength(2);
        expect(log.all()[0]).toMatchObject({costWei: "5"});
    });
});
