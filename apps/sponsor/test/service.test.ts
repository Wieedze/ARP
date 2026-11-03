import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import {
  hireDigest,
  signContentReceipt,
  signHireReceipt,
  signMintGasRequest,
  signSponsorRequest,
  sponsorProofDigest,
  sponsorRequestTypedData,
  planToolListing,
  signListToolRequest,
  thingUri,
  type MultiVaultReads,
  type PreparedCall,
  type SponsorLimits,
  type AgentIdentityAtom,
  type SponsorProof,
  type StrictIdentityAtom,
} from '@arp-protocol/core';
import { signDelegation } from '@metamask/smart-accounts-kit';
import {
  decodeFunctionData,
  getAddress,
  keccak256,
  parseAbi,
  stringToBytes,
  verifyTypedData,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { assertSponsorChain, KeyFileError, readKeyFile } from '../src/key-file.ts';
import { SponsorLedger } from '../src/ledger.ts';
import { nullOnRevert } from '../src/routes/context.ts';
import {
  addressList,
  createSponsor,
  registryList,
  type PublishConfig,
  type SponsorWallet,
} from '../src/service.ts';

// Fixed test keys, generated for nothing and holding nothing. No real key is read by any test.
const AGENT_KEY = `0x${'11'.repeat(32)}` as const;
const AGENT = privateKeyToAccount(AGENT_KEY);
const CALLEE = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const NODE = privateKeyToAccount(`0x${'33'.repeat(32)}`);
const SPONSOR_ACCOUNT = privateKeyToAccount(`0x${'44'.repeat(32)}`);
const SPONSOR = SPONSOR_ACCOUNT.address;
const STRANGER = privateKeyToAccount(`0x${'55'.repeat(32)}`);

const CHAIN = 13579;
const MULTIVAULT: Address = '0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91';
const REGISTRY_ADDRESS: Address = '0xC165A2ADc0000000000000000000000000000001';
const REGISTRY = `eip155:${CHAIN}:${REGISTRY_ADDRESS}`;
const DELEGATION_MANAGER: Address = '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3';
const USES: Hex = `0x${'0a'.repeat(32)}`;
const SUBJECT: Hex = `0x${'5b'.repeat(32)}`;
const OBJECT: Hex = `0x${'0b'.repeat(32)}`;
const TERM: Hex = `0x${'7e'.repeat(32)}`;
const PAYMENT: Hex = `0x${'ab'.repeat(32)}`;
const MILLI = 10n ** 15n;
const NOW = 20_000 * 86_400_000 + 3_600_000;

const LIMITS: SponsorLimits = {
  depositAmount: MILLI,
  approvalGas: MILLI / 10n,
  mintGas: MILLI / 10n,
  newAgentsPerDay: 2,
  listingsPerAddressPerDay: 2,
  anonymousListingsPerDay: 2,
  listingsPerDay: 4,
  dailyBudget: 10n ** 18n,
  depositsPerAgentPerDay: 2,
  publicationsPerDelegatorPerDay: 2,
  withdrawalThresholdBps: null,
  belowProofCost: false,
};

const depositAbi = parseAbi([
  'function deposit(address receiver, bytes32 termId, uint256 curveId, uint256 minShares)',
]);

type World = {
  sent: PreparedCall[];
  gas: { to: Address; value: bigint }[];
  shares: Map<string, bigint>;
  terms: Set<string>;
  simulateOk: boolean;
  pinned: string[];
  /** The wallet broadcasts, then throws while the receipt is awaited: `main.ts`'s `mined`. */
  sendThrows: boolean;
  /** Every `sharesOf` after the first send throws: the RPC failing once the deposit is out. */
  sharesThrowAfterSend: boolean;
  /** Sends that come back reverted. */
  revert: boolean;
  /** Sends broadcast whose receipt did not come within the wait. */
  unconfirmed: boolean;
};

function world(): World {
  return {
    sent: [],
    gas: [],
    shares: new Map(),
    terms: new Set([TERM.toLowerCase()]),
    simulateOk: true,
    pinned: [],
    sendThrows: false,
    sharesThrowAfterSend: false,
    revert: false,
    unconfirmed: false,
  };
}

function fakeWallet(w: World): SponsorWallet {
  let n = 0;
  const hash = () => `0x${(++n).toString(16).padStart(64, '0')}` as Hex;
  return {
    address: SPONSOR,
    simulate: async () =>
      w.simulateOk ? { ok: true } : { ok: false, reason: 'MultiVault_SenderNotApproved()' },
    send: async (call) => {
      w.sent.push(call);
      if (call.kind === 'deposit') {
        const { args } = decodeFunctionData({ abi: depositAbi, data: call.data });
        const key = `${args[0].toLowerCase()}:${args[1].toLowerCase()}`;
        w.shares.set(key, (w.shares.get(key) ?? 0n) + 1_000n);
      } else if (call.kind === 'create-triple') {
        w.terms.add(TERM.toLowerCase());
      } else {
        w.terms.add(`created:${w.sent.length}`);
      }
      if (w.sendThrows) throw new Error('timed out waiting for the receipt');
      return {
        hash: hash(),
        status: w.unconfirmed ? 'unconfirmed' : w.revert ? 'reverted' : 'success',
      };
    },
    sendGas: async (to, value) => {
      w.gas.push({ to, value });
      if (w.sendThrows) throw new Error('timed out waiting for the receipt');
      return {
        hash: hash(),
        status: w.unconfirmed ? 'unconfirmed' : w.revert ? 'reverted' : 'success',
      };
    },
  };
}

function fakeReads(w: World, chainId = CHAIN): MultiVaultReads {
  return {
    address: MULTIVAULT,
    chainId,
    termExists: async (id: Hex) => w.terms.has(id.toLowerCase()),
    tripleId: async (s: Hex, p: Hex, o: Hex) =>
      s === SUBJECT && p === USES && o === OBJECT
        ? TERM
        : keccak256(`0x${s.slice(2)}${p.slice(2)}${o.slice(2)}`),
    atomId: async (data: Hex) => keccak256(data),
    defaultCurveId: async () => 1n,
    minDeposit: async () => MILLI,
    atomCost: async () => MILLI,
    tripleCost: async () => MILLI,
    previewDeposit: async () => ({ shares: 1_000n, assetsAfterFees: MILLI }),
    previewAtomCreate: async () => ({ shares: 1n, assetsAfterFixedFees: 1n, assetsAfterFees: 1n }),
    previewTripleCreate: async () => ({
      shares: 1n,
      assetsAfterFixedFees: 1n,
      assetsAfterFees: 1n,
    }),
    sharesOf: async (account: Address, termId: Hex) => {
      if (w.sharesThrowAfterSend && w.sent.length > 0) throw new Error('rpc unavailable');
      return w.shares.get(`${account.toLowerCase()}:${termId.toLowerCase()}`) ?? 0n;
    },
  } as unknown as MultiVaultReads; // Every member the service reaches is above; the rest are never called.
}

const payments = (value = 5n * MILLI) => ({
  getTransaction: async ({ hash }: { hash: Hex }) => {
    if (hash !== PAYMENT) throw new Error('not found');
    return { from: AGENT.address, to: CALLEE.address, value };
  },
  getTransactionReceipt: async () => ({ status: 'success' as const }),
});

const owners = (
  held: Record<string, Address> = { '7': AGENT.address, '8': CALLEE.address },
  wallets: Record<string, Address> = {},
) => ({
  ownerOf: async (registry: Address, agentId: bigint) =>
    registry.toLowerCase() === REGISTRY_ADDRESS.toLowerCase()
      ? (held[agentId.toString()] ?? null)
      : null,
  agentWalletOf: async (registry: Address, agentId: bigint) =>
    registry.toLowerCase() === REGISTRY_ADDRESS.toLowerCase()
      ? (wallets[agentId.toString()] ?? null)
      : null,
});

/** Agent 7 (the requester) is `SUBJECT` on the graph, agent 8 (the one hired) is `OBJECT`. */
const identities = (atoms: Record<string, Hex> = { '7': SUBJECT, '8': OBJECT }) => ({
  identityAtom: async ({
    agentRegistry,
    agentId,
  }: {
    agentRegistry: string;
    agentId: string;
  }): Promise<StrictIdentityAtom> => {
    const atom = agentRegistry === REGISTRY ? atoms[agentId] : undefined;
    // The fixture's atoms stand for what `asAgentIdentityAtom` would have returned for them.
    return atom === undefined
      ? { status: 'none' }
      : { status: 'found', atom: atom as AgentIdentityAtom };
  },
});

function sponsor(w: World, over: Partial<Parameters<typeof createSponsor>[0]> = {}) {
  return createSponsor({
    chainId: CHAIN,
    wallet: fakeWallet(w),
    reads: fakeReads(w),
    payments: payments(),
    holdings: { agentsHeldBy: async (address: Address) => (address === AGENT.address ? 1n : 0n) },
    owners: owners(),
    identities: identities(),
    registries: [REGISTRY],
    usesPredicate: USES,
    limits: LIMITS,
    ledger: new SponsorLedger(null),
    acceptedContentSigners: [NODE.address],
    publish: null,
    hosts: ['sponsor'],
    now: () => NOW,
    ...over,
  });
}

/** A `ReceiptEnforcer` deployment: a receipt signed for it is not one signed for the service. */
const ENFORCER: Address = getAddress('0x00000000000000000000000000000000000e4f04');

async function hireProof(
  paid = 5n * MILLI,
  by = CALLEE,
  agentId = '8',
  verifier: Address = SPONSOR,
): Promise<SponsorProof> {
  const receipt = await signHireReceipt(
    {
      version: 2,
      agentRegistry: REGISTRY,
      agentId,
      requester: AGENT.address,
      payment: PAYMENT,
      paid: paid.toString(),
      requestHash: hireDigest({ q: 1 }),
      resultHash: hireDigest({ a: 1 }),
      issuedAt: Math.floor(NOW / 1000) - 60,
      termId: TERM,
      expiresAt: Math.floor(NOW / 1000) + 3_600,
    },
    { chainId: CHAIN, verifyingContract: verifier },
    { address: by.address, signTypedData: (data) => by.signTypedData(data) },
  );
  // Through JSON, as the service receives it: bigints become strings and nothing else changes.
  return JSON.parse(JSON.stringify({ kind: 'hire', receipt })) as SponsorProof;
}

async function depositBody(
  proof: SponsorProof,
  signer = AGENT,
  over: Record<string, unknown> = {},
  agent: Address = AGENT.address,
  chain = CHAIN,
) {
  const request = {
    version: 1,
    agent,
    agentRegistry: REGISTRY,
    agentId: '7',
    termId: TERM,
    proof: sponsorProofDigest(proof),
    nonce: keccak256(stringToBytes(Math.random().toString())),
    expiresAt: Math.floor(NOW / 1000) + 600,
  };
  const signed = await signSponsorRequest(request, chain, {
    signTypedData: (data: ReturnType<typeof sponsorRequestTypedData>) => signer.signTypedData(data),
  });
  return {
    request: signed,
    proof,
    triple: { subjectId: SUBJECT, predicateId: USES, objectId: OBJECT },
    ...over,
  };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://sponsor${path}`, {
    method: 'POST',
    headers: { host: 'sponsor', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function call(service: ReturnType<typeof createSponsor>, path: string, body: unknown) {
  const response = await service.fetch(post(path, body));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('GET /', () => {
  test('prints the limits, an unset withdrawal threshold and the approve call', async () => {
    const response = await sponsor(world()).fetch(
      new Request('http://sponsor/', { headers: { host: 'sponsor' } }),
    );
    // The info route's shape, as `service.ts` builds it.
    const info = (await response.json()) as {
      chainId: number;
      sponsor: string;
      receiptVerifier: string;
      limits: Record<string, unknown>;
      approve: { kind: string };
      publish: string;
    };
    expect(info.chainId).toBe(CHAIN);
    expect(info.sponsor).toBe(SPONSOR);
    expect(info.receiptVerifier).toBe(SPONSOR);
    expect(info.limits.withdrawalThresholdBps).toBe('unset');
    expect(info.limits.belowProofCost).toBe(false);
    expect(info.limits.pendingSends).toBe(0);
    expect(info.limits.depositsPerAgentPerDay).toBe(2);
    expect(info.limits.dailyBudgetWei).toBe((10n ** 18n).toString());
    expect(info.approve.kind).toBe('approve');
    expect(info.publish).toBe('disabled');
  });
});

describe('POST /deposit', () => {
  /** `(SUBJECT, uses, SUBJECT)` is the term the request signs, so the check under test is reached. */
  const selfTriple = (w: World): MultiVaultReads => ({
    ...fakeReads(w),
    tripleId: async (s: Hex, p: Hex, o: Hex) =>
      s === SUBJECT && p === USES && o === SUBJECT ? TERM : keccak256(`0x${s.slice(2)}`),
  });

  test('refuses, and sends nothing, a hire receipt signed for the enforcer rather than this service', async () => {
    const w = world();
    const res = await call(
      sponsor(w),
      '/deposit',
      await depositBody(await hireProof(5n * MILLI, CALLEE, '8', ENFORCER)),
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/is for verifier/);
    expect(w.sent).toHaveLength(0);
  });

  test("refuses a hire of the requester's own agent through its agentWallet", async () => {
    // Agent 7 is the requester, held by AGENT, and CALLEE is its agentWallet. The holder pays the
    // wallet, the wallet signs a receipt naming agent 7: two keys, one agent.
    const w = world();
    const service = sponsor(w, {
      owners: owners({ '7': AGENT.address }, { '7': CALLEE.address }),
      reads: selfTriple(w),
    });
    const res = await call(
      service,
      '/deposit',
      await depositBody(await hireProof(5n * MILLI, CALLEE, '7'), AGENT, {
        triple: { subjectId: SUBJECT, predicateId: USES, objectId: SUBJECT },
      }),
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/the requester itself/);
    expect(w.sent).toHaveLength(0);
  });

  test.each([
    ['the requester', '7'],
    ['the hired agent', '8'],
  ])('refuses, and sends nothing, when two atoms claim %s through `same as`', async (_l, id) => {
    const w = world();
    const base = identities();
    const service = sponsor(w, {
      identities: {
        identityAtom: async (agent) =>
          agent.agentId === id
            ? { status: 'ambiguous', reason: `more than one atom claims this identity: ${OBJECT}` }
            : base.identityAtom(agent),
      },
    });
    const res = await call(service, '/deposit', await depositBody(await hireProof()));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/more than one atom/);
    expect(w.sent).toHaveLength(0);
  });

  test('refuses a triple whose subject and object are one atom, even for two agent ids', async () => {
    const w = world();
    const service = sponsor(w, {
      identities: identities({ '7': SUBJECT, '8': SUBJECT }),
      reads: selfTriple(w),
    });
    const res = await call(
      service,
      '/deposit',
      await depositBody(await hireProof(), AGENT, {
        triple: { subjectId: SUBJECT, predicateId: USES, objectId: SUBJECT },
      }),
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/using itself/);
    expect(w.sent).toHaveLength(0);
  });

  test('deposits with the agent as receiver, once per proof', async () => {
    const w = world();
    const service = sponsor(w);
    const proof = await hireProof();
    const first = await call(service, '/deposit', await depositBody(proof));
    expect(first.status).toBe(200);
    expect(first.body.receiver).toBe(AGENT.address);
    expect(first.body.shares).toBe('1000');
    expect(w.sent).toHaveLength(1);
    const { args } = decodeFunctionData({ abi: depositAbi, data: w.sent[0]!.data });
    expect(args[0]).toBe(AGENT.address);
    expect(args[1]).toBe(TERM);
    expect(w.sent[0]!.to).toBe(MULTIVAULT);
    expect(w.sent[0]!.value).toBe(MILLI);

    const again = await call(service, '/deposit', await depositBody(proof));
    expect(again.status).toBe(409);
    expect(w.sent).toHaveLength(1);
  });

  test('two concurrent requests with one proof send one deposit', async () => {
    const w = world();
    const service = sponsor(w);
    const proof = await hireProof();
    const [a, b] = await Promise.all([
      call(service, '/deposit', await depositBody(proof)),
      call(service, '/deposit', await depositBody(proof)),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(w.sent).toHaveLength(1);
  });

  test('refuses the third deposit of the day and hands back the call the agent can send itself', async () => {
    const w = world();
    const ledger = new SponsorLedger(null);
    for (const key of ['a', 'b']) {
      ledger.append({
        kind: 'deposit',
        subject: AGENT.address,
        value: MILLI,
        at: NOW - 1,
        key,
        termId: TERM,
        curveId: 1n,
        shares: 0n,
      });
    }
    const res = await call(
      sponsor(w, { ledger }),
      '/deposit',
      await depositBody(await hireProof()),
    );
    expect(res.status).toBe(429);
    expect((res.body.selfDeposit as { kind: string }).kind).toBe('deposit');
    expect(w.sent).toHaveLength(0);
  });

  test('refuses past a withdrawal threshold once one is set', async () => {
    const w = world();
    const ledger = new SponsorLedger(null);
    ledger.append({
      kind: 'deposit',
      subject: AGENT.address,
      value: MILLI,
      at: NOW - 3 * 86_400_000,
      key: 'old',
      termId: TERM,
      curveId: 1n,
      shares: 1_000n,
    });
    // The agent holds none of the 1,000 sponsored shares: it withdrew them all.
    const service = sponsor(w, { ledger, limits: { ...LIMITS, withdrawalThresholdBps: 5_000 } });
    const res = await call(service, '/deposit', await depositBody(await hireProof()));
    expect(res.status).toBe(429);
    expect(String(res.body.error)).toMatch(/withdrawn/);
    const unset = await call(
      sponsor(world(), { ledger }),
      '/deposit',
      await depositBody(await hireProof()),
    );
    expect(unset.status).toBe(200);
  });

  test('answers 409 with the approve call when the deposit does not simulate', async () => {
    const w = world();
    w.simulateOk = false;
    const res = await call(sponsor(w), '/deposit', await depositBody(await hireProof()));
    expect(res.status).toBe(409);
    expect((res.body.approve as { kind: string }).kind).toBe('approve');
    expect(w.sent).toHaveLength(0);
  });

  test('on testnet sponsors a hire that cost no more than the sponsored amount', async () => {
    const w = world();
    const proof = await hireProof(1n);
    const res = await call(
      sponsor(w, { payments: payments(1n) }),
      '/deposit',
      await depositBody(proof),
    );
    expect(res.status).toBe(200);
    expect(w.sent).toHaveLength(1);
  });

  test('with the mainnet cost rule on, refuses a proof that cost no more than the amount', async () => {
    const w = world();
    const proof = await hireProof(MILLI);
    const res = await call(
      sponsor(w, { payments: payments(MILLI), limits: { ...LIMITS, belowProofCost: true } }),
      '/deposit',
      await depositBody(proof),
    );
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toMatch(/not more than/);
    expect(w.sent).toHaveLength(0);
  });

  test("refuses an agent held by the sponsor's own key, before it reads the proof", async () => {
    const w = world();
    const service = sponsor(w, { owners: owners({ '7': SPONSOR, '8': CALLEE.address }) });
    const res = await call(
      service,
      '/deposit',
      await depositBody(await hireProof(), SPONSOR_ACCOUNT, {}, SPONSOR),
    );
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toMatch(/sponsoring service itself/);
    expect(w.sent).toHaveLength(0);
  });

  async function contentProof(chain = CHAIN, signer = NODE, to: Address = AGENT.address) {
    const receipt = await signContentReceipt(
      {
        atom: OBJECT,
        url: 'https://github.com/a/b?skill=c',
        path: 'skills/c/SKILL.md',
        digest: `0x${'00'.repeat(32)}`,
        to,
        servedAt: 1_793_000_000,
        nonce: keccak256(stringToBytes(Math.random().toString())),
      },
      chain,
      { address: signer.address, signTypedData: (data) => signer.signTypedData(data) },
    );
    return { kind: 'content', receipt } as SponsorProof; // Built from the content receipt just signed.
  }

  test('on testnet sponsors a content receipt from an accepted signer, once', async () => {
    const w = world();
    const service = sponsor(w);
    const proof = await contentProof();
    const first = await call(service, '/deposit', await depositBody(proof));
    expect(first.status).toBe(200);
    expect(first.body.receiver).toBe(AGENT.address);
    expect(w.sent).toHaveLength(1);
    const again = await call(service, '/deposit', await depositBody(proof));
    expect(again.status).toBe(409);
    expect(w.sent).toHaveLength(1);
  });

  test('refuses a content receipt signed by a key it does not accept, or about another caller', async () => {
    const w = world();
    const unknown = await call(
      sponsor(w),
      '/deposit',
      await depositBody(await contentProof(CHAIN, STRANGER)),
    );
    expect(unknown.status).toBe(403);
    expect(String(unknown.body.error)).toMatch(/unknown-signer/);
    const other = await call(
      sponsor(w),
      '/deposit',
      await depositBody(await contentProof(CHAIN, NODE, CALLEE.address)),
    );
    expect(other.status).toBe(403);
    expect(String(other.body.error)).toMatch(/other-caller/);
    expect(w.sent).toHaveLength(0);
  });

  test('refuses a content receipt on any chain but 13579', async () => {
    const w = world();
    const res = await call(
      sponsor(w, { chainId: 1155, reads: fakeReads(w, 1155) }),
      '/deposit',
      await depositBody(await contentProof(1155), AGENT, {}, AGENT.address, 1155),
    );
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toMatch(/no price yet/);
    expect(w.sent).toHaveLength(0);
  });

  test('with the mainnet cost rule on, refuses a content receipt, which has no price', async () => {
    const w = world();
    const res = await call(
      sponsor(w, { limits: { ...LIMITS, belowProofCost: true } }),
      '/deposit',
      await depositBody(await contentProof()),
    );
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toMatch(/has no price/);
    expect(w.sent).toHaveLength(0);
  });

  test('refuses a request someone else signed', async () => {
    const res = await call(
      sponsor(world()),
      '/deposit',
      await depositBody(await hireProof(), STRANGER),
    );
    expect(res.status).toBe(401);
  });

  test('refuses a proof swapped after signing', async () => {
    const body = await depositBody(await hireProof());
    const res = await call(sponsor(world()), '/deposit', {
      ...body,
      proof: await hireProof(6n * MILLI),
    });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/not the proof the request signed/);
  });

  test('refuses an agent that is not registered, or not in an accepted registry', async () => {
    const res = await call(
      sponsor(world(), { owners: owners({}) }),
      '/deposit',
      await depositBody(await hireProof()),
    );
    expect(res.status).toBe(403);
    const other = await call(
      sponsor(world(), { registries: [] }),
      '/deposit',
      await depositBody(await hireProof()),
    );
    expect(other.status).toBe(403);
    const heldByOther = await call(
      sponsor(world(), { owners: owners({ '7': CALLEE.address }) }),
      '/deposit',
      await depositBody(await hireProof()),
    );
    expect(heldByOther.status).toBe(403);
  });

  test('refuses a triple that is not the term, or not a uses triple', async () => {
    const proof = await hireProof();
    const wrong = await call(
      sponsor(world()),
      '/deposit',
      await depositBody(proof, AGENT, {
        triple: { subjectId: SUBJECT, predicateId: USES, objectId: SUBJECT },
      }),
    );
    expect(wrong.status).toBe(400);
    const notUses = await call(
      sponsor(world()),
      '/deposit',
      await depositBody(proof, AGENT, {
        triple: { subjectId: SUBJECT, predicateId: OBJECT, objectId: OBJECT },
      }),
    );
    expect(notUses.status).toBe(400);
  });

  test("sponsors only the proof's edge: (requester identity, uses, hired agent identity)", async () => {
    const proof = await hireProof();
    // The term id check runs first, so each of these names a triple the fake reads accept.
    const otherSubject: Hex = `0x${'5c'.repeat(32)}`;
    const reads = (w: World, s: Hex, o: Hex): MultiVaultReads => ({
      ...fakeReads(w),
      tripleId: async (a: Hex, p: Hex, b: Hex) =>
        a === s && p === USES && b === o ? TERM : SUBJECT,
    });
    const wrongSubject = world();
    const a = await call(
      sponsor(wrongSubject, { reads: reads(wrongSubject, otherSubject, OBJECT) }),
      '/deposit',
      await depositBody(proof, AGENT, {
        triple: { subjectId: otherSubject, predicateId: USES, objectId: OBJECT },
      }),
    );
    expect(a.status).toBe(400);
    expect(String(a.body.error)).toMatch(/subject is not agent 7/);
    expect(wrongSubject.sent).toHaveLength(0);

    const wrongObject = world();
    const b = await call(
      sponsor(wrongObject, { reads: reads(wrongObject, SUBJECT, otherSubject) }),
      '/deposit',
      await depositBody(proof, AGENT, {
        triple: { subjectId: SUBJECT, predicateId: USES, objectId: otherSubject },
      }),
    );
    expect(b.status).toBe(400);
    expect(String(b.body.error)).toMatch(/not the object the triple names/);
    expect(wrongObject.sent).toHaveLength(0);
  });

  test('refuses when either agent has no identity atom on the graph', async () => {
    const noRequester = world();
    const a = await call(
      sponsor(noRequester, { identities: identities({ '8': OBJECT }) }),
      '/deposit',
      await depositBody(await hireProof()),
    );
    expect(a.status).toBe(403);
    expect(String(a.body.error)).toMatch(/agent 7 has no identity atom/);
    const noCallee = world();
    const b = await call(
      sponsor(noCallee, { identities: identities({ '7': SUBJECT }) }),
      '/deposit',
      await depositBody(await hireProof()),
    );
    expect(b.status).toBe(403);
    expect(String(b.body.error)).toMatch(/hired has no identity atom/);
    expect([...noRequester.sent, ...noCallee.sent]).toHaveLength(0);
  });

  test('refuses a hire receipt whose signer is not the registered agent it names', async () => {
    // Agent 8 is held by CALLEE; a receipt signed by NODE for agent 8, paid to NODE, is not agent 8's.
    const w = world();
    const toNode = {
      getTransaction: async () => ({ from: AGENT.address, to: NODE.address, value: 5n * MILLI }),
      getTransactionReceipt: async () => ({ status: 'success' as const }),
    };
    const res = await call(
      sponsor(w, { payments: toNode }),
      '/deposit',
      await depositBody(await hireProof(5n * MILLI, NODE)),
    );
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toMatch(/neither the holder nor the agentWallet/);
    // The same receipt is the agent's once NODE is agent 8's agentWallet.
    const ok = await call(
      sponsor(world(), {
        payments: toNode,
        owners: owners(undefined, { '8': NODE.address }),
      }),
      '/deposit',
      await depositBody(await hireProof(5n * MILLI, NODE)),
    );
    expect(ok.status).toBe(200);
    // And an agent id that is not registered at all.
    const unregistered = await call(
      sponsor(world()),
      '/deposit',
      await depositBody(await hireProof(5n * MILLI, CALLEE, '99')),
    );
    expect(unregistered.status).toBe(403);
    expect(String(unregistered.body.error)).toMatch(/not registered/);
  });

  test('a read that fails after the deposit landed still spends the proof', async () => {
    const w = world();
    w.sharesThrowAfterSend = true;
    const ledger = new SponsorLedger(null);
    const service = sponsor(w, { ledger });
    const proof = await hireProof();
    const first = await call(service, '/deposit', await depositBody(proof));
    expect(first.status).toBe(200);
    expect(first.body.shares).toBeNull();
    expect(ledger.records).toHaveLength(1);
    expect(ledger.pending()).toHaveLength(0);
    w.sharesThrowAfterSend = false;
    const again = await call(service, '/deposit', await depositBody(proof));
    expect(again.status).toBe(409);
    expect(w.sent).toHaveLength(1);
  });

  test('a send that throws after broadcast leaves the proof spent and the spend pending', async () => {
    const w = world();
    w.sendThrows = true;
    const ledger = new SponsorLedger(null);
    const service = sponsor(w, { ledger });
    const proof = await hireProof();
    const first = await call(service, '/deposit', await depositBody(proof));
    expect(first.status).toBe(500);
    expect(ledger.pending()).toHaveLength(1);
    expect(ledger.records[0]?.value).toBe(MILLI);
    w.sendThrows = false;
    const again = await call(service, '/deposit', await depositBody(proof));
    expect(again.status).toBe(409);
    expect(w.sent).toHaveLength(1);
  });

  test('a reverted deposit spends nothing, so the proof can be retried', async () => {
    const w = world();
    w.revert = true;
    const ledger = new SponsorLedger(null);
    const service = sponsor(w, { ledger });
    const proof = await hireProof();
    expect((await call(service, '/deposit', await depositBody(proof))).status).toBe(502);
    expect(ledger.records).toHaveLength(0);
    w.revert = false;
    expect((await call(service, '/deposit', await depositBody(proof))).status).toBe(200);
    expect(w.sent).toHaveLength(2);
  });

  test('never sends a call for another chain than its own', async () => {
    const w = world();
    const res = await call(
      sponsor(w, { reads: fakeReads(w, 1155) }),
      '/deposit',
      await depositBody(await hireProof()),
    );
    expect(res.status).toBe(500);
    expect(w.sent).toHaveLength(0);
  });
});

describe('POST /gas', () => {
  test('sends the approval gas to a registered agent once, ever', async () => {
    const w = world();
    const service = sponsor(w);
    const first = await call(service, '/gas', { agentRegistry: REGISTRY, agentId: '7' });
    expect(first.status).toBe(200);
    expect(w.gas).toEqual([{ to: AGENT.address, value: MILLI / 10n }]);
    expect((first.body.next as { kind: string }).kind).toBe('approve');
    const second = await call(service, '/gas', { agentRegistry: REGISTRY, agentId: '7' });
    expect(second.status).toBe(429);
    expect(w.gas).toHaveLength(1);
  });

  test('a gas transfer that throws after broadcast is not sent a second time', async () => {
    const w = world();
    w.sendThrows = true;
    const service = sponsor(w);
    expect((await call(service, '/gas', { agentRegistry: REGISTRY, agentId: '7' })).status).toBe(
      500,
    );
    w.sendThrows = false;
    const again = await call(service, '/gas', { agentRegistry: REGISTRY, agentId: '7' });
    expect(again.status).toBe(429);
    expect(w.gas).toHaveLength(1);
  });

  test('a reverted gas transfer can be retried', async () => {
    const w = world();
    w.revert = true;
    const service = sponsor(w);
    expect((await call(service, '/gas', { agentRegistry: REGISTRY, agentId: '7' })).status).toBe(
      502,
    );
    w.revert = false;
    expect((await call(service, '/gas', { agentRegistry: REGISTRY, agentId: '7' })).status).toBe(
      200,
    );
    expect(w.gas).toHaveLength(2);
  });

  test("sends no gas to an agent held by the sponsor's own key", async () => {
    const w = world();
    const service = sponsor(w, { owners: owners({ '7': SPONSOR }) });
    const res = await call(service, '/gas', { agentRegistry: REGISTRY, agentId: '7' });
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toMatch(/sponsoring service itself/);
    expect(w.gas).toHaveLength(0);
  });

  test('sends nothing to an unregistered agent', async () => {
    const w = world();
    const res = await call(sponsor(w), '/gas', { agentRegistry: REGISTRY, agentId: '99' });
    expect(res.status).toBe(403);
    expect((await call(sponsor(w), '/gas', { agentRegistry: REGISTRY })).status).toBe(400);
    expect(w.gas).toHaveLength(0);
  });
});

describe('POST /publish', () => {
  const DELEGATE_TO: Hex = `0x${'d1'.repeat(32)}`;
  const IN_CONTEXT_OF: Hex = `0x${'c1'.repeat(32)}`;

  async function delegation(delegate: Address = AGENT.address) {
    const unsigned = {
      delegate,
      delegator: CALLEE.address,
      authority: `0x${'ff'.repeat(32)}` as Hex,
      caveats: [
        {
          enforcer: '0x99921C234d4Ca518DC58ba63ff9bfD2Cc9435f34' as Address,
          terms: '0x12' as Hex,
          args: '0x' as Hex,
        },
      ],
      salt: '0x01' as Hex,
      signature: '0x' as Hex,
    };
    const signature = await signDelegation({
      privateKey: `0x${'22'.repeat(32)}`,
      delegation: unsigned,
      delegationManager: DELEGATION_MANAGER,
      chainId: CHAIN,
    });
    return { ...unsigned, signature };
  }

  function config(w: World): PublishConfig {
    w.terms.add(DELEGATE_TO.toLowerCase());
    w.terms.add(IN_CONTEXT_OF.toLowerCase());
    return {
      delegationManager: DELEGATION_MANAGER,
      predicates: { delegateTo: DELEGATE_TO, inContextOf: IN_CONTEXT_OF },
      verify: (args) => verifyTypedData(args),
      pin: async (document) => {
        w.pinned.push(document);
        return `ipfs://bafy${w.pinned.length}`;
      },
    };
  }

  test('answers 503 when publication is not configured', async () => {
    const res = await call(sponsor(world()), '/publish', { delegation: await delegation() });
    expect(res.status).toBe(503);
  });

  test('pins nothing and sends nothing for a delegation whose signature does not verify', async () => {
    const w = world();
    const forged = {
      ...(await delegation()),
      caveats: [
        { enforcer: '0x99921C234d4Ca518DC58ba63ff9bfD2Cc9435f34', terms: '0x99', args: '0x' },
      ],
    };
    const res = await call(sponsor(w, { publish: config(w) }), '/publish', {
      delegation: forged,
      agentRegistry: REGISTRY,
      agentId: '7',
    });
    expect(res.status).toBe(401);
    expect(w.pinned).toHaveLength(0);
    expect(w.sent).toHaveLength(0);
  });

  test('publishes a verified delegation to a registered agent: three atoms, two triples', async () => {
    const w = world();
    const res = await call(sponsor(w, { publish: config(w) }), '/publish', {
      delegation: await delegation(),
      agentRegistry: REGISTRY,
      agentId: '7',
    });
    expect(res.status).toBe(200);
    expect(res.body.published).toBe('now');
    expect(w.pinned).toHaveLength(1);
    expect(w.sent.map((c) => c.kind)).toEqual([
      'create-atom',
      'create-atom',
      'create-atom',
      'create-triple',
      'create-triple',
    ]);
    expect(w.sent.every((c) => c.to === MULTIVAULT)).toBe(true);
  });

  test('pins nothing for a delegate that is not the registered agent, and returns the document', async () => {
    const w = world();
    const res = await call(sponsor(w, { publish: config(w) }), '/publish', {
      delegation: await delegation(STRANGER.address),
      agentRegistry: REGISTRY,
      agentId: '7',
    });
    expect(res.status).toBe(403);
    expect(typeof res.body.document).toBe('string');
    expect(w.pinned).toHaveLength(0);
  });

  test('records what a publication spent when a send throws half way', async () => {
    const w = world();
    const publish = config(w);
    const ledger = new SponsorLedger(null);
    const wallet = fakeWallet(w);
    let calls = 0;
    const flaky: SponsorWallet = {
      ...wallet,
      send: async (c) => {
        calls += 1;
        if (calls === 2) {
          w.sent.push(c);
          throw new Error('timed out waiting for the receipt');
        }
        return wallet.send(c);
      },
    };
    const res = await call(sponsor(w, { publish, ledger, wallet: flaky }), '/publish', {
      delegation: await delegation(),
      agentRegistry: REGISTRY,
      agentId: '7',
    });
    expect(res.status).toBe(500);
    // Both calls are counted: the one that landed and the one whose outcome is unknown.
    expect(ledger.records).toHaveLength(1);
    expect(ledger.records[0]?.value).toBe(w.sent[0]!.value + w.sent[1]!.value);
  });

  test('stops at two publications a day per delegator', async () => {
    const w = world();
    const ledger = new SponsorLedger(null);
    for (const key of ['a', 'b'])
      ledger.append({ kind: 'publish', subject: CALLEE.address, value: MILLI, at: NOW - 1, key });
    const res = await call(sponsor(w, { publish: config(w), ledger }), '/publish', {
      delegation: await delegation(),
      agentRegistry: REGISTRY,
      agentId: '7',
    });
    expect(res.status).toBe(429);
    expect(w.sent).toHaveLength(0);
  });
});

describe('the ledger', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  test('survives a restart, bigints included, and skips a torn last line', () => {
    dir = mkdtempSync(join(tmpdir(), 'sponsor-ledger-'));
    const path = join(dir, 'ledger.jsonl');
    const first = new SponsorLedger(path);
    first.append({
      kind: 'deposit',
      subject: AGENT.address,
      value: MILLI,
      at: NOW,
      key: 'k',
      termId: TERM,
      curveId: 1n,
      shares: 7n,
    });
    writeFileSync(path, '{"kind":"dep', { flag: 'a' });
    first.close();
    const second = new SponsorLedger(path);
    expect(second.records).toEqual([
      {
        kind: 'deposit',
        subject: AGENT.address,
        value: MILLI,
        at: NOW,
        key: 'k',
        termId: TERM,
        curveId: 1n,
        shares: 7n,
      },
    ]);
    expect(second.has('deposit', 'k')).toBe(true);
    expect(second.has('gas', 'k')).toBe(false);
  });

  test('refuses a second service on the same ledger file until the first closes it', () => {
    dir = mkdtempSync(join(tmpdir(), 'sponsor-ledger-'));
    const path = join(dir, 'ledger.jsonl');
    const first = new SponsorLedger(path);
    expect(() => new SponsorLedger(path)).toThrow(/held by process/);
    first.close();
    new SponsorLedger(path).close();
  });

  test("decides the day's limits from today's slice and the subject's own history alone", () => {
    const ledger = new SponsorLedger(null);
    const row = { kind: 'gas' as const, value: 1n };
    ledger.append({ ...row, subject: AGENT.address, at: NOW - 3 * 86_400_000, key: 'old' });
    ledger.append({ ...row, subject: CALLEE.address, at: NOW - 3 * 86_400_000, key: 'other' });
    ledger.append({ ...row, subject: CALLEE.address, at: NOW, key: 'today' });
    expect(ledger.relevant(NOW, [AGENT.address]).map((r) => r.key)).toEqual(['today', 'old']);
    expect(ledger.relevant(NOW).map((r) => r.key)).toEqual(['today']);
  });

  test('reloads a pending reservation as spent, and a settlement onto its row', () => {
    dir = mkdtempSync(join(tmpdir(), 'sponsor-ledger-'));
    const path = join(dir, 'ledger.jsonl');
    const first = new SponsorLedger(path);
    const row = { kind: 'deposit' as const, subject: AGENT.address, value: MILLI, at: NOW };
    first.reserve({ ...row, key: 'lost', termId: TERM, curveId: 1n });
    first.reserve({ ...row, key: 'landed', termId: TERM, curveId: 1n });
    first.settle('deposit', 'landed', { status: 'success', hash: PAYMENT, shares: 9n });
    first.reserve({ ...row, key: 'reverted' });
    first.settle('deposit', 'reverted', { status: 'reverted', hash: PAYMENT });
    expect(() => first.reserve({ ...row, key: 'lost' })).toThrow(/already reserved/);
    expect(() => first.settle('deposit', 'nope', { status: 'reverted', hash: PAYMENT })).toThrow(
      /no pending/,
    );

    first.close();
    const second = new SponsorLedger(path);
    expect(second.has('deposit', 'lost')).toBe(true);
    expect(second.has('deposit', 'landed')).toBe(true);
    expect(second.has('deposit', 'reverted')).toBe(false);
    expect(second.pending().map((r) => r.key)).toEqual(['lost']);
    expect(second.records.map((r) => [r.key, r.shares])).toEqual([
      ['lost', undefined],
      ['landed', 9n],
    ]);
    // A reverted reservation frees its key for a new one.
    second.reserve({ ...row, key: 'reverted' });
    expect(second.has('deposit', 'reverted')).toBe(true);
  });
});

describe('the key file and the chain', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  test('reads a 0600 file and refuses one anybody else can read', () => {
    dir = mkdtempSync(join(tmpdir(), 'sponsor-key-'));
    const path = join(dir, 'key');
    // A fixed test value, not a key anyone holds.
    writeFileSync(path, `${'11'.repeat(32)}\n`);
    chmodSync(path, 0o644);
    expect(() => readKeyFile(path)).toThrow(KeyFileError);
    chmodSync(path, 0o600);
    expect(readKeyFile(path)).toBe(AGENT_KEY);
    writeFileSync(path, 'not a key');
    chmodSync(path, 0o600);
    expect(() => readKeyFile(path)).toThrow(/32-byte/);
  });

  test('refuses any chain but 13579', () => {
    expect(() => assertSponsorChain(13579)).not.toThrow();
    expect(() => assertSponsorChain(1155)).toThrow(/testnet 13579 only/);
  });

  test('parses the registry list and refuses it whole on one bad or foreign entry', () => {
    expect(registryList(` ${REGISTRY} `, CHAIN)).toEqual([REGISTRY]);
    expect(() => registryList(`${REGISTRY},0xabc`, CHAIN)).toThrow(/0xabc/);
    expect(() => registryList(`eip155:1155:${REGISTRY_ADDRESS}`, CHAIN)).toThrow(/not on chain/);
    expect(() => registryList(' , ', CHAIN)).toThrow(/no registry/);
  });

  test('parses an address list and refuses it whole on one bad entry', () => {
    expect(addressList(undefined)).toEqual([]);
    expect(addressList(` ${NODE.address.toLowerCase()} `)).toEqual([NODE.address]);
    expect(() => addressList(`${NODE.address},nope`)).toThrow(/nope/);
  });
});

describe('a first declaration: the uses triple is created, then the deposit', () => {
  function fresh(): World {
    const w = world();
    w.terms = new Set([SUBJECT.toLowerCase(), OBJECT.toLowerCase()]);
    return w;
  }

  test("creates the missing triple, then deposits the agent's position on it", async () => {
    const w = fresh();
    const res = await call(sponsor(w), '/deposit', await depositBody(await hireProof()));
    expect(res.status).toBe(200);
    expect(w.sent.map((c) => c.kind)).toEqual(['create-triple', 'deposit']);
    expect(w.sent[0]!.to).toBe(MULTIVAULT);
    expect(w.sent[0]!.value).toBe(2n * MILLI);
    expect(res.body.created).toBeDefined();
    expect(res.body.receiver).toBe(AGENT.address);
  });

  test('creates no triple past depositsPerAgentPerDay creations for one agent, deposits or not', async () => {
    const w = fresh();
    const ledger = new SponsorLedger(null);
    for (const n of ['1', '2']) {
      ledger.append({
        kind: 'create',
        subject: AGENT.address,
        value: MILLI,
        at: NOW,
        key: `create:${n}`,
      });
    }
    const res = await call(
      sponsor(w, { ledger }),
      '/deposit',
      await depositBody(await hireProof()),
    );
    expect(res.status).toBe(429);
    expect(String(res.body.error)).toMatch(/triple creations a day/);
    expect(w.sent).toHaveLength(0);
  });

  test('creates nothing when an atom of the triple is missing', async () => {
    const w = world();
    w.terms = new Set([SUBJECT.toLowerCase()]);
    const res = await call(sponsor(w), '/deposit', await depositBody(await hireProof()));
    expect(res.status).toBe(400);
    expect(w.sent).toHaveLength(0);
  });

  test('creates nothing when the deposit itself would be refused by the budget', async () => {
    const w = fresh();
    const res = await call(
      sponsor(w, { limits: { ...LIMITS, dailyBudget: 2n * MILLI } }),
      '/deposit',
      await depositBody(await hireProof()),
    );
    expect(res.status).toBe(429);
    expect(w.sent).toHaveLength(0);
  });
});

describe('POST /mint-gas', () => {
  const HOLDER = privateKeyToAccount(`0x${'66'.repeat(32)}`);
  const ADDRESS = HOLDER.address;
  let n = 0;
  /** A request signed by `signer`, as `apps/mcp`'s loop sends it. */
  async function minted(
    signer: { address: Address; signTypedData: typeof AGENT.signTypedData },
    over: { address?: Address; chain?: number } = {},
  ) {
    const request = await signMintGasRequest(
      {
        address: over.address ?? signer.address,
        nonce: keccak256(stringToBytes(`mint-${(n += 1)}`)),
        expiresAt: Math.floor(NOW / 1000) + 600,
      },
      over.chain ?? CHAIN,
      signer,
    );
    return { request };
  }

  test('sends the mint gas to an unregistered address once, ever', async () => {
    const w = world();
    const service = sponsor(w);
    const first = await call(service, '/mint-gas', await minted(HOLDER));
    expect(first.status).toBe(200);
    expect(w.gas).toEqual([{ to: ADDRESS, value: MILLI / 10n }]);
    const second = await call(service, '/mint-gas', await minted(HOLDER));
    expect(second.status).toBe(429);
    expect(w.gas).toHaveLength(1);
  });

  test('refuses a bare address, and a request one address signs for another', async () => {
    const w = world();
    const bare = await call(sponsor(w), '/mint-gas', { address: ADDRESS });
    expect(bare.status).toBe(400);
    const forged = await call(
      sponsor(w),
      '/mint-gas',
      await minted(STRANGER, { address: ADDRESS }),
    );
    expect(forged.status).toBe(401);
    const otherChain = await call(sponsor(w), '/mint-gas', await minted(HOLDER, { chain: 1155 }));
    expect(otherChain.status).toBe(400);
    expect(w.gas).toHaveLength(0);
  });

  test('spends a signed request once; a reverted send gave its value back and may retry', async () => {
    const w = world();
    w.revert = true;
    const service = sponsor(w);
    const body = await minted(HOLDER);
    expect((await call(service, '/mint-gas', body)).status).toBe(502);
    w.revert = false;
    expect((await call(service, '/mint-gas', body)).status).toBe(200);
    expect((await call(service, '/mint-gas', body)).status).toBe(409);
    expect(w.gas).toHaveLength(2);
  });

  test('stops at the daily cap of new agents, whoever asks', async () => {
    const w = world();
    const service = sponsor(w);
    for (const k of ['67', '68']) {
      const signer = privateKeyToAccount(`0x${k.repeat(32)}`);
      expect((await call(service, '/mint-gas', await minted(signer))).status).toBe(200);
    }
    const third = await call(service, '/mint-gas', await minted(HOLDER));
    expect(third.status).toBe(429);
    expect(String(third.body.error)).toMatch(/new agents a day/);
    expect(w.gas).toHaveLength(2);
  });

  test('sends nothing to an address that already holds an agent', async () => {
    const w = world();
    const held = await call(sponsor(w), '/mint-gas', await minted(AGENT));
    expect(held.status).toBe(403);
    expect(w.gas).toHaveLength(0);
  });

  test('answers 503 when it is off, and sends nothing to itself', async () => {
    const w = world();
    const off = await call(
      sponsor(w, { limits: { ...LIMITS, mintGas: null } }),
      '/mint-gas',
      await minted(HOLDER),
    );
    expect(off.status).toBe(503);
    const self = await call(sponsor(w), '/mint-gas', await minted(SPONSOR_ACCOUNT));
    expect(self.status).toBe(403);
    expect(w.gas).toHaveLength(0);
  });
});

describe('POST /identity', () => {
  const pinned = async (thing: Parameters<typeof thingUri>[0]) => thingUri(thing);

  test('pins both documents, then creates the two atoms and three triples, all to the MultiVault', async () => {
    const w = world();
    const res = await call(sponsor(w, { pinThing: pinned }), '/identity', {
      agentRegistry: REGISTRY,
      agentId: '7',
    });
    expect(res.status).toBe(200);
    expect(w.sent.map((c) => c.kind)).toEqual([
      'create-atom',
      'create-atom',
      'create-triple',
      'create-triple',
      'create-triple',
    ]);
    expect(w.sent.every((c) => c.to === MULTIVAULT)).toBe(true);
    expect(res.body.identityAtom).toBeDefined();
  });

  test('sends nothing when a pin does not return the uri the atom derives from', async () => {
    const w = world();
    const res = await call(sponsor(w, { pinThing: async () => 'ipfs://bafywrong' }), '/identity', {
      agentRegistry: REGISTRY,
      agentId: '7',
    });
    expect(res.status).toBe(502);
    expect(w.sent).toHaveLength(0);
  });

  test('stops at the daily cap of new identities, and refuses an unregistered agent', async () => {
    const w = world();
    let pins = 0;
    const service = sponsor(w, {
      pinThing: async (thing) => {
        pins += 1;
        return pinned(thing);
      },
      owners: owners({ '7': AGENT.address, '8': CALLEE.address, '9': STRANGER.address }),
    });
    for (const agentId of ['7', '8']) {
      expect((await call(service, '/identity', { agentRegistry: REGISTRY, agentId })).status).toBe(
        200,
      );
    }
    expect(pins).toBe(4);
    const third = await call(service, '/identity', { agentRegistry: REGISTRY, agentId: '9' });
    expect(third.status).toBe(429);
    // Refused before anything was pinned for it.
    expect(pins).toBe(4);
    const unknown = await call(service, '/identity', { agentRegistry: REGISTRY, agentId: '10' });
    expect(unknown.status).toBe(403);
  });

  test('answers 503 without a pinning key', async () => {
    const w = world();
    const res = await call(sponsor(w), '/identity', { agentRegistry: REGISTRY, agentId: '7' });
    expect(res.status).toBe(503);
    expect(w.sent).toHaveLength(0);
  });
});

describe('a request from somewhere other than this machine', () => {
  const ADDRESS = privateKeyToAccount(`0x${'66'.repeat(32)}`).address;

  test('a text/plain POST, which any web page can send, spends nothing', async () => {
    const w = world();
    const response = await sponsor(w).fetch(
      post('/mint-gas', { address: ADDRESS }, { 'content-type': 'text/plain;charset=UTF-8' }),
    );
    expect(response.status).toBe(415);
    expect(w.gas).toHaveLength(0);
  });

  test('a rebinding Host and a foreign Origin are refused before the route runs', async () => {
    const w = world();
    const service = sponsor(w);
    const rebound = await service.fetch(
      post('/gas', { agentRegistry: REGISTRY, agentId: '7' }, { host: 'attacker.example:3200' }),
    );
    expect(rebound.status).toBe(403);
    const page = await service.fetch(
      post(
        '/gas',
        { agentRegistry: REGISTRY, agentId: '7' },
        { origin: 'https://attacker.example' },
      ),
    );
    expect(page.status).toBe(403);
    expect(w.gas).toHaveLength(0);
  });
});

describe('a send whose receipt does not come in time', () => {
  test('answers 504, keeps the spend pending with its hash, and frees the queue', async () => {
    const w = world();
    w.unconfirmed = true;
    const ledger = new SponsorLedger(null);
    const service = sponsor(w, { ledger });
    const res = await call(service, '/gas', { agentRegistry: REGISTRY, agentId: '7' });
    expect(res.status).toBe(504);
    const key = `gas:${AGENT.address.toLowerCase()}`;
    expect(ledger.pending().map((r) => r.key)).toEqual([key]);
    expect(ledger.hashOf('gas', key)).toBe(res.body.pending as Hex);
    // Still spent: the agent does not get its gas a second time while the first may land.
    w.unconfirmed = false;
    expect((await call(service, '/gas', { agentRegistry: REGISTRY, agentId: '7' })).status).toBe(
      429,
    );
    // And the queue moved on: another agent's request is served.
    expect((await call(service, '/gas', { agentRegistry: REGISTRY, agentId: '8' })).status).toBe(
      200,
    );
  });

  test('the hash of a pending send survives a restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sponsor-ledger-'));
    try {
      const path = join(dir, 'ledger.jsonl');
      const first = new SponsorLedger(path);
      first.reserve({ kind: 'gas', subject: AGENT.address, value: 1n, at: NOW, key: 'g' });
      first.noteSent('gas', 'g', PAYMENT);
      first.close();
      const second = new SponsorLedger(path);
      expect(second.pending().map((r) => r.key)).toEqual(['g']);
      expect(second.hashOf('gas', 'g')).toBe(PAYMENT);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('a chain that cannot be read', () => {
  const outage = (): never => {
    throw new Error('HTTP request failed. URL: https://rpc.example/v2/SECRETKEY');
  };

  test("the requester's owner unreadable is a 503 with a retry hint, not a refusal", async () => {
    const w = world();
    const service = sponsor(w, {
      owners: { ownerOf: async () => outage(), agentWalletOf: async () => null },
    });
    const response = await service.fetch(post('/deposit', await depositBody(await hireProof())));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ retry: true });
    expect(text).not.toContain('SECRETKEY');
    expect(w.sent).toHaveLength(0);
  });

  test('the same on /gas, which also asks who holds the agent', async () => {
    const w = world();
    const service = sponsor(w, {
      owners: { ownerOf: async () => outage(), agentWalletOf: async () => null },
    });
    const gas = await service.fetch(post('/gas', { agentRegistry: REGISTRY, agentId: '7' }));
    expect(gas.status).toBe(503);
    expect(gas.headers.get('retry-after')).toBe('5');
    expect(w.sent).toHaveLength(0);
  });

  test('a proof the chain could not be read for is a 503, not a 403', async () => {
    // A receipt signed by NODE for agent 8 (held by CALLEE) makes the check ask agent 8's wallet.
    const w = world();
    const toNode = {
      getTransaction: async () => ({ from: AGENT.address, to: NODE.address, value: 5n * MILLI }),
      getTransactionReceipt: async () => ({ status: 'success' as const }),
    };
    const held = owners();
    const service = sponsor(w, {
      payments: toNode,
      owners: { ownerOf: held.ownerOf, agentWalletOf: async () => outage() },
    });
    const response = await service.fetch(
      post('/deposit', await depositBody(await hireProof(5n * MILLI, NODE))),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.retry).toBe(true);
    expect(String(body.error)).toMatch(/could not be read/);
    expect(w.sent).toHaveLength(0);
  });

  test('a registry read that reverts is "none", and every other failure is rethrown', () => {
    expect(nullOnRevert(new Error('execution reverted'))).toBeNull();
    const down = new Error('fetch failed');
    expect(() => nullOnRevert(down)).toThrow(down);
  });
});

describe('a request that fails inside a route', () => {
  test('answers a generic 500 and logs the detail with the RPC URL cut to its host', async () => {
    const w = world();
    const lines: string[] = [];
    const service = sponsor(w, {
      log: (line) => lines.push(line),
      owners: {
        ownerOf: async () => AGENT.address,
        agentWalletOf: async () => null,
      },
      holdings: {
        agentsHeldBy: async () => {
          throw new Error('HTTP request failed. URL: https://rpc.example/v2/SECRETKEY');
        },
      },
    });
    const body = await signMintGasRequest(
      {
        address: STRANGER.address,
        nonce: keccak256(stringToBytes('fail')),
        expiresAt: Math.floor(NOW / 1000) + 60,
      },
      CHAIN,
      STRANGER,
    );
    const response = await service.fetch(post('/mint-gas', { request: body }));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain('SECRETKEY');
    expect(text).not.toContain('rpc.example');
    expect(lines.join('\n')).toContain('https://rpc.example/…');
    expect(lines.join('\n')).not.toContain('SECRETKEY');
  });
});

describe('POST /list-tool', () => {
  const TOOL = 'https://example.com/mcp';
  const SKILL = 'https://github.com/a/b?skill=c';
  const pinned: string[] = [];
  const listing = (w: World, over: Partial<Parameters<typeof createSponsor>[0]> = {}) =>
    sponsor(w, {
      pinThing: async (thing) => {
        pinned.push(thing.url);
        return thingUri(thing);
      },
      resolveTool: async () => ({ ok: true }),
      listToolOrigins: ['http://localhost:5173'],
      ...over,
    });
  const signedFor = async (url: string, signer = AGENT) =>
    signListToolRequest(
      {
        address: signer.address,
        url,
        nonce: keccak256(stringToBytes(Math.random().toString())),
        expiresAt: Math.floor(NOW / 1000) + 600,
      },
      CHAIN,
      { signTypedData: (data) => signer.signTypedData(data) },
    );

  afterEach(() => {
    pinned.length = 0;
  });

  test('lists a tool URL unsigned: pins its Thing, creates its atom on the MultiVault', async () => {
    const w = world();
    const res = await call(listing(w), '/list-tool', { url: TOOL });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(true);
    expect(w.sent.map((c) => c.kind)).toEqual(['create-atom']);
    expect(w.sent[0]!.to).toBe(MULTIVAULT);
    expect(w.sent[0]!.value).toBe(2n * MILLI);
    expect(pinned).toEqual([TOOL]);
    expect(res.body.repositoryAtomId).toBeUndefined();
  });

  test('lists a skill with its repository and the source triple', async () => {
    const w = world();
    const res = await call(listing(w), '/list-tool', { url: SKILL });
    expect(res.status).toBe(200);
    expect(w.sent.map((c) => c.kind)).toEqual(['create-atom', 'create-triple']);
    expect(w.sent[0]!.value).toBe(4n * MILLI);
    expect(pinned).toEqual([SKILL, 'https://github.com/a/b']);
    expect(res.body.repositoryAtomId).toBeDefined();
    expect(res.body.sourceTriple).toBeDefined();
  });

  test('answers created: false, and spends nothing, when the tool is already listed', async () => {
    const w = world();
    const plan = await planToolListing({ url: TOOL, reads: fakeReads(w) });
    w.terms.add(plan.atomId.toLowerCase());
    const res = await call(listing(w), '/list-tool', { url: TOOL });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.transactions).toEqual([]);
    expect(pinned).toHaveLength(0);
    expect(w.sent).toHaveLength(0);
  });

  test("lists a skill under GitHub's spelling, whatever path, query or case was pasted", async () => {
    const w = world();
    const canonical = await planToolListing({
      url: 'https://github.com/Wieedze/ARP?skill=arp',
      reads: fakeReads(w),
    });
    for (const id of [
      canonical.atomId,
      canonical.repository!.atomId,
      canonical.repository!.sourceTripleId,
    ])
      w.terms.add(id.toLowerCase());
    const service = listing(w, {
      resolveTool: async () => ({ ok: true, fullName: 'Wieedze/ARP' }),
    });
    for (const url of [
      'https://github.com/wieedze/arp?skill=arp',
      'https://github.com/Wieedze/ARP/tree/main?skill=arp',
      'https://github.com/Wieedze/ARP?skill=arp&ref=x',
      'https://github.com:8080/Wieedze/ARP.git?skill=arp',
    ]) {
      const res = await call(service, '/list-tool', { url });
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(false);
      expect(res.body.atomId).toBe(canonical.atomId);
    }
    expect(w.sent).toHaveLength(0);
  });

  test('stops all listings at the daily total, however many keys sign them', async () => {
    const w = world();
    const service = listing(w, { limits: { ...LIMITS, anonymousListingsPerDay: 10 } });
    for (const n of ['1', '2', '3', '4']) {
      const signer = privateKeyToAccount(`0x${n.repeat(64)}`);
      const url = `${TOOL}${n}`;
      expect(
        (await call(service, '/list-tool', { url, request: await signedFor(url, signer) })).status,
      ).toBe(200);
    }
    const fifth = await call(service, '/list-tool', { url: `${TOOL}5` });
    expect(fifth.status).toBe(429);
    expect(String(fifth.body.error)).toMatch(/in all/);
    expect(w.sent).toHaveLength(4);
  });

  test('refuses a URL longer than any tool URL', async () => {
    const res = await call(listing(world()), '/list-tool', { url: `${TOOL}/${'a'.repeat(2_100)}` });
    expect(res.status).toBe(400);
    expect(res.body.rule).toBe('url');
  });

  test('stops unsigned listings at the anonymous cap; a signed one uses its own limit', async () => {
    const w = world();
    const service = listing(w);
    for (const n of ['1', '2']) {
      expect((await call(service, '/list-tool', { url: `${TOOL}${n}` })).status).toBe(200);
    }
    const third = await call(service, '/list-tool', { url: `${TOOL}3` });
    expect(third.status).toBe(429);
    expect(third.body.rule).toBe('limit');
    const signed = await call(service, '/list-tool', {
      url: `${TOOL}3`,
      request: await signedFor(`${TOOL}3`),
    });
    expect(signed.status).toBe(200);
    expect(w.sent).toHaveLength(3);
  });

  test('refuses a signature over another URL, and a signed request used twice', async () => {
    const w = world();
    const service = listing(w);
    const other = await call(service, '/list-tool', { url: TOOL, request: await signedFor(SKILL) });
    expect(other.status).toBe(400);
    expect(other.body.rule).toBe('signature');
    const request = await signedFor(TOOL);
    expect((await call(service, '/list-tool', { url: TOOL, request })).status).toBe(200);
    const again = await call(service, '/list-tool', { url: TOOL, request });
    expect(again.status).toBe(409);
    expect(w.sent).toHaveLength(1);
  });

  test('refuses a URL that does not exist, or is not a tool, before pinning or sending', async () => {
    const w = world();
    const missing = await call(
      listing(w, { resolveTool: async () => ({ ok: false, reason: 'no such repository' }) }),
      '/list-tool',
      { url: SKILL },
    );
    expect(missing.status).toBe(422);
    expect(missing.body.rule).toBe('resolves');
    const notTool = await call(listing(w), '/list-tool', { url: 'not a url' });
    expect(notTool.status).toBe(400);
    expect(notTool.body.rule).toBe('url');
    expect(pinned).toHaveLength(0);
    expect(w.sent).toHaveLength(0);
  });

  test('answers 503 when the URL cannot be checked, and when listing is not configured', async () => {
    const w = world();
    const down = await call(
      listing(w, {
        resolveTool: async () => {
          throw new Error('GitHub answered HTTP 403');
        },
      }),
      '/list-tool',
      { url: SKILL },
    );
    expect(down.status).toBe(503);
    expect(down.body.retry).toBe(true);
    const off = await call(sponsor(w), '/list-tool', { url: TOOL });
    expect(off.status).toBe(503);
    expect(w.sent).toHaveLength(0);
  });

  test('answers the web app from its origin on this route alone', async () => {
    const w = world();
    const service = listing(w);
    const preflight = await service.fetch(
      new Request('http://sponsor/list-tool', {
        method: 'OPTIONS',
        headers: { host: 'sponsor', origin: 'http://localhost:5173' },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const posted = await service.fetch(
      post('/list-tool', { url: TOOL }, { origin: 'http://localhost:5173' }),
    );
    expect(posted.status).toBe(200);
    expect(posted.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const elsewhere = await service.fetch(
      post('/list-tool', { url: TOOL }, { origin: 'https://evil.example' }),
    );
    expect(elsewhere.status).toBe(403);
    const gas = await service.fetch(
      post('/gas', { agentRegistry: REGISTRY, agentId: '7' }, { origin: 'http://localhost:5173' }),
    );
    expect(gas.status).toBe(403);
    expect(w.gas).toHaveLength(0);
  });
});
