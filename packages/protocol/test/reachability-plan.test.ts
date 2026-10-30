import {describe, expect, it} from "vitest";
import type {Address, Hex} from "viem";

import {planReachability, type ReachabilityState} from "../src/declare/reachability-plan.js";

const MULTI_VAULT = "0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91" as Address;
const ME = "0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f" as Address;
// Real-shaped: `bytes32`, because viem encodes against the ABI and a short hex is rejected there
// rather than in this file. The first draft used `0xaaaa` and five tests failed inside `encodeBytes`.
const TRIPLE = `0x${"aa".repeat(32)}` as Hex;
const COUNTER = `0x${"bb".repeat(32)}` as Hex;
const SUBJECT = `0x${"cc".repeat(32)}` as Hex;
const PREDICATE = `0x${"dd".repeat(32)}` as Hex;
const OBJECT = `0x${"ee".repeat(32)}` as Hex;

const TRIPLE_COST = 1_000_000_000_002n;

const OPTIONS = {
    multiVault: MULTI_VAULT,
    chainId: 13579,
    receiver: ME,
    curveId: 1n,
    stake: 1_000_000_000_000_000n,
    tripleCost: TRIPLE_COST,
    toolLabel: "github.com/stripe/agent-toolkit",
};

function state(
    recorded: ReachabilityState["recorded"],
    shares = 0n,
    exists = true,
): ReachabilityState {
    return {
        terms: {triple: TRIPLE, counter: COUNTER, subject: SUBJECT, predicate: PREDICATE, object: OBJECT, exists},
        recorded,
        shares,
    };
}

describe("planReachability", () => {
    it("plans one deposit on the triple when nothing is recorded and it answers", () => {
        const plan = planReachability(state("none"), ["up"], OPTIONS);
        expect(plan.calls).toHaveLength(1);
        expect(plan.calls[0]?.kind).toBe("deposit");
        expect(plan.calls[0]?.value).toBe(OPTIONS.stake);
        expect(plan.to).toBe("up");
    });

    it("plans nothing when the verdict agrees with the record", () => {
        // The common case, and not a failure. An empty plan has to be legible as "nothing to do".
        const plan = planReachability(state("up", 10n), ["up", "up"], OPTIONS);
        expect(plan.calls).toEqual([]);
        expect(plan.from).toBe("up");
        expect(plan.to).toBe("up");
    });

    it("plans nothing on one down verdict against a recorded up", () => {
        // Slow to condemn: three consecutive, because marking a live tool dead takes an author's
        // visibility away and is our reputation.
        expect(planReachability(state("up", 10n), ["down"], OPTIONS).calls).toEqual([]);
    });

    it("redeems the triple and deposits the counter on three consecutive down verdicts", () => {
        const plan = planReachability(state("up", 777n), ["down", "down", "down"], OPTIONS);
        expect(plan.calls.map((call) => call.kind)).toEqual(["redeem", "deposit"]);
        expect(plan.to).toBe("down");
        // Redeem sends no value. A value here would be spending TRUST to collect TRUST.
        expect(plan.calls[0]?.value).toBe(0n);
        expect(plan.calls[1]?.value).toBe(OPTIONS.stake);
    });

    it("rehabilitates on a single success, redeeming the counter", () => {
        const plan = planReachability(state("down", 42n), ["up", "down", "down"], OPTIONS);
        expect(plan.calls.map((call) => call.kind)).toEqual(["redeem", "deposit"]);
        expect(plan.to).toBe("up");
    });

    it("carries the chain id on every call, not only on the plan", () => {
        // `send-plan.ts` refuses a plan whose calls disagree with its `--chain`, and that guard is
        // what caught an earlier seeder omitting it.
        const plan = planReachability(state("up", 5n), ["down", "down", "down"], OPTIONS);
        for (const call of plan.calls) expect(call.chainId).toBe(13579);
    });

    it("plans no redeem when the recorded side holds nothing", () => {
        // A position redeemed in full leaves its row behind with zero shares, so "recorded" and
        // "holds shares" can disagree. Redeeming zero would revert.
        const plan = planReachability(state("up", 0n), ["down", "down", "down"], OPTIONS);
        expect(plan.calls.map((call) => call.kind)).toEqual(["deposit"]);
    });

    it("says why it is doing nothing, so an empty plan is not mistaken for a failure", () => {
        const plan = planReachability(state("up", 10n), ["no-verdict"], OPTIONS);
        expect(plan.calls).toEqual([]);
        expect(plan.why).toContain("nothing is claimed");
    });
});

describe("planReachability, when the claim is not on chain yet", () => {
    it("writes the triple before depositing on it", () => {
        // The defect the first `maintained` run hit on testnet 13579: 53 deposits planned onto 53
        // triples none of which existed, and the chain refused the first. `reachable` never saw it
        // because the domain seeding had already written those triples.
        const plan = planReachability(state("none", 0n, false), ["up"], OPTIONS);
        expect(plan.calls).toHaveLength(2);
        expect(plan.calls[0]?.kind).toBe("create-triple");
        expect(plan.calls[1]?.kind).toBe("deposit");
    });

    it("pays exactly the fee to create, so the creation mints no shares", () => {
        // A `down` verdict puts the position on the counter. Creating with `cost + stake` would
        // put it on the triple instead — the opposite of what was decided.
        const plan = planReachability(state("none", 0n, false), ["down"], {...OPTIONS, condemnAfter: 1});
        expect(plan.calls[0]?.value).toBe(TRIPLE_COST);
        expect(plan.calls[1]?.kind).toBe("deposit");
        expect(plan.calls[1]?.value).toBe(OPTIONS.stake);
    });

    it("writes nothing at all when the verdict changes nothing", () => {
        // An absent triple is not itself a reason to spend: with no verdict there is no claim to
        // write, and creating the term anyway would pay a fee to say nothing.
        const plan = planReachability(state("none", 0n, false), ["no-verdict"], OPTIONS);
        expect(plan.calls).toEqual([]);
    });

    it("does not re-create a triple that exists", () => {
        const plan = planReachability(state("none", 0n, true), ["up"], OPTIONS);
        expect(plan.calls).toHaveLength(1);
        expect(plan.calls[0]?.kind).toBe("deposit");
    });
});
