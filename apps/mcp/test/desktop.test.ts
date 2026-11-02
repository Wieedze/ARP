import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeAbiParameters, encodeEventTopics, getAddress, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { afterEach, beforeEach, describe as group, expect, it } from 'vitest';

import { contentDigest, signContentReceipt } from '@arp-protocol/core';

import { loadOrCreateAgentKey, refusal, type AgentSender, type AllowedCall } from '../src/desktop/agent-key.js';
import { declareUsed, getSkill, type LoopConfig } from '../src/desktop/loop.js';

const REGISTRY = getAddress('0xC165A2AD2E540A4069E02834009161E2b4490d5A');
const MULTI_VAULT = getAddress('0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91');
const ATOM = `0x${'ab'.repeat(32)}` as Hex;
const IDENTITY = `0x${'cd'.repeat(32)}` as Hex;
const TERM = `0x${'ef'.repeat(32)}` as Hex;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arp-desktop-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

group('the agent key', () => {
  it('is created once, mode 0600, and read back the same', () => {
    const path = join(dir, '.arp', 'agent-key');
    const first = loadOrCreateAgentKey(path);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(loadOrCreateAgentKey(path).address).toBe(first.address);
  });

  it('signs only a zero-value call on 13579 to a contract it may call', () => {
    const call: AllowedCall = { to: REGISTRY, data: '0x', value: 0n, chainId: 13579 };
    expect(refusal(call, [REGISTRY])).toBeNull();
    expect(refusal({ ...call, value: 1n }, [REGISTRY])).toMatch(/sends value/);
    expect(refusal({ ...call, chainId: 1155 }, [REGISTRY])).toMatch(/not testnet/);
    expect(refusal({ ...call, to: MULTI_VAULT }, [REGISTRY])).toMatch(/not a contract/);
  });
});

/** A content server and a sponsor in one fake fetch, answering in the order a new agent meets them. */
function services(agentAddress: Address, node = privateKeyToAccount(generatePrivateKey())) {
  const calls: string[] = [];
  let deposits = 0;
  const bytes = new TextEncoder().encode('# A skill\n');
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url).pathname;
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    if (path.startsWith('/content/')) {
      const signed = await signContentReceipt(
        {
          atom: ATOM,
          url: 'github.com/acme/skills?skill=thumbs',
          path: 'skills/thumbs/SKILL.md',
          digest: contentDigest(bytes),
          to: agentAddress,
          servedAt: 1,
          nonce: `0x${'00'.repeat(32)}`,
        },
        13579,
        node,
      );
      return new Response(bytes, { headers: { 'x-arp-receipt': JSON.stringify(signed) } });
    }
    if (path === '/') return Response.json({ multiVault: MULTI_VAULT });
    if (path === '/mint-gas') return Response.json({ sent: '0x01' });
    if (path === '/identity') return Response.json({ identityAtom: IDENTITY, sent: [] });
    if (path === '/gas') return Response.json({ sent: '0x02', next: { to: MULTI_VAULT, data: '0x1234', value: '0' } });
    if (path === '/deposit') {
      deposits += 1;
      if (deposits === 1) return Response.json({ error: 'agent 7 has no identity atom on the graph' }, { status: 403 });
      if (deposits === 2) return Response.json({ error: 'not approved', approve: {} }, { status: 409 });
      return Response.json({ sent: '0x03', created: '0x04' });
    }
    return Response.json({ error: 'no route' }, { status: 404 });
  }) as typeof fetch; // the subset of fetch this module calls
  return { fake, calls };
}

function fakeAgent(sent: AllowedCall[]): AgentSender {
  const account = privateKeyToAccount(generatePrivateKey());
  const registered = {
    address: REGISTRY,
    topics: encodeEventTopics({
      abi: [
        {
          type: 'event',
          name: 'Registered',
          inputs: [
            { name: 'agentId', type: 'uint256', indexed: true },
            { name: 'agentURI', type: 'string', indexed: false },
            { name: 'to', type: 'address', indexed: true },
          ],
        },
      ],
      eventName: 'Registered',
      args: { agentId: 7n, to: account.address },
    }),
    data: encodeAbiParameters([{ type: 'string' }], ['']),
  };
  return {
    address: account.address,
    account,
    // Only `readContract` is called on the client, for the triple's id.
    client: { readContract: async () => TERM } as unknown as AgentSender['client'],
    async send(call) {
      sent.push(call);
      return { status: 'success', transactionHash: '0x05', logs: call.to === REGISTRY ? [registered] : [] } as unknown as Awaited<
        ReturnType<AgentSender['send']>
      >; // the fields `declareUsed` reads
    },
  };
}

group('the loop a new agent walks', () => {
  it('gets a skill with a receipt naming it, then declares it: gas, register, identity, approval, deposit', async () => {
    const sent: AllowedCall[] = [];
    const agent = fakeAgent(sent);
    const { fake, calls } = services(agent.address);
    const config: LoopConfig = {
      contentUrl: 'http://content.test',
      sponsorUrl: 'http://sponsor.test',
      registry: REGISTRY,
      stateDir: join(dir, '.arp'),
      sleep: async () => {},
      fetch: fake,
    };

    const skill = await getSkill(config, agent, ATOM);
    expect(skill).toMatchObject({ name: 'thumbs', text: '# A skill\n' });

    const done = await declareUsed(config, agent, ATOM);
    expect(done).toEqual({ skill: 'thumbs', created: true, sent: '0x03' });
    expect(calls).toEqual([
      'GET /content/' + ATOM,
      'POST /mint-gas',
      'POST /identity',
      'GET /',
      'POST /deposit',
      'POST /deposit',
      'POST /gas',
      'POST /deposit',
    ]);
    expect(sent.map((call) => call.to)).toEqual([REGISTRY, MULTI_VAULT]);
    expect(JSON.parse(readFileSync(join(dir, '.arp', 'agent.json'), 'utf8'))).toEqual({ agentId: '7', identityAtom: IDENTITY });

    // The second declaration finds the agent and its identity already made.
    calls.length = 0;
    await declareUsed(config, agent, ATOM).catch(() => undefined);
    expect(calls.slice(0, 2)).toEqual(['GET /', 'POST /deposit']);
  });

  it('refuses to declare a skill that was not served through ARP', async () => {
    const agent = fakeAgent([]);
    const config: LoopConfig = {
      contentUrl: 'http://content.test',
      sponsorUrl: 'http://sponsor.test',
      registry: REGISTRY,
      stateDir: join(dir, '.arp'),
      fetch: services(agent.address).fake,
    };
    await expect(declareUsed(config, agent, ATOM)).rejects.toThrow(/arp_get_skill first/);
  });

  it('refuses a receipt that names another caller', async () => {
    const agent = fakeAgent([]);
    const config: LoopConfig = {
      contentUrl: 'http://content.test',
      sponsorUrl: 'http://sponsor.test',
      registry: REGISTRY,
      stateDir: join(dir, '.arp'),
      fetch: services(privateKeyToAccount(generatePrivateKey()).address).fake,
    };
    await expect(getSkill(config, agent, ATOM)).rejects.toThrow(/another caller/);
  });
});
