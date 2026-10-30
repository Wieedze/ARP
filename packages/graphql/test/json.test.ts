import {describe, expect, it} from "vitest";

import {
    isRecord,
    omitPath,
    readArray,
    readBigInt,
    readNumber,
    readPath,
    readRecord,
    readString,
} from "../src/json.js";

describe("narrowing untrusted JSON", () => {
    it("distinguishes records from arrays and null", () => {
        expect(isRecord({})).toBe(true);
        expect(isRecord([])).toBe(false);
        expect(isRecord(null)).toBe(false);
        expect(isRecord("x")).toBe(false);
    });

    it("returns null rather than coercing a wrong type", () => {
        const source = {s: 1, n: "1", r: [], a: {}};
        expect(readString(source, "s")).toBeNull();
        expect(readNumber(source, "n")).toBeNull();
        expect(readRecord(source, "r")).toBeNull();
        expect(readArray(source, "a")).toEqual([]);
        expect(readString(null, "s")).toBeNull();
        expect(readNumber(undefined, "n")).toBeNull();
    });

    it("rejects non-finite numbers", () => {
        expect(readNumber({n: Number.NaN}, "n")).toBeNull();
        expect(readNumber({n: Number.POSITIVE_INFINITY}, "n")).toBeNull();
    });

    it("parses on-chain amounts as bigint, never as a lossy number", () => {
        expect(readBigInt({v: "993846395273540461"}, "v")).toBe(993846395273540461n);
        expect(readBigInt({v: -5}, "v")).toBe(-5n);
        expect(readBigInt({v: 1.5}, "v")).toBeNull();
        expect(readBigInt({v: "12.5"}, "v")).toBeNull();
        expect(readBigInt({v: "not a number"}, "v")).toBeNull();
        expect(readBigInt({v: 10n}, "v")).toBe(10n);
    });

    it("walks a path and stops at the first missing segment", () => {
        expect(readPath({a: {b: {c: 1}}}, ["a", "b", "c"])).toBe(1);
        expect(readPath({a: {b: {}}}, ["a", "b", "c"])).toBeNull();
        expect(readPath({a: 1}, ["a", "b"])).toBeNull();
    });
});

describe("omitPath", () => {
    it("removes a nested path without touching the original", () => {
        const source = {assessment: {score: 1, signature: {value: "0x"}}};
        expect(omitPath(source, "assessment.signature")).toEqual({assessment: {score: 1}});
        expect(source.assessment.signature).toEqual({value: "0x"});
    });

    it("removes a top-level path", () => {
        expect(omitPath({a: 1, b: 2}, "a")).toEqual({b: 2});
    });

    it("returns null when the path is absent, so a caller never hashes the wrong bytes", () => {
        expect(omitPath({a: {}}, "a.b")).toBeNull();
        expect(omitPath({a: 1}, "a.b")).toBeNull();
        expect(omitPath({}, "a")).toBeNull();
        expect(omitPath("not an object", "a")).toBeNull();
        expect(omitPath({a: 1}, "")).toBeNull();
    });
});
