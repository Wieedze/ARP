import type {Hex} from "viem";

/**
 * The subject of a `uses` edge, and the guard that stops the wrong atom being used.
 *
 * ADR 0032: `(agent, uses, tool)` carries the **registration-derived agent atom** — the one
 * `resolveSubject` returns, reached from the agent's ERC-8004 CAIP-19 through `same as`. A `uses`
 * edge is a claim about the agent's identity, not a record of an operating account's action.
 *
 * This module exists because the wrong atom is the easy mistake and the damage is permanent:
 * Intuition has no deletion, and an edge written on a `caip10:` subject is invisible to
 * `getCapabilities` and to every third party following the partner guide. Twenty-one such triples
 * already exist on testnet from before ADR 0030.
 */

/** An atom id established to be an agent's registration-derived identity atom. */
export type AgentIdentityAtom = Hex & {readonly __brand: unique symbol};

/**
 * An agent that has no ERC-8004 identity atom, so it cannot be the subject of a `uses` edge yet.
 *
 * The accepted cost of ADR 0032, and deliberately an error rather than a fallback: falling back to
 * the operating account would write a permanent, unreadable edge, which is the bug ADR 0032 decided
 * against. The remedy is ADR 0027 — mint the agent into the canonical ERC-8004 registry.
 */
export class NoAgentIdentityError extends Error {
    readonly operatingAccount: string;

    constructor(operatingAccount: string) {
        super(
            `this agent has no ERC-8004 identity atom, only the operating account ` +
                `${operatingAccount}. A \`uses\` edge must carry the registration-derived atom ` +
                `(ADR 0032); mint the agent into the canonical registry first (ADR 0027). ` +
                `Writing the edge on the account would be permanent and unreadable.`,
        );
        this.name = "NoAgentIdentityError";
        this.operatingAccount = operatingAccount;
    }
}

/**
 * Accept an atom id as an agent identity, or refuse it.
 *
 * `resolvedFromCaip19` is the assertion the caller is making: this atom was reached from the agent's
 * ERC-8004 CAIP-19 through `same as`, not guessed and not substituted. The brand makes that
 * assertion explicit at every call site rather than implicit in a `Hex`, the same device
 * `PinAuth` uses for the partner credential.
 */
export function asAgentIdentityAtom(
    atomId: Hex,
    resolvedFromCaip19: string,
): AgentIdentityAtom {
    if (!/^eip155:\d+\/erc721:0x[0-9a-fA-F]{40}\/\d+$/.test(resolvedFromCaip19)) {
        throw new NoAgentIdentityError(resolvedFromCaip19);
    }
    return atomId as AgentIdentityAtom;
}
