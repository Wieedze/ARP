import {isRecord, readString} from "../json.js";
import type {
    DeclaredEndpoint,
    DeclarationSpelling,
    EndpointClassification,
    KnownProtocol,
} from "./types.js";

/**
 * The three keys a registration file uses to declare endpoints, in the order they are read.
 *
 * `services` is the common one and `endpoints` is the one the spec examples use — measured
 * 2026-10-16 over 150 random Base token ids, `services` appeared 106 times against `endpoints` twice.
 * A verifier reading only `endpoints` sees almost nothing; that was a real bug while measuring, and
 * it is why this list exists rather than a single key.
 */
const SPELLINGS: readonly DeclarationSpelling[] = [
    "endpoints",
    "services",
    "registrations[].endpoints",
];

/** Protocols with a handshake a prober can actually perform. Everything else is a plain GET. */
const KNOWN_PROTOCOLS: Readonly<Record<string, KnownProtocol>> = {
    mcp: "mcp",
    a2a: "a2a",
};

/** An unsubstituted template placeholder, e.g. `.../agents/{agentId}/card`. */
const TEMPLATE = /\{[A-Za-z_][A-Za-z0-9_]*\}/;

/**
 * What class of thing a declared endpoint value is.
 *
 * Pure, and deliberately **not** a boolean. 82% of declared endpoints in the cohort cannot be probed
 * at all, and an `ok: false` would collapse "this agent is broken" into "we cannot check this agent"
 * — the single most damaging mistake this verifier can make. The two outcomes are different
 * `status` values so that no consumer can render them in one register by accident, and the reason is
 * a `code` rather than a free-form string so a consumer can branch on it without matching prose.
 *
 * `templated` and `non-http-identifier` are **not defects**. A `{agentId}` placeholder is a
 * documented template whose substitution the registration file simply does not describe, and
 * `eip155:8453:0x…` or `name.base.eth` under a `wallet` or `ens` key is a legitimate use of the field
 * for a non-HTTP identifier. Neither agent did anything wrong.
 */
export function classifyEndpoint(raw: unknown): EndpointClassification {
    if (typeof raw !== "string" || raw.trim().length === 0) {
        return {
            status: "not-checkable",
            code: "empty",
            declared: typeof raw === "string" ? raw : "",
        };
    }
    const declared = raw.trim();
    if (TEMPLATE.test(declared)) {
        const placeholder = TEMPLATE.exec(declared)?.[0] ?? "{?}";
        return {status: "not-checkable", code: "templated", declared, placeholder};
    }
    if (!/^https?:\/\//i.test(declared)) {
        return {status: "not-checkable", code: "non-http-identifier", declared};
    }
    let url: URL;
    try {
        url = new URL(declared);
    } catch {
        // Passes the scheme test but is not a URL — a malformed value the agent published, which is
        // a fact about the document rather than a limit of ours.
        return {status: "not-checkable", code: "unparseable-url", declared};
    }
    return {status: "probeable", url: url.toString(), declared};
}

function normaliseName(value: unknown): string | null {
    const name = typeof value === "string" ? value.trim() : null;
    return name && name.length > 0 ? name : null;
}

function readCapabilities(entry: Record<string, unknown>): string[] {
    const raw = entry["capabilities"];
    if (!Array.isArray(raw)) return [];
    return raw.filter((value): value is string => typeof value === "string" && value.length > 0);
}

function entriesUnder(document: Record<string, unknown>, spelling: DeclarationSpelling): unknown[] {
    if (spelling === "registrations[].endpoints") {
        const registrations = document["registrations"];
        if (!Array.isArray(registrations)) return [];
        return registrations.flatMap((registration) => {
            if (!isRecord(registration)) return [];
            const nested = registration["endpoints"];
            return Array.isArray(nested) ? nested : [];
        });
    }
    const raw = document[spelling];
    return Array.isArray(raw) ? raw : [];
}

/**
 * Every endpoint a registration document declares, across all three spellings, each classified.
 *
 * A function of the document and nothing else: no network, no clock, no configuration. That is what
 * makes the classification unit-testable without fixtures of the whole internet, and it is why the
 * prober is a separate module.
 *
 * An empty result means the document declares no endpoint — which is itself common (22 of 68 parsed
 * documents in the 2026-10-16 sample) and is **not** a defect either. A reader needs to tell "this
 * agent published nothing to probe" apart from "this agent published something that failed", so the
 * caller gets an empty array rather than a synthesised failure row.
 */
export function readDeclaredEndpoints(document: unknown): DeclaredEndpoint[] {
    if (!isRecord(document)) return [];
    const out: DeclaredEndpoint[] = [];
    for (const spelling of SPELLINGS) {
        for (const entry of entriesUnder(document, spelling)) {
            if (!isRecord(entry)) continue;
            const name = normaliseName(entry["name"]);
            out.push({
                declaredUnder: spelling,
                name,
                protocol: name ? (KNOWN_PROTOCOLS[name.toLowerCase()] ?? null) : null,
                version: readString(entry, "version"),
                capabilities: readCapabilities(entry),
                classification: classifyEndpoint(entry["endpoint"]),
            });
        }
    }
    return out;
}

/**
 * Split a classified list into the two groups a reader must never see merged.
 *
 * Provided as a function rather than left to each caller because the whole point of the
 * classification is that these two sets are reported differently, and a caller writing its own
 * filter is where that discipline erodes.
 */
export function partitionByCheckability(endpoints: readonly DeclaredEndpoint[]): {
    probeable: DeclaredEndpoint[];
    notCheckable: DeclaredEndpoint[];
} {
    const probeable: DeclaredEndpoint[] = [];
    const notCheckable: DeclaredEndpoint[] = [];
    for (const endpoint of endpoints) {
        if (endpoint.classification.status === "probeable") probeable.push(endpoint);
        else notCheckable.push(endpoint);
    }
    return {probeable, notCheckable};
}
