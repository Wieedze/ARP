import {describe, expect, it} from "vitest";
import type {Address} from "viem";

import {deployments} from "../../lib/deployments";
import {findAgentIdByOwner} from "../agent-identity";

import {DEFAULT_TEST_ADDRESS, makeMockPublicClient} from "./fixtures";

const REGISTRY = deployments.arp.identityRegistry;

describe("findAgentIdByOwner", () => {
    it("returns null when the owner has no Registered events", async () => {
        const pc = makeMockPublicClient();
        pc.getLogs.mockResolvedValue([]);

        const result = await findAgentIdByOwner({
            owner: DEFAULT_TEST_ADDRESS,
            publicClient: pc,
        });

        expect(result).toBeNull();
        const call = pc.getLogs.mock.calls[0][0] as {
            address: string;
            fromBlock: bigint | string;
            toBlock: bigint | string;
            args: {to: Address};
        };
        expect(call.address).toBe(REGISTRY);
        expect(call.fromBlock).toBe(0n);
        expect(call.toBlock).toBe("latest");
        expect(call.args.to).toBe(DEFAULT_TEST_ADDRESS);
    });

    it("returns the last agentId when multiple registrations are found", async () => {
        const pc = makeMockPublicClient();
        pc.getLogs.mockResolvedValue([
            {args: {agentId: 3n, to: DEFAULT_TEST_ADDRESS, agentURI: ""}},
            {args: {agentId: 11n, to: DEFAULT_TEST_ADDRESS, agentURI: ""}},
            {args: {agentId: 42n, to: DEFAULT_TEST_ADDRESS, agentURI: ""}},
        ]);

        const result = await findAgentIdByOwner({
            owner: DEFAULT_TEST_ADDRESS,
            publicClient: pc,
        });
        expect(result).toBe(42n);
    });
});
