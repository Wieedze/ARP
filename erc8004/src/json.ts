/**
 * Narrowing helpers for untrusted JSON.
 *
 * Every GraphQL row and every resolver document in this package is written by a
 * third party. None of it is typed until it has been through here.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRecord(source: unknown, key: string): Record<string, unknown> | null {
    if (!isRecord(source)) return null;
    const child = source[key];
    return isRecord(child) ? child : null;
}

export function readString(source: unknown, key: string): string | null {
    if (!isRecord(source)) return null;
    const value = source[key];
    return typeof value === "string" ? value : null;
}

export function readNumber(source: unknown, key: string): number | null {
    if (!isRecord(source)) return null;
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readArray(source: unknown, key: string): unknown[] {
    if (!isRecord(source)) return [];
    const value = source[key];
    return Array.isArray(value) ? value : [];
}

/**
 * Amounts arrive from the graph as decimal strings because they exceed
 * `Number.MAX_SAFE_INTEGER`. Parsing them as numbers would silently lose
 * precision, so they become `bigint` or `null` — never an approximation.
 */
export function readBigInt(source: unknown, key: string): bigint | null {
    if (!isRecord(source)) return null;
    const value = source[key];
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return Number.isInteger(value) ? BigInt(value) : null;
    if (typeof value !== "string" || !/^-?\d+$/.test(value)) return null;
    return BigInt(value);
}

/** Reads a path like `assessment.signature`. Returns null if any segment is missing. */
export function readPath(source: unknown, path: readonly string[]): unknown {
    let cursor: unknown = source;
    for (const segment of path) {
        if (!isRecord(cursor)) return null;
        cursor = cursor[segment];
    }
    return cursor ?? null;
}

/**
 * Deletes a dotted path from a structured clone of `source`, leaving the
 * original untouched. Used to apply an assessment signature's `excludes` list
 * before canonicalisation.
 *
 * Returns `null` when the path does not exist — the caller needs to know that a
 * declared exclusion did not apply, rather than hashing a document that differs
 * from the one the provider signed.
 */
export function omitPath(source: unknown, path: string): unknown | null {
    const segments = path.split(".");
    const last = segments.pop();
    if (last === undefined || !isRecord(source)) return null;

    const clone: unknown = structuredClone(source);
    let cursor: unknown = clone;
    for (const segment of segments) {
        if (!isRecord(cursor)) return null;
        cursor = cursor[segment];
    }
    if (!isRecord(cursor) || !(last in cursor)) return null;
    delete cursor[last];
    return clone;
}
