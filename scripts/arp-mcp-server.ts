/** ARP's MCP node — the surface an agent reads tool reputation through, and declares through.
 *
 *  Phase 1 of `docs/15_ROADMAP.md`, the first half of `tasks/16`. **Run it yourself** (ADR `0045`):
 *  the invariant is that ARP is never in the path of a request, and code on the operator's machine
 *  is not in the path while a host they must reach is.
 *
 *      bun run scripts/arp-mcp-server.ts --stdio              # for an MCP client to launch
 *      bun run scripts/arp-mcp-server.ts                      # mainnet 1155, listens on :3002
 *      ARP_TARGET=testnet bun run scripts/arp-mcp-server.ts   # testnet 13579
 *      PORT=4000 bun run scripts/arp-mcp-server.ts
 *
 *  Two transports over **one** dispatch: `handler.fetch` is the only place a method is handled, and
 *  the stdio loop wraps it rather than re-implementing it. In stdio mode **stdout is the protocol
 *  channel**, so every diagnostic goes to stderr — a stray `console.log` there corrupts the stream.
 *
 *  MCP over HTTP is JSON-RPC with three methods — `initialize`, `tools/list`, `tools/call` — so it
 *  is hand-rolled rather than pulling a dependency. `@arp-protocol/core` holds the protocol logic; this file is
 *  a transport over it, which is why it lives in `scripts/` and not in the connector
 *  (`rules/portability.md`).
 *
 *  **It signs nothing and sends nothing.** One tool reads. The two planners return prepared calls
 *  for the agent to sign with its own key — ARP holds no key, so it cannot spend an operator's
 *  TRUST even by mistake (ADR `0038`), which is what makes "ARP is not a party" (ADR `0035`) a
 *  property rather than a promise.
 *
 *  Two things it is deliberately not:
 *    - not meant to be a host an agent depends on — and today it is one. Planning lives here: atom
 *      resolution, the refuse-on-ambiguous rule, the cost reads. If this process is down an agent
 *      cannot build its plan. "The agent chooses to call it", which this comment used to argue, is
 *      true of signing and false of planning. ADR `0045` moves this to a node the operator runs; the
 *      dependency is real until then and is stated here rather than defended.
 *    - not a scorer. It returns what was staked and by whom, with provenance. Composing that into a
 *      single number is a decision nobody has made (`docs/01` rejects being one more score).
 */

import { readFileSync } from 'node:fs';

import {
  intuitionToolAtomLookup,
  multiVaultReads,
  prepareDeclareUsed,
  prepareMarketExit,
  prepareMarketPosition,
  prepareStakeOnUsed,
  resolveDeclarationSubject,
  type DeclarePlan,
  type PreparedCall,
  type StakePlan,
} from '../packages/protocol/src/declare/index.js';
import { toCaip19 } from '../packages/protocol/src/caip.js';
import { listTools, type ToolListingOrder } from '../packages/protocol/src/tool-listing.js';
import { getAddress } from 'viem';

import { listRegisteredTools } from '../packages/protocol/src/registered-tools.js';
import { toolsInDomain } from '../packages/protocol/src/domains.js';
import {
  planReachability,
  readReachabilityState,
} from '../packages/protocol/src/declare/reachability-plan.js';
import { verdictOf } from '../packages/protocol/src/reachability.js';
import {
  HAS_TAG,
  IS_A_SUB_DOMAIN_OF,
} from '../packages/protocol/src/sources/intuition/terms.js';
import catalogue from '../catalogue/tools.json';
import { createErc8004Client } from '../packages/protocol/src/client.js';
import { resolveAgent } from '../packages/protocol/src/profile.js';
import {
  partitionByCheckability,
  readDeclaredEndpoints,
} from '../packages/protocol/src/verify/declaration.js';
import { probeEndpoint } from '../packages/protocol/src/verify/probe.js';
import { listAgents } from '../packages/protocol/src/listing.js';
import { intuitionSource } from '../packages/protocol/src/sources/intuition/index.js';
import type { AgentListOrder } from '../packages/protocol/src/types.js';
import { getToolUsage, type ToolUsage } from '../packages/protocol/src/tool-usage.js';
import { TOOLS } from './arp-mcp-tools.js';

const PORT = Number(process.env.PORT ?? 3002);
const PROTOCOL_VERSION = '2025-06-18';

/**
 * Which chain this server plans against — config with a default, never a module constant.
 *
 * `rules/portability.md` rule 1, and rule 3 is why it matters here: a triple costs 0.1 TRUST on
 * 1155 and 0.001 on 13579. The addresses and URLs come from `deployments/<chainId>.json` at
 * startup, read rather than imported, so a mainnet server cannot be served a testnet constant.
 */
const TARGETS = { mainnet: 1155, testnet: 13579 } as const;
const targetName = (process.env.ARP_TARGET ?? 'mainnet') as keyof typeof TARGETS;
const chainId = TARGETS[targetName];
if (chainId === undefined) {
  console.error(`ARP_TARGET must be one of ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}

type DeploymentRecord = {
  chain?: { rpcUrl?: string; graphqlUrl?: string; name?: string };
  intuition?: { multiVault?: string };
};

const record = JSON.parse(
  readFileSync(new URL(`../deployments/${chainId}.json`, import.meta.url), 'utf8'),
) as DeploymentRecord;

const GRAPHQL_URL = process.env.INTUITION_GRAPHQL_URL ?? record.chain?.graphqlUrl;
const RPC_URL = process.env.INTUITION_RPC_URL ?? record.chain?.rpcUrl;
const MULTI_VAULT_RAW = (process.env.ARP_MULTI_VAULT ?? record.intuition?.multiVault) as
  | `0x${string}`
  | undefined;

/**
 * Narrowed once, here, because the guard below cannot do it.
 *
 * `process.exit` is not typed `never`, so TypeScript keeps all three as `T | undefined` everywhere
 * downstream and every use is an error. The repo never saw them: `scripts/` is outside `tsc -b`,
 * outside eslint and outside `bun build`'s checks — `rules/claims.md` §4 names that gap by name.
 * Two had accumulated by 2026-10-29. Re-assigning after the guard fixes every call site at once
 * and keeps the loud failure the guard exists for.
 */
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined || value === null || value === '') {
    console.error(`deployments/${chainId}.json is missing ${what}`);
    process.exit(1);
  }
  return value;
}

const GRAPHQL = required(GRAPHQL_URL, 'a graphqlUrl');
const RPC = required(RPC_URL, 'an rpcUrl');
const MULTI_VAULT = required(MULTI_VAULT_RAW, 'a multiVault');

const reads = multiVaultReads({ address: MULTI_VAULT, chainId, rpcUrl: RPC });

/**
 * So an `https://` tool reuses the atom it already has instead of minting a metadata-less one
 * beside it. Measured by `scripts/measure/tool-atom-shape.ts`: 78 of the 84 tool atoms on mainnet
 * `uses` edges are `ipfs://` and 77 of those resolve a pinned Thing. A graph read, no credential.
 */
const toolAtoms = intuitionToolAtomLookup({ graphqlUrl: GRAPHQL });

/** The label every domain path climbs to. One word, no hyphen — the user's rule, 2026-10-28. It is
 *  a convention and the one arbitrary choice in the vocabulary, so it is named once here rather
 *  than repeated at each call site. */
const DOMAIN_ROOT = 'tool';

/**
 * `reachable` — the object of the one claim here a third party can reproduce.
 *
 * A plain string, so its id follows from the word and is **the same on both chains**: verified
 * 2026-10-29, `0x997fd60b…` on 1155 and on 13579, and already created on both. Nothing has to be
 * minted to start recording.
 */
const REACHABLE_ATOM =
  '0x997fd60b1bd203d0c579fb72eea70e585d2fbd68287a911b7cc0e7ed0eae0805' as `0x${string}`;

/**
 * The address whose positions define ARP's domain tree.
 *
 * A term is in the tree because this address paid to put it there, by creating it with a deposit or
 * by backing one somebody else created — the two are the same act (the user, 2026-10-28). It is a
 * published reading and not a permission: nobody is prevented from writing, and a caller can read
 * the unfiltered graph instead. On 13579 the hierarchy predicate carries 60 triples and this
 * address has a position on 17 of them; the other 43 belong to a different project and to its test
 * runs.
 *
 * Checksummed, because the indexer's `positions.account_id` is and a lowercase filter returns zero
 * rows — which reads as "nobody staked" rather than as a bad query.
 */
/**
 * ARP's published domain attestor — the address whose positions are ARP's index.
 *
 * A **default**, not a fallback to the operator's own address. ADR `0045` has every operator run
 * this node on their own machine, so the attestor has to travel with the code: an operator who
 * clones the repo and starts the node must get ARP's index without configuring anything.
 *
 * The first version of this read `ARP_DOMAIN_ATTESTOR ?? AGENT_ADDRESS`, which was right for one
 * laptop and wrong for a distributed node: `AGENT_ADDRESS` is the *operator's own* agent, it has no
 * position on any ARP domain, so every operator's node would have read an **empty index** and
 * reported that ARP has filed nothing. Silent, and indistinguishable from an empty registry.
 *
 * Override it with `ARP_DOMAIN_ATTESTOR` to read somebody else's index, or your own once you have
 * filed domains yourself. Blank it to disable domain search altogether — the search then refuses
 * rather than falling back to the unfiltered graph.
 */
const ARP_DOMAIN_ATTESTOR = '0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f';

function configuredAttestor(): string | undefined {
  const raw = process.env['ARP_DOMAIN_ATTESTOR'] ?? ARP_DOMAIN_ATTESTOR;
  // `??` alone let an EMPTY string through, because an empty string is not nullish: the guard below
  // saw a value, the query ran with `account_id: ""`, and every domain came back with nothing in
  // it. A search that silently returns zero rows reads as "this domain is empty", not as "this node
  // is misconfigured" — the same trap as the lowercase address, one level up.
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const address = raw.trim();
  if (/^0x[0-9a-f]{40}$/.test(address) || /^0x[0-9A-F]{40}$/.test(address)) {
    // Normalised rather than refused. The indexer's `positions.account_id` is checksummed and a
    // lowercase filter matches nothing, so a perfectly valid address written in lower case would
    // return an empty index for every domain — which reads as "ARP has filed nothing" rather than
    // as a configuration mistake. `getAddress` throws on a bad address and returns the checksummed
    // form otherwise, so this both fixes the case and validates the value.
    try {
      return getAddress(address);
    } catch {
      console.error(`ARP_DOMAIN_ATTESTOR is not a valid address: ${JSON.stringify(address)} — domain search disabled.`);
      return undefined;
    }
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    // Refused at load, not at call time. A malformed attestor cannot produce a correct index, and
    // failing at the first search would make it look like a data problem.
    // `console.error`, not `log`: this runs at module load and `log` is declared further down, so
    // calling it here threw a ReferenceError and took the whole server down before it could serve
    // anything. stderr is the right stream in both transports anyway — on stdio, stdout is the
    // protocol.
    console.error(
      `ARP_DOMAIN_ATTESTOR is not a 0x address: ${JSON.stringify(address)} — domain search disabled.`,
    );
    return undefined;
  }
  return address;
}

/**
 * The address whose positions define this node's domain index. Set once, at load.
 *
 * Not a request parameter, deliberately — see the note in `findTools`.
 */
const DOMAIN_ATTESTOR = configuredAttestor();

/**
 * The directory read, pointed at the same graph as everything else here.
 *
 * Only the Intuition source: the registry source answers per-agent questions and cannot list, and
 * `listAgents` throws `NoListingSourceError` rather than silently returning an empty page when no
 * source can. Explicit about `graphqlUrl` because the default is mainnet, and a testnet node
 * serving a mainnet directory is the kind of mix-up `rules/portability.md` rule 1 exists for.
 */
const directory = createErc8004Client({
  sources: [intuitionSource({ graphqlUrl: GRAPHQL })],
});

type JsonRpcId = string | number | null;
type Rpc = { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };

function result(id: JsonRpcId, value: unknown) {
  return Response.json({ jsonrpc: '2.0', id, result: value });
}

/** JSON-RPC error codes. -32602 is invalid params, -32601 method not found, -32603 internal. */
function fail(id: JsonRpcId, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function text(id: JsonRpcId, value: unknown) {
  return result(id, { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
}

/** Amounts are strings: a TRUST figure does not survive JSON's number type. */
function serialise(usage: ToolUsage) {
  const side = (s: { totalAssets: bigint | null; positionCount: number | null }) => ({
    total_assets_wei: (s.totalAssets ?? 0n).toString(),
    position_count: s.positionCount ?? 0,
  });
  return {
    tool_atom_id: usage.toolAtomId,
    label: usage.label,
    pinned_uri: usage.pinnedUri,
    totals: {
      support_assets_wei: usage.totals.supportAssets.toString(),
      oppose_assets_wei: usage.totals.opposeAssets.toString(),
      support_positions: usage.totals.supportPositions,
      oppose_positions: usage.totals.opposePositions,
    },
    edges: usage.edges.map((e) => ({
      triple_id: e.tripleId,
      agent: e.agent,
      support: side(e.support),
      oppose: side(e.oppose),
      // The tier a reader must not flatten: an edge with no stake behind it is not weak
      // evidence, it is none (docs/14).
      //
      // Keyed on the POSITION COUNT, not the assets. Creating a triple seeds its vault with
      // `minShare`, so `total_assets` is never zero for an edge that exists — measured on mainnet
      // 2026-10-19, every unbacked IPFS edge reports exactly 1000000 wei with zero positions. This
      // line read `totalAssets > 0n` and so answered `staked: true` for all 7 of IPFS's edges,
      // including the 4 nobody has backed. The caveat below promises the flag means something; it
      // did not. ADR `0042`.
      staked: (e.support.positionCount ?? 0) > 0,
    })),
    provenance: usage.provenance,
    caveat:
      'Each edge is an assertion somebody wrote; the market prices it. An edge with ' +
      'staked=false carries no weight at all. ARP composes no score.',
  };
}

const serialiseCall = (call: PreparedCall) => ({
  kind: call.kind,
  // On every call, not only on the plan: each MultiVault is codeless on the other chain, and a
  // value-bearing call to a codeless address succeeds as a plain transfer instead of reverting.
  chain_id: call.chainId,
  to: call.to,
  value_wei: call.value.toString(),
  data: call.data,
  why: call.why,
  // What the chain says the call buys, read before anything is signed. `shares: "0"` means the
  // term would be born with no position — on the chain, and not a market (ADR `0053`).
  ...(call.preview === undefined
    ? {}
    : {
        preview: {
          shares: call.preview.shares.toString(),
          assets_after_fees_wei: call.preview.assetsAfterFees.toString(),
        },
      }),
});

/**
 * What a client is told at `initialize`, and the only context an agent gets if it never reads
 * `skills/arp/SKILL.md`.
 *
 * It used to be four sentences of **precautions** — unsigned calls, position counts, no score. All
 * true, and useless as context: it told a caller what to be careful about and nothing about what the
 * work is or why it would be worth doing. A tool list plus a list of warnings leaves an agent knowing
 * which calls exist and not one reason to make any of them.
 *
 * So it carries the same frame the skill does: what the expense buys, the four jobs, and which of
 * them needs nothing. The precautions are still here — they are the last line, where a precaution
 * belongs.
 */
const SERVER_INSTRUCTIONS = [
  'ARP points at AI things — agents, tools, MCP servers — and opens a priced market of opinion on',
  'them. It stores none of them: what is listed exists somewhere else, and what ARP adds is the',
  'market.',
  '',
  'WHY SPEND ON THIS. Declaring costs 0.1 TRUST on mainnet and the fee does not come back. What it',
  'buys is a record that you used a tool which is public, attributed to you, and permanent — a review',
  'is free, so it is worth what it cost. Other agents read that when choosing whom to hire. If you',
  'never declare anything, you are not in that set.',
  '',
  'A deposit is a different act from a declaration, and it goes both ways: you buy a position on an',
  'agent or a tool, and you can redeem it. So a figure you read is what people hold NOW, not what was',
  'ever put in. Anyone can deposit against a claim at the same price, but almost nobody does — 1 of',
  '185 `uses` edges on mainnet 1155 as of 2026-10-21 — so read an empty counter vault as "nobody',
  'bothered", never as agreement.',
  '',
  'FOUR JOBS, and they need different things:',
  '  check a tool or an agent   needs NOTHING — public reads, no wallet, no identity. Start here.',
  '  declare what you used      needs a funded wallet and an ERC-8004 identity',
  '  list a tool nobody has     needs a funded wallet. An atom has no subject, so no identity',
  '  be hired                   needs an endpoint YOU run. Nothing here provides it',
  '',
  'THIS SERVER PREPARES CALLS AND NOTHING ELSE. It holds no key and has no send path: every planner',
  'returns UNSIGNED calls that you sign and send yourself. Reading is free and needs none of that.',
  '',
  'TWO THINGS TO KNOW BEFORE ACTING ON A NUMBER. Assets above zero mean the term exists, not that',
  'somebody staked — creating a term seeds its vaults; position_count is the discriminator. And ARP',
  'composes no score: every figure is a deposit somebody else made.',
].join('\n');

/** Said on every plan, because a caller who assumes ARP executed it will not check that it did. */
const UNSIGNED_CAVEAT =
  'These calls are UNSIGNED and nothing has been sent. ARP holds no key and has no send ' +
  'path: sign them with your own wallet, in the order given, and send them yourself. ' +
  'Creating a term costs a non-recoverable fee — compare total_value_wei against your budget ' +
  'first.';

function serialiseDeclarePlan(plan: DeclarePlan) {
  return {
    chain_id: plan.chainId,
    subject_atom_id: plan.subject,
    predicate_term_id: plan.predicate,
    tools: plan.tools.map((tool) => ({
      uri: tool.uri,
      // Not always `uri`: for an http(s) URL the atom derives from a Thing computed off the
      // normalised URL, so this is the `ipfs://` string the id is actually the hash of.
      atom_uri: tool.atomUri,
      atom_id: tool.atomId,
      atom_source: tool.atomSource,
      triple_id: tool.tripleId,
      atom_exists: tool.atomExists,
      triple_exists: tool.tripleExists,
      // The bytes to pin for this atom to read as a name instead of a hash. Creating, declaring
      // and staking all work without it; only legibility does not.
      ...(tool.pinDocument === undefined ? {} : { pin_document: tool.pinDocument }),
      ...(tool.bareUrlWarning === undefined ? {} : { bare_url_warning: tool.bareUrlWarning }),
    })),
    calls: plan.calls.map(serialiseCall),
    existing_terms: plan.existingTerms,
    total_value_wei: plan.totalValue.toString(),
    caveat: UNSIGNED_CAVEAT,
  };
}

function serialiseStakePlan(plan: StakePlan) {
  return {
    chain_id: plan.chainId,
    curve_id: plan.curveId.toString(),
    min_deposit_wei: plan.minDeposit.toString(),
    targets: plan.targets.map((target) => ({
      triple_id: target.tripleId,
      receiver: target.receiver,
      amount_wei: target.amount.toString(),
      exists: target.exists,
    })),
    calls: plan.calls.map(serialiseCall),
    total_value_wei: plan.totalValue.toString(),
    caveat: UNSIGNED_CAVEAT,
  };
}

const isTermId = (value: unknown): value is `0x${string}` =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
const isAddress = (value: unknown): value is `0x${string}` =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);

async function toolReputation(id: JsonRpcId, args: Record<string, unknown>) {
  const toolAtomId = args['tool_atom_id'];
  if (!isTermId(toolAtomId)) {
    return fail(id, -32602, 'tool_atom_id must be a 0x-prefixed 32-byte hex string');
  }
  const attestedBy = typeof args['attested_by'] === 'string' ? args['attested_by'] : undefined;
  const usage = await getToolUsage(toolAtomId, {
    graphqlUrl: GRAPHQL,
    ...(attestedBy === undefined ? {} : { attestedBy }),
  });
  return text(id, serialise(usage));
}

async function declareUsed(id: JsonRpcId, args: Record<string, unknown>) {
  const agentChainId = args['agent_chain_id'];
  const agentTokenId = args['agent_token_id'];
  const tools = args['tools'];
  if (typeof agentChainId !== 'number' || !Number.isInteger(agentChainId) || agentChainId <= 0) {
    return fail(id, -32602, 'agent_chain_id must be a positive integer');
  }
  if (typeof agentTokenId !== 'string' || !/^\d+$/.test(agentTokenId)) {
    return fail(id, -32602, 'agent_token_id must be a decimal string');
  }
  if (!Array.isArray(tools) || tools.some((tool) => typeof tool !== 'string')) {
    return fail(id, -32602, 'tools must be an array of URI strings');
  }

  const subject = await resolveDeclarationSubject({
    agent: { chainId: agentChainId, tokenId: agentTokenId },
    graphqlUrl: GRAPHQL,
  });
  const plan = await prepareDeclareUsed({
    subject,
    tools: tools as string[],
    reads,
    lookup: toolAtoms,
  });
  return text(id, serialiseDeclarePlan(plan));
}

async function stakeOnUsed(id: JsonRpcId, args: Record<string, unknown>) {
  const receiver = args['receiver'];
  const targets = args['targets'];
  if (!isAddress(receiver)) return fail(id, -32602, 'receiver must be a 20-byte hex address');
  if (!Array.isArray(targets) || targets.length === 0) {
    return fail(id, -32602, 'targets must be a non-empty array');
  }

  const parsed: { tripleId: `0x${string}`; amount: bigint }[] = [];
  for (const target of targets) {
    const row = target as Record<string, unknown>;
    if (!isTermId(row['triple_id'])) {
      return fail(id, -32602, 'each target needs a triple_id of 0x + 32 bytes');
    }
    const amountRaw = row['amount_wei'];
    if (typeof amountRaw !== 'string' || !/^\d+$/.test(amountRaw)) {
      return fail(id, -32602, 'each target needs amount_wei as a decimal string of wei');
    }
    parsed.push({ tripleId: row['triple_id'], amount: BigInt(amountRaw) });
  }

  const curveRaw = args['curve_id'];
  if (curveRaw !== undefined && (typeof curveRaw !== 'number' || !Number.isInteger(curveRaw))) {
    return fail(id, -32602, 'curve_id must be an integer');
  }

  const plan = await prepareStakeOnUsed({
    targets: parsed,
    receiver,
    reads,
    ...(curveRaw === undefined ? {} : { curveId: BigInt(curveRaw) }),
  });
  return text(id, serialiseStakePlan(plan));
}

/**
 * Join the market on an atom.
 *
 * **A different act from `arp_stake_on_used`**, and the server keeps them apart for the reason ADR
 * `0056` does: backing a `uses` edge says *this claim is true* and is attributable to whoever wrote
 * it; depositing on an atom says *this thing is worth something* and anyone may do it for any
 * reason. The two are never summed.
 *
 * This is the gap that made the node read-only on the thing it exists for: measured 2026-10-28,
 * **2,354 TRUST across 23 positions** sits on 39 skill atoms on mainnet 1155, and until now not one
 * wei of it was reachable from here.
 */
async function takePosition(id: JsonRpcId, args: Record<string, unknown>) {
  const termId = args['term_id'];
  const receiver = args['receiver'];
  if (!isTermId(termId)) return fail(id, -32602, 'term_id must be 0x + 32 bytes');
  if (!isAddress(receiver)) return fail(id, -32602, 'receiver must be a 0x address');

  const amountRaw = args['amount_wei'];
  if (typeof amountRaw !== 'string' || !/^\d+$/.test(amountRaw)) {
    return fail(id, -32602, 'amount_wei must be a decimal string of wei');
  }
  const curveRaw = args['curve_id'];
  if (curveRaw !== undefined && (typeof curveRaw !== 'number' || !Number.isInteger(curveRaw))) {
    return fail(id, -32602, 'curve_id must be an integer');
  }
  const minSharesRaw = args['min_shares'];
  if (
    minSharesRaw !== undefined &&
    (typeof minSharesRaw !== 'string' || !/^\d+$/.test(minSharesRaw))
  ) {
    return fail(id, -32602, 'min_shares must be a decimal string');
  }

  const plan = await prepareMarketPosition({
    termId,
    amount: BigInt(amountRaw),
    receiver,
    reads,
    ...(curveRaw === undefined ? {} : { curveId: BigInt(curveRaw) }),
    ...(minSharesRaw === undefined ? {} : { minShares: BigInt(minSharesRaw) }),
  });

  return text(id, {
    term_id: plan.termId,
    receiver: plan.receiver,
    curve_id: plan.curveId.toString(),
    amount_wei: plan.amount.toString(),
    shares: plan.shares.toString(),
    assets_after_fees_wei: plan.assetsAfterFees.toString(),
    min_deposit_wei: plan.minDeposit.toString(),
    chain_id: plan.chainId,
    calls: plan.calls.map(serialiseCall),
    caveat: UNSIGNED_CAVEAT,
  });
}

/**
 * Leave the market on an atom.
 *
 * It ships with the way in rather than after it: ADR `0056`, in the user's own words — *a deposit
 * nobody can withdraw is a donation*, and a one-directional market is a collection box.
 *
 * The call it returns sends **no value**, which is unique on this server. What the redemption
 * fetches is read from `previewRedeem` rather than derived from the share count, because the exit
 * fee is governance-configurable and curve 2 is not linear in shares.
 */
async function exitPosition(id: JsonRpcId, args: Record<string, unknown>) {
  const termId = args['term_id'];
  const account = args['account'];
  const receiver = args['receiver'];
  if (!isTermId(termId)) return fail(id, -32602, 'term_id must be 0x + 32 bytes');
  if (!isAddress(account)) return fail(id, -32602, 'account must be a 0x address');
  if (!isAddress(receiver)) return fail(id, -32602, 'receiver must be a 0x address');

  const sharesRaw = args['shares'];
  if (sharesRaw !== undefined && (typeof sharesRaw !== 'string' || !/^\d+$/.test(sharesRaw))) {
    return fail(id, -32602, 'shares must be a decimal string');
  }
  const curveRaw = args['curve_id'];
  if (curveRaw !== undefined && (typeof curveRaw !== 'number' || !Number.isInteger(curveRaw))) {
    return fail(id, -32602, 'curve_id must be an integer');
  }
  const minAssetsRaw = args['min_assets'];
  if (
    minAssetsRaw !== undefined &&
    (typeof minAssetsRaw !== 'string' || !/^\d+$/.test(minAssetsRaw))
  ) {
    return fail(id, -32602, 'min_assets must be a decimal string');
  }

  const plan = await prepareMarketExit({
    termId,
    account,
    receiver,
    reads,
    ...(sharesRaw === undefined ? {} : { shares: BigInt(sharesRaw) }),
    ...(curveRaw === undefined ? {} : { curveId: BigInt(curveRaw) }),
    ...(minAssetsRaw === undefined ? {} : { minAssets: BigInt(minAssetsRaw) }),
  });

  return text(id, {
    term_id: plan.termId,
    receiver: plan.receiver,
    curve_id: plan.curveId.toString(),
    shares: plan.shares.toString(),
    held_shares: plan.held.toString(),
    assets_after_fees_wei: plan.assetsAfterFees.toString(),
    chain_id: plan.chainId,
    calls: plan.calls.map(serialiseCall),
    caveat: UNSIGNED_CAVEAT,
  });
}

/**
 * Where another agent said it can be reached.
 *
 * **ARP is not in the path of what you do with it.** `docs/12`: unplug ARP's servers and every
 * agent-to-agent call still completes. This hands over an address the agent published about itself;
 * the call that follows is between the two of you, and ADR `0060` is why there is no step in
 * between — a delegation names its delegate by address, an agent's runtime address is not on the
 * graph, so brokering a meeting is a promise with no mechanism. Handing over a published address is
 * not brokering.
 *
 * Declared, **not verified**: an agent writes its own card. `arp_probe_endpoint` is the separate
 * question, deliberately separate, because what was published and what answers are two facts.
 */
async function agentEndpoints(id: JsonRpcId, args: Record<string, unknown>) {
  const agentChainId = args['agent_chain_id'];
  const agentTokenId = args['agent_token_id'];
  if (typeof agentChainId !== 'number' || !Number.isInteger(agentChainId) || agentChainId <= 0) {
    return fail(id, -32602, 'agent_chain_id must be a positive integer');
  }
  if (typeof agentTokenId !== 'string' || !/^\d+$/.test(agentTokenId)) {
    return fail(id, -32602, 'agent_token_id must be a decimal string');
  }
  const registryRaw = args['registry'];
  if (registryRaw !== undefined && !isAddress(registryRaw)) {
    return fail(id, -32602, 'registry, when given, must be a 20-byte hex address');
  }

  const agent = {
    chainId: agentChainId,
    tokenId: agentTokenId,
    ...(registryRaw === undefined ? {} : { registry: registryRaw }),
  };
  const identity = await resolveAgent(directory, agent);
  const file = identity?.registrationFile ?? null;
  if (file === null || file.trim() === '') {
    return text(id, {
      caip19: toCaip19(agent),
      registration_file: null,
      note: 'This agent registered without a document, so it published no way in.',
    });
  }

  let document: unknown;
  try {
    if (file.startsWith('data:')) {
      // Inline in the tokenURI — the shape an agent picks when it wants no hosting dependency.
      const comma = file.indexOf(',');
      const payload = file.slice(comma + 1);
      document = JSON.parse(
        file.slice(0, comma).includes(';base64')
          ? Buffer.from(payload, 'base64').toString('utf8')
          : decodeURIComponent(payload),
      );
    } else {
      const url = file.startsWith('ipfs://')
        ? `https://ipfs.io/ipfs/${file.slice('ipfs://'.length)}`
        : file;
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) {
        return text(id, {
          caip19: toCaip19(agent),
          registration_file: file,
          error: `the host answered ${response.status}`,
          note: 'Published something we could not read, which is a different answer from publishing nothing.',
        });
      }
      document = await response.json();
    }
  } catch (error) {
    return text(id, {
      caip19: toCaip19(agent),
      registration_file: file,
      error: error instanceof Error ? error.message : String(error),
      note: 'Published something we could not read, which is a different answer from publishing nothing.',
    });
  }

  // Split, never merged: showing them as one list implies the second group failed a check it was
  // never given.
  const { probeable, notCheckable } = partitionByCheckability(readDeclaredEndpoints(document));
  return text(id, {
    caip19: toCaip19(agent),
    registration_file: file,
    callable: probeable.map((endpoint) => ({
      name: endpoint.name,
      protocol: endpoint.protocol,
      version: endpoint.version,
      url: endpoint.classification.status === 'probeable' ? endpoint.classification.url : null,
      capabilities: endpoint.capabilities,
    })),
    not_callable: notCheckable.map((endpoint) => ({
      name: endpoint.name,
      declared:
        endpoint.classification.status === 'probeable' ? null : endpoint.classification.declared,
      why: endpoint.classification.status === 'probeable' ? null : endpoint.classification.code,
    })),
    note: "The agent's own claim about itself. `arp_probe_endpoint` asks whether one answers.",
  });
}

/**
 * Does this endpoint answer?
 *
 * The verdict vocabulary is the prober's and the asymmetry in it is principled: a timeout **is** an
 * answer about the agent, because an endpoint that cannot respond in eight seconds is not serving
 * callers; a TLS or DNS failure is **not**, because it could equally be us; a `429` is never a
 * verdict, it is the host asking us to stop. Some genuinely dead endpoints therefore land in
 * `inconclusive` — a true positive given up rather than a false accusation risked, and the observed
 * body is carried so a caller can draw its own conclusion from the same evidence.
 *
 * It lives here and not in the app for one reason: a probe in a browser would be every reader of a
 * page firing at somebody else's host.
 */
async function probe(id: JsonRpcId, args: Record<string, unknown>) {
  const url = args['url'];
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return fail(id, -32602, 'url must be an http or https address');
  }
  const protocolRaw = args['protocol'];
  if (protocolRaw !== undefined && protocolRaw !== 'mcp' && protocolRaw !== 'a2a') {
    return fail(id, -32602, "protocol, when given, must be 'mcp' or 'a2a'");
  }

  const outcome = await probeEndpoint({
    declaredUnder: 'endpoints',
    name: protocolRaw ?? null,
    protocol: (protocolRaw as 'mcp' | 'a2a' | undefined) ?? null,
    version: null,
    capabilities: [],
    classification: { status: 'probeable', url, declared: url },
  });
  return text(id, { url, outcome });
}

/**
 * Probe an endpoint and plan the position that records what you found.
 *
 * The node has been producing the only reproducible claim in this system and throwing it away. This
 * writes it — or rather, prepares the write: the caller signs with **its own** key, so what lands is
 * *this agent's* verdict and not ARP's. ARP's index reads the attestor's positions; everybody
 * else's sit beside them, and a disagreement between them is the signal to re-probe.
 *
 * **One observation is enough here, and that is deliberate.** The scheduled prober needs three
 * consecutive down verdicts before condemning, because it is making a public judgement about
 * somebody else's service from the outside and condemning takes an author's visibility away. An
 * agent that called an endpoint and got nothing is reporting **what happened to it**. Asking it for
 * three confirmations would be asking it to doubt its own experience.
 *
 * It plans and does not sign (ADR `0038`), like every other write path on this node.
 */
async function recordReachable(id: JsonRpcId, args: Record<string, unknown>) {
  const url = args['url'];
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return fail(id, -32602, 'url must be an http or https address');
  }
  const toolAtomId = args['tool_atom_id'];
  if (!isTermId(toolAtomId)) {
    return fail(id, -32602, 'tool_atom_id must be 0x + 32 bytes — arp_find_tools returns them');
  }
  const receiver = args['receiver'];
  if (!isAddress(receiver)) return fail(id, -32602, 'receiver must be a 0x address');
  const protocolRaw = args['protocol'];
  if (protocolRaw !== undefined && protocolRaw !== 'mcp' && protocolRaw !== 'a2a') {
    return fail(id, -32602, "protocol, when given, must be 'mcp' or 'a2a'");
  }

  const outcome = await probeEndpoint({
    declaredUnder: 'endpoints',
    name: protocolRaw ?? null,
    protocol: (protocolRaw as 'mcp' | 'a2a' | undefined) ?? null,
    version: null,
    capabilities: [],
    classification: { status: 'probeable', url, declared: url },
  });

  const verdict = verdictOf(outcome);
  const curveId = await reads.defaultCurveId();
  const state = await readReachabilityState(
    reads,
    receiver,
    toolAtomId,
    HAS_TAG,
    REACHABLE_ATOM,
    curveId,
  );

  // `minDeposit` read per call, never copied: it is 10x apart between chains and governance may
  // move it (`rules/portability.md` rule 3).
  const stake = await reads.minDeposit();
  // Read for the same reason as `stake`, and spent only when the claim is not on chain yet — which
  // is the common case for a tool nobody has reported on before.
  const tripleCost = await reads.tripleCost();
  const plan = planReachability(state, [verdict], {
    multiVault: MULTI_VAULT,
    chainId,
    receiver,
    curveId,
    stake,
    tripleCost,
    toolLabel: url,
    // First hand. See the note above.
    condemnAfter: 1,
  });

  return text(id, {
    url,
    // The probe's own result, carried whole: a confirmed outcome holds the exact request, so
    // anybody can reproduce this verdict with one curl. That is what replaces an oracle here.
    outcome,
    verdict,
    triple_id: state.terms.triple,
    counter_triple_id: state.terms.counter,
    you_currently_assert: state.recorded,
    // Nothing in this node creates it, but a caller that deposited by hand could, and resolving it
    // silently would hide a contradiction the reader is entitled to see.
    ...(state.bothSides ? { warning: 'this address holds a position on BOTH sides' } : {}),
    would_become: plan.to,
    why: plan.why,
    calls: plan.calls.map(serialiseCall),
    total_value_wei: plan.calls.reduce((sum, call) => sum + call.value, 0n).toString(),
    caveat: UNSIGNED_CAVEAT,
  });
}

/**
 * Does this agent have an identity atom — the thing a `uses` edge must carry as its subject?
 *
 * The most useful read here, because of what `scripts/measure/cohort-coverage.ts` measures: the atom
 * is written by Intuition's **mirror**, the mirror holds 28,648, and the Base registry's highest
 * minted id was 309,925 on 2026-10-20. So for roughly nine agents in ten the answer is **no**, and
 * every other tool on this server fails for them until it is yes (ADR `0047`).
 *
 * A read. No credential, nothing signed. It reports the gap rather than closing it, because closing
 * it is a write — but the id is knowable either way: the atom's id is a pure function of the agent's
 * identity, computed locally by `agent-atom.ts` with no key and no network. Pinning only makes the
 * document readable, and anyone can pin the same bytes (ADR `0047`).
 */
async function identity(id: JsonRpcId, args: Record<string, unknown>) {
  const agentChainId = args['agent_chain_id'];
  const agentTokenId = args['agent_token_id'];
  if (typeof agentChainId !== 'number' || !Number.isInteger(agentChainId) || agentChainId <= 0) {
    return fail(id, -32602, 'agent_chain_id must be a positive integer');
  }
  if (typeof agentTokenId !== 'string' || !/^\d+$/.test(agentTokenId)) {
    return fail(id, -32602, 'agent_token_id must be a decimal string');
  }
  const registryRaw = args['registry'];
  if (registryRaw !== undefined && !isAddress(registryRaw)) {
    return fail(id, -32602, 'registry, when given, must be a 20-byte hex address');
  }
  const agent = {
    chainId: agentChainId,
    tokenId: agentTokenId,
    ...(registryRaw === undefined ? {} : { registry: registryRaw }),
  };

  try {
    const subject = await resolveDeclarationSubject({ agent, graphqlUrl: GRAPHQL });
    return text(id, {
      caip19: toCaip19(agent),
      identity_atom: subject,
      declarable: true,
      note: 'This agent can declare. Its identity atom is the subject every `uses` edge carries.',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'NoAgentIdentityError') {
      return text(id, {
        caip19: toCaip19(agent),
        identity_atom: null,
        declarable: false,
        note:
          'No identity atom on the graph, so this agent cannot declare yet. The atom is written ' +
          "by Intuition's mirror; measured 2026-10-20 the mirror holds 28,648 of a registry whose " +
          'highest minted id is 309,925, so this is the common case and not a fault of yours. ' +
          'Writing it needs two atoms and a `same as` triple — `scripts/agent-identity-atom.ts`, ' +
          'ADR 0047. The atom ids are computable locally from your identity alone, with no API key.',
      });
    }
    throw error;
  }
}

/**
 * The directory: agents the graph holds, in the order the caller asks for.
 *
 * Two orders, and the names say what they measure rather than implying a ranking: how **many**
 * statements a source holds about an agent, or how much TRUST sits on its own atom. Neither is a
 * score and this server composes none (ADR `0046`) — a caller that wants one has the parts.
 *
 * `total` is the cohort's size from the source's own aggregate, never `agents.length`, so a page of
 * 25 out of 28,648 cannot read as 25 agents existing.
 */
async function findAgents(id: JsonRpcId, args: Record<string, unknown>) {
  const orderRaw = args['order'] ?? 'evidence-quantity';
  if (orderRaw !== 'evidence-quantity' && orderRaw !== 'economic-conviction') {
    return fail(id, -32602, "order must be 'evidence-quantity' or 'economic-conviction'");
  }
  const limitRaw = args['limit'] ?? 25;
  if (
    typeof limitRaw !== 'number' ||
    !Number.isInteger(limitRaw) ||
    limitRaw < 1 ||
    limitRaw > 100
  ) {
    return fail(id, -32602, 'limit must be an integer between 1 and 100');
  }
  const offsetRaw = args['offset'] ?? 0;
  if (typeof offsetRaw !== 'number' || !Number.isInteger(offsetRaw) || offsetRaw < 0) {
    return fail(id, -32602, 'offset must be a non-negative integer');
  }

  const page = await listAgents(directory, {
    order: orderRaw as AgentListOrder,
    limit: limitRaw,
    offset: offsetRaw,
  });

  return text(id, {
    source_id: page.sourceId,
    order: page.order,
    limit: page.limit,
    offset: page.offset,
    // The cohort's size, not this page's. A page count read as a population is the mistake.
    total: page.total,
    agents: page.agents.map((agent) => ({
      source_handle: agent.sourceHandle,
      caip19: agent.ref === null ? null : toCaip19(agent.ref),
      // Said rather than resolved: several `same as` edges means there is no single agent to
      // point at, and naming one would be a guess with a permanent reader.
      identity_ambiguous: agent.isIdentityAmbiguous,
      identity_edge_count: agent.identityEdgeCount,
      name: agent.metadata.name,
      // `Agent <chain>:<token>` is the canonical **fallback**, not a name an operator chose. Saying
      // which it is keeps a reader from crediting an agent with naming itself.
      name_is_fallback: agent.metadata.isFallback,
      statement_count: agent.statementCount,
      // `null` stays `null` and is never coerced to `0`. The first draft of this read a field that
      // does not exist (`totalAssets`) and `?? 0n`'d the `undefined`, so it reported **0 TRUST for
      // an agent carrying 13** — ADR `0042`'s family with the sign flipped, and it shipped because
      // `scripts/` is outside every typecheck (`tasks/21`).
      own_atom_market:
        agent.market === null
          ? null
          : {
              // Market cap, not assets: this type carries no assets figure, and the two are not
              // the same number — 13.02 against 12.28 TRUST on the agent measured 2026-10-20.
              total_market_cap_wei:
                agent.market.totalMarketCap === null
                  ? null
                  : agent.market.totalMarketCap.toString(),
              // Positions, not distinct stakers: one account holding two is two here.
              position_count: agent.market.positionCount,
              // Summed across this many bonding curves. It matters: on the agent above, curve 1
              // held 0.00098 TRUST and curve 2 held 12.28, so a figure from one curve beside a
              // count from all of them is a contradiction.
              vault_count: agent.market.vaultCount,
            },
    })),
  });
}

/**
 * Tools agents declared using, with where each is hosted and what stands behind it.
 *
 * The step the rest of this server assumed somebody else had taken. `arp_tool_reputation` prices a
 * tool whose atom id you already know; nothing let an agent **find** one, and a pointer nobody can
 * enumerate is not a pointer (ADR `0051`).
 *
 * `hosted_at` is the field that makes this actionable: ARP stores no tool, so an agent reads the
 * listing, **goes to the host**, and decides for itself. It is a home page, not a call target — 28
 * of the 85 distinct tools on mainnet `uses` edges carry none at all, and 9 more carry the string
 * `"null"` (re-measured 2026-10-28; it was 80 and 3 on 2026-10-20).
 *
 * **None of those 85 is reachable through the declared read, and that is the point of the second
 * one.** `listTools` requires the subject to be an identified agent — a `same as` edge — and
 * measured 2026-10-28, **zero** of the 186 mainnet `uses` edges has one. Three of 167 do on
 * testnet. So the declared population is a real zero on mainnet, which is our own non-activity
 * and not a property of the graph, and a catalogue built on it alone answers nothing.
 *
 * ## Two populations, and it used to return one
 *
 * A **declared** tool is the object of an agent's `uses` edge. A **registered** tool is an atom
 * somebody created, which needs no agent and carries a market of its own (ADR `0039`). Returning
 * only the first made the whole catalogue invisible to an agent until somebody had already
 * declared something — and nobody had, ARP included, so on testnet this answered with an empty
 * list while 52 registered tools sat one query away.
 *
 * `provenance` says which read a row came from, because the two answer different questions and a
 * merged list that hid the difference would be the kind of summed figure `rules/claims.md`
 * forbids. A collision keeps the declared row: it carries the per-edge market this tool is about.
 *
 * Agent declarations only on the declared side: the `uses` predicate is shared and most of what
 * sits on it is ordinary prose, filtered out in the query rather than returned under a caveat.
 * That filter is why `arp_find_tools` no longer answers with Bitcoin and Obsidian.
 *
 * ## `title` and `purpose` are this repo's, not the chain's
 *
 * Read from `catalogue/tools.json`. The atom carries only its URL (ADR `0054`), so a readable name
 * cannot come from the graph; and `purpose` is the description each repository publishes about
 * itself, quoted and dated, never written by us. Absent for a tool we have not catalogued, which
 * is most of the graph — a caller gets `null` and the URL, not a guess.
 */
/**
 * `catalogue/tools.json`'s entry for an atom label, as the two fields a caller gets.
 *
 * Keyed on the label the graph returns, which `toolThing` writes as the URL minus its scheme.
 * Tolerant of a scheme, a trailing slash and case, because a hand-registered atom may carry any
 * of them. Both fields are `null` for a tool nobody catalogued — a caller then has the URL, which
 * is the identity and was always enough.
 */
function seedFor(label: string | null): { title: string | null; purpose: string | null } {
  if (label === null) return { title: null, purpose: null };
  const key = label
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const hit = SEED_BY_KEY.get(key);
  return { title: hit?.title ?? null, purpose: hit?.purpose ?? null };
}

const SEED_BY_KEY = new Map(
  (catalogue.tools as { url: string; title: string; purpose: string | null }[]).map((tool) => [
    tool.url.replace(/^https:\/\//, '').toLowerCase(),
    tool,
  ]),
);

async function findTools(id: JsonRpcId, args: Record<string, unknown>) {
  const orderRaw = args['order'] ?? 'priced-edges';
  if (orderRaw !== 'priced-edges' && orderRaw !== 'conviction' && orderRaw !== 'declarations') {
    return fail(id, -32602, "order must be 'priced-edges', 'conviction' or 'declarations'");
  }
  const limitRaw = args['limit'] ?? 25;
  if (
    typeof limitRaw !== 'number' ||
    !Number.isInteger(limitRaw) ||
    limitRaw < 1 ||
    limitRaw > 100
  ) {
    return fail(id, -32602, 'limit must be an integer between 1 and 100');
  }
  const curveRaw = args['curve_id'];
  if (curveRaw !== undefined && (typeof curveRaw !== 'number' || !Number.isInteger(curveRaw))) {
    return fail(id, -32602, 'curve_id must be an integer');
  }
  const domainRaw = args['domain'];
  if (domainRaw !== undefined && typeof domainRaw !== 'string') {
    return fail(id, -32602, 'domain must be a string');
  }
  // Whose index to read is **not** a request parameter, and that is the safety net (the user,
  // 2026-10-28: « je ne veux pas que ce soit modulable par un agent ou un mcp ou n'importe quoi,
  // c'est le filet de sécurité du classement des info »).
  //
  // The reasoning: `has tag` and the hierarchy are permissionless to write, so the only thing
  // separating ARP's index from anything anybody published is which positions it is read through.
  // A caller that can pass its own attestor — or `any` — can make the index say whatever it likes,
  // and then a curated index guarantees nothing. An earlier version of this handler took
  // `attestor` from the arguments; it was wrong for exactly one turn.
  //
  // The attestor is a property of the NODE, not of the request. Anybody who wants a different
  // index runs a node with a different `ARP_DOMAIN_ATTESTOR`. Nobody changes it per call.
  const attestor = DOMAIN_ATTESTOR;
  if (domainRaw !== undefined && attestor === undefined) {
    // Refuses rather than falling back to the unfiltered graph. The fallback is the failure this
    // whole design exists to prevent, and it would have been silent: a search returning more rows
    // than it should looks like a better answer, not like a missing guard rail.
    return fail(
      id,
      -32603,
      'this node has no domain attestor configured, so it cannot answer a domain search. ' +
        'Set ARP_DOMAIN_ATTESTOR (or AGENT_ADDRESS) to the address whose filings are the index. ' +
        'Reading the hierarchy unfiltered would return every triple anybody has ever published ' +
        'under the predicate, which is not an index.',
    );
  }

  // Searching by need, which is the whole reason this parameter exists: the agent names a domain
  // and the subtree under it is resolved before anything is ranked. A tool carries one tag at its
  // deepest domain and the ancestors are derived (ADR `0074`), so `payment` has to descend to
  // `card` before it can find Stripe.
  let domainScope: {
    domains: string[];
    atomIds: Set<string>;
    backed: Set<string>;
    othersHidden: number;
  } | null = null;
  if (domainRaw !== undefined) {
    const normalised = domainRaw.trim().toLowerCase();
    const {domains, tools} = await toolsInDomain(
      {
        graphqlUrl: GRAPHQL,
        hierarchyPredicate: IS_A_SUB_DOMAIN_OF,
        tagPredicate: HAS_TAG,
        root: DOMAIN_ROOT,
        attestor,
      },
      normalised,
    );
    // `has tag` is permissionless to write: anybody can publish `(anything, has tag, payment)` for
    // the price of one triple. An index is therefore a *reading* of those filings, and `attestor`
    // picks whose — ARP's by default, the caller's own, somebody else's, or none at all.
    const kept = tools.filter((tool) => tool.attestorBacked);
    domainScope = {
      domains,
      atomIds: new Set(kept.map((tool) => tool.atomId.toLowerCase())),
      backed: new Set(
        tools.filter((tool) => tool.attestorBacked).map((tool) => tool.atomId.toLowerCase()),
      ),
      othersHidden: tools.length - kept.length,
    };
  }

  const [page, registered] = await Promise.all([
    listTools({
      graphqlUrl: GRAPHQL,
      order: orderRaw as ToolListingOrder,
      ...(curveRaw === undefined ? {} : { curveId: curveRaw }),
    }),
    listRegisteredTools({
      graphqlUrl: GRAPHQL,
      ...(curveRaw === undefined ? {} : { curveId: curveRaw }),
    }),
  ]);

  const declared = new Set(page.tools.map((tool) => tool.atomId.toLowerCase()));
  const registeredRows = registered.tools
    .filter((tool) => !declared.has(tool.atomId.toLowerCase()))
    .filter((tool) => domainScope === null || domainScope.atomIds.has(tool.atomId.toLowerCase()))
    .map((tool) => ({
      tool_atom_id: tool.atomId,
      label: tool.label,
      provenance: 'registered' as const,
      ...seedFor(tool.label),
      hosted_at: tool.url,
      atom_uri: tool.uri,
      declarations: tool.declarations,
      // `null`, not `0`: pricing a registered row's declarations needs the per-edge vaults, which
      // is `listTools`'s read. A zero under "paid for" would read as "nobody paid", a claim this
      // read cannot make.
      paid_declarations: null,
      support_assets_wei: tool.assets.toString(),
      oppose_assets_wei: null,
      // Creating a term seeds its vault with `minShare` (ADR `0042`), so assets alone never say
      // whether anybody staked. This does.
      position_count: tool.positionCount,
    }));

  const inScope = (atomId: string): boolean =>
    domainScope === null || domainScope.atomIds.has(atomId.toLowerCase());

  return text(id, {
    curve_id: page.curveId,
    edges_read: page.edgesRead,
    truncated: page.truncated || registered.truncated,
    purpose_read_at: catalogue.readAt,
    // Present only when a domain was asked for. `domains_walked` is the derivation made visible:
    // a tool tagged `card` comes back under `payment` because the hierarchy says so, and the
    // reader should be able to see which hop did it rather than take the filter on trust.
    ...(domainScope === null
      ? {}
      : {
          domain: String(domainRaw).trim().toLowerCase(),
          domains_walked: domainScope.domains,
          domain_tagged_tools: domainScope.atomIds.size,
          // Whose tree was walked. Named in the response because "the domain tree" is a reading,
          // not a fact about the chain, and a reader should never have to guess whose it was.
          // Echoed verbatim although the caller cannot set it. "The domain tree" is a reading
          // and not a fact about the chain, so a reader must never have to guess whose it was —
          // and an address in the wrong case returns an empty tree, which this makes diagnosable
          // instead of looking like "this domain has nothing in it".
          domain_attestor: attestor,
          // How many filings under this domain this attestor does not back, and were left out.
          // Reported even when zero, so a reader never wonders whether the question was asked.
          tags_from_others_hidden: domainScope.othersHidden,
        }),
    tools: [
      ...page.tools.filter((tool) => inScope(tool.atomId)).map((tool) => ({
        tool_atom_id: tool.atomId,
        label: tool.label,
        provenance: 'declared' as const,
        ...seedFor(tool.label),
        // Where to go and look. ARP hosts nothing; this is the pointer and the point.
        hosted_at: tool.hostedAt,
        atom_uri: tool.uri,
        declarations: tool.edgeCount,
        // How many of those declarations somebody paid to stand behind. Never a summed position
        // count: positions are counted per vault and a sum across edges counts nothing (ADR `0023`).
        paid_declarations: tool.pricedEdges,
        support_assets_wei: tool.supportAssetsSum.toString(),
        oppose_assets_wei: tool.opposeAssetsSum.toString(),
        position_count: null,
      })),
      ...registeredRows,
    ].slice(0, limitRaw),
  });
}

async function callTool(id: JsonRpcId, params: Record<string, unknown> | undefined) {
  const name = typeof params?.['name'] === 'string' ? params['name'] : null;
  const args = (params?.['arguments'] ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      case 'arp_tool_reputation':
        return await toolReputation(id, args);
      case 'arp_declare_used':
        return await declareUsed(id, args);
      case 'arp_stake_on_used':
        return await stakeOnUsed(id, args);
      case 'arp_take_position':
        return await takePosition(id, args);
      case 'arp_exit_position':
        return await exitPosition(id, args);
      case 'arp_identity':
        return await identity(id, args);
      case 'arp_agent_endpoints':
        return await agentEndpoints(id, args);
      case 'arp_probe_endpoint':
        return await probe(id, args);
      case 'arp_find_agents':
        return await findAgents(id, args);
      case 'arp_record_reachable':
        return await recordReachable(id, args);
      case 'arp_find_tools':
        return await findTools(id, args);
      default:
        return fail(id, -32602, `unknown tool: ${String(name)}`);
    }
  } catch (error) {
    // The message, not a stack: a caller gets enough to retry or report, nothing about our host.
    return fail(id, -32603, `${String(name)} failed: ${String(error).slice(0, 300)}`);
  }
}

export const handler = {
  port: PORT,
  async fetch(request: Request) {
    if (request.method === 'GET') {
      // Not part of MCP. A plain GET is what the verifier's non-protocol probe sends, and
      // answering it makes this endpoint `live` rather than `dead` for that path too.
      return Response.json({
        name: 'ARP',
        description: 'Agent and tool reputation over the Intuition knowledge graph.',
        mcp: { protocolVersion: PROTOCOL_VERSION, tools: TOOLS.map((t) => t.name) },
        chain: { id: chainId, name: record.chain?.name ?? null },
      });
    }
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

    let body: Rpc;
    try {
      body = (await request.json()) as Rpc;
    } catch {
      return fail(null, -32700, 'parse error');
    }
    const id = body.id ?? null;

    switch (body.method) {
      case 'initialize':
        return result(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'ARP', version: '0.2.0' },
          instructions: SERVER_INSTRUCTIONS,
        });
      case 'notifications/initialized':
        // A notification has no id and takes no response body.
        return new Response(null, { status: 202 });
      case 'tools/list':
        return result(id, { tools: TOOLS });
      case 'tools/call':
        return callTool(id, body.params);
      case 'ping':
        return result(id, {});
      default:
        return fail(id, -32601, `method not found: ${String(body.method)}`);
    }
  },
};

/**
 * The stdio transport — newline-delimited JSON-RPC over stdin/stdout, which is how an MCP client
 * launches a local server.
 *
 * It wraps `handler.fetch` instead of re-implementing the dispatch, so there is exactly one place a
 * method is handled and the two transports cannot drift. A 202 (a notification) has no body and
 * writes nothing, which is what the protocol requires.
 *
 * **Everything printed here goes to stderr.** stdout is the protocol channel: one stray line on it
 * desynchronises the client, and the failure looks like a malformed server rather than a log.
 */
async function serveStdio(): Promise<void> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffered = '';

  const send = (line: string) => Bun.write(Bun.stdout, encoder.encode(`${line}\n`));

  for await (const chunk of Bun.stdin.stream()) {
    buffered += decoder.decode(chunk as Uint8Array, { stream: true });
    let newline = buffered.indexOf('\n');
    while (newline !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf('\n');
      if (line.length === 0) continue;

      const response = await handler.fetch(
        new Request(`http://stdio/`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: line,
        }),
      );
      if (response.status === 202) continue;
      await send(await response.text());
    }
  }
}

if (import.meta.main) {
  const stdio = process.argv.includes('--stdio') || process.env.ARP_TRANSPORT === 'stdio';
  // stderr in both modes: the banner is a diagnostic, and on stdio stdout belongs to the protocol.
  const log = (line: string) => process.stderr.write(`${line}\n`);

  log(`ARP MCP node — ${stdio ? 'stdio' : `http://localhost:${PORT}`}`);
  log(`  chain:      ${chainId} (${record.chain?.name ?? 'unknown'}) via ARP_TARGET=${targetName}`);
  log(`  graph:      ${GRAPHQL}`);
  log(`  rpc:        ${RPC}`);
  log(`  multivault: ${MULTI_VAULT}`);

  if (stdio) {
    await serveStdio();
    process.exit(0);
  }

  Bun.serve(handler);
  log(`  tools:      ${TOOLS.map((t) => t.name).join(', ')}`);
  log(`\nsigns nothing, sends nothing — the planners return calls for your own key.`);
}
