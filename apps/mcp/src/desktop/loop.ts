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
import { dirname, join } from 'node:path';

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
  signLineRequest,
  signListToolRequest,
  signMintGasRequest,
  signSponsorRequest,
  skillRefFromUrl,
  sponsorProofDigest,
  verifyContentReceipt,
  type BundleFile,
  type SignedContentReceipt,
  type UsageOutcome,
  type UsageReason,
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

export type ServedSkill = { atom: Hex; url: string; name: string; text: string; installedAt?: string; files?: number };

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

type Service = { name: string; url: string; setting: string };
const sponsoring = (config: LoopConfig): Service => ({
  name: "ARP's sponsoring service",
  url: config.sponsorUrl,
  setting: 'ARP_SPONSOR',
});
const content = (config: LoopConfig): Service => ({
  name: "ARP's content server",
  url: config.contentUrl,
  setting: 'ARP_CONTENT',
});

/** A service that is down names itself and its setting, because the error reaches a person through an agent. */
async function reach(config: LoopConfig, service: Service, url: string, init: RequestInit): Promise<Response> {
  try {
    return await (config.fetch ?? fetch)(url, init);
  } catch (error) {
    const unreachable =
      error instanceof TypeError ||
      (error instanceof Error && /fetch failed|ECONNREFUSED|Unable to connect|TimeoutError/.test(`${error.name} ${error.message}`));
    if (!unreachable) throw error;
    throw new Error(
      `${service.name} did not answer at ${service.url}. Is it running? Its address is set by ${service.setting}. (${error.message})`,
      { cause: error },
    );
  }
}

async function post(config: LoopConfig, path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await reach(config, sponsoring(config), `${config.sponsorUrl}${path}`, {
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
  const response = await reach(
    config,
    content(config),
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
  // Installed under its own name only when that name is a plain directory name: it comes from a URL.
  if (config.skillsDir === undefined || ref === null || !/^[a-z0-9][a-z0-9._-]*$/i.test(ref.skill)) return served;
  const dir = join(config.skillsDir, ref.skill);
  // A different file already at one of these paths is somebody's: another skill of the same name, or
  // one edited by hand. Refused before anything is written, never overwritten (ADR `0116`).
  const clash = files.find((file) => {
    const path = join(dir, file.path);
    return existsSync(path) && !Buffer.from(readFileSync(path)).equals(Buffer.from(file.bytes));
  });
  if (clash !== undefined) {
    throw new Error(
      `${join(dir, clash.path)} already exists with different contents; nothing was installed. ` +
        `Remove ${dir} to install this skill there.`,
    );
  }
  // Every path was checked to stay inside the directory by `bundleMatchesReceipt`.
  for (const file of files) {
    mkdirSync(dirname(join(dir, file.path)), { recursive: true });
    writeFileSync(join(dir, file.path), file.bytes);
  }
  if (config.projectReceipts !== undefined) {
    mkdirSync(join(config.projectReceipts, '..'), { recursive: true });
    const at = new Date(signed.receipt.servedAt * 1000).toISOString();
    appendFileSync(config.projectReceipts, `${JSON.stringify({ skill: ref.skill, atom: signed.receipt.atom, url: signed.receipt.url, at, receipt: signed })}\n`);
  }
  return { ...served, installedAt: join(dir, 'SKILL.md'), files: files.length };
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

/** The agent's identity atom, created by the sponsor the first time. */
async function ensureIdentity(config: LoopConfig, state: AgentState): Promise<Hex> {
  if (state.identityAtom !== undefined) return state.identityAtom;
  const made = await post(config, '/identity', { agentRegistry: registryRef(config), agentId: state.agentId });
  if (made.status !== 200 || typeof made.body['identityAtom'] !== 'string') {
    throw new Error(`the identity could not be created (${made.status}): ${String(made.body['error'] ?? '')}`);
  }
  state.identityAtom = made.body['identityAtom'] as Hex; // a string, checked on the line above
  writeAgent(config, state);
  return state.identityAtom;
}

/** The one approval this key signs, built here: the sponsor's answer to /gas does not choose it. */
async function sponsorApproval(config: LoopConfig) {
  const info = await json(
    await reach(config, sponsoring(config), config.sponsorUrl, { signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS) }),
  );
  // The record's address, not the sponsor's: a wrong sponsor endpoint must not redirect the approval.
  const multiVault = getAddress(config.multiVault);
  if (String(info['multiVault']).toLowerCase() !== multiVault.toLowerCase()) {
    throw new Error(`the sponsor names MultiVault ${String(info['multiVault'])}, not ${multiVault}`);
  }
  return { to: multiVault, data: encodeApproveDeposit(getAddress(String(info['sponsor']))) };
}

/** The sponsor sends the gas, and this key sends the approval it planned. */
async function approveSponsor(config: LoopConfig, agent: AgentSender, ref: object, approval: { to: Address; data: Hex }) {
  const gas = await post(config, '/gas', ref);
  if (gas.status !== 200) throw new Error(`no gas for the approval (${gas.status}): ${String(gas.body['error'] ?? '')}`);
  const next = gas.body['next'] as { to: Address; data: Hex; value: string | number }; // the sponsor's PreparedCall
  await agent.send({ to: next.to, data: next.data, value: BigInt(next.value), chainId: DESKTOP_CHAIN_ID }, [approval]);
}

export type LineInput = { toolUrl: string; domain?: string; outcome: UsageOutcome; reason?: UsageReason };
/** `toolUrl` is the spelling it was listed under, which can differ from the one asked: GitHub's own wins. */
export type WrittenLine = { toolUrl: string; termId: Hex; levels: Hex[]; created: boolean; transactions: Hex[] };

/**
 * Writes one form B line about a tool through ARP's sponsoring service (ADR `0144`): the tool is listed if it
 * has no atom, and the agent is registered and approved the first time. This key signs requests, `register()`
 * and the approval, and nothing that sends value.
 */
export async function writeLine(config: LoopConfig, agent: AgentSender, input: LineInput): Promise<WrittenLine> {
  try {
    const state = await ensureAgent(config, agent);
    const ref = { agentRegistry: registryRef(config), agentId: state.agentId };
    await ensureIdentity(config, state);
    const approval = await sponsorApproval(config);
    const expiresAt = () => Math.floor(Date.now() / 1000) + 600;

    const listing = await signListToolRequest(
      { address: agent.address, url: input.toolUrl, nonce: keccak256(stringToBytes(`list-${input.toolUrl}-${Date.now()}`)), expiresAt: expiresAt() },
      DESKTOP_CHAIN_ID,
      agent.account,
    );
    const listed = await post(config, '/list-tool', { url: input.toolUrl, request: listing });
    if (listed.status !== 200 || typeof listed.body['atomId'] !== 'string') {
      throw new Error(`the tool could not be listed (${listed.status}): ${String(listed.body['error'] ?? '')}`);
    }
    const tool = listed.body['atomId'] as Hex; // a string, checked on the line above

    const wait = config.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
    const deadline = Date.now() + (config.indexerWaitMs ?? 120_000);
    let approved = false;
    for (;;) {
      const request = await signLineRequest(
        {
          agent: agent.address,
          ...ref,
          tool,
          domain: input.domain ?? '',
          outcome: input.outcome,
          reason: input.reason ?? '',
          nonce: keccak256(stringToBytes(`line-${tool}-${Date.now()}`)),
          expiresAt: expiresAt(),
        },
        DESKTOP_CHAIN_ID,
        agent.account,
      );
      const answer = await post(config, '/line', { request });
      if (answer.status === 200) {
        return {
          toolUrl: String(listed.body['url']),
          termId: answer.body['termId'] as Hex, // the service's own answer
          levels: answer.body['levels'] as Hex[], // the service's own answer
          created: answer.body['created'] === true,
          transactions: answer.body['transactions'] as Hex[], // the service's own answer
        };
      }
      const error = String(answer.body['error'] ?? '');
      if (answer.status === 403 && /no identity atom on the graph/.test(error) && Date.now() < deadline) {
        await wait(5_000);
        continue;
      }
      if (answer.status === 409 && answer.body['approve'] !== undefined && !approved) {
        await approveSponsor(config, agent, ref, approval);
        approved = true;
        continue;
      }
      throw new Error(`the sponsor refused the line (${answer.status}): ${error}`);
    }
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && /fetch failed|ECONNREFUSED|Unable to connect|TimeoutError/.test(`${error.name} ${error.message}`))) {
      throw new Error(`ARP's sponsoring service did not answer at ${config.sponsorUrl}. Is it running? (${error.message})`, { cause: error });
    }
    throw error;
  }
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

  const identityAtom = await ensureIdentity(config, state);

  const multiVault = getAddress(config.multiVault);
  const approval = await sponsorApproval(config);
  const termId = await agent.client.readContract({
    address: multiVault,
    abi: multiVaultDeclareAbi,
    functionName: 'calculateTripleId',
    args: [identityAtom, INTUITION_USES_TERM_ID, served.atom],
  });
  const proof = { kind: 'content' as const, receipt: served.receipt };
  const triple = { subjectId: identityAtom, predicateId: INTUITION_USES_TERM_ID, objectId: served.atom };

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
      await approveSponsor(config, agent, ref, approval);
      approved = true;
      continue;
    }
    throw new Error(`the sponsor refused (${answer.status}): ${error}`);
  }
}
