import {keccak256, parseEther, stringToHex, type Hex} from "viem";
import {describe, expect, it} from "vitest";

import {canonicalCaipThing, thingUri} from "../src/declare/agent-atom.js";
import {
    AgentAtomMismatchError,
    IdentityTermHasNoPositionError,
    MissingAgentAtomError,
    prepareEndpointBinding,
    type MultiVaultReads,
} from "../src/declare/index.js";
import {atomDataForUri} from "../src/declare/multivault.js";
import type {EndpointBinding} from "../src/handshake.js";
import {SAME_AS} from "../src/sources/intuition/terms.js";

const MULTI_VAULT = "0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91" as const;
const AGENT_ATOM = `0x${"aa".repeat(32)}` as Hex;
const HAS_ENDPOINT = `0x${"e1".repeat(32)}` as Hex;
const IN_CONTEXT_OF = `0x${"c1".repeat(32)}` as Hex;
const ENDPOINT = "https://quiet-lake.trycloudflare.com";
const DOCUMENT = "ipfs://bafkreiexampleexampleexampleexampleexampleexampleexampleexample";
const REGISTRY = "0xC165A2AD2E540A4069E02834009161E2b4490d5A";

/** The plan checks no signature: it is handed a binding the verifier already returned. */
const BINDING: EndpointBinding = {
    version: 1,
    agentRegistry: `eip155:13579:${REGISTRY}`,
    agentId: "7",
    owner: "0x1111111111111111111111111111111111111111",
    nodeAddress: "0x2222222222222222222222222222222222222222",
    nodePublicKey: `0x04${"33".repeat(64)}`,
    endpoint: ENDPOINT,
    message: "signed",
    ownerSignature: "0x01",
    nodeSignature: "0x02",
};

const tripleOf = (s: Hex, p: Hex, o: Hex) => keccak256(`${s}${p.slice(2)}${o.slice(2)}` as Hex);
/** `(AGENT_ATOM, same as, caip19 atom of agent 7)`, the edge the plan requires. */
const SAME_AS_TRIPLE = tripleOf(
    AGENT_ATOM,
    SAME_AS,
    keccak256(atomDataForUri(thingUri(canonicalCaipThing(`eip155:13579/erc721:${REGISTRY}/7`)))),
);

const atomCost = parseEther("0.001000000001");
const tripleCost = parseEther("0.001000000002");

/** Ids are hashes of what they are made of, so the test can tell which term a call names. */
function fakeReads(
    state: {existing?: Hex[]; agentExists?: boolean; sameAs?: boolean; feeAll?: boolean} = {},
): MultiVaultReads {
    const exists = new Set(state.existing ?? []);
    const unreachable = (name: string) => async (): Promise<never> => {
        throw new Error(`${name} is not reachable from a binding plan`);
    };
    const afterFees = (left: bigint) => {
        const shares = state.feeAll === true || left <= 0n ? 0n : left;
        return {shares, assetsAfterFixedFees: left, assetsAfterFees: shares};
    };
    return {
        address: MULTI_VAULT,
        chainId: 13579,
        async atomId(data: Hex) {
            return keccak256(data);
        },
        async tripleId(s: Hex, p: Hex, o: Hex) {
            return tripleOf(s, p, o);
        },
        async termExists(id: Hex) {
            if (id === AGENT_ATOM) return state.agentExists !== false;
            if (id === SAME_AS_TRIPLE) return state.sameAs !== false;
            return exists.has(id);
        },
        async atomCost() {
            return atomCost;
        },
        async tripleCost() {
            return tripleCost;
        },
        async minDeposit() {
            return parseEther("0.001");
        },
        async previewAtomCreate(_id: Hex, assets: bigint) {
            return afterFees(assets - atomCost);
        },
        async previewTripleCreate(_id: Hex, assets: bigint) {
            return afterFees(assets - tripleCost);
        },
        defaultCurveId: unreachable("defaultCurveId"),
        counterTripleId: unreachable("counterTripleId"),
        sharesOf: unreachable("sharesOf"),
        previewRedeem: unreachable("previewRedeem"),
        previewDeposit: unreachable("previewDeposit"),
    };
}

const params = (
    reads: MultiVaultReads,
    extra: {birthDeposit?: bigint; binding?: EndpointBinding} = {},
) => ({
    reads,
    agentAtom: AGENT_ATOM,
    binding: BINDING,
    documentUri: DOCUMENT,
    predicates: {hasEndpoint: HAS_ENDPOINT, inContextOf: IN_CONTEXT_OF},
    ...extra,
});

const hexOf = (value: string) => value.slice(2).toLowerCase();

describe("prepareEndpointBinding", () => {
    it("writes two atoms, the binding triple, then the proof attached to it, each with a position", async () => {
        const plan = await prepareEndpointBinding(params(fakeReads()));
        expect(plan.calls.map((call) => call.kind)).toEqual([
            "create-atom",
            "create-atom",
            "create-triple",
            "create-triple",
        ]);
        expect(plan.endpointAtom).toBe(keccak256(atomDataForUri(ENDPOINT)));
        expect(plan.calls[0]?.data.toLowerCase()).toContain(hexOf(stringToHex(ENDPOINT)));
        const [, , binding, context] = plan.calls;
        for (const term of [AGENT_ATOM, HAS_ENDPOINT, plan.endpointAtom]) {
            expect(binding?.data.toLowerCase()).toContain(hexOf(term));
        }
        for (const term of [plan.documentAtom, IN_CONTEXT_OF, plan.bindingTriple]) {
            expect(context?.data.toLowerCase()).toContain(hexOf(term));
        }
        for (const call of plan.calls) {
            expect(call.chainId).toBe(13579);
            expect(call.to).toBe(MULTI_VAULT);
            expect(call.preview?.shares).toBe(parseEther("0.001"));
        }
        expect(plan.totalValue).toBe(
            2n * (atomCost + parseEther("0.001")) + 2n * (tripleCost + parseEther("0.001")),
        );
    });

    it("plans nothing when every term exists, and says so", async () => {
        const first = await prepareEndpointBinding(params(fakeReads()));
        const reads = fakeReads({
            existing: [
                first.endpointAtom,
                first.documentAtom,
                first.bindingTriple,
                first.contextTriple,
            ],
        });
        const plan = await prepareEndpointBinding(params(reads));
        expect(plan.calls).toEqual([]);
        expect(plan.totalValue).toBe(0n);
        expect(plan.existing).toEqual({
            endpointAtom: true,
            documentAtom: true,
            bindingTriple: true,
            contextTriple: true,
        });
    });

    it("refuses an agent atom that does not exist", async () => {
        await expect(
            prepareEndpointBinding(params(fakeReads({agentExists: false}))),
        ).rejects.toBeInstanceOf(MissingAgentAtomError);
    });

    it("refuses an agent atom with no `same as` edge to the binding's agent", async () => {
        await expect(
            prepareEndpointBinding(params(fakeReads({sameAs: false}))),
        ).rejects.toBeInstanceOf(AgentAtomMismatchError);
        // Agent 8's binding, planned under agent 7's atom: the edge the plan looks for is 8's.
        await expect(
            prepareEndpointBinding(params(fakeReads(), {binding: {...BINDING, agentId: "8"}})),
        ).rejects.toThrow(`erc721:${REGISTRY}/8`);
    });

    it("refuses a binding whose endpoint or agent id is malformed", async () => {
        await expect(
            prepareEndpointBinding(
                params(fakeReads(), {binding: {...BINDING, endpoint: `${ENDPOINT}/`}}),
            ),
        ).rejects.toThrow("not normalised");
        await expect(
            prepareEndpointBinding(
                params(fakeReads(), {binding: {...BINDING, agentRegistry: "eip155:x"}}),
            ),
        ).rejects.toThrow("names no ERC-8004 agent");
        await expect(
            prepareEndpointBinding(params(fakeReads(), {binding: {...BINDING, agentId: "07"}})),
        ).rejects.toThrow("names no ERC-8004 agent");
    });

    it("refuses a document that is not pinned", async () => {
        await expect(
            prepareEndpointBinding({
                ...params(fakeReads()),
                documentUri: "https://example.com/doc.json",
            }),
        ).rejects.toThrow("must be pinned");
    });

    it("refuses to create a term with no position unless asked to", async () => {
        await expect(
            prepareEndpointBinding(params(fakeReads({feeAll: true}))),
        ).rejects.toBeInstanceOf(IdentityTermHasNoPositionError);
        const plan = await prepareEndpointBinding(
            params(fakeReads({feeAll: true}), {birthDeposit: 0n}),
        );
        expect(plan.calls[0]?.value).toBe(atomCost);
        expect(plan.calls[2]?.value).toBe(tripleCost);
    });
});
