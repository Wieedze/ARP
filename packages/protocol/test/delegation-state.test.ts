import type {Address, Hex} from "viem";
import {describe, expect, it} from "vitest";

import {
    DISABLED_DELEGATIONS_ABI,
    readDelegationState,
    type DisabledDelegationsReader,
} from "../src/delegation/state.js";

const MANAGER: Address = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3";
const HASH: Hex = `0x${"ab".repeat(32)}`;

function reader(answer: () => Promise<unknown>) {
    const calls: unknown[] = [];
    const stub = {
        readContract: async (args: unknown) => {
            calls.push(args);
            return answer();
        },
    } as DisabledDelegationsReader; // The stub returns `unknown` so the test can feed a malformed answer.
    return {stub, calls};
}

describe("readDelegationState", () => {
    it("asks the named manager for the hash, through disabledDelegations", async () => {
        const {stub, calls} = reader(async () => false);
        await readDelegationState(HASH, {reader: stub, delegationManager: MANAGER});
        expect(calls).toEqual([
            {
                address: MANAGER,
                abi: DISABLED_DELEGATIONS_ABI,
                functionName: "disabledDelegations",
                args: [HASH],
            },
        ]);
    });

    it("maps true to disabled and false to enabled", async () => {
        const on = reader(async () => true).stub;
        const off = reader(async () => false).stub;
        expect(await readDelegationState(HASH, {reader: on, delegationManager: MANAGER})).toBe(
            "disabled",
        );
        expect(await readDelegationState(HASH, {reader: off, delegationManager: MANAGER})).toBe(
            "enabled",
        );
    });

    it("answers unknown, never enabled, when the read fails", async () => {
        const failing = reader(async () => {
            throw new Error("rpc down");
        }).stub;
        expect(
            await readDelegationState(HASH, {reader: failing, delegationManager: MANAGER}),
        ).toBe("unknown");
    });

    it("answers unknown when the answer is not a boolean", async () => {
        const odd = reader(async () => "0x01").stub;
        expect(await readDelegationState(HASH, {reader: odd, delegationManager: MANAGER})).toBe(
            "unknown",
        );
    });
});
