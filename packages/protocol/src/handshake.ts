/**
 * The install handshake: the operator's node is bound to its ERC-8004 token by a signature the
 * token's owner makes, and anyone can re-check the binding without ARP (ADR `0094` §1, task 39b).
 *
 * Three steps, and this module is both ends of them except the transport and the keys:
 *
 * 1. the node sends the agent id (`agentRegistry` + `agentId`), its public key and its endpoint;
 * 2. the verifier reads the token's owner on the registry's chain and returns a challenge — an
 *    EIP-4361 (Sign-In with Ethereum) message carrying a single-use nonce, a short expiry and the
 *    chain id;
 * 3. the owner signs that message, **and so does the node key** (ADR `0095`). The verifier checks
 *    the owner still owns the token and both signatures recover, then returns the binding.
 *
 * **Never signs and never sends**, like the rest of the package (ADR `0038`): the owner signs in
 * their own wallet and the node signs with its own key, and both signatures arrive here as hex.
 *
 * **The node signs too, which ADR `0094` does not ask for.** Without it, an owner could bind a
 * public key they do not hold — somebody else's node — and receipts that node signs for its own
 * agent would then also read as signed by a node bound to theirs. Proof of possession closes that
 * for one signature more.
 *
 * **A transfer voids the binding** without anybody revoking it: {@link verifyEndpointBinding}
 * compares the owner who signed with the registry's owner now, so a binding read after a transfer
 * is `transferred` until the new owner makes a new handshake.
 *
 * ERC-8004 checks none of this — the registry does not even test that an endpoint answers.
 */
import {getAddress, isAddress, isHex, recoverMessageAddress, type Address, type Hex} from "viem";
import {publicKeyToAddress} from "viem/accounts";
import {createSiweMessage, generateSiweNonce, parseSiweMessage} from "viem/siwe";

import {canonicalizeRfc8785} from "./canonicalize.js";

/** The binding's own format version. Bump it with the statement or the document's shape. */
export const ENDPOINT_BINDING_VERSION = 1;

/** How long a challenge stays signable. Short: a person is signing it while the CLI waits. */
export const DEFAULT_CHALLENGE_TTL_SECONDS = 300;

/** Challenges kept in memory at once. A flood past it is refused rather than grown into. */
export const DEFAULT_MAX_PENDING = 1000;

/** An agent as ERC-8004 names it: `eip155:<chainId>:<identityRegistry>` plus the token id. */
export type HandshakeAgent = {agentRegistry: string; agentId: string};

/** Step 1, what the node sends. */
export type HandshakeRequest = HandshakeAgent & {
    /** The node key's uncompressed secp256k1 public key, `0x04…`, 65 bytes. */
    nodePublicKey: Hex;
    /** Where the agent is reached: the tunnel's public `https://` URL. */
    endpoint: string;
};

/** Step 2, what the verifier answers. `message` is what both keys sign, byte for byte. */
export type HandshakeChallenge = {
    nonce: string;
    chainId: number;
    owner: Address;
    nodeAddress: Address;
    issuedAt: string;
    expiresAt: string;
    message: string;
};

/** Step 3, what the node sends back. */
export type HandshakeCompletion = {nonce: string; ownerSignature: Hex; nodeSignature: Hex};

/** The result: everything a stranger needs to re-check the binding against the registry. */
export type EndpointBinding = HandshakeAgent & {
    version: number;
    owner: Address;
    nodeAddress: Address;
    nodePublicKey: Hex;
    endpoint: string;
    message: string;
    ownerSignature: Hex;
    nodeSignature: Hex;
};

/** What the verifier needs from the chain: the registry's chain, by the registry's chain id. */
export type HandshakeChain = {
    /** `ownerOf(agentId)` on `registry`, on `chainId`. Throws when the token does not exist. */
    ownerOf(agent: {chainId: number; registry: Address; agentId: bigint}): Promise<Address>;
    /**
     * Whether `signature` over `message` is `address`'s. A chain read rather than a recovery, so
     * an owner that is a contract account (ERC-1271) verifies as well as an EOA.
     */
    verifyMessage(args: {
        chainId: number;
        address: Address;
        message: string;
        signature: Hex;
    }): Promise<boolean>;
};

export type HandshakeError =
    | {code: "malformed"; reason: string}
    /** `ownerOf` reverted (no such token) or the RPC failed. Not a verdict on the agent. */
    | {code: "chain-unreadable"; reason: string}
    | {code: "unknown-nonce"}
    | {code: "expired"}
    | {code: "owner-changed"; signedFor: Address; current: Address}
    | {code: "bad-owner-signature"}
    | {code: "bad-node-signature"; recovered: Address | null}
    | {code: "busy"};

export type HandshakeResult<T> = {ok: true; value: T} | {ok: false; error: HandshakeError};

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const REGISTRY = /^eip155:([1-9][0-9]*):(0x[0-9a-fA-F]{40})$/;

/** `eip155:<chainId>:<address>` split, or `null` when it is not one. */
export function parseAgentRegistry(value: string): {chainId: number; registry: Address} | null {
    const match = REGISTRY.exec(value);
    if (match === null) return null;
    const [, chainId, registry] = match as unknown as [string, string, string];
    const id = Number(chainId);
    if (!Number.isSafeInteger(id)) return null;
    return {chainId: id, registry: getAddress(registry)};
}

/**
 * The endpoint as it is bound: `https://`, no credentials, no fragment, no trailing slash on a bare
 * host. `null` when it cannot be one.
 *
 * `https` only, because the endpoint is the tunnel's public address and every tunnel this is
 * built for serves TLS. A plain `http` endpoint bound on chain would invite every caller to send
 * its payment proof in clear.
 */
export function normaliseEndpoint(value: string): string | null {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        return null;
    }
    if (url.protocol !== "https:") return null;
    if (url.username !== "" || url.password !== "") return null;
    if (url.hash !== "") return null;
    const text = url.toString();
    return url.pathname === "/" && url.search === "" ? text.slice(0, -1) : text;
}

/** The address a node public key signs as. `null` when it is not an uncompressed secp256k1 key. */
export function nodeAddressOf(publicKey: string): Address | null {
    if (!isHex(publicKey) || publicKey.length !== 132 || !publicKey.startsWith("0x04")) return null;
    return publicKeyToAddress(publicKey);
}

/** The one sentence both keys sign. Rebuilt by every re-check, so it must stay a pure function. */
export function bindingStatement(
    agent: HandshakeAgent,
    nodeAddress: Address,
    endpoint: string,
): string {
    return (
        `Bind ARP node ${getAddress(nodeAddress)} to ERC-8004 agent ${agent.agentId} of ` +
        `${agent.agentRegistry}, reachable at ${endpoint}. A transfer of the token voids this.`
    );
}

type ValidRequest = {
    agent: HandshakeAgent;
    chainId: number;
    registry: Address;
    agentId: bigint;
    nodeAddress: Address;
    nodePublicKey: Hex;
    endpoint: string;
};

function malformed(reason: string): {ok: false; error: HandshakeError} {
    return {ok: false, error: {code: "malformed", reason}};
}

/** Step 1's input, checked field by field. Exported so a node can refuse to send a bad one. */
export function validateHandshakeRequest(input: unknown): HandshakeResult<ValidRequest> {
    if (typeof input !== "object" || input === null) return malformed("body is not an object");
    const body = input as Record<string, unknown>;
    const {agentRegistry, agentId, nodePublicKey, endpoint} = body;
    if (typeof agentRegistry !== "string") return malformed("agentRegistry is missing");
    const parsed = parseAgentRegistry(agentRegistry);
    if (parsed === null) return malformed("agentRegistry is not eip155:<chainId>:<address>");
    if (typeof agentId !== "string" || !DECIMAL.test(agentId)) {
        return malformed("agentId is not a decimal token id");
    }
    if (typeof nodePublicKey !== "string") return malformed("nodePublicKey is missing");
    const nodeAddress = nodeAddressOf(nodePublicKey);
    if (nodeAddress === null)
        return malformed("nodePublicKey is not an uncompressed secp256k1 key");
    if (typeof endpoint !== "string") return malformed("endpoint is missing");
    const normalised = normaliseEndpoint(endpoint);
    if (normalised === null) return malformed("endpoint is not an https URL without credentials");
    return {
        ok: true,
        value: {
            // Rebuilt from the parsed parts, so a checksum difference in the registry address does
            // not produce two statements for one agent.
            agent: {agentRegistry: `eip155:${parsed.chainId}:${parsed.registry}`, agentId},
            chainId: parsed.chainId,
            registry: parsed.registry,
            agentId: BigInt(agentId),
            nodeAddress,
            nodePublicKey: nodePublicKey as Hex, // checked by `nodeAddressOf` above
            endpoint: normalised,
        },
    };
}

/** Where pending challenges live between step 2 and step 3. `take` is the single use. */
export type ChallengeStore = {
    put(nonce: string, entry: PendingChallenge): boolean;
    take(nonce: string): PendingChallenge | undefined;
};

export type PendingChallenge = {request: ValidRequest; challenge: HandshakeChallenge};

/**
 * An in-memory store, bounded. Expired entries are dropped on every write, and a write past
 * `maxPending` live entries is refused — each challenge cost an RPC read, so an unbounded store is
 * a bill and a memory leak for whoever hosts the verifier.
 */
export function memoryChallengeStore(
    options: {maxPending?: number; now?: () => Date} = {},
): ChallengeStore {
    const max = options.maxPending ?? DEFAULT_MAX_PENDING;
    const now = options.now ?? (() => new Date());
    const entries = new Map<string, PendingChallenge>();
    return {
        put(nonce, entry) {
            const at = now().getTime();
            for (const [key, value] of entries) {
                if (Date.parse(value.challenge.expiresAt) <= at) entries.delete(key);
            }
            if (entries.size >= max || entries.has(nonce)) return false;
            entries.set(nonce, entry);
            return true;
        },
        take(nonce) {
            const entry = entries.get(nonce);
            entries.delete(nonce);
            return entry;
        },
    };
}

export type HandshakeVerifierOptions = {
    chain: HandshakeChain;
    /** The verifier's host, which the owner's wallet shows as who is asking. */
    domain: string;
    /** The verifier's handshake URL. */
    uri: string;
    ttlSeconds?: number;
    store?: ChallengeStore;
    now?: () => Date;
    nonce?: () => string;
};

export type HandshakeVerifier = {
    challenge(input: unknown): Promise<HandshakeResult<HandshakeChallenge>>;
    complete(input: unknown): Promise<HandshakeResult<EndpointBinding>>;
};

async function currentOwner(
    chain: HandshakeChain,
    request: ValidRequest,
): Promise<HandshakeResult<Address>> {
    try {
        const owner = await chain.ownerOf({
            chainId: request.chainId,
            registry: request.registry,
            agentId: request.agentId,
        });
        return {ok: true, value: getAddress(owner)};
    } catch (error) {
        return {
            ok: false,
            error: {
                code: "chain-unreadable",
                reason: error instanceof Error ? error.message : String(error),
            },
        };
    }
}

/** The verifier's two steps, over a chain and a store the caller supplies. */
export function createHandshakeVerifier(options: HandshakeVerifierOptions): HandshakeVerifier {
    const now = options.now ?? (() => new Date());
    const ttl = options.ttlSeconds ?? DEFAULT_CHALLENGE_TTL_SECONDS;
    const store = options.store ?? memoryChallengeStore({now});
    const nonce = options.nonce ?? generateSiweNonce;

    return {
        async challenge(input) {
            const valid = validateHandshakeRequest(input);
            if (!valid.ok) return valid;
            const request = valid.value;
            const owner = await currentOwner(options.chain, request);
            if (!owner.ok) return owner;

            const issuedAt = now();
            // Whole seconds: EIP-4361 timestamps are RFC 3339, and a millisecond part survives the
            // round trip through `parseSiweMessage` only by luck of formatting.
            issuedAt.setUTCMilliseconds(0);
            const expiresAt = new Date(issuedAt.getTime() + ttl * 1000);
            const value = nonce();
            const message = createSiweMessage({
                domain: options.domain,
                address: owner.value,
                statement: bindingStatement(request.agent, request.nodeAddress, request.endpoint),
                uri: options.uri,
                version: "1",
                chainId: request.chainId,
                nonce: value,
                issuedAt,
                expirationTime: expiresAt,
                resources: [request.endpoint],
            });
            const challenge: HandshakeChallenge = {
                nonce: value,
                chainId: request.chainId,
                owner: owner.value,
                nodeAddress: request.nodeAddress,
                issuedAt: issuedAt.toISOString(),
                expiresAt: expiresAt.toISOString(),
                message,
            };
            if (!store.put(value, {request, challenge})) return {ok: false, error: {code: "busy"}};
            return {ok: true, value: challenge};
        },

        async complete(input) {
            if (typeof input !== "object" || input === null)
                return malformed("body is not an object");
            const {nonce: given, ownerSignature, nodeSignature} = input as Record<string, unknown>;
            if (typeof given !== "string") return malformed("nonce is missing");
            if (typeof ownerSignature !== "string" || !isHex(ownerSignature)) {
                return malformed("ownerSignature is not hex");
            }
            if (typeof nodeSignature !== "string" || !isHex(nodeSignature)) {
                return malformed("nodeSignature is not hex");
            }
            // Taken before anything else is checked: a nonce is spent by being presented, so a
            // failed attempt cannot be retried with a corrected signature against the same message.
            const pending = store.take(given);
            if (pending === undefined) return {ok: false, error: {code: "unknown-nonce"}};
            const {request, challenge} = pending;
            if (now().getTime() > Date.parse(challenge.expiresAt)) {
                return {ok: false, error: {code: "expired"}};
            }

            let recovered: Address | null = null;
            try {
                recovered = await recoverMessageAddress({
                    message: challenge.message,
                    signature: nodeSignature,
                });
            } catch {
                recovered = null;
            }
            if (recovered !== request.nodeAddress) {
                return {ok: false, error: {code: "bad-node-signature", recovered}};
            }

            // Read again: the token may have moved while the owner was signing.
            const owner = await currentOwner(options.chain, request);
            if (!owner.ok) return owner;
            if (owner.value !== challenge.owner) {
                return {
                    ok: false,
                    error: {
                        code: "owner-changed",
                        signedFor: challenge.owner,
                        current: owner.value,
                    },
                };
            }
            let signed: boolean;
            try {
                signed = await options.chain.verifyMessage({
                    chainId: request.chainId,
                    address: challenge.owner,
                    message: challenge.message,
                    signature: ownerSignature,
                });
            } catch (error) {
                return {
                    ok: false,
                    error: {
                        code: "chain-unreadable",
                        reason: error instanceof Error ? error.message : String(error),
                    },
                };
            }
            if (!signed) return {ok: false, error: {code: "bad-owner-signature"}};

            return {
                ok: true,
                value: {
                    version: ENDPOINT_BINDING_VERSION,
                    ...request.agent,
                    owner: challenge.owner,
                    nodeAddress: request.nodeAddress,
                    nodePublicKey: request.nodePublicKey,
                    endpoint: request.endpoint,
                    message: challenge.message,
                    ownerSignature,
                    nodeSignature,
                },
            };
        },
    };
}

export type BindingVerdict =
    | {status: "bound"; owner: Address}
    | {status: "transferred"; signedBy: Address; current: Address}
    | {status: "invalid"; reason: string}
    /** The chain could not be read. Never rounded to `bound`, and never to `invalid` either. */
    | {status: "unknown"; reason: string};

/**
 * Re-check a binding with nothing but the registry: the message says what the binding says, both
 * signatures hold, and the owner who signed still owns the token.
 *
 * The message's expiry is **not** checked here, and that is deliberate: it bounded how long the
 * challenge could be signed for, which the verifier enforced when the handshake ran. A binding read
 * a month later is expired by that clock and still means what the owner signed.
 */
export async function verifyEndpointBinding(
    binding: EndpointBinding,
    chain: HandshakeChain,
): Promise<BindingVerdict> {
    const invalid = (reason: string): BindingVerdict => ({status: "invalid", reason});
    if (binding.version !== ENDPOINT_BINDING_VERSION)
        return invalid(`unknown version ${binding.version}`);
    const valid = validateHandshakeRequest(binding);
    if (!valid.ok) {
        return invalid(valid.error.code === "malformed" ? valid.error.reason : valid.error.code);
    }
    const request = valid.value;
    if (request.endpoint !== binding.endpoint) return invalid("endpoint is not in its normal form");
    if (!isAddress(binding.owner) || !isAddress(binding.nodeAddress)) {
        return invalid("owner or nodeAddress is not an address");
    }
    if (getAddress(binding.nodeAddress) !== request.nodeAddress) {
        return invalid("nodeAddress does not match nodePublicKey");
    }
    if (!isHex(binding.ownerSignature) || !isHex(binding.nodeSignature)) {
        return invalid("a signature is not hex");
    }

    // `parseSiweMessage` never throws: it returns whichever fields it found, so "is it EIP-4361" is
    // the presence of the fields the standard requires.
    const parsed = parseSiweMessage(binding.message);
    if (
        parsed.address === undefined ||
        parsed.domain === undefined ||
        parsed.nonce === undefined ||
        parsed.uri === undefined ||
        parsed.version !== "1"
    ) {
        return invalid("message is not EIP-4361");
    }
    const owner = getAddress(binding.owner);
    if (getAddress(parsed.address) !== owner) {
        return invalid("message is not addressed to the owner");
    }
    if (parsed.chainId !== request.chainId) return invalid("message is for another chain");
    if (
        parsed.statement !== bindingStatement(request.agent, request.nodeAddress, request.endpoint)
    ) {
        return invalid("message does not say what the binding says");
    }

    let recovered: Address | null;
    try {
        recovered = await recoverMessageAddress({
            message: binding.message,
            signature: binding.nodeSignature,
        });
    } catch {
        recovered = null;
    }
    if (recovered !== request.nodeAddress) return invalid("node signature does not recover");

    let signed: boolean;
    try {
        signed = await chain.verifyMessage({
            chainId: request.chainId,
            address: owner,
            message: binding.message,
            signature: binding.ownerSignature,
        });
    } catch (error) {
        return {status: "unknown", reason: error instanceof Error ? error.message : String(error)};
    }
    if (!signed) return invalid("owner signature does not verify");

    const current = await currentOwner(chain, request);
    if (!current.ok) {
        return {
            status: "unknown",
            reason:
                current.error.code === "chain-unreadable"
                    ? current.error.reason
                    : current.error.code,
        };
    }
    if (current.value !== owner)
        return {status: "transferred", signedBy: owner, current: current.value};
    return {status: "bound", owner};
}

/** Narrow parsed JSON to a binding's shape. Fields are checked by {@link verifyEndpointBinding}. */
export function asEndpointBinding(value: unknown): EndpointBinding | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const strings = [
        "agentRegistry",
        "agentId",
        "owner",
        "nodeAddress",
        "nodePublicKey",
        "endpoint",
        "message",
        "ownerSignature",
        "nodeSignature",
    ];
    if (typeof record["version"] !== "number") return null;
    for (const key of strings) if (typeof record[key] !== "string") return null;
    return record as EndpointBinding; // every field's type checked on the two lines above
}

/**
 * The document pinned to IPFS and attached to the binding triple by `in context of` (task 39c).
 *
 * A schema.org Thing, so the indexer resolves a name for it, carrying the whole binding. RFC 8785
 * canonical, so the same binding pinned by anyone yields the same CID.
 */
export function endpointBindingDocument(binding: EndpointBinding): string {
    return canonicalizeRfc8785({
        "@context": "https://schema.org",
        "@type": "Thing",
        name: `ARP endpoint binding: agent ${binding.agentId} of ${binding.agentRegistry}`,
        url: binding.endpoint,
        binding,
    });
}

/** The binding back out of a pinned document, or `null` when the document is not one. */
export function bindingFromDocument(document: unknown): EndpointBinding | null {
    if (typeof document !== "object" || document === null) return null;
    return asEndpointBinding((document as Record<string, unknown>)["binding"]);
}
