import {describe, expect, it} from "vitest";

import {
    canonicalBytesRfc8785,
    canonicalizeRfc8785,
    CanonicalizationError,
} from "../src/canonicalize.js";

const cp = (code: number): string => String.fromCodePoint(code);

describe("canonicalizeRfc8785 — number serialisation (RFC 8785 Appendix B)", () => {
    // Every pair below is an ES6 Number::toString result the RFC publishes as a
    // vector. They are the cases that silently break a signature check: an
    // implementation that formats 1e+23 as 100000000000000000000000 hashes
    // different bytes than the signer did and reports a false mismatch.
    const vectors: [number, string][] = [
        [0, "0"],
        [-0, "0"],
        [Number.MIN_VALUE, "5e-324"],
        [-Number.MIN_VALUE, "-5e-324"],
        [Number.MAX_VALUE, "1.7976931348623157e+308"],
        [-Number.MAX_VALUE, "-1.7976931348623157e+308"],
        [9007199254740992, "9007199254740992"],
        [-9007199254740992, "-9007199254740992"],
        [295147905179352830000, "295147905179352830000"],
        [9.999999999999997e22, "9.999999999999997e+22"],
        [1e23, "1e+23"],
        [1.0000000000000001e23, "1.0000000000000001e+23"],
        [999999999999999700000, "999999999999999700000"],
        [999999999999999900000, "999999999999999900000"],
        [1e21, "1e+21"],
        [0.000001, "0.000001"],
        [9.999999999999997e-7, "9.999999999999997e-7"],
        [1e-7, "1e-7"],
        [333333333.3333333, "333333333.3333333"],
    ];

    for (const [value, expected] of vectors) {
        it(`serialises ${expected}`, () => {
            expect(canonicalizeRfc8785(value)).toBe(expected);
        });
    }

    it("rejects non-finite numbers", () => {
        expect(() => canonicalizeRfc8785(Number.NaN)).toThrow(CanonicalizationError);
        expect(() => canonicalizeRfc8785(Number.POSITIVE_INFINITY)).toThrow(CanonicalizationError);
    });
});

describe("canonicalizeRfc8785 — string escaping (RFC 8785 section 3.2.2.2)", () => {
    it("uses the minimal escape set and lowercase hex for other control characters", () => {
        const input = [0x00, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1f, 0x22, 0x5c].map(cp).join("");
        const expected = [
            '"',
            "\\u0000",
            "\\b",
            "\\t",
            "\\n",
            "\\u000b",
            "\\f",
            "\\r",
            "\\u001f",
            '\\"',
            "\\\\",
            '"',
        ].join("");
        expect(canonicalizeRfc8785(input)).toBe(expected);
    });

    it("leaves non-ASCII characters unescaped", () => {
        expect(canonicalizeRfc8785(cp(0x20ac))).toBe(`"${cp(0x20ac)}"`);
        expect(canonicalizeRfc8785(cp(0x1f600))).toBe(`"${cp(0x1f600)}"`);
    });
});

describe("canonicalizeRfc8785 — property ordering (RFC 8785 section 3.2.3)", () => {
    it("sorts keys by UTF-16 code unit, not by code point", () => {
        const input: Record<string, string> = {
            [cp(0x20ac)]: "Euro Sign",
            [cp(0x000d)]: "Carriage Return",
            [cp(0xfb33)]: "Hebrew Letter Dalet With Dagesh",
            "1": "One",
            [cp(0x1f600)]: "Emoji: Grinning Face",
            [cp(0x0080)]: "Control",
            [cp(0x00f6)]: "Latin Small Letter O With Diaeresis",
        };
        const expected = [
            "{",
            '"\\r":"Carriage Return",',
            '"1":"One",',
            `"${cp(0x0080)}":"Control",`,
            `"${cp(0x00f6)}":"Latin Small Letter O With Diaeresis",`,
            `"${cp(0x20ac)}":"Euro Sign",`,
            `"${cp(0x1f600)}":"Emoji: Grinning Face",`,
            `"${cp(0xfb33)}":"Hebrew Letter Dalet With Dagesh"`,
            "}",
        ].join("");
        expect(canonicalizeRfc8785(input)).toBe(expected);
    });

    it("places the surrogate-pair key before U+FB33 — the case that separates UTF-16 from UTF-8 ordering", () => {
        const output = canonicalizeRfc8785({[cp(0xfb33)]: 1, [cp(0x1f600)]: 2});
        expect(output.indexOf(cp(0x1f600))).toBeLessThan(output.indexOf(cp(0xfb33)));
    });

    it("sorts recursively and emits no whitespace", () => {
        expect(canonicalizeRfc8785({b: {d: 1, c: [3, {f: 4, e: 5}]}, a: null})).toBe(
            '{"a":null,"b":{"c":[3,{"e":5,"f":4}],"d":1}}',
        );
    });
});

describe("canonicalizeRfc8785 — literals and containers", () => {
    it("serialises literals", () => {
        expect(canonicalizeRfc8785(null)).toBe("null");
        expect(canonicalizeRfc8785(true)).toBe("true");
        expect(canonicalizeRfc8785(false)).toBe("false");
        expect(canonicalizeRfc8785([])).toBe("[]");
        expect(canonicalizeRfc8785({})).toBe("{}");
    });

    it("preserves array order", () => {
        expect(canonicalizeRfc8785(["b", "a", 2, 1])).toBe('["b","a",2,1]');
    });

    it("drops undefined members, as JSON.stringify does", () => {
        expect(canonicalizeRfc8785({b: undefined, a: 1})).toBe('{"a":1}');
    });

    it("rejects values with no JSON counterpart", () => {
        expect(() => canonicalizeRfc8785(10n)).toThrow(CanonicalizationError);
        expect(() => canonicalizeRfc8785(Symbol("x"))).toThrow(CanonicalizationError);
    });

    it("emits UTF-8 bytes for hashing", () => {
        expect(canonicalBytesRfc8785({a: cp(0x20ac)})).toEqual(
            new TextEncoder().encode(`{"a":"${cp(0x20ac)}"}`),
        );
    });
});
