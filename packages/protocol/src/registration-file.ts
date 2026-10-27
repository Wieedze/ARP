/**
 * The ERC-8004 **registration file** — the document an agent's `agentURI` points at.
 *
 * ## Why this exists
 *
 * `register()` takes no argument and mints an identity whose `tokenURI` is empty. That is a legal
 * ERC-8004 identity and it says **nothing**: no name, no description, no endpoint. The cohort is
 * full of them — probed on Base 8453 on 2026-10-27, agents `6649` and `500000` both return an
 * empty `tokenURI` — and they are exactly the rows this project already renders as the indexer's
 * stand-in, `Agent 8453:6649` (`FALLBACK_NAME_PATTERN`, `metadata.isFallback`).
 *
 * The whole chain degrades from one missing argument: no `tokenURI` → `registrationFile` null →
 * `prepareIdentityAtom` falls back to the frozen recipe's defaults → the Intuition atom carries a
 * stand-in name → every reader sees a nameless agent. So minting without a registration file is
 * minting into the half of the cohort nothing can say anything about.
 *
 * ## The shape, read off the chain rather than off a spec
 *
 * Probed from two live agents on Base, `scripts/measure/canonical-registry.ts`:
 *
 * ```json
 * {
 *   "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
 *   "name": "ClawNews",
 *   "description": "…",
 *   "image": "https://clawnews.io/logo.png",
 *   "services": [{"name": "web", "endpoint": "https://clawnews.io"}],
 *   "registrations": [{"agentId": 1, "agentRegistry": "eip155:56:0x8004A169…"}],
 *   "active": true,
 *   "x402Support": false,
 *   "supportedTrust": ["reputation"]
 * }
 * ```
 *
 * Agent `1` carries 2,269 bytes of it as a `data:application/json;base64,…` URI, embedded on
 * chain. Agent `2340` (Clawnch) does the same. Agent `1100000` instead points at
 * `https://centralcity.ai/a/L8Blf4`.
 *
 * **Both forms are in use and this module builds the on-chain one by default.** A URL is cheaper
 * and can stop resolving; a data URI costs gas once and is then as durable as the chain. ARP's
 * whole argument is that a claim should be checkable without trusting a server, so the default
 * follows the argument. `toRegistrationUrl` exists for a caller who wants the other trade.
 *
 * ## `agentId: null` in `registrations`, deliberately
 *
 * A fresh mint cannot name its own id — the registry assigns it in the same call that reads this
 * document. Agent `1`'s own file does the same thing for its Base entry, so `null` is the
 * ecosystem's convention and not a gap. The owner can replace the file afterwards with
 * `setAgentURI`, which the registry restricts to them (probed: it reverts `Not authorized` for
 * anybody else).
 */

/** The `type` every registration file carries. Not a version we chose; it is the discriminator. */
export const REGISTRATION_V1_TYPE =
    "https://eips.ethereum.org/EIPS/eip-8004#registration-v1" as const;

/** One way to reach the agent. `name` is a label, not an enum — the wild holds many. */
export type RegistrationService = {name: string; endpoint: string};

/** Where else this agent is registered. `agentId` is null when it is not yet known. */
export type RegistrationEntry = {agentId: number | null; agentRegistry: string};

export type RegistrationFile = {
    type: typeof REGISTRATION_V1_TYPE;
    name: string;
    description: string | null;
    image: string | null;
    services: RegistrationService[];
    registrations: RegistrationEntry[];
    active: boolean;
    x402Support: boolean;
    supportedTrust: string[];
};

export type RegistrationInput = {
    name: string;
    description?: string;
    image?: string;
    /** The agent's public entry point, if it has one. Emitted as the `web` service. */
    webEndpoint?: string;
    /** Extra services beyond `web` — `mcp`, `a2a`, `email`, whatever the agent speaks. */
    services?: readonly RegistrationService[];
    /** The chain the identity is being minted on, for the self-entry in `registrations`. */
    chainId: number;
    registry: string;
    /** Known only when the file is written *after* the mint. Null on a fresh one. */
    agentId?: number | null;
};

/** Trimmed, or `null` when there is nothing left. Keeps `""` out of a published document. */
function clean(value: string | undefined): string | null {
    const trimmed = (value ?? "").trim();
    return trimmed === "" ? null : trimmed;
}

/**
 * Build the document.
 *
 * `name` is the only required field, because it is the only one whose absence makes the identity
 * unreadable — which is the entire problem this module exists to avoid. Everything else is omitted
 * rather than defaulted: an empty string in a published document is a claim that the field was
 * answered.
 */
export function buildRegistrationFile(input: RegistrationInput): RegistrationFile {
    const name = clean(input.name);
    if (name === null) {
        throw new TypeError(
            "A registration file needs a name; an unnamed identity reads as absent.",
        );
    }

    const services: RegistrationService[] = [];
    const web = clean(input.webEndpoint);
    if (web !== null) services.push({name: "web", endpoint: web});
    for (const service of input.services ?? []) {
        const endpoint = clean(service.endpoint);
        const label = clean(service.name);
        if (endpoint !== null && label !== null) services.push({name: label, endpoint});
    }

    return {
        type: REGISTRATION_V1_TYPE,
        name,
        description: clean(input.description),
        image: clean(input.image),
        services,
        registrations: [
            {
                agentId: input.agentId ?? null,
                agentRegistry: `eip155:${input.chainId}:${input.registry}`,
            },
        ],
        active: true,
        // Both false/minimal on purpose. `x402Support` is a claim about a payment surface this
        // agent may not have, and `supportedTrust` says which trust models it accepts —
        // `reputation` is what every probed agent carries and what ARP itself reads.
        x402Support: false,
        supportedTrust: ["reputation"],
    };
}

/** The JSON as it will be stored. Keys dropped when null, so the document states only answers. */
export function serialiseRegistrationFile(file: RegistrationFile): string {
    const out: Record<string, unknown> = {type: file.type, name: file.name};
    if (file.description !== null) out["description"] = file.description;
    if (file.image !== null) out["image"] = file.image;
    out["services"] = file.services;
    out["registrations"] = file.registrations;
    out["active"] = file.active;
    out["x402Support"] = file.x402Support;
    out["supportedTrust"] = file.supportedTrust;
    return JSON.stringify(out);
}

/**
 * The on-chain form: `data:application/json;base64,…`.
 *
 * What agents `1` and `2340` carry on Base. Self-contained — nothing to host and nothing to rot —
 * and the byte count is the gas cost, so a caller shows it before asking for a signature.
 *
 * `btoa` is not used: it throws on any code point above 0xFF, and a name with an emoji in it is
 * ordinary here (agent `2340` is literally `🦞 Clawnch 🦞`). The bytes are UTF-8 first.
 */
export function toRegistrationDataUri(file: RegistrationFile): string {
    const json = serialiseRegistrationFile(file);
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:application/json;base64,${btoa(binary)}`;
}

/** The hosted form, for a caller who would rather pay less gas and host the document. */
export function toRegistrationUrl(url: string): string {
    const trimmed = url.trim();
    if (trimmed === "") throw new TypeError("A hosted registration file needs a URL.");
    return trimmed;
}

/** How many bytes the registry will store. The gas cost in the only unit a caller can act on. */
export function registrationUriBytes(uri: string): number {
    return new TextEncoder().encode(uri).length;
}
