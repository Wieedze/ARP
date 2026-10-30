import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import {
  hireDigest,
  signContentReceipt,
  signHireReceipt,
  signSponsorRequest,
  sponsorProofDigest,
  sponsorRequestTypedData,
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
import {
  addressList,
  createSponsor,
  type PublishConfig,
  type SponsorWallet,
} from '../src/service.ts';

// Fixed test keys, generated for nothing and holding nothing. No real key is read by any test.
const AGENT_KEY = `0x${'11'.repeat(32)}` as const;
const AGENT = privateKeyToAccount(AGENT_KEY);
const CALLEE = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const NODE = privateKeyToAccount(`0x${'33'.repeat(32)}`);
const SPONSOR = privateKeyToAccount(`0x${'44'.repeat(32)}`).address;
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
  dailyBudget: 10n ** 18n,
  depositsPerAgentPerDay: 2,
  publicationsPerDelegatorPerDay: 2,
  withdrawalThresholdBps: null,
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
      } else {
        w.terms.add(`created:${w.sent.length}`);
      }
      if (w.sendThrows) throw new Error('timed out waiting for the receipt');
      return { hash: hash(), status: w.revert ? 'reverted' : 'success' };
    },
    sendGas: async (to, value) => {
      w.gas.push({ to, value });
      if (w.sendThrows) throw new Error('timed out waiting for the receipt');
      return { hash: hash(), status: w.revert ? 'reverted' : 'success' };
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
    owners: owners(),
    identities: identities(),
    registries: [REGISTRY],
    usesPredicate: USES,
    limits: LIMITS,
    ledger: new SponsorLedger(null),
    acceptedContentSigners: [NODE.address],
    publish: null,
    now: () => NOW,
    ...over,
  });
}

async function hireProof(paid = 5n * MILLI, by = CALLEE, agentId = '8'): Promise<SponsorProof> {
  const receipt = await signHireReceipt(
    {
      version: 1,
      agentRegistry: REGISTRY,
      agentId,
      requester: AGENT.address,
      payment: PAYMENT,
      paid: paid.toString(),
      requestHash: hireDigest({ q: 1 }),
      resultHash: hireDigest({ a: 1 }),
      issuedAt: 1_793_000_000,
    },
    CHAIN,
    { address: by.address, signTypedData: (data) => by.signTypedData(data) },
  );
  // Through JSON, as the service receives it: bigints become strings and nothing else changes.
  return JSON.parse(JSON.stringify({ kind: 'hire', receipt })) as SponsorProof;
}

async function depositBody(
  proof: SponsorProof,
  signer = AGENT,
  over: Record<string, unknown> = {},
) {
  const request = {
    version: 1,
    agent: AGENT.address,
    agentRegistry: REGISTRY,
    agentId: '7',
    termId: TERM,
    proof: sponsorProofDigest(proof),
    nonce: keccak256(stringToBytes(Math.random().toString())),
    expiresAt: Math.floor(NOW / 1000) + 600,
  };
  const signed = await signSponsorRequest(request, CHAIN, {
    signTypedData: (data: ReturnType<typeof sponsorRequestTypedData>) => signer.signTypedData(data),
  });
  return {
    request: signed,
    proof,
    triple: { subjectId: SUBJECT, predicateId: USES, objectId: OBJECT },
    ...over,
  };
}

function post(path: string, body: unknown): Request {
  return new Request(`http://sponsor${path}`, { method: 'POST', body: JSON.stringify(body) });
}

async function call(service: ReturnType<typeof createSponsor>, path: string, body: unknown) {
  const response = await service.fetch(post(path, body));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('GET /', () => {
  test('prints the limits, an unset withdrawal threshold and the approve call', async () => {
    const response = await sponsor(world()).fetch(new Request('http://sponsor/'));
    // The info route's shape, as `service.ts` builds it.
    const info = (await response.json()) as {
      chainId: number;
      sponsor: string;
      limits: Record<string, unknown>;
      approve: { kind: string };
      publish: string;
    };
    expect(info.chainId).toBe(CHAIN);
    expect(info.sponsor).toBe(SPONSOR);
    expect(info.limits.withdrawalThresholdBps).toBe('unset');
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

  test('refuses a proof that cost no more than the sponsored amount', async () => {
    const w = world();
    const proof = await hireProof(MILLI);
    const res = await call(
      sponsor(w, { payments: payments(MILLI) }),
      '/deposit',
      await depositBody(proof),
    );
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toMatch(/not more than/);
    expect(w.sent).toHaveLength(0);
  });

  test('refuses a content receipt, which has no price yet', async () => {
    const w = world();
    const receipt = await signContentReceipt(
      {
        atom: OBJECT,
        url: 'https://github.com/a/b?skill=c',
        path: 'skills/c/SKILL.md',
        digest: `0x${'00'.repeat(32)}`,
        to: AGENT.address,
        servedAt: 1_793_000_000,
        nonce: keccak256(stringToBytes('n')),
      },
      CHAIN,
      { address: NODE.address, signTypedData: (data) => NODE.signTypedData(data) },
    );
    const proof = { kind: 'content', receipt } as SponsorProof; // Built from the content receipt just signed.
    const res = await call(sponsor(w), '/deposit', await depositBody(proof));
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toMatch(/no price/);
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

  test('parses an address list and refuses it whole on one bad entry', () => {
    expect(addressList(undefined)).toEqual([]);
    expect(addressList(` ${NODE.address.toLowerCase()} `)).toEqual([NODE.address]);
    expect(() => addressList(`${NODE.address},nope`)).toThrow(/nope/);
  });
});
