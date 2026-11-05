import {describe, expect, it} from "vitest";

import {parseLocalFailures, yourFailures} from "../src/local-failures.js";

const line = (over: Record<string, unknown> = {}) =>
    JSON.stringify({at: "2026-11-05T10:00:00Z", session: "s", skill: "clip", source: "a/b", reason: "missing-key", ...over});

describe("parseLocalFailures", () => {
    it("keeps the fields a reader needs and skips what it cannot read", () => {
        const rows = parseLocalFailures([line(), "{half", line({reason: "because I say so"}), line({skill: 3}), ""].join("\n"));
        expect(rows).toEqual([{at: "2026-11-05T10:00:00Z", skill: "clip", source: "a/b", reason: "missing-key"}]);
    });
});

describe("yourFailures", () => {
    it("is null for a skill this machine never failed on", () => {
        expect(yourFailures(parseLocalFailures(line()), "other", "a/b")).toBeNull();
    });

    it("counts sessions by reason and gives the latest date", () => {
        const rows = parseLocalFailures([line(), line({reason: "missing-file", at: "2026-11-05T12:00:00Z"}), line()].join("\n"));
        expect(yourFailures(rows, "clip", "a/b")).toEqual({
            reasons: {"missing-key": 2, "missing-file": 1},
            last: "2026-11-05T12:00:00Z",
            byNameOnly: false,
        });
    });

    it("does not count another repository's skill of the same name", () => {
        expect(yourFailures(parseLocalFailures(line({source: "x/y"})), "clip", "a/b")).toBeNull();
    });

    it("says when a line named no source, and reads a plugin's name", () => {
        const found = yourFailures(parseLocalFailures(line({source: null, skill: "tools:clip"})), "clip", "a/b");
        expect(found?.byNameOnly).toBe(true);
    });
});
