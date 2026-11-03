/**
 * The loop an outside user walks in Claude Desktop, with nothing to sign and nothing to pay
 * (`docs/tasks/50`), and in Claude Code (`docs/tasks/55`). Only `ARP_TOOLS=desktop` or `sponsored`
 * loads this file.
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

import { installFiles, installPrompt, recordInstall, SAFE_SKILL_NAME, type GateAnswer, type ReviewContext } from './skill-gate.js';

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
  bundleMatchesReceipt,
  contentRequestTypedData,
  encodeApproveDeposit,
  INTUITION_USES_TERM_ID,
  multiVaultDeclareAbi,
  receiptMatchesContent,
  signMintGasRequest,
  signSponsorRequest,
  skillRefFromUrl,
  sponsorProofDigest,
  verifyContentReceipt,
  type BundleFile,
  type SignedContentReceipt,
  type SkillPrompt,
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
  /**
   * Shows the install question to the person and returns their answer. Absent, it is the same as a
   * client that cannot ask: nothing is installed (task 61, deliverable D).
   */
  ask?: (prompt: SkillPrompt) => Promise<GateAnswer>;
  /** The commit's date and third-party figures for the question, by skill URL. */
  reviewContext?: (url: string) => ReviewContext;
  /** How long to wait for the indexer to see a new identity, in ms. */
  indexerWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  fetch?: typeof fetch;
};

type AgentState = { agentId: string; identityAtom?: Hex };

export type ServedSkill = {
  atom: Hex;
  url: string;
  name: string;
  text: string;
  files?: number;
  /** Where the person accepted it into. */
  installedAt?: string;
  /** Not installed: what the client answered instead of an accept. */
  notInstalled?: Exclude<GateAnswer, 'accepted'>;
};

type ReceiptLine = { atom: Hex; url: string; skill: string | null; receipt: SignedContentReceipt };

const registryRef = (config: LoopConfig) => `eip155:${DESKTOP_CHAIN_ID}:${getAddress(config.registry)}`;

async function json(response: Response): Promise<Record<string, unknown>> {
  // Every route of both services answers JSON, an error included.
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

/**
 * Every call to the content server and the sponsor is bounded (ADR `0116`): a tool call that waits
 * forever on a service that never answers is a hung session. The sponsor's routes wait for a
 * transaction to be mined, up to two minutes, so the bound is above that.
 */
const SERVICE_TIMEOUT_MS = 150_000;

async function post(config: LoopConfig, path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await (config.fetch ?? fetch)(`${config.sponsorUrl}${path}`, {
    method: 'POST',
    signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
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
  // Where the skill is installed, the runtime can run its scripts, so it gets the whole directory
  // (task 57). Claude Desktop's Chat runs nothing, and gets SKILL.md alone.
  const bundle = config.skillsDir !== undefined;
  const response = await (config.fetch ?? fetch)(
    `${config.contentUrl}/content/${atom}?nonce=${nonce}&by=${agent.address}&sig=${signature}${bundle ? '&bundle=1' : ''}`,
    { signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS) },
  );
  if (!response.ok) {
    const body = await json(response);
    throw new Error(`the content server answered ${response.status}: ${String(body['error'] ?? '')} ${String(body['reason'] ?? '')}`.trim());
  }
  const header = response.headers.get('x-arp-receipt');
  const raw = bundle ? null : new Uint8Array(await response.arrayBuffer());
  const files: BundleFile[] = bundle
    ? (((await response.json()) as { files?: { path: string; base64: string }[] }).files ?? []).map((file) => ({
        path: file.path,
        bytes: new Uint8Array(Buffer.from(file.base64, 'base64')),
      })) // the content server's bundle body; every file is checked against the receipt below
    : [{ path: 'SKILL.md', bytes: raw ?? new Uint8Array() }];
  if (header === null) throw new Error('the content server sent no receipt');
  const signed = JSON.parse(header) as SignedContentReceipt; // checked by the verifications below
  const verdict = await verifyContentReceipt(signed);
  if (verdict.status !== 'valid') throw new Error(`the receipt does not verify (${verdict.status})`);
  const matches = bundle ? bundleMatchesReceipt(signed.receipt, files) : receiptMatchesContent(signed.receipt, raw ?? new Uint8Array());
  if (!matches) throw new Error('the files do not match the receipt');
  if (signed.receipt.to?.toLowerCase() !== agent.address.toLowerCase()) throw new Error('the receipt names another caller');
  const skillMd = files.find((file) => file.path === 'SKILL.md');
  if (skillMd === undefined) throw new Error('the skill came without its SKILL.md');

  const ref = skillRefFromUrl(signed.receipt.url);
  mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  const line: ReceiptLine = { atom: signed.receipt.atom, url: signed.receipt.url, skill: ref?.skill ?? null, receipt: signed };
  appendFileSync(join(config.stateDir, 'receipts.jsonl'), `${JSON.stringify(line)}\n`);
  const served = { atom: signed.receipt.atom, url: signed.receipt.url, name: ref?.skill ?? signed.receipt.url, text: new TextDecoder().decode(skillMd.bytes) };
  if (config.skillsDir === undefined || ref === null || !SAFE_SKILL_NAME.test(ref.skill)) return served;

  // The question is always asked (task 61): an absent `ask` is the same as nobody to ask.
  const prompt = installPrompt(
    signed,
    files,
    join(config.skillsDir, ref.skill),
    config.reviewContext?.(signed.receipt.url) ?? { committedAt: null, thirdParty: [] },
  );
  const answer = config.ask === undefined ? 'unavailable' : await config.ask(prompt);
  // Nothing written, nothing kept: a refusal is not parked for later (user decision 2026-11-03).
  if (answer !== 'accepted') return { ...served, notInstalled: answer, files: files.length };
  const installedAt = installFiles(config.skillsDir, ref.skill, files);
  if (config.projectReceipts !== undefined) recordInstall(config.projectReceipts, ref.skill, signed);
  return { ...served, installedAt, files: files.length };
}

/** This key's agent id: read from `~/.arp`, or minted with gas the sponsor sends once. */
async function ensureAgent(config: LoopConfig, agent: AgentSender): Promise<AgentState> {
  const known = readAgent(config);
  if (known !== null) return known;
  // Signed by this key: the sponsor sends mint gas only to the address that asked for it (ADR `0116`).
  const request = await signMintGasRequest(
    {
      address: agent.address,
      nonce: keccak256(stringToBytes(`mint-gas-${agent.address}-${Date.now()}`)),
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    },
    DESKTOP_CHAIN_ID,
    agent.account,
  );
  const gas = await post(config, '/mint-gas', { request });
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

  const info = await json(await (config.fetch ?? fetch)(config.sponsorUrl, { signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS) }));
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
