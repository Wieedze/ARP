import {createExecution, ExecutionMode} from "@metamask/smart-accounts-kit";
import {decodeAbiParameters, decodeFunctionData, parseEther} from "viem";
import type {Address, Hex} from "viem";
import {describe, expect, it} from "vitest";

import {toDelegatedCalls, type DelegationLike} from "../src/declare/index.js";
import type {PreparedCall} from "../src/declare/types.js";

const MULTI_VAULT = "0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e" as Address;
const DELEGATION_MANAGER = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as Address;

/**
 * `redeemDelegations` as the Delegation Framework declares it, for decoding only.
 *
 * The test decodes with its own copy so it checks the kit's output rather than its own input —
 * asserting `encode()` against `encode()` would pass whatever the kit did.
 */
const redeemAbi = [
    {
        type: "function",
        name: "redeemDelegations",
        inputs: [
            {name: "_permissionContexts", type: "bytes[]"},
            {name: "_modes", type: "bytes32[]"},
            {name: "_executionCallDatas", type: "bytes[]"},
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
] as const;

const delegation = (delegator: Address): DelegationLike => ({
    delegate: "0x2222222222222222222222222222222222222222" as Address,
    delegator,
    authority: `0x${"ff".repeat(32)}` as Hex,
    caveats: [],
    salt: 1n,
    signature: "0xdeadbeef" as Hex,
});

const innerCall = (value: bigint): PreparedCall => ({
    kind: "deposit",
    chainId: 1155,
    to: MULTI_VAULT,
    value,
    data: "0xabcdef01" as Hex,
    why: "stake behind the claim 0x1234",
});

describe("toDelegatedCalls", () => {
    it("targets the DelegationManager and sends nothing from the redeemer", async () => {
        const plan = await toDelegatedCalls({
            calls: [innerCall(parseEther("0.5"))],
            delegations: delegation("0x3333333333333333333333333333333333333333" as Address),
            delegationManager: DELEGATION_MANAGER,
        });

        expect(plan.calls).toHaveLength(1);
        expect(plan.calls[0]?.to).toBe(DELEGATION_MANAGER);
        // A redemption executes from the DELEGATOR's balance. A redeemer sending value here would
        // be paying twice, from the wrong account.
        expect(plan.calls[0]?.value).toBe(0n);
        expect(plan.delegatorValue).toBe(parseEther("0.5"));
    });

    it("keeps the inner execution intact — target, value and calldata", async () => {
        const inner = innerCall(parseEther("0.25"));
        const plan = await toDelegatedCalls({
            calls: [inner],
            delegations: delegation("0x3333333333333333333333333333333333333333" as Address),
            delegationManager: DELEGATION_MANAGER,
        });

        const {functionName, args} = decodeFunctionData({
            abi: redeemAbi,
            data: plan.calls[0]!.data,
        });
        expect(functionName).toBe("redeemDelegations");
        const [contexts, modes, executionCallDatas] = args as [Hex[], Hex[], Hex[]];
        expect(contexts).toHaveLength(1);
        expect(executionCallDatas).toHaveLength(1);

        // SingleDefault execution calldata is the packed (target, value, calldata) triple.
        const encoded = executionCallDatas[0]!;
        expect(encoded.toLowerCase()).toContain(MULTI_VAULT.slice(2).toLowerCase());
        expect(encoded.toLowerCase().endsWith(inner.data.slice(2).toLowerCase())).toBe(true);
        expect(modes[0]).toBe(ExecutionMode.SingleDefault);
    });

    it("puts the real amount where the cap enforcer reads it, not the outer zero", async () => {
        const inner = innerCall(parseEther("0.25"));
        const plan = await toDelegatedCalls({
            calls: [inner],
            delegations: delegation("0x3333333333333333333333333333333333333333" as Address),
            delegationManager: DELEGATION_MANAGER,
        });

        const [, , executions] = decodeFunctionData({abi: redeemAbi, data: plan.calls[0]!.data})
            .args as [Hex[], Hex[], Hex[]];

        // `TrustStakeCapEnforcer.beforeHook` caps native `value` decoded out of the EXECUTION —
        // `ExecutionLib.decodeSingle(_executionCallData)` at
        // contracts/src/enforcers/TrustStakeCapEnforcer.sol:101, and its NatSpec says "Only
        // `value` is consumed". So the outer call's `value: 0n` does not slip past the cap: what
        // the enforcer sees is this number. ADR 0040 — the claim that fees escaped the cap was
        // wrong, and this is the assertion that keeps it wrong in the right direction.
        const packed = executions[0]!.slice(2);
        const target = `0x${packed.slice(0, 40)}`;
        const value = BigInt(`0x${packed.slice(40, 104)}`);
        expect(target.toLowerCase()).toBe(MULTI_VAULT.toLowerCase());
        expect(value).toBe(parseEther("0.25"));
        expect(plan.calls[0]?.value).toBe(0n);
    });

    it("never batches, because ARP's own cap enforcer rejects batch modes", async () => {
        const plan = await toDelegatedCalls({
            calls: [innerCall(1n), innerCall(2n), innerCall(3n)],
            delegations: delegation("0x3333333333333333333333333333333333333333" as Address),
            delegationManager: DELEGATION_MANAGER,
        });

        // contracts/src/enforcers/TrustStakeCapEnforcer.sol:95-96 guards beforeHook with
        // onlySingleCallTypeMode and onlyDefaultExecutionMode. One redemption per call.
        expect(plan.calls).toHaveLength(3);
        for (const call of plan.calls) {
            const [, modes, executions] = decodeFunctionData({abi: redeemAbi, data: call.data})
                .args as [Hex[], Hex[], Hex[]];
            expect(modes).toEqual([ExecutionMode.SingleDefault]);
            expect(executions).toHaveLength(1);
        }
        expect(plan.delegatorValue).toBe(6n);
    });

    it("passes a delegation chain through in the order the framework validates it", async () => {
        const leaf = delegation("0x4444444444444444444444444444444444444444" as Address);
        const root = delegation("0x5555555555555555555555555555555555555555" as Address);
        const plan = await toDelegatedCalls({
            calls: [innerCall(1n)],
            delegations: [leaf, root],
            delegationManager: DELEGATION_MANAGER,
        });

        const [contexts] = decodeFunctionData({abi: redeemAbi, data: plan.calls[0]!.data}).args as [
            Hex[],
            Hex[],
            Hex[],
        ];
        const decoded = decodeAbiParameters(
            [
                {
                    type: "tuple[]",
                    components: [
                        {name: "delegate", type: "address"},
                        {name: "delegator", type: "address"},
                        {name: "authority", type: "bytes32"},
                        {
                            name: "caveats",
                            type: "tuple[]",
                            components: [
                                {name: "enforcer", type: "address"},
                                {name: "terms", type: "bytes"},
                                {name: "args", type: "bytes"},
                            ],
                        },
                        {name: "salt", type: "uint256"},
                        {name: "signature", type: "bytes"},
                    ],
                },
            ],
            contexts[0]!,
        );
        const chain = decoded[0] as readonly {delegator: Address}[];
        expect(chain.map((d) => d.delegator.toLowerCase())).toEqual([
            leaf.delegator.toLowerCase(),
            root.delegator.toLowerCase(),
        ]);
    });

    it("carries the reason forward, naming where the TRUST comes from", async () => {
        const plan = await toDelegatedCalls({
            calls: [innerCall(1n)],
            delegations: delegation("0x3333333333333333333333333333333333333333" as Address),
            delegationManager: DELEGATION_MANAGER,
        });
        expect(plan.calls[0]?.why).toContain("stake behind the claim");
        expect(plan.calls[0]?.why).toContain("delegation");
    });

    it("produces calldata a direct-mode plan does not — the two modes are not interchangeable", async () => {
        const inner = innerCall(parseEther("0.5"));
        const plan = await toDelegatedCalls({
            calls: [inner],
            delegations: delegation("0x3333333333333333333333333333333333333333" as Address),
            delegationManager: DELEGATION_MANAGER,
        });
        expect(plan.calls[0]?.data).not.toBe(inner.data);
        expect(plan.calls[0]?.to).not.toBe(inner.to);
        // And the execution the kit built from the inner call is the one being redeemed.
        const execution = createExecution({
            target: inner.to,
            value: inner.value,
            callData: inner.data,
        });
        expect(execution.target).toBe(inner.to);
        expect(execution.value).toBe(inner.value);
    });
});
