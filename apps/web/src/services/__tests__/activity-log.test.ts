import {describe, expect, it, vi} from "vitest";

import {ActivityLog} from "../activity-log";

const tick = () => {
    let t = 1_000;
    return () => (t += 1_000);
};

describe("ActivityLog", () => {
    it("keeps entries oldest first and stamps them with the clock it was given", () => {
        // The clock is injected because a store that reads `Date.now()` cannot be asserted on, and
        // `trust-format.ts` already set that convention for anything time-dependent here.
        const log = new ActivityLog({now: tick()});
        log.append({stream: "mine", step: "discovery", label: "découverte"});
        log.append({stream: "mine", step: "access", label: "accès"});
        expect(log.all().map((e) => [e.id, e.at, e.label])).toEqual([
            [1, 2_000, "découverte"],
            [2, 3_000, "accès"],
        ]);
    });

    it("hands out a new array on append, because the panel compares by reference", () => {
        // `useSyncExternalStore` re-renders on identity change. Pushing in place would leave the
        // panel showing the previous render's list, which is the classic version of this bug.
        const log = new ActivityLog({now: tick()});
        const before = log.all();
        log.append({stream: "mine", step: "access", label: "accès"});
        expect(log.all()).not.toBe(before);
    });

    it("drops the oldest past its capacity rather than growing without limit", () => {
        const log = new ActivityLog({capacity: 3, now: tick()});
        for (let i = 1; i <= 5; i += 1) {
            log.append({stream: "chain", step: "landed", label: `w${i}`});
        }
        expect(log.all().map((e) => e.label)).toEqual(["w3", "w4", "w5"]);
    });

    it("separates the two streams, because they are not the same evidence", () => {
        // Only `mine` can carry the receipt and the invocation: the chain holds the declaration and
        // nothing about how it was arrived at. The panel renders them at different weights.
        const log = new ActivityLog({now: tick()});
        log.append({stream: "mine", step: "receipt", label: "reçu"});
        log.append({stream: "chain", step: "landed", label: "uses"});
        expect(log.of("mine").map((e) => e.label)).toEqual(["reçu"]);
        expect(log.of("chain").map((e) => e.label)).toEqual(["uses"]);
    });

    it("knows an event it already recorded, whatever its case", () => {
        // The chain poller re-reads an overlapping window every tick, so without this it appends
        // the same write for ever. Keyed on whatever the producer can always recognise — a triple
        // id from the indexer, whose transaction hash can be null — and case-folded because both
        // spellings occur.
        const log = new ActivityLog({now: tick()});
        const key = `0x${"ab".repeat(32)}`;
        log.append({stream: "chain", step: "landed", label: "uses", key});
        expect(log.has(key)).toBe(true);
        expect(log.has(key.toUpperCase().replace("0X", "0x"))).toBe(true);
        expect(log.has(`0x${"cd".repeat(32)}`)).toBe(false);
    });

    it("does not confuse a display hash with a dedupe key", () => {
        // `tx` is what the panel prints; `key` is what makes two reads the same event. Keying on
        // `tx` would have left the chain stream with nothing to dedupe on.
        const log = new ActivityLog({now: tick()});
        log.append({
            stream: "mine",
            step: "confirmed",
            label: "confirmé",
            tx: `0x${"ef".repeat(32)}`,
        });
        expect(log.has(`0x${"ef".repeat(32)}`)).toBe(false);
    });

    it("notifies a subscriber on append and stops after it unsubscribes", () => {
        const log = new ActivityLog({now: tick()});
        const seen = vi.fn();
        const off = log.subscribe(seen);
        log.append({stream: "mine", step: "access", label: "accès"});
        expect(seen).toHaveBeenCalledTimes(1);
        off();
        log.append({stream: "mine", step: "access", label: "encore"});
        expect(seen).toHaveBeenCalledTimes(1);
    });

    it("does not notify when clearing an already empty log", () => {
        // A no-op that still emits would re-render the panel on every mount.
        const log = new ActivityLog({now: tick()});
        const seen = vi.fn();
        log.subscribe(seen);
        log.clear();
        expect(seen).not.toHaveBeenCalled();
    });

    it("keeps a cost as a decimal string, never a number", () => {
        // Any real TRUST figure loses precision as a double. `0.002000000002` is what a triple
        // actually costs on 13579 and it does not survive the round trip.
        const log = new ActivityLog({now: tick()});
        const entry = log.append({
            stream: "mine",
            step: "declaration",
            label: "déclaration",
            costWei: "2000000002000000",
        });
        expect(entry.costWei).toBe("2000000002000000");
    });

    it("lets a producer pass the time it already knew", () => {
        // A chain write has a block timestamp, and stamping it with the browser's clock would put
        // somebody else's write in the wrong place in the order.
        const log = new ActivityLog({now: tick()});
        const entry = log.append({stream: "chain", step: "landed", label: "uses", at: 42});
        expect(entry.at).toBe(42);
    });
});
