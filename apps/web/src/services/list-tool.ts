/**
 * Ask the sponsor to list a tool or a skill on testnet 13579 (task 53c, ADR `0120`).
 *
 * Unsigned for now: the sponsor counts it against its shared anonymous cap. A request signed by
 * the agent key or a wallet gets its own per-address cap; signing it waits for
 * `signListToolRequest` to reach `@arp-protocol/core` on `dev`.
 *
 * No React. Every IO is injected, so the test needs no server.
 */
export type ListToolResult =
    | {status: "listed"; atomId: string; created: boolean; transactions: readonly string[]}
    | {status: "refused"; rule: string | null; retry: boolean; httpStatus: number}
    | {status: "unavailable"};

export type ListToolDeps = {
    /** `undefined` when no sponsor is configured: nothing is sent. */
    endpoint: string | undefined;
    fetch: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export async function listTool(url: string, deps: ListToolDeps): Promise<ListToolResult> {
    if (deps.endpoint === undefined) return {status: "unavailable"};
    let response: Response;
    try {
        response = await deps.fetch(`${deps.endpoint}/list-tool`, {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({url}),
        });
    } catch {
        // The sponsor runs on the operator's machine (`docs/26` §2); not running is the usual cause.
        return {status: "unavailable"};
    }
    const body: unknown = await response.json().catch(() => null);
    if (response.ok && isRecord(body) && typeof body["atomId"] === "string") {
        const transactions = Array.isArray(body["transactions"])
            ? body["transactions"].filter((hash): hash is string => typeof hash === "string")
            : [];
        return {
            status: "listed",
            atomId: body["atomId"],
            created: body["created"] === true,
            transactions,
        };
    }
    return {
        status: "refused",
        rule: isRecord(body) && typeof body["rule"] === "string" ? body["rule"] : null,
        retry: isRecord(body) && body["retry"] === true,
        httpStatus: response.status,
    };
}

/** One short line for each outcome, in the page's plain words (ADR `0103`). */
export function listToolMessage(result: ListToolResult): string {
    switch (result.status) {
        case "listed":
            return result.created ? "Listed." : "Already listed.";
        case "unavailable":
            return "The sponsor is not running.";
        case "refused":
            if (result.rule === "url") return "That is not a tool or skill URL.";
            if (result.rule === "resolves" && !result.retry)
                return "Nothing found at that URL on GitHub.";
            if (result.rule === "limit") return "Today's limit is reached. Try again tomorrow.";
            if (result.retry) return "Not answered right now. Try again.";
            return "The sponsor could not list it.";
    }
}
