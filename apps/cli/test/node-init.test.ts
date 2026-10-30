import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { verifyMessage } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import {
  createHandshakeVerifier,
  handshakeFetchHandler,
  verifyEndpointBinding,
  type HandshakeChain,
} from '@arp-protocol/core';

import { NODE_INIT_EXIT, nodeInit, parseNodeInitFlags, type NodeInitIo } from '../src/node-init.ts';

const REGISTRY = `eip155:13579:0xC165A2AD2E540A4069E02834009161E2b4490d5A`;
const owner = privateKeyToAccount(generatePrivateKey());
const chain: HandshakeChain = {
  ownerOf: async () => owner.address,
  verifyMessage: (args) => verifyMessage(args),
};

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'arp-node-init-'));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const flagsFor = (extra: string[] = []) => {
  const flags = parseNodeInitFlags([
    '--node',
    '--agent-registry',
    REGISTRY,
    '--agent-id=7',
    '--endpoint',
    'https://agent.example/',
    '--directory',
    'https://arp.example/handshake',
    ...extra,
  ]);
  if (flags instanceof Error) throw flags;
  return flags;
};

/** A terminal that answers the signature prompt by signing what it was shown, as the owner would. */
function io(overrides: Partial<NodeInitIo> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const handle = handshakeFetchHandler(
    createHandshakeVerifier({ chain, domain: 'arp.example', uri: 'https://arp.example/handshake' }),
  );
  const value: NodeInitIo = {
    env: {},
    home,
    interactive: true,
    async readLine() {
      const message = readFileSync(join(home, '.arp', 'handshake-message.txt'), 'utf8');
      return owner.signMessage({ message });
    },
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    fetch: async (input, init) => handle(new Request(input, init)),
    ...overrides,
  };
  return { value, out, err };
}

describe('parseNodeInitFlags', () => {
  test('reads both spellings of every value flag', () => {
    expect(flagsFor(['--no-input'])).toEqual({
      agentRegistry: REGISTRY,
      agentId: '7',
      endpoint: 'https://agent.example/',
      directory: 'https://arp.example/handshake',
      noInput: true,
    });
  });
  test('refuses a missing value and an unknown option', () => {
    expect(parseNodeInitFlags(['--node', '--agent-id'])).toBeInstanceOf(Error);
    expect(parseNodeInitFlags(['--agent-id', '--endpoint'])).toBeInstanceOf(Error);
    expect(parseNodeInitFlags(['--agent-id='])).toBeInstanceOf(Error);
    expect((parseNodeInitFlags(['--yes']) as Error).message).toContain("unknown option '--yes'");
  });
});

describe('nodeInit', () => {
  test('binds the node and saves a binding a stranger can re-check', async () => {
    const terminal = io();
    expect(await nodeInit(flagsFor(), terminal.value)).toBe(NODE_INIT_EXIT.ok);
    const bindingPath = join(home, '.arp', 'node-binding.json');
    const binding = JSON.parse(readFileSync(bindingPath, 'utf8'));
    expect(binding.endpoint).toBe('https://agent.example');
    expect(await verifyEndpointBinding(binding, chain)).toEqual({
      status: 'bound',
      owner: owner.address,
    });
    expect(
      JSON.parse(readFileSync(join(home, '.arp', 'node-binding.document.json'), 'utf8')),
    ).toMatchObject({
      binding,
    });
    if (process.platform !== 'win32') expect(statSync(bindingPath).mode & 0o777).toBe(0o600);
    expect(terminal.err.join('\n')).toContain(`Sign this message as ${owner.address}`);
    expect(terminal.out.join('\n')).toContain('signs no transaction');
    // The node key was created on first use, in the operator's home.
    expect(existsSync(join(home, '.arp', 'node.key'))).toBe(true);
  });

  test('takes the agent, endpoint and directory from the environment', async () => {
    const flags = parseNodeInitFlags(['--node']);
    if (flags instanceof Error) throw flags;
    const terminal = io({
      env: {
        AGENT_REGISTRY: REGISTRY,
        AGENT_ID: '7',
        ARP_NODE_PUBLIC_URL: 'https://agent.example',
        ARP_DIRECTORY_URL: 'https://arp.example/handshake',
      },
    });
    expect(await nodeInit(flags, terminal.value)).toBe(NODE_INIT_EXIT.ok);
  });

  test('names everything that is missing', async () => {
    const flags = parseNodeInitFlags(['--node']);
    if (flags instanceof Error) throw flags;
    const terminal = io();
    expect(await nodeInit(flags, terminal.value)).toBe(NODE_INIT_EXIT.usage);
    expect(terminal.err[0]).toContain('--agent-registry');
    expect(terminal.err[0]).toContain('--directory');
  });

  test('refuses a malformed agent or a non-https endpoint before any request', async () => {
    let requests = 0;
    const counting = async () => {
      requests += 1;
      return new Response('{}');
    };
    expect(await nodeInit({ ...flagsFor(), agentId: 'seven' }, io({ fetch: counting }).value)).toBe(
      NODE_INIT_EXIT.usage,
    );
    expect(
      await nodeInit(
        { ...flagsFor(), endpoint: 'http://agent.example' },
        io({ fetch: counting }).value,
      ),
    ).toBe(NODE_INIT_EXIT.usage);
    expect(requests).toBe(0);
  });

  test('refuses without a terminal, since the owner signs by hand', async () => {
    expect(await nodeInit(flagsFor(['--no-input']), io().value)).toBe(NODE_INIT_EXIT.refused);
    expect(await nodeInit(flagsFor(), io({ interactive: false }).value)).toBe(
      NODE_INIT_EXIT.refused,
    );
  });

  test('reports a pasted line that is not a signature, and writes no binding', async () => {
    const terminal = io({ readLine: async () => 'yes' });
    expect(await nodeInit(flagsFor(), terminal.value)).toBe(NODE_INIT_EXIT.failed);
    expect(terminal.err.at(-1)).toBe('arp init --node: owner refused: that is not a signature');
    expect(existsSync(join(home, '.arp', 'node-binding.json'))).toBe(false);
  });

  test('reports a node key it cannot use', async () => {
    const terminal = io({ env: { AGENT_PRIVATE_KEY: '0x12' } });
    expect(await nodeInit(flagsFor(), terminal.value)).toBe(NODE_INIT_EXIT.failed);
    expect(terminal.err.at(-1)).toContain('AGENT_PRIVATE_KEY');
  });
});
