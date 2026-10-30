/** What the sponsoring service does with a request, separated from where it reads its key.
 *
 *  `main.ts` reads the environment and listens; this file is the part a test can construct, with
 *  the wallet, the chain and the pinning service injected.
 *
 *  **Three routes that spend, and each checks before it spends** (ADR `0092` item 2, ADR `0094`):
 *
 *  | route           | what it pays for                                     | what it checks first                 |
 *  | --------------- | ---------------------------------------------------- | ------------------------------------ |
 *  | `POST /gas`     | the gas for the agent's one `approve`, once ever     | a registered ERC-8004 agent          |
 *  | `POST /deposit` | a deposit with `receiver = agent`                    | the signed request, the proof, limits |
 *  | `POST /publish` | the atoms and triples that index a signed delegation | the delegator's signature, limits    |
 *
 *  **The allow-list is enforced here, not trusted to the wallet.** Every call sent goes to the
 *  MultiVault on this chain, and the only value sent anywhere else is the approval gas, to the
 *  registered agent, for exactly `limits.approvalGas`. ADR `0094` §3: "The sponsoring service calls
 *  the MultiVault and nothing else."
 *
 *  **One spend at a time.** Every route that sends runs inside one queue, so two requests cannot
 *  both pass the day's count, or both spend one proof, before either is recorded.
 *
 *  **Recorded before it is sent.** A deposit and a gas transfer are reserved in the ledger before
 *  the key is used and settled after (`ledger.ts`), so a send whose outcome is lost to a failing RPC
 *  still spends its proof, and the agent's gas, once.
 *
 *  **The edge is the proof's edge.** A sponsored deposit is on `(requester, uses, X)`, where the
 *  subject is the requesting agent's identity atom and X is what the proof is about: the tool atom
 *  a content receipt names, or the identity atom of the agent a hire receipt says was hired. Any
 *  other `uses` triple is refused, so a deposit this service paid for is _proven_ about that edge
 *  and no other.
 *
 *  **A refusal always leaves the agent a way.** A 409 for a missing approval carries the approve
 *  call; a 429 carries the call the agent can send itself. Unplugging this service costs an agent
 *  its sponsorship and the _proven_ label, never a capability (ADR `0094`, ADR `0092` item 6).
 */
import {
  checkDepositLimits,
  type AgentIdentityRef,
  type AgentKeyReads,
  checkGasLimits,
  checkPublishLimits,
  checkSponsorProof,
  delegationDocument,
  delegationHash,
  parseDelegation,
  planDepositApproval,
  planPublishDelegation,
  planSponsoredDeposit,
  sponsoredPositions,
  sponsorProofDigest,
  spentOnDay,
  verifyDelegationSignature,
  verifySponsorRequest,
  withdrawnBps,
  type DelegationPredicates,
  type MultiVaultReads,
  type PaymentReads,
  type PreparedCall,
  type SignedSponsorRequest,
  type SponsorLimits,
  type SponsorProof,
  type StrictIdentityAtom,
  type TypedDataVerifier,
} from '@arp-protocol/core';
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem';

import type { SponsorLedger } from './ledger.ts';

/** The one key ARP holds here, behind three methods. `main.ts` builds it from viem. */
export type SponsorWallet = {
  address: Address;
  /** `eth_call` the call from this address. A deposit the agent has not approved fails here. */
  simulate(call: PreparedCall): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Send one call and wait for it to be mined. */
  send(call: PreparedCall): Promise<{ hash: Hex; status: 'success' | 'reverted' }>;
  /** A plain value transfer, used for the approval gas and for nothing else. */
  sendGas(to: Address, value: bigint): Promise<{ hash: Hex; status: 'success' | 'reverted' }>;
};

/** Who holds an ERC-8004 token, or `null` when it does not exist, and the `agentWallet` it set. */
export type AgentOwnerReads = AgentKeyReads;

/**
 * An agent's identity atom: the registration-derived atom a `uses` edge carries as its subject
 * (ADR `0032`). `main.ts` resolves it through `same as` with `resolveIdentityAtomStrict`, which
 * answers `ambiguous` rather than picking when two atoms claim one identity.
 */
export type AgentIdentityAtoms = {
  identityAtom(agent: AgentIdentityRef): Promise<StrictIdentityAtom>;
};

/** The delegation register's part. Absent, `POST /publish` answers 503 and spends nothing. */
export type PublishConfig = {
  delegationManager: Address;
  predicates: DelegationPredicates;
  verify: TypedDataVerifier;
  /** Pins the exact document string and returns its `ipfs://` URI. */
  pin(document: string): Promise<string>;
};

export type SponsorOptions = {
  chainId: number;
  wallet: SponsorWallet;
  /** Its `address` is the MultiVault, the only contract this service calls. */
  reads: MultiVaultReads;
  payments: PaymentReads;
  owners: AgentOwnerReads;
  identities: AgentIdentityAtoms;
  /** The ERC-8004 registries whose agents are sponsored, as `eip155:<chainId>:<address>`. */
  registries: readonly string[];
  /** The canonical `uses` predicate. A sponsored deposit is on a `(agent, uses, tool)` triple. */
  usesPredicate: Hex;
  limits: SponsorLimits;
  ledger: SponsorLedger;
  /** Content-receipt signers accepted as ARP's own nodes. */
  acceptedContentSigners: readonly Address[];
  publish: PublishConfig | null;
  /** Milliseconds. Injected so a test can move the day. */
  now?: () => number;
};

function bigintSafe(_key: string, inner: unknown): unknown {
  return typeof inner === 'bigint' ? inner.toString() : inner;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, bigintSafe, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isBytes32(value: unknown): value is Hex {
  return typeof value === 'string' && isHex(value) && value.length === 66;
}

const REGISTRY = /^eip155:([1-9][0-9]*):(0x[0-9a-fA-F]{40})$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

type Body = Record<string, unknown>;

async function readBody(request: Request): Promise<Body | Response> {
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return json({ error: 'body is not a JSON object' }, 400);
    }
    return parsed as Body; // An object, checked on the line above; fields are narrowed per route.
  } catch {
    return json({ error: 'body is not JSON' }, 400);
  }
}

export function createSponsor(options: SponsorOptions): {
  fetch(request: Request): Promise<Response>;
} {
  const { chainId, wallet, reads, payments, owners, limits, ledger } = options;
  const now = options.now ?? Date.now;
  const multiVault = getAddress(reads.address);
  const registries = new Set(options.registries.map((r) => r.toLowerCase()));

  let queue: Promise<unknown> = Promise.resolve();
  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  }

  /** The allow-list. Checked before a spend is reserved, so a refused call burns no proof. */
  function assertMultiVault(call: PreparedCall): void {
    if (getAddress(call.to) !== multiVault || call.chainId !== chainId) {
      throw new Error(`refusing a call to ${call.to} on chain ${call.chainId}`);
    }
  }

  /** The allow-list again, at the last step before a key is used. */
  async function sendToMultiVault(call: PreparedCall) {
    assertMultiVault(call);
    return wallet.send(call);
  }

  /** A registered agent is one whose ERC-8004 token exists in an accepted registry. */
  async function ownerOfAgent(
    agentRegistry: unknown,
    agentId: unknown,
  ): Promise<{ owner: Address } | { error: string; status: number }> {
    if (
      typeof agentRegistry !== 'string' ||
      typeof agentId !== 'string' ||
      !DECIMAL.test(agentId)
    ) {
      return {
        error: 'agentRegistry (eip155:<chainId>:<address>) and agentId (decimal) are required',
        status: 400,
      };
    }
    const match = REGISTRY.exec(agentRegistry);
    if (match === null || !registries.has(agentRegistry.toLowerCase())) {
      return { error: `${agentRegistry} is not a registry this service sponsors`, status: 403 };
    }
    const owner = await owners
      .ownerOf(getAddress(match[2] ?? ''), BigInt(agentId))
      .catch(() => null);
    if (owner === null) {
      return { error: `agent ${agentId} is not registered in ${agentRegistry}`, status: 403 };
    }
    return { owner: getAddress(owner) };
  }

  function info() {
    return {
      service: 'ARP sponsoring service',
      chainId,
      sponsor: wallet.address,
      multiVault,
      registries: [...options.registries],
      limits: {
        depositAmountWei: limits.depositAmount,
        depositsPerAgentPerDay: limits.depositsPerAgentPerDay,
        publicationsPerDelegatorPerDay: limits.publicationsPerDelegatorPerDay,
        dailyBudgetWei: limits.dailyBudget,
        approvalGasWei: limits.approvalGas,
        withdrawalThresholdBps: limits.withdrawalThresholdBps ?? 'unset',
        spentTodayWei: spentOnDay(ledger.records, now()),
        spentCounts: 'value sent only; the gas of the service’s own transactions is not counted',
        pendingSends: ledger.pending().length,
      },
      proofs: {
        hire: 'accepted: the payment on chain, and a hire receipt signed by the hired agent’s holder or agentWallet. The edge must be (requester identity, uses, hired agent identity). The payment is a transfer: one operator holding both agents gets it back, so for that operator the bound is the daily count and budget, not the price.',
        content:
          options.acceptedContentSigners.length === 0
            ? 'no signer accepted'
            : 'verified, but refused until a fetch has a price (docs/tasks/41)',
      },
      approve: planDepositApproval({ multiVault, chainId, sponsor: wallet.address }),
      publish: options.publish === null ? 'disabled' : 'enabled',
      note: 'Testnet 13579 only. Every deposit is made with the agent as receiver; the shares are the agent’s.',
    };
  }

  async function gas(body: Body): Promise<Response> {
    const agent = await ownerOfAgent(body.agentRegistry, body.agentId);
    if ('error' in agent) return json({ error: agent.error }, agent.status);
    return exclusive(async () => {
      const decision = checkGasLimits(ledger.records, { agent: agent.owner, now: now(), limits });
      if (!decision.ok) return json({ error: decision.reason }, 429);
      const key = `gas:${agent.owner.toLowerCase()}`;
      ledger.reserve({
        kind: 'gas',
        subject: agent.owner,
        value: limits.approvalGas,
        at: now(),
        key,
      });
      // A throw from here on leaves the reservation pending, which `checkGasLimits` counts as sent.
      const sent = await wallet.sendGas(agent.owner, limits.approvalGas);
      if (sent.status !== 'success') {
        ledger.settle('gas', key, { status: 'reverted', hash: sent.hash });
        return json({ error: `gas transfer ${sent.hash} reverted` }, 502);
      }
      ledger.settle('gas', key, { status: 'success', hash: sent.hash });
      return json({
        sent: sent.hash,
        to: agent.owner,
        valueWei: limits.approvalGas,
        next: planDepositApproval({ multiVault, chainId, sponsor: wallet.address }),
      });
    });
  }

  async function deposit(body: Body): Promise<Response> {
    const signed = body.request as SignedSponsorRequest; // Every field is checked by `verifySponsorRequest`.
    const proof = body.proof as SponsorProof; // Checked by `checkSponsorProof`, which refuses what it cannot read.
    const triple = body.triple as
      | { subjectId?: unknown; predicateId?: unknown; objectId?: unknown }
      | undefined; // Narrowed below.
    if (typeof signed !== 'object' || signed === null)
      return json({ error: 'request is required' }, 400);
    if (signed.chainId !== chainId) {
      return json(
        { error: `request is for chain ${String(signed.chainId)}, this service is on ${chainId}` },
        400,
      );
    }
    const verdict = await verifySponsorRequest(signed, Math.floor(now() / 1000));
    if (verdict.status !== 'valid')
      return json({ error: `request is ${verdict.status}`, verdict }, 401);
    const request = signed.request;
    const agent = verdict.agent;
    if (sponsorProofDigest(proof ?? null) !== request.proof.toLowerCase()) {
      return json({ error: 'the proof sent is not the proof the request signed' }, 400);
    }
    if (
      typeof triple !== 'object' ||
      triple === null ||
      !isBytes32(triple.subjectId) ||
      !isBytes32(triple.predicateId) ||
      !isBytes32(triple.objectId)
    ) {
      return json({ error: 'triple { subjectId, predicateId, objectId } is required' }, 400);
    }
    if (triple.predicateId.toLowerCase() !== options.usesPredicate.toLowerCase()) {
      return json({ error: 'a sponsored deposit is on a `uses` triple' }, 400);
    }

    const registered = await ownerOfAgent(request.agentRegistry, request.agentId);
    if ('error' in registered) return json({ error: registered.error }, registered.status);
    if (registered.owner !== agent) {
      return json(
        { error: `agent ${request.agentId} is held by ${registered.owner}, not ${agent}` },
        403,
      );
    }

    const tripleId = await reads.tripleId(triple.subjectId, triple.predicateId, triple.objectId);
    if (tripleId.toLowerCase() !== request.termId.toLowerCase()) {
      return json({ error: `termId is not the triple named (${tripleId})` }, 400);
    }

    const proven = await checkSponsorProof(proof, {
      receiver: agent,
      requester: { agentRegistry: request.agentRegistry, agentId: request.agentId },
      chainId,
      payments,
      acceptedContentSigners: options.acceptedContentSigners,
      acceptedRegistries: options.registries,
      agents: owners,
    });
    if (proven.status !== 'proven') return json({ error: proven.reason }, 403);
    // ADR `0094` §2: a sponsored amount stays below the cost of the proof that unlocks it. An
    // unpriced proof has no "below". Between two operators that makes a faked hire cost more than
    // it earns; one operator holding both agents gets the payment back, so for that one the bound
    // is the daily count and the budget below, not this.
    if (proven.cost === null) {
      return json(
        { error: `a ${proven.kind} proof has no price yet, so it cannot unlock a sponsorship` },
        403,
      );
    }
    if (limits.depositAmount >= proven.cost) {
      return json(
        {
          error: `the proof cost ${proven.cost} wei, not more than the ${limits.depositAmount} sponsored`,
        },
        403,
      );
    }

    // The edge is the proof's: `(requester, uses, what the proof is about)`, both as atoms.
    const subjectRead = await options.identities.identityAtom({
      agentRegistry: request.agentRegistry,
      agentId: request.agentId,
    });
    if (subjectRead.status === 'none') {
      return json({ error: `agent ${request.agentId} has no identity atom on the graph` }, 403);
    }
    if (subjectRead.status === 'ambiguous') {
      return json({ error: `agent ${request.agentId}: ${subjectRead.reason}` }, 409);
    }
    const subject = subjectRead.atom;
    if (subject.toLowerCase() !== triple.subjectId.toLowerCase()) {
      return json(
        {
          error: `the triple's subject is not agent ${request.agentId}'s identity atom ${subject}`,
        },
        400,
      );
    }
    let object: Hex;
    if (proven.object.kind === 'atom') {
      object = proven.object.atom;
    } else {
      const objectRead = await options.identities.identityAtom(proven.object);
      if (objectRead.status === 'none') {
        return json(
          { error: 'the agent the proof says was hired has no identity atom on the graph' },
          403,
        );
      }
      if (objectRead.status === 'ambiguous') {
        return json({ error: `the agent the proof says was hired: ${objectRead.reason}` }, 409);
      }
      object = objectRead.atom;
    }
    if (object.toLowerCase() !== triple.objectId.toLowerCase()) {
      return json({ error: `the proof is about ${object}, not the object the triple names` }, 400);
    }
    // A second guard on the same case `checkSponsorProof` refuses by identity: two references that
    // resolve to one atom are one agent, and `(A, uses, A)` is not agent calls agent.
    if (subject.toLowerCase() === object.toLowerCase()) {
      return json({ error: 'the triple is the agent using itself, which no proof backs' }, 403);
    }

    return exclusive(async () => {
      if (ledger.has('deposit', proven.id))
        return json({ error: 'this proof already sponsored a deposit' }, 409);

      const positions = sponsoredPositions(ledger.records, agent);
      const held = await Promise.all(
        positions.map((p) => reads.sharesOf(agent, p.termId, p.curveId)),
      );
      const withdrawn = withdrawnBps(
        positions.map((p, i) => ({ sponsoredShares: p.shares, heldShares: held[i] ?? 0n })),
      );

      let plan;
      try {
        plan = await planSponsoredDeposit({
          receiver: agent,
          termId: request.termId,
          amount: limits.depositAmount,
          reads,
        });
      } catch (error) {
        return json({ error: String(error instanceof Error ? error.message : error) }, 400);
      }

      const decision = checkDepositLimits(ledger.records, { agent, now: now(), limits, withdrawn });
      // The same call the agent can send itself: `sender == receiver` needs no approval.
      if (!decision.ok) return json({ error: decision.reason, selfDeposit: plan.call }, 429);

      const simulated = await wallet.simulate(plan.call);
      if (!simulated.ok) {
        return json(
          {
            error: `the deposit does not simulate: ${simulated.reason}`,
            approve: planDepositApproval({ multiVault, chainId, sponsor: wallet.address }),
          },
          409,
        );
      }

      const before = await reads.sharesOf(agent, request.termId, plan.curveId);
      assertMultiVault(plan.call);
      ledger.reserve({
        kind: 'deposit',
        subject: agent,
        value: plan.call.value,
        at: now(),
        key: proven.id,
        termId: request.termId,
        curveId: plan.curveId,
      });
      // From here a throw leaves the proof spent: the deposit may have landed.
      const sent = await sendToMultiVault(plan.call);
      if (sent.status !== 'success') {
        ledger.settle('deposit', proven.id, { status: 'reverted', hash: sent.hash });
        return json({ error: `deposit ${sent.hash} reverted` }, 502);
      }
      // A failing read must not leave a mined deposit unsettled: the shares stay unknown instead,
      // and `sponsoredPositions` skips a row without them.
      const after = await reads.sharesOf(agent, request.termId, plan.curveId).catch(() => null);
      const shares = after === null ? null : after > before ? after - before : 0n;
      ledger.settle('deposit', proven.id, {
        status: 'success',
        hash: sent.hash,
        ...(shares === null ? {} : { shares }),
      });
      return json({
        sent: sent.hash,
        receiver: agent,
        termId: request.termId,
        valueWei: plan.call.value,
        shares,
        proof: { kind: proven.kind, strength: proven.strength },
      });
    });
  }

  async function publish(body: Body): Promise<Response> {
    const config = options.publish;
    if (config === null)
      return json({ error: 'publication is not configured on this service' }, 503);
    const parsed = parseDelegation(body.delegation);
    if ('error' in parsed) return json({ error: parsed.error }, 400);
    const domain = { chainId, delegationManager: config.delegationManager };
    // First, and before anything is pinned: the relay is not free pinning (ADR `0092` item 2).
    if (!(await verifyDelegationSignature(parsed, domain, config.verify))) {
      return json({ error: 'the delegation signature does not verify for its delegator' }, 401);
    }
    const document = delegationDocument(parsed, domain);
    const registered = await ownerOfAgent(body.agentRegistry, body.agentId);
    if ('error' in registered) {
      // Not sponsored, still publishable: the operator pins this document and sends the plan.
      return json({ error: registered.error, document }, registered.status);
    }
    if (registered.owner !== parsed.delegate) {
      return json(
        {
          error: `the delegate ${parsed.delegate} is not the holder of agent ${String(body.agentId)}`,
          document,
        },
        403,
      );
    }

    return exclusive(async () => {
      const count = checkPublishLimits(ledger.records, {
        delegator: parsed.delegator,
        value: 0n,
        now: now(),
        limits,
      });
      if (!count.ok) return json({ error: count.reason, document }, 429);
      const documentUri = await config.pin(document);
      const plan = await planPublishDelegation({
        delegation: parsed,
        domain,
        documentUri,
        predicates: config.predicates,
        reads,
      });
      if (plan.calls.length === 0) {
        return json({
          published: 'already',
          delegationHash: delegationHash(parsed),
          terms: plan.terms,
        });
      }
      const decision = checkPublishLimits(ledger.records, {
        delegator: parsed.delegator,
        value: plan.totalValue,
        now: now(),
        limits,
      });
      if (!decision.ok) return json({ error: decision.reason, documentUri, plan }, 429);

      plan.calls.forEach(assertMultiVault);
      const sent: Hex[] = [];
      let spent = 0n;
      try {
        for (const call of plan.calls) {
          // Counted before the send: a throw while it is awaited may still have spent it.
          spent += call.value;
          const result = await sendToMultiVault(call);
          if (result.status !== 'success') {
            spent -= call.value;
            break;
          }
          sent.push(result.hash);
        }
      } finally {
        // Recorded even when it stopped half way, or threw: what was sent was spent.
        if (spent > 0n) {
          ledger.append({
            kind: 'publish',
            subject: parsed.delegator,
            value: spent,
            at: now(),
            key: delegationHash(parsed),
          });
        }
      }
      if (sent.length < plan.calls.length) {
        return json(
          { error: 'a call reverted; re-publishing resumes where it stopped', sent, documentUri },
          502,
        );
      }
      return json({
        published: 'now',
        delegationHash: delegationHash(parsed),
        documentUri,
        sent,
        terms: plan.terms,
      });
    });
  }

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/') return json(info());
      if (request.method !== 'POST')
        return json({ error: 'GET /, or POST /gas, /deposit, /publish' }, 404);
      const route = { '/gas': gas, '/deposit': deposit, '/publish': publish }[url.pathname];
      if (route === undefined)
        return json({ error: 'GET /, or POST /gas, /deposit, /publish' }, 404);
      const body = await readBody(request);
      if (body instanceof Response) return body;
      try {
        return await route(body);
      } catch (error) {
        // The message, not a stack: enough to retry or report, nothing about the host or the key.
        return json(
          {
            error: `failed: ${String(error instanceof Error ? error.message : error).slice(0, 300)}`,
          },
          500,
        );
      }
    },
  };
}

/** Exported for `main.ts`: an address list from configuration, refused whole if one entry is bad. */
export function addressList(raw: string | undefined): Address[] {
  if (raw === undefined || raw.trim() === '') return [];
  return raw.split(',').map((entry) => {
    const value = entry.trim();
    if (!isAddress(value)) throw new Error(`${value} is not an address`);
    return getAddress(value);
  });
}
