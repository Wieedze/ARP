/**
 * An agent named by its ids, typed into the index's search (task 46e).
 *
 * `8453/2340` or `8453:2340` is chain and token. A bare number is a token on Base, because the
 * index lists Base only (`AgentDirectory`). Input that is only digits, or digits and a separator,
 * is always read as an id and never as a capability; anything else stays a capability search.
 */
export type AgentRef = {chainId: number; tokenId: string};

const BASE = 8453;

export function agentRefOf(input: string): AgentRef | null {
    const text = input.trim();
    const pair = /^(\d+)\s*[/:]\s*(\d+)$/.exec(text);
    if (pair !== null) {
        const chainId = Number(pair[1]);
        return Number.isSafeInteger(chainId) && chainId > 0
            ? {chainId, tokenId: stripZeros(pair[2] ?? "")}
            : null;
    }
    return /^\d+$/.test(text) ? {chainId: BASE, tokenId: stripZeros(text)} : null;
}

/** `/agent/8453/007` and `/agent/8453/7` are one agent; the route keeps one spelling. */
function stripZeros(digits: string): string {
    return digits.replace(/^0+(?=\d)/, "");
}
