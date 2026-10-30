import {decodeFunctionData, parseEther} from "viem";
import type {Hex} from "viem";
import {describe, expect, it} from "vitest";

import {multiVaultDeclareAbi} from "../src/declare/index.js";
import {prepareRate} from "../src/declare/rate.js";
import {USES} from "../src/sources/intuition/terms.js";
import {fakeReads, idFor, SUBJECT} from "./helpers.js";

/** A hired agent's identity atom — already on the graph, reached through `same as`. */
const AGENT_ATOM = "0xbbb0000000000000000000000000000000000000000000000000000000000002" as Hex;

/** What `fakeReads.tripleId` returns for an object it did not itself derive. */
const EDGE = idFor("7319", AGENT_ATOM);

describe("prepareRate", () => {
    it("declares (hirer, uses, agent) against the atom the agent already has", async () => {
        const reads = fakeReads({existing: new Set([AGENT_ATOM.toLowerCase()])});
        const plan = await prepareRate({hirer: SUBJECT, agentAtom: AGENT_ATOM, reads});

        expect(plan.tripleId).toBe(EDGE);
        expect(plan.alreadyDeclared).toBe(false);
        expect(plan.declare.tools).toHaveLength(1);
        expect(plan.declare.tools[0]?.atomId).toBe(AGENT_ATOM);
        expect(plan.declare.tools[0]?.atomSource).toBe("given-atom");
    });

    /**
     * The reason this function exists rather than reusing the tool path. A hired agent already has
     * an atom; deriving a second from some URL would give it two reputations that never merge,
     * which is the fragmentation ADR `0054` exists to prevent.
     */
    it("creates the edge and never the agent's atom", async () => {
        const reads = fakeReads({existing: new Set([AGENT_ATOM.toLowerCase()])});
        const plan = await prepareRate({hirer: SUBJECT, agentAtom: AGENT_ATOM, reads});

        expect(plan.declare.calls.map((call) => call.kind)).toEqual(["create-triple"]);
        expect(plan.declare.calls.some((call) => call.kind === "create-atom")).toBe(false);
    });

    it("raises rather than minting an identity on the agent's behalf", async () => {
        const reads = fakeReads({existing: new Set()});
        await expect(
            prepareRate({hirer: SUBJECT, agentAtom: AGENT_ATOM, reads}),
        ).rejects.toThrow(/does not exist on chain .*will not create one/s);
    });

    /**
     * `docs/tasks/25`: **do not invent an agent-rating predicate.** `docs/tasks/09` records what happened the
     * last time ARP minted its own — a node its own connector could not read (ADR `0030`).
     */
    it("uses the `uses` predicate, unchanged", async () => {
        const reads = fakeReads({existing: new Set([AGENT_ATOM.toLowerCase()])});
        const plan = await prepareRate({hirer: SUBJECT, agentAtom: AGENT_ATOM, reads});
        expect(plan.declare.predicate).toBe(USES);

        const call = plan.declare.calls.find((c) => c.kind === "create-triple");
        const decoded = decodeFunctionData({abi: multiVaultDeclareAbi, data: call?.data ?? "0x"});
        expect(decoded.functionName).toBe("createTriples");
        const [subjects, predicates, objects] = decoded.args as readonly Hex[][];
        expect(subjects[0]).toBe(SUBJECT);
        expect(predicates[0]).toBe(USES);
        expect(objects[0]).toBe(AGENT_ATOM);
    });

    it("reports an edge already on chain and plans nothing for it", async () => {
        const reads = fakeReads({
            existing: new Set([AGENT_ATOM.toLowerCase(), EDGE.toLowerCase()]),
        });
        const plan = await prepareRate({hirer: SUBJECT, agentAtom: AGENT_ATOM, reads});

        expect(plan.alreadyDeclared).toBe(true);
        expect(plan.declare.calls).toHaveLength(0);
        expect(plan.declare.existingTerms).toContain(EDGE);
    });

    /**
     * The edge is born with a position (ADR `0053`), so a rating that stops at the declaration is
     * already a staked claim. The amount is that position, not an extra transaction.
     */
    it("puts the rating amount behind the edge in the same call", async () => {
        const reads = fakeReads({
            existing: new Set([AGENT_ATOM.toLowerCase()]),
            tripleCost: parseEther("0.1"),
        });
        const amount = parseEther("0.5");
        const plan = await prepareRate({hirer: SUBJECT, agentAtom: AGENT_ATOM, reads, amount});

        const call = plan.declare.calls.find((c) => c.kind === "create-triple");
        expect(call?.value).toBe(parseEther("0.6"));
        expect(plan.declare.totalValue).toBe(parseEther("0.6"));
        expect(call?.preview?.shares).toBeGreaterThan(0n);
    });

    it("defaults the position to the chain's minDeposit rather than to a number of ours", async () => {
        const minDeposit = parseEther("0.01");
        const reads = fakeReads({
            existing: new Set([AGENT_ATOM.toLowerCase()]),
            tripleCost: parseEther("0.1"),
            minDeposit,
        });
        const plan = await prepareRate({hirer: SUBJECT, agentAtom: AGENT_ATOM, reads});
        expect(plan.declare.calls[0]?.value).toBe(parseEther("0.11"));
        expect(reads.reads).toContain("getGeneralConfig");
    });
});
