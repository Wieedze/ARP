import { describe, expect, test } from 'bun:test';
import { verifyMessage, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import {
  createHandshakeVerifier,
  handshakeFetchHandler,
  verifyEndpointBinding,
  type HandshakeChain,
} from '@arp-protocol/core';

import { register } from '../src/register.ts';

const REGISTRY = '0xC165A2AD2E540A4069E02834009161E2b4490d5A';
const AGENT = { agentRegistry: `eip155:13579:${REGISTRY}`, agentId: '7' };
const ENDPOINT = 'https://agent.example';
const owner = privateKeyToAccount(generatePrivateKey());
const node = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

const chain: HandshakeChain = {
  ownerOf: async () => owner.address,
  verifyMessage: (args) => verifyMessage(args),
};

/** The real verifier behind a fetch, so both halves of the protocol run with no network. */
function directory() {
  const handle = handshakeFetchHandler(
    createHandshakeVerifier({ chain, domain: 'arp.example', uri: 'https://arp.example/handshake' }),
  );
  const urls: string[] = [];
  const fetchLike = async (input: string, init?: RequestInit) => {
    urls.push(input);
    return handle(new Request(input, init));
  };
  return { fetchLike, urls };
}

const asOwner =
  (signer: { signMessage(args: { message: string }): Promise<Hex> }) =>
  async (challenge: { message: string }) =>
    signer.signMessage({ message: challenge.message });

describe('register', () => {
  test('runs the three steps and returns a binding a stranger can re-check', async () => {
    const { fetchLike, urls } = directory();
    const result = await register({
      directoryUrl: 'https://arp.example/handshake/',
      agent: AGENT,
      endpoint: ENDPOINT,
      node,
      signAsOwner: asOwner(owner),
      fetch: fetchLike,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(urls).toEqual([
      'https://arp.example/handshake/challenge',
      'https://arp.example/handshake/complete',
    ]);
    expect(result.binding.nodeAddress).toBe(node.address);
    expect(result.challenge.owner).toBe(owner.address);
    expect(await verifyEndpointBinding(result.binding, chain)).toEqual({
      status: 'bound',
      owner: owner.address,
    });
  });

  test('refuses a bad request before sending anything', async () => {
    const { fetchLike, urls } = directory();
    const result = await register({
      directoryUrl: 'https://arp.example/handshake',
      agent: AGENT,
      endpoint: 'http://agent.example',
      node,
      signAsOwner: asOwner(owner),
      fetch: fetchLike,
    });
    expect(result).toMatchObject({ ok: false, step: 'request' });
    expect(urls).toEqual([]);
  });

  test("carries the directory's refusal back with its step", async () => {
    const { fetchLike } = directory();
    const result = await register({
      directoryUrl: 'https://arp.example/handshake',
      agent: AGENT,
      endpoint: ENDPOINT,
      node,
      signAsOwner: asOwner(stranger),
      fetch: fetchLike,
    });
    expect(result).toEqual({ ok: false, step: 'complete', reason: 'bad-owner-signature' });
  });

  test('reports a challenge refusal with its reason, and a network failure', async () => {
    const refused = await register({
      directoryUrl: 'https://arp.example/handshake',
      agent: AGENT,
      endpoint: ENDPOINT,
      node,
      signAsOwner: asOwner(owner),
      fetch: async () =>
        new Response(JSON.stringify({ error: 'chain-unreadable', reason: 'rpc down' }), {
          status: 503,
        }),
    });
    expect(refused).toEqual({ ok: false, step: 'challenge', reason: 'chain-unreadable: rpc down' });

    const html = await register({
      directoryUrl: 'https://arp.example/handshake',
      agent: AGENT,
      endpoint: ENDPOINT,
      node,
      signAsOwner: asOwner(owner),
      fetch: async () => new Response('<html>', { status: 502 }),
    });
    expect(html).toEqual({ ok: false, step: 'challenge', reason: 'HTTP 502' });

    const offline = await register({
      directoryUrl: 'https://arp.example/handshake',
      agent: AGENT,
      endpoint: ENDPOINT,
      node,
      signAsOwner: asOwner(owner),
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(offline).toEqual({ ok: false, step: 'challenge', reason: 'ECONNREFUSED' });
  });

  test('will not sign a challenge that is not one, or that names another node', async () => {
    const answer = (body: unknown) => async () => new Response(JSON.stringify(body));
    const base = {
      directoryUrl: 'https://arp.example/h',
      agent: AGENT,
      endpoint: ENDPOINT,
      node,
      signAsOwner: asOwner(owner),
    };
    expect(await register({ ...base, fetch: answer({ nonce: 1 }) })).toEqual({
      ok: false,
      step: 'challenge',
      reason: 'not a challenge',
    });
    expect(
      await register({
        ...base,
        fetch: answer({
          nonce: 'n',
          message: 'm',
          owner: owner.address,
          nodeAddress: stranger.address,
        }),
      }),
    ).toEqual({ ok: false, step: 'challenge', reason: 'the challenge names another node key' });
  });

  test("reports the owner's refusal or a signature that is not hex", async () => {
    const { fetchLike } = directory();
    const base = {
      directoryUrl: 'https://arp.example/handshake',
      agent: AGENT,
      endpoint: ENDPOINT,
      node,
      fetch: fetchLike,
    };
    expect(
      await register({
        ...base,
        signAsOwner: async () => {
          throw new Error('cancelled');
        },
      }),
    ).toEqual({ ok: false, step: 'owner', reason: 'cancelled' });
    expect(await register({ ...base, signAsOwner: async () => 'nope' as Hex })).toEqual({
      ok: false,
      step: 'owner',
      reason: 'the signature is not hex',
    });
  });

  test('refuses a completion that is not the binding it asked for, or that never arrives', async () => {
    const { fetchLike } = directory();
    let call = 0;
    const tamper =
      (replace: () => Promise<Response>) => async (input: string, init?: RequestInit) => {
        call += 1;
        return call === 1 ? fetchLike(input, init) : replace();
      };
    const base = {
      directoryUrl: 'https://arp.example/handshake',
      agent: AGENT,
      endpoint: ENDPOINT,
      node,
      signAsOwner: asOwner(owner),
    };
    expect(
      await register({ ...base, fetch: tamper(async () => new Response('{"version":1}')) }),
    ).toEqual({
      ok: false,
      step: 'complete',
      reason: 'the directory did not return this binding',
    });
    call = 0;
    expect(
      await register({
        ...base,
        fetch: tamper(async () => {
          throw new Error('reset');
        }),
      }),
    ).toEqual({ ok: false, step: 'complete', reason: 'reset' });
  });

  test('signs the message as the node key, never as anything else', async () => {
    const seen: Address[] = [];
    const { fetchLike } = directory();
    const result = await register({
      directoryUrl: 'https://arp.example/handshake',
      agent: AGENT,
      endpoint: ENDPOINT,
      node,
      signAsOwner: async (challenge) => {
        seen.push(challenge.owner);
        return owner.signMessage({ message: challenge.message });
      },
      fetch: fetchLike,
    });
    expect(seen).toEqual([owner.address]);
    expect(
      result.ok &&
        (await verifyMessage({
          address: node.address,
          message: result.binding.message,
          signature: result.binding.nodeSignature,
        })),
    ).toBe(true);
  });
});
