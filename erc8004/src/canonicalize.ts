/**
 * Thrown when a value cannot be canonicalised: a non-finite number, or a
 * JavaScript type with no JSON counterpart.
 */
export class CanonicalizationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CanonicalizationError";
    }
}

/**
 * RFC 8785 (JSON Canonicalization Scheme).
 *
 * Written rather than depended on: it is sixty lines, and a signature check is
 * only as trustworthy as the bytes it hashes. Three rules carry the whole scheme.
 *
 *   1. Object keys sort by their UTF-16 code units. JavaScript's default string
 *      comparison already does exactly that — which is why `keys.sort()` is
 *      correct here and `localeCompare` would not be.
 *   2. Numbers serialise per ECMAScript `Number::toString`. RFC 8785 §3.2.2.3
 *      names `JSON.stringify` as producing the correct result, so delegating to
 *      it is the specified behaviour, not a shortcut.
 *   3. Strings use JSON's minimal escaping — the same set `JSON.stringify` emits.
 *
 * Whitespace is never emitted, and `undefined`-valued properties are dropped as
 * `JSON.stringify` drops them. Input is expected to have come from `JSON.parse`,
 * where neither case can arise.
 */
export function canonicalizeRfc8785(value: unknown): string {
    if (value === null) return "null";

    switch (typeof value) {
        case "boolean":
            return value ? "true" : "false";
        case "number": {
            if (!Number.isFinite(value)) {
                throw new CanonicalizationError(`non-finite number: ${String(value)}`);
            }
            // JSON.stringify(-0) is "0", which is what RFC 8785 requires.
            return JSON.stringify(value);
        }
        case "string":
            return JSON.stringify(value);
        case "object":
            break;
        default:
            throw new CanonicalizationError(`unsupported type: ${typeof value}`);
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalizeRfc8785(item)).join(",")}]`;
    }

    // Narrowed to a plain object by the switch above plus the array check.
    const record = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(record).sort()) {
        const member = record[key];
        if (member === undefined) continue;
        parts.push(`${JSON.stringify(key)}:${canonicalizeRfc8785(member)}`);
    }
    return `{${parts.join(",")}}`;
}

/** UTF-8 bytes of the canonical form — what a `keccak256` over the document hashes. */
export function canonicalBytesRfc8785(value: unknown): Uint8Array {
    return new TextEncoder().encode(canonicalizeRfc8785(value));
}
