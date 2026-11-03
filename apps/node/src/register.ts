/** The node's half of the install handshake (task 39b, ADR `0094` §1): ask the directory for a
 *  challenge, have the token's owner sign it, sign it with the node key, send both back.
 *
 *  The owner's key never comes near this file. `signAsOwner` is the caller's: `arp init --node`
 *  prints the message and waits for the operator to paste a signature made in their own wallet. The
 *  node key signs here, and it signs a message, never a transaction.
 *
 *  This is the only request the node makes to ARP, and it makes it once, at install. Nothing the
 *  node serves passes through ARP afterwards.
 */
import {
  asEndpointBinding,
  type EndpointBinding,
  type HandshakeAgent,
  type HandshakeChallenge,
  validateHandshakeRequest,
} from '@arp-protocol/core';
import { isHex, type Hex, type PrivateKeyAccount } from 'viem';

export { resolveNodeKey, nodeKeyPath, loadOrCreateNodeKey, type NodeKey } from './node-key.ts';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type RegisterOptions = {
  /** The directory's handshake base, e.g. `https://arp.example/handshake`. */
  directoryUrl: string;
  agent: HandshakeAgent;
  endpoint: string;
  node: PrivateKeyAccount;
  /** Shown the challenge; returns the owner's EIP-191 signature over `challenge.message`. */
  signAsOwner(challenge: HandshakeChallenge): Promise<Hex>;
  fetch?: FetchLike;
};

export type RegisterResult =
  | { ok: true; binding: EndpointBinding; challenge: HandshakeChallenge }
  | { ok: false; step: 'request' | 'challenge' | 'owner' | 'complete'; reason: string };

async function post(fetchLike: FetchLike, url: string, body: unknown) {
  const response = await fetchLike(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { status: response.status, ok: response.ok, body: parsed };
}

function refusal(status: number, body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const { error, reason } = body as { error?: unknown; reason?: unknown };
    if (typeof error === 'string')
      return typeof reason === 'string' ? `${error}: ${reason}` : error;
  }
  return `HTTP ${status}`;
}

function isChallenge(value: unknown): value is HandshakeChallenge {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['nonce'] === 'string' &&
    typeof record['message'] === 'string' &&
    typeof record['owner'] === 'string' &&
    typeof record['nodeAddress'] === 'string'
  );
}

/** Run the three steps. Every refusal is returned with the step it happened at, never thrown. */
export async function register(options: RegisterOptions): Promise<RegisterResult> {
  const fetchLike = options.fetch ?? fetch;
  const base = options.directoryUrl.replace(/\/$/, '');
  const request = {
    ...options.agent,
    nodePublicKey: options.node.publicKey,
    endpoint: options.endpoint,
  };
  const valid = validateHandshakeRequest(request);
  if (!valid.ok) {
    return {
      ok: false,
      step: 'request',
      reason: valid.error.code === 'malformed' ? valid.error.reason : valid.error.code,
    };
  }

  let answer: Awaited<ReturnType<typeof post>>;
  try {
    answer = await post(fetchLike, `${base}/challenge`, request);
  } catch (error) {
    return {
      ok: false,
      step: 'challenge',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  if (!answer.ok)
    return { ok: false, step: 'challenge', reason: refusal(answer.status, answer.body) };
  if (!isChallenge(answer.body)) return { ok: false, step: 'challenge', reason: 'not a challenge' };
  const challenge = answer.body;
  // The directory chose the message; the node checks it binds this node before signing it.
  if (challenge.nodeAddress.toLowerCase() !== options.node.address.toLowerCase()) {
    return { ok: false, step: 'challenge', reason: 'the challenge names another node key' };
  }

  let ownerSignature: Hex;
  try {
    ownerSignature = await options.signAsOwner(challenge);
  } catch (error) {
    return {
      ok: false,
      step: 'owner',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  if (!isHex(ownerSignature))
    return { ok: false, step: 'owner', reason: 'the signature is not hex' };

  const nodeSignature = await options.node.signMessage({ message: challenge.message });
  let done: Awaited<ReturnType<typeof post>>;
  try {
    done = await post(fetchLike, `${base}/complete`, {
      nonce: challenge.nonce,
      ownerSignature,
      nodeSignature,
    });
  } catch (error) {
    return {
      ok: false,
      step: 'complete',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  if (!done.ok) return { ok: false, step: 'complete', reason: refusal(done.status, done.body) };
  const binding = asEndpointBinding(done.body);
  if (binding === null || binding.message !== challenge.message) {
    return { ok: false, step: 'complete', reason: 'the directory did not return this binding' };
  }
  return { ok: true, binding, challenge };
}
