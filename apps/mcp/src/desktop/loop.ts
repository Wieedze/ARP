/**
 * The loop an outside user walks in Claude Desktop, with nothing to sign and nothing to pay
 * (`docs/tasks/50`). Only the extension build loads this file (`ARP_TOOLS=desktop`).
 *
 *   arp_get_skill     the skill's files through ARP's content server, with a receipt naming this
 *                     agent as the caller
 *   arp_declare_used  the first time: gas, `register()`, the identity, the approval. Every time: a
 *                     deposit on `(this agent, uses, the skill)`, paid by ARP's sponsoring service,
 *                     with the receipt as its proof
 *
 * A receipt attests that the skill was served to this agent, never that it was used (ADR `0109`).
 * State is kept in `~/.arp/`, next to the key: `agent.json` (the agent's id and identity atom) and
 * `receipts.jsonl` (one line per skill served).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  keccak256,
  stringToBytes,
  type Address,
  type Hex,
} from 'viem';

import {
  contentRequestTypedData,
  encodeApproveDeposit,
  INTUITION_USES_TERM_ID,
  multiVaultDeclareAbi,
  receiptMatchesContent,
  signSponsorRequest,
  skillRefFromUrl,
  sponsorProofDigest,
  verifyContentReceipt,
  type SignedContentReceipt,
} from '@arp-protocol/core';

import { DESKTOP_CHAIN_ID, type AgentSender } from './agent-key.js';

/** `register()` and the event that carries the new id: all this needs of the ERC-8004 registry. */
const registryAbi = [
  { type: 'function', name: 'register', stateMutability: 'nonpayable', inputs: [], outputs: [{ name: 'agentId', type: 'uint256' }] },
  {
    type: 'event',
    name: 'Registered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'agentURI', type: 'string', indexed: false },
      { name: 'to', type: 'address', indexed: true },
    ],
  },
] as const;

export type LoopConfig = {
  /** ARP's content server, which signs a receipt for every skill it serves. */
  contentUrl: string;
  /** ARP's sponsoring service. */
  sponsorUrl: string;
  /** ARP's ERC-8004 registry on 13579. */
  registry: Address;
  /** Intuition's MultiVault on 13579, from this repo's deployment record, never from the sponsor. */
  multiVault: Address;
  /** `~/.arp`. */
  stateDir: string;
  /** Where to install a fetched skill so the runtime can invoke it, or nothing. */
  skillsDir?: string;
  /**
   * The project's receipts file, which the hook reads to name the atom of a skill it sees invoked
   * (`apps/hook/src/hook.ts`, `fetchedRefs`). Written with `skillsDir`, never without.
   */
  projectReceipts?: string;
  /** How long to wait for the indexer to see a new identity, in ms. */
  indexerWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  fetch?: typeof fetch;
};

type AgentState = { agentId: string; identityAtom?: Hex };

export type ServedSkill = { atom: Hex; url: string; name: string; text: string; installedAt?: string };

type ReceiptLine = { atom: Hex; url: string; skill: string | null; receipt: SignedContentReceipt };

const registryRef = (config: LoopConfig) => `eip155:${DESKTOP_CHAIN_ID}:${getAddress(config.registry)}`;

async function json(response: Response): Promise<Record<string, unknown>> {
  // Every route of both services answers JSON, an error included.
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

async function post(config: LoopConfig, path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await (config.fetch ?? fetch)(`${config.sponsorUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body, (_, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)),
  });
  return { status: response.status, body: await json(response) };
}

function readAgent(config: LoopConfig): AgentState | null {
  const file = join(config.stateDir, 'agent.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as AgentState) : null; // written by `writeAgent` only
}

function writeAgent(config: LoopConfig, state: AgentState): void {
  mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(config.stateDir, 'agent.json'), `${JSON.stringify(state)}\n`, { mode: 0o600 });
}

function receiptFor(config: LoopConfig, atom: Hex): ReceiptLine | null {
  const file = join(config.stateDir, 'receipts.jsonl');
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as ReceiptLine); // written by `getSkill` only
  return lines.reverse().find((line) => line.atom.toLowerCase() === atom.toLowerCase()) ?? null;
}

/** The skill's files, served to this agent with a receipt that names it, verified before it is kept. */
export async function getSkill(config: LoopConfig, agent: AgentSender, atom: Hex): Promise<ServedSkill> {
  const nonce = keccak256(stringToBytes(`${atom}-${Date.now()}`));
  const signature = await agent.account.signTypedData(contentRequestTypedData(atom, nonce, DESKTOP_CHAIN_ID));
  const response = await (config.fetch ?? fetch)(
    `${config.contentUrl}/content/${atom}?nonce=${nonce}&by=${agent.address}&sig=${signature}`,
  );
  if (!response.ok) {
    const body = await json(response);
    throw new Error(`the content server answered ${response.status}: ${String(body['error'] ?? '')} ${String(body['reason'] ?? '')}`.trim());
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const header = response.headers.get('x-arp-receipt');
  if (header === null) throw new Error('the content server sent no receipt');
  const signed = JSON.parse(header) as SignedContentReceipt; // checked by the two verifications below
  const verdict = await verifyContentReceipt(signed);
  if (verdict.status !== 'valid') throw new Error(`the receipt does not verify (${verdict.status})`);
  if (!receiptMatchesContent(signed.receipt, bytes)) throw new Error('the files do not match the receipt');
  if (signed.receipt.to?.toLowerCase() !== agent.address.toLowerCase()) throw new Error('the receipt names another caller');

  const ref = skillRefFromUrl(signed.receipt.url);
  mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  const line: ReceiptLine = { atom: signed.receipt.atom, url: signed.receipt.url, skill: ref?.skill ?? null, receipt: signed };
  appendFileSync(join(config.stateDir, 'receipts.jsonl'), `${JSON.stringify(line)}\n`);
  const served = { atom: signed.receipt.atom, url: signed.receipt.url, name: ref?.skill ?? signed.receipt.url, text: new TextDecoder().decode(bytes) };
  // Installed under its own name only when that name is a plain directory name: it comes from a URL.
  if (config.skillsDir === undefined || ref === null || !/^[a-z0-9][a-z0-9._-]*$/i.test(ref.skill)) return served;
  const dir = join(config.skillsDir, ref.skill);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), bytes);
  if (config.projectReceipts !== undefined) {
    mkdirSync(join(config.projectReceipts, '..'), { recursive: true });
    const at = new Date(signed.receipt.servedAt * 1000).toISOString();
    appendFileSync(config.projectReceipts, `${JSON.stringify({ skill: ref.skill, atom: signed.receipt.atom, url: signed.receipt.url, at, receipt: signed })}\n`);
  }
  return { ...served, installedAt: join(dir, 'SKILL.md') };
}

/** This key's agent id: read from `~/.arp`, or minted with gas the sponsor sends once. */
async function ensureAgent(config: LoopConfig, agent: AgentSender): Promise<AgentState> {
  const known = readAgent(config);
  if (known !== null) return known;
  const gas = await post(config, '/mint-gas', { address: agent.address });
  if (gas.status !== 200) throw new Error(`no gas to register (${gas.status}): ${String(gas.body['error'] ?? '')}`);
  const register = { to: config.registry, data: encodeFunctionData({ abi: registryAbi, functionName: 'register' }) };
  const receipt = await agent.send({ ...register, value: 0n, chainId: DESKTOP_CHAIN_ID }, [register]);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.registry.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: registryAbi, topics: log.topics, data: log.data });
      if (event.eventName === 'Registered' && event.args.to.toLowerCase() === agent.address.toLowerCase()) {
        const state = { agentId: event.args.agentId.toString() };
        writeAgent(config, state);
        return state;
      }
    } catch {
      // The registry's ERC-721 `Transfer` is in the same receipt, and this ABI does not decode it.
      continue;
    }
  }
  throw new Error(`register() in ${receipt.transactionHash} emitted no Registered event for this agent`);
}

export type Declared = { skill: string; created: boolean; sent: Hex };

/**
 * Declares that this agent used the skill at `atom`, and has ARP's sponsor support the declaration
 * in the agent's name. The skill must have been served through {@link getSkill}: its receipt is the
 * proof the sponsor asks for.
 */
export async function declareUsed(config: LoopConfig, agent: AgentSender, atom: Hex): Promise<Declared> {
  const served = receiptFor(config, atom);
  if (served === null) throw new Error('this skill was not fetched through ARP; call arp_get_skill first');
  const state = await ensureAgent(config, agent);
  const ref = { agentRegistry: registryRef(config), agentId: state.agentId };

  if (state.identityAtom === undefined) {
    const made = await post(config, '/identity', ref);
    if (made.status !== 200 || typeof made.body['identityAtom'] !== 'string') {
      throw new Error(`the identity could not be created (${made.status}): ${String(made.body['error'] ?? '')}`);
    }
    state.identityAtom = made.body['identityAtom'] as Hex; // a string, checked on the line above
    writeAgent(config, state);
  }

  const info = await json(await (config.fetch ?? fetch)(config.sponsorUrl));
  // The record's address, not the sponsor's: a wrong sponsor endpoint must not redirect the approval.
  const multiVault = getAddress(config.multiVault);
  if (String(info['multiVault']).toLowerCase() !== multiVault.toLowerCase()) {
    throw new Error(`the sponsor names MultiVault ${String(info['multiVault'])}, not ${multiVault}`);
  }
  // The one approval this key signs, built here: the sponsor's answer to /gas does not choose it.
  const approval = { to: multiVault, data: encodeApproveDeposit(getAddress(String(info['sponsor']))) };
  const termId = await agent.client.readContract({
    address: multiVault,
    abi: multiVaultDeclareAbi,
    functionName: 'calculateTripleId',
    args: [state.identityAtom, INTUITION_USES_TERM_ID, served.atom],
  });
  const proof = { kind: 'content' as const, receipt: served.receipt };
  const triple = { subjectId: state.identityAtom, predicateId: INTUITION_USES_TERM_ID, objectId: served.atom };

  const wait = config.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const deadline = Date.now() + (config.indexerWaitMs ?? 120_000);
  let approved = false;
  for (;;) {
    const request = await signSponsorRequest(
      {
        version: 1,
        agent: agent.address,
        agentRegistry: ref.agentRegistry,
        agentId: ref.agentId,
        termId,
        proof: sponsorProofDigest(proof),
        nonce: keccak256(stringToBytes(`${termId}-${Date.now()}`)),
        expiresAt: Math.floor(Date.now() / 1000) + 600,
      },
      DESKTOP_CHAIN_ID,
      agent.account,
    );
    const answer = await post(config, '/deposit', { request, proof, triple });
    if (answer.status === 200) {
      return { skill: served.skill ?? served.url, created: typeof answer.body['created'] === 'string', sent: answer.body['sent'] as Hex }; // the sponsor's 200 carries `sent`
    }
    const error = String(answer.body['error'] ?? '');
    // A new identity takes the indexer a moment to see.
    if (answer.status === 403 && /no identity atom on the graph/.test(error) && Date.now() < deadline) {
      await wait(5_000);
      continue;
    }
    // Not approved yet: the sponsor sends the gas, and this key sends the approval it planned.
    if (answer.status === 409 && answer.body['approve'] !== undefined && !approved) {
      const gas = await post(config, '/gas', ref);
      if (gas.status !== 200) throw new Error(`no gas for the approval (${gas.status}): ${String(gas.body['error'] ?? '')}`);
      const next = gas.body['next'] as { to: Address; data: Hex; value: string | number }; // the sponsor's PreparedCall, checked against `approval`
      await agent.send({ to: next.to, data: next.data, value: BigInt(next.value), chainId: DESKTOP_CHAIN_ID }, [approval]);
      approved = true;
      continue;
    }
    throw new Error(`the sponsor refused (${answer.status}): ${error}`);
  }
}
