/**
 * `arp init --node` — the install handshake, from the operator's terminal (task 39b, ADR `0094` §1).
 *
 * It binds this machine's node key to the operator's ERC-8004 agent, through the directory:
 *
 * 1. the node key is loaded, or created in `~/.arp/node.key` (`apps/node/src/node-key.ts`);
 * 2. the directory reads the token's owner and returns a Sign-In with Ethereum message;
 * 3. the operator signs it **in their own wallet** and pastes the signature here, and the node key
 *    signs it too. The CLI never asks for, reads or holds the owner's key.
 *
 * The result is saved to `~/.arp/node-binding.json`, with the canonical document to pin beside it.
 * Writing it to Intuition is a plan (`prepareEndpointBinding`) somebody else signs — the operator's
 * wallet or ARP's sponsoring service — and this command sends no transaction.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { endpointBindingDocument, normaliseEndpoint, parseAgentRegistry } from '@arp-protocol/core';
import { register, resolveNodeKey } from '@arp/node/register';
import { isHex, type Hex } from 'viem';

export const NODE_INIT_EXIT = { ok: 0, usage: 2, refused: 3, failed: 6 } as const;

export type NodeInitFlags = {
  agentRegistry: string | null;
  agentId: string | null;
  endpoint: string | null;
  directory: string | null;
  noInput: boolean;
};

const VALUE_FLAGS = {
  '--agent-registry': 'agentRegistry',
  '--agent-id': 'agentId',
  '--endpoint': 'endpoint',
  '--directory': 'directory',
} as const;

/** `--node` itself is accepted and ignored: it is what routed here. */
export function parseNodeInitFlags(args: readonly string[]): NodeInitFlags | Error {
  const flags: NodeInitFlags = {
    agentRegistry: null,
    agentId: null,
    endpoint: null,
    directory: null,
    noInput: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--node') continue;
    if (arg === '--no-input') {
      flags.noInput = true;
      continue;
    }
    const [name, inline] = arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
      : [arg, null];
    if (name in VALUE_FLAGS) {
      const value = inline ?? args[i + 1];
      if (inline === null) i += 1;
      if (value === undefined || value.length === 0 || value.startsWith('--')) {
        return new Error(`${name} needs a value`);
      }
      flags[VALUE_FLAGS[name as keyof typeof VALUE_FLAGS]] = value; // `as`: `in` checked the key just above
      continue;
    }
    return new Error(`unknown option '${arg}' for init --node`);
  }
  return flags;
}

export type NodeInitIo = {
  env: Readonly<Record<string, string | undefined>>;
  home: string;
  interactive: boolean;
  /** One line from the operator, prompt shown first. */
  readLine(prompt: string): Promise<string>;
  out(line: string): void;
  err(line: string): void;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
};

function writePrivate(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, text, { mode: 0o600 });
}

/** Run the handshake. Returns the exit code. */
export async function nodeInit(flags: NodeInitFlags, io: NodeInitIo): Promise<number> {
  const agentRegistry = flags.agentRegistry ?? io.env['AGENT_REGISTRY'] ?? null;
  const agentId = flags.agentId ?? io.env['AGENT_ID'] ?? null;
  const endpointRaw = flags.endpoint ?? io.env['ARP_NODE_PUBLIC_URL'] ?? null;
  const directory = flags.directory ?? io.env['ARP_DIRECTORY_URL'] ?? null;

  const missing: string[] = [];
  if (agentRegistry === null) missing.push('--agent-registry (or AGENT_REGISTRY)');
  if (agentId === null) missing.push('--agent-id (or AGENT_ID)');
  if (endpointRaw === null) missing.push('--endpoint (or ARP_NODE_PUBLIC_URL)');
  if (directory === null) missing.push('--directory (or ARP_DIRECTORY_URL)');
  if (
    missing.length > 0 ||
    agentRegistry === null ||
    agentId === null ||
    endpointRaw === null ||
    directory === null
  ) {
    io.err(`arp init --node: missing ${missing.join(', ')}`);
    return NODE_INIT_EXIT.usage;
  }
  if (parseAgentRegistry(agentRegistry) === null || !/^(0|[1-9][0-9]*)$/.test(agentId)) {
    io.err('arp init --node: the agent is eip155:<chainId>:<registry> plus a decimal token id');
    return NODE_INIT_EXIT.usage;
  }
  const endpoint = normaliseEndpoint(endpointRaw);
  if (endpoint === null) {
    io.err(`arp init --node: the endpoint must be the tunnel's https URL, got ${endpointRaw}`);
    return NODE_INIT_EXIT.usage;
  }
  // The owner signs by hand, so there has to be a hand. Checked before any request is made.
  if (flags.noInput || !io.interactive) {
    io.err(
      'arp init --node: the owner signs the handshake in their wallet, which needs a terminal',
    );
    return NODE_INIT_EXIT.refused;
  }

  let key: ReturnType<typeof resolveNodeKey>;
  try {
    key = resolveNodeKey(io.env, { home: io.home });
  } catch (error) {
    io.err(`arp init --node: ${error instanceof Error ? error.message : String(error)}`);
    return NODE_INIT_EXIT.failed;
  }
  io.err(
    `node key   ${key.account.address}  (${key.source === 'env' ? 'AGENT_PRIVATE_KEY' : key.path})`,
  );

  const messagePath = join(io.home, '.arp', 'handshake-message.txt');
  const result = await register({
    directoryUrl: directory,
    agent: { agentRegistry, agentId },
    endpoint,
    node: key.account,
    ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
    async signAsOwner(challenge) {
      writePrivate(messagePath, challenge.message);
      io.err('');
      io.err(
        `Sign this message as ${challenge.owner}, the token's owner, before ${challenge.expiresAt}:`,
      );
      io.err('');
      for (const line of challenge.message.split('\n')) io.err(`  ${line}`);
      io.err('');
      io.err(`It is also in ${messagePath}. With Foundry, for example:`);
      io.err(`  cast wallet sign --interactive "$(cat ${messagePath})"`);
      io.err('');
      const answer = (await io.readLine('owner signature (0x…): ')).trim();
      if (!isHex(answer) || answer.length < 132) throw new Error('that is not a signature');
      return answer as Hex; // checked by `isHex` on the line above
    },
  });
  if (!result.ok) {
    io.err(`arp init --node: ${result.step} refused: ${result.reason}`);
    return NODE_INIT_EXIT.failed;
  }

  const bindingPath = join(io.home, '.arp', 'node-binding.json');
  const documentPath = join(io.home, '.arp', 'node-binding.document.json');
  writePrivate(bindingPath, `${JSON.stringify(result.binding, null, 2)}\n`);
  writePrivate(documentPath, endpointBindingDocument(result.binding));
  io.out(`bound      node ${result.binding.nodeAddress} to agent ${agentId} of ${agentRegistry}`);
  io.out(`endpoint   ${result.binding.endpoint}`);
  io.out(`saved      ${bindingPath}`);
  io.out(`document   ${documentPath}`);
  io.out('');
  io.out('Next: pin the document to IPFS, then write the binding on Intuition testnet with');
  io.out('`prepareEndpointBinding`. This command signs no transaction.');
  io.out('A transfer of the token voids the binding until you run this again.');
  return NODE_INIT_EXIT.ok;
}
