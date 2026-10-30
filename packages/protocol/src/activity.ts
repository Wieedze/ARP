/**
 * What an agent did, as one ordered stream of events a reader can follow.
 *
 * Three local records, each written by a different program, and none of them by the agent's
 * model:
 *
 * | file              | written by              | one line per                                   |
 * | ----------------- | ----------------------- | ---------------------------------------------- |
 * | `session.jsonl`   | the runtime hook        | skill or MCP call the runtime made (ADR `0090`) |
 * | `receipts.jsonl`  | the skill fetcher       | skill content served, with the server's receipt |
 * | `sent.jsonl`      | `agent-send-plan --log` | call signed, dry-run or sent                    |
 *
 * Pure: a line in, an event out. Where the lines come from — a file tail, a socket, a test — is
 * the caller's business, so a browser and a terminal read the same events from the same parser.
 *
 * **An event is a claim by a local program, never by the chain.** A `sent` event with
 * `status: "success"` says what the signer saw; a reader who wants the chain's word reads the
 * receipt for `hash` themselves. The web app does exactly that before it marks a row confirmed.
 */
import {decodeFunctionData, type Hex} from "viem";

import {multiVaultDeclareAbi} from "./declare/multivault.js";

export type ActivitySource = "session" | "receipt" | "sent";

/** What the hook classified a call's result as (ADR `0090`). Lines before 2026-10-30 carry none. */
export type InvocationOutcome =
    | "ok"
    | "tool_error"
    | "auth"
    | "timeout"
    | "unreachable"
    | "payment";

/** A MultiVault call, decoded from the calldata that was signed. */
export type DecodedCall =
    | {fn: "createTriples"; subjects: Hex[]; predicates: Hex[]; objects: Hex[]}
    | {fn: "createAtoms"; count: number}
    | {fn: "deposit"; receiver: Hex; termId: Hex; curveId: string}
    | {fn: "redeem"; termId: Hex}
    | {fn: "other"; selector: Hex | null};

export type ActivityEvent =
    | {
          source: "session";
          at: string;
          session: string | null;
          call: string | null;
          kind: "skill" | "mcp";
          name: string;
          ref: string | null;
          outcome: InvocationOutcome | null;
          ms: number | null;
      }
    | {
          source: "receipt";
          at: string;
          name: string;
          url: string | null;
          atom: string | null;
          /** The address that signed the content receipt. */
          signer: string | null;
          /** The requester the receipt names. */
          to: string | null;
      }
    | {
          source: "sent";
          at: string;
          chainId: number;
          /** `dry` is a simulated call: priced and estimated, never signed. */
          status: "dry" | "success" | "reverted";
          hash: Hex | null;
          signer: string | null;
          to: string | null;
          value: string;
          gasUsed: string | null;
          kind: string;
          why: string;
          decoded: DecodedCall;
      };

const OUTCOMES: readonly InvocationOutcome[] = [
    "ok",
    "tool_error",
    "auth",
    "timeout",
    "unreachable",
    "payment",
];
const HEX = /^0x[0-9a-fA-F]*$/;

const str = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

/** Decode MultiVault calldata. Anything not in the declare ABI is `other`, never a throw. */
export function decodeMultiVaultCall(data: string | null): DecodedCall {
    if (data === null || !HEX.test(data) || data.length < 10) return {fn: "other", selector: null};
    // `HEX` matched just above, and a prefix of a hex string is hex.
    const hex = data as Hex;
    const selector = hex.slice(0, 10) as Hex;
    try {
        const decoded = decodeFunctionData({abi: multiVaultDeclareAbi, data: hex});
        switch (decoded.functionName) {
            case "createTriples": {
                const [subjects, predicates, objects] = decoded.args;
                return {
                    fn: "createTriples",
                    subjects: [...subjects],
                    predicates: [...predicates],
                    objects: [...objects],
                };
            }
            case "createAtoms":
                return {fn: "createAtoms", count: decoded.args[0].length};
            case "deposit": {
                const [receiver, termId, curveId] = decoded.args;
                return {fn: "deposit", receiver, termId, curveId: curveId.toString()};
            }
            case "redeem":
                return {fn: "redeem", termId: decoded.args[1]};
            default:
                return {fn: "other", selector};
        }
    } catch {
        // A selector this ABI does not know. Reported as such rather than guessed at.
        return {fn: "other", selector};
    }
}

/**
 * One JSON object from one of the three files, as an event. `null` for a line that does not say
 * enough to be shown — a corrupt line loses itself, never the stream.
 */
export function activityFromRecord(source: ActivitySource, record: unknown): ActivityEvent | null {
    if (typeof record !== "object" || record === null) return null;
    // Every field is narrowed below before use; the cast only names the candidates.
    const r = record as Record<string, unknown>;
    const at = str(r["at"]) ?? "";

    if (source === "session") {
        const name = str(r["name"]);
        const kind = r["kind"];
        if (name === null || (kind !== "skill" && kind !== "mcp")) return null;
        const outcome = OUTCOMES.find((candidate) => candidate === r["outcome"]) ?? null;
        return {
            source,
            at,
            session: str(r["session"]),
            call: str(r["call"]),
            kind,
            name,
            ref: str(r["ref"]),
            outcome,
            ms: typeof r["ms"] === "number" ? r["ms"] : null,
        };
    }

    if (source === "receipt") {
        const name = str(r["skill"]) ?? str(r["name"]);
        if (name === null) return null;
        return {
            source,
            at,
            name,
            url: str(r["url"]),
            atom: str(r["atom"]),
            signer: str(r["node"]),
            to: str(r["to"]),
        };
    }

    const status = r["status"];
    if (status !== "dry" && status !== "success" && status !== "reverted") return null;
    const chainId = typeof r["chainId"] === "number" ? r["chainId"] : Number.NaN;
    if (!Number.isInteger(chainId)) return null;
    const hash = str(r["hash"]);
    return {
        source,
        at,
        chainId,
        status,
        // A 32-byte hex string, checked on the same line.
        hash: hash !== null && HEX.test(hash) && hash.length === 66 ? (hash as Hex) : null,
        signer: str(r["signer"]),
        to: str(r["to"]),
        // Decimal wei only: a reader calls `BigInt` on it, and one malformed line must not take the
        // page down with it.
        value: /^\d+$/.test(str(r["value"]) ?? "") ? (str(r["value"]) ?? "0") : "0",
        gasUsed: str(r["gasUsed"]),
        kind: str(r["kind"]) ?? "call",
        why: str(r["why"]) ?? "",
        decoded: decodeMultiVaultCall(str(r["data"])),
    };
}

/** One JSONL line. */
export function activityFromLine(source: ActivitySource, line: string): ActivityEvent | null {
    if (line.trim().length === 0) return null;
    try {
        return activityFromRecord(source, JSON.parse(line));
    } catch {
        return null;
    }
}

/**
 * An event as it travels over the wire, re-validated on arrival. The feed already normalised it;
 * the browser does not take that on trust, because the feed is a separate process on a port.
 */
export function activityFromWire(value: unknown): ActivityEvent | null {
    if (typeof value !== "object" || value === null) return null;
    // Narrowed by `activityFromRecord` field by field.
    const v = value as Record<string, unknown>;
    const source = v["source"];
    if (source === "session") return activityFromRecord("session", v);
    if (source === "receipt") {
        return activityFromRecord("receipt", {...v, skill: v["name"], node: v["signer"]});
    }
    if (source === "sent") {
        const event = activityFromRecord("sent", v);
        if (event === null || event.source !== "sent") return null;
        // The wire carries the decoded call rather than calldata; keep it if it is well formed.
        const decoded = v["decoded"];
        if (typeof decoded === "object" && decoded !== null) {
            // Each field is narrowed inside `sanitiseDecoded`.
            return {...event, decoded: sanitiseDecoded(decoded as Record<string, unknown>)};
        }
        return event;
    }
    return null;
}

function hexList(value: unknown): Hex[] {
    return Array.isArray(value)
        ? value.filter((item): item is Hex => typeof item === "string" && HEX.test(item))
        : [];
}

function sanitiseDecoded(d: Record<string, unknown>): DecodedCall {
    // `HEX` is the check the cast stands on.
    const hex = (value: unknown): Hex | null =>
        typeof value === "string" && HEX.test(value) ? (value as Hex) : null;
    switch (d["fn"]) {
        case "createTriples":
            return {
                fn: "createTriples",
                subjects: hexList(d["subjects"]),
                predicates: hexList(d["predicates"]),
                objects: hexList(d["objects"]),
            };
        case "createAtoms":
            return {fn: "createAtoms", count: typeof d["count"] === "number" ? d["count"] : 0};
        case "deposit": {
            const receiver = hex(d["receiver"]);
            const termId = hex(d["termId"]);
            if (receiver === null || termId === null) return {fn: "other", selector: null};
            return {
                fn: "deposit",
                receiver,
                termId,
                curveId: typeof d["curveId"] === "string" ? d["curveId"] : "0",
            };
        }
        case "redeem": {
            const termId = hex(d["termId"]);
            return termId === null ? {fn: "other", selector: null} : {fn: "redeem", termId};
        }
        default:
            return {fn: "other", selector: hex(d["selector"])};
    }
}

/** Oldest first, by timestamp; ties keep arrival order. */
export function orderActivity(events: readonly ActivityEvent[]): ActivityEvent[] {
    return events
        .map((event, index) => ({event, index}))
        .sort((a, b) => a.event.at.localeCompare(b.event.at) || a.index - b.index)
        .map(({event}) => event);
}
