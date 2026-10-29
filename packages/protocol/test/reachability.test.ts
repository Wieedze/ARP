import {describe, expect, it} from "vitest";

import {
    DOWN_VERDICTS_TO_CONDEMN,
    decideTransition,
    flipCost,
    verdictOf,
    type Verdict,
} from "../src/reachability.js";
import type {ProbeOutcome} from "../src/verify/types.js";

/** A confirmed outcome with the given code. The other fields are what `probe.ts` fills. */
function confirmed(code: "live" | "dead" | "serves-declared-protocol" | "declared-protocol-not-served") {
    return {
        status: "confirmed",
        code,
        httpStatus: 200,
        request: {method: "GET", url: "https://x/", headers: {}, body: null},
        detail: "",
    } as unknown as ProbeOutcome;
}

describe("verdictOf", () => {
    it("reads a verdict only from a confirmed outcome", () => {
        expect(verdictOf(confirmed("live"))).toBe("up");
        expect(verdictOf(confirmed("serves-declared-protocol"))).toBe("up");
        expect(verdictOf(confirmed("dead"))).toBe("down");
        expect(verdictOf(confirmed("declared-protocol-not-served"))).toBe("down");
    });

    it("treats a transport failure and a rate limit as no verdict at all", () => {
        // The asymmetry `probe.ts` documents: a timeout is an answer about the agent, a TLS or DNS
        // failure could equally be us, and a 429 is the host asking us to stop. None of the three
        // may move what ARP asserts.
        expect(verdictOf({status: "inconclusive", detail: "TLS"} as unknown as ProbeOutcome)).toBe(
            "no-verdict",
        );
        expect(verdictOf({status: "not-checkable", code: "no-endpoint"} as unknown as ProbeOutcome)).toBe(
            "no-verdict",
        );
    });
});

describe("decideTransition", () => {
    it("records the first verdict when nothing is recorded", () => {
        const move = decideTransition("none", ["up"]);
        expect(move.change).toBe(true);
        if (move.change) expect(move.to).toBe("up");
    });

    it("does nothing when the verdict agrees with the record", () => {
        expect(decideTransition("up", ["up", "up"]).change).toBe(false);
        expect(decideTransition("down", ["down"]).change).toBe(false);
    });

    it("needs three consecutive down verdicts to condemn", () => {
        expect(decideTransition("up", ["down"]).change).toBe(false);
        expect(decideTransition("up", ["down", "down"]).change).toBe(false);
        const move = decideTransition("up", ["down", "down", "down"]);
        expect(move.change).toBe(true);
        if (move.change) expect(move.to).toBe("down");
    });

    it("rehabilitates on a single success", () => {
        // Asymmetric on purpose: marking a live tool dead costs the author its visibility and costs
        // us our reputation; marking a dead tool live costs an agent one session.
        const move = decideTransition("down", ["up", "down", "down", "down", "down"]);
        expect(move.change).toBe(true);
        if (move.change) expect(move.to).toBe("up");
    });

    it("skips non-verdicts instead of counting them as agreement", () => {
        // An endpoint behind a rate limiter would otherwise drift toward whatever it was recorded
        // as last — the opposite of what a 429 tells us.
        const history: Verdict[] = ["no-verdict", "down", "no-verdict", "down", "down"];
        const move = decideTransition("up", history);
        expect(move.change).toBe(true);
        if (move.change) expect(move.to).toBe("down");
    });

    it("a down streak broken by an up does not condemn", () => {
        const move = decideTransition("up", ["down", "down", "up", "down", "down"]);
        expect(move.change).toBe(false);
        expect(move.change === false && move.why).toContain(`2 of ${DOWN_VERDICTS_TO_CONDEMN}`);
    });

    it("claims nothing when the history holds no verdict", () => {
        const move = decideTransition("up", ["no-verdict", "no-verdict"]);
        expect(move.change).toBe(false);
        expect(move.change === false && move.why).toContain("nothing is claimed");
    });
});

describe("flipCost", () => {
    it("charges no redeem when nothing is held yet", () => {
        expect(flipCost("none", 1_000n)).toEqual({redeem: 0n, deposit: 1_000n});
    });

    it("charges a redeem and a deposit to move sides", () => {
        expect(flipCost("up", 1_000n)).toEqual({redeem: 1_000n, deposit: 1_000n});
    });
});

describe("decideTransition, first-hand", () => {
    it("condemns on one down verdict when the caller says so", () => {
        // The agent's policy, not the prober's. An agent that called an endpoint and got nothing is
        // reporting what happened to it; asking it for three confirmations asks it to doubt its own
        // experience. The prober's three exists because condemning takes an author's visibility.
        const move = decideTransition("up", ["down"], {condemnAfter: 1});
        expect(move.change).toBe(true);
        if (move.change) expect(move.to).toBe("down");
    });

    it("never accepts a threshold below one", () => {
        // Zero would condemn on a history with no down verdict in it at all.
        const move = decideTransition("up", ["up"], {condemnAfter: 0});
        expect(move.change).toBe(false);
    });

    it("still refuses to move on a non-verdict, whatever the threshold", () => {
        const move = decideTransition("up", ["no-verdict"], {condemnAfter: 1});
        expect(move.change).toBe(false);
    });
});
