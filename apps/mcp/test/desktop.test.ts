import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, getAddress, parseAbi, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { afterEach, beforeEach, describe as group, expect, it } from 'vitest';

import { bundleManifest, contentDigest, encodeApproveDeposit, signContentReceipt, verifyMintGasRequest } from '@arp-protocol/core';

import { loadOrCreateAgentKey, refusal, type AgentSender, type AllowedCall } from '../src/desktop/agent-key.js';
import { declareUsed, getSkill, type LoopConfig } from '../src/desktop/loop.js';

const REGISTRY = getAddress('0xC165A2AD2E540A4069E02834009161E2b4490d5A');
const MULTI_VAULT = getAddress('0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91');
const ATOM = `0x${'ab'.repeat(32)}` as Hex;
const IDENTITY = `0x${'cd'.repeat(32)}` as Hex;
const TERM = `0x${'ef'.repeat(32)}` as Hex;
const SPONSOR = getAddress('0xE596096F4176b682E300d73963e7B04B383C1AA1');
const REGISTER = encodeFunctionData({ abi: parseAbi(['function register() returns (uint256)']), functionName: 'register' });

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

  it('refuses a key file other users can read, and leaves its mode as it found it', () => {
    const path = join(dir, 'agent-key');
    writeFileSync(path, `0x${'12'.repeat(32)}\n`);
    chmodSync(path, 0o644);
    expect(() => loadOrCreateAgentKey(path, { platform: 'linux' })).toThrow(/must be 600/);
    expect(statSync(path).mode & 0o777).toBe(0o644);
  });

  it('signs only register() and the approval of the sponsor, exactly, at zero value on 13579', () => {
    const permitted = [
      { to: REGISTRY, data: REGISTER },
      { to: MULTI_VAULT, data: encodeApproveDeposit(SPONSOR) },
    ];
    const register: AllowedCall = { to: REGISTRY, data: REGISTER, value: 0n, chainId: 13579 };
    expect(refusal(register, permitted)).toBeNull();
    expect(refusal({ ...register, to: MULTI_VAULT, data: encodeApproveDeposit(SPONSOR) }, permitted)).toBeNull();
    expect(refusal({ ...register, value: 1n }, permitted)).toMatch(/sends value/);
    expect(refusal({ ...register, chainId: 1155 }, permitted)).toMatch(/not testnet/);
    // What a wrong or hostile sponsor answer could ask for: an approval to someone else, a redeem.
    const stranger = getAddress('0x000000000000000000000000000000000000dEaD');
    expect(refusal({ ...register, to: MULTI_VAULT, data: encodeApproveDeposit(stranger) }, permitted)).toMatch(/signs only/);
    const redeem = encodeFunctionData({
      abi: parseAbi(['function redeem(address receiver, bytes32 termId, uint256 curveId, uint256 shares, uint256 minAssets)']),
      functionName: 'redeem',
      args: [stranger, TERM, 1n, 1n, 0n],
    });
    expect(refusal({ ...register, to: MULTI_VAULT, data: redeem }, permitted)).toMatch(/signs only/);
  });
});

/** A content server and a sponsor in one fake fetch, answering in the order a new agent meets them. */
function services(agentAddress: Address, node = privateKeyToAccount(generatePrivateKey()), approveData: Hex = encodeApproveDeposit(SPONSOR)) {
  const calls: string[] = [];
  let deposits = 0;
  const bytes = new TextEncoder().encode('# A skill\n');
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url).pathname;
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    if (path.startsWith('/content/') && url.includes('bundle=1')) {
      const files = [
        { path: 'SKILL.md', bytes },
        { path: 'scripts/thumb.py', bytes: new TextEncoder().encode("print('thumb')\n") },
      ];
      const signed = await signContentReceipt(
        {
          atom: ATOM,
          url: 'github.com/acme/skills?skill=thumbs',
          path: 'skills/thumbs',
          digest: contentDigest(new TextEncoder().encode(bundleManifest(files))),
          to: agentAddress,
          servedAt: 1,
          nonce: `0x${'00'.repeat(32)}`,
        },
        13579,
        node,
      );
      return Response.json(
        { path: 'skills/thumbs', files: files.map((f) => ({ path: f.path, base64: Buffer.from(f.bytes).toString('base64') })) },
        { headers: { 'x-arp-receipt': JSON.stringify(signed) } },
      );
    }
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
    if (path === '/') return Response.json({ multiVault: MULTI_VAULT, sponsor: SPONSOR });
    if (path === '/mint-gas') {
      // The sponsor sends mint gas only to the address that signed for it (ADR `0116`).
      const verdict = await verifyMintGasRequest(JSON.parse(String(init?.body)).request, Math.floor(Date.now() / 1000));
      if (verdict.status !== 'valid' || verdict.address !== agentAddress) return Response.json({ error: 'unsigned' }, { status: 401 });
      return Response.json({ sent: '0x01' });
    }
    if (path === '/identity') return Response.json({ identityAtom: IDENTITY, sent: [] });
    if (path === '/gas') return Response.json({ sent: '0x02', next: { to: MULTI_VAULT, data: approveData, value: '0' } });
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
    async send(call, permitted) {
      const why = refusal(call, permitted);
      if (why !== null) throw new Error(`refused: ${why}`);
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
      multiVault: MULTI_VAULT,
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

  it('refuses the approval when the sponsor asks to approve someone else', async () => {
    const sent: AllowedCall[] = [];
    const agent = fakeAgent(sent);
    const stranger = getAddress('0x000000000000000000000000000000000000dEaD');
    const config: LoopConfig = {
      contentUrl: 'http://content.test',
      sponsorUrl: 'http://sponsor.test',
      registry: REGISTRY,
      multiVault: MULTI_VAULT,
      stateDir: join(dir, '.arp'),
      sleep: async () => {},
      fetch: services(agent.address, undefined, encodeApproveDeposit(stranger)).fake,
    };
    await getSkill(config, agent, ATOM);
    await expect(declareUsed(config, agent, ATOM)).rejects.toThrow(/signs only/);
    expect(sent.map((call) => call.to)).toEqual([REGISTRY]);
  });

  it('refuses a sponsor that names another MultiVault', async () => {
    const agent = fakeAgent([]);
    const config: LoopConfig = {
      contentUrl: 'http://content.test',
      sponsorUrl: 'http://sponsor.test',
      registry: REGISTRY,
      multiVault: getAddress('0x000000000000000000000000000000000000bEEF'),
      stateDir: join(dir, '.arp'),
      sleep: async () => {},
      fetch: services(agent.address).fake,
    };
    await getSkill(config, agent, ATOM);
    await expect(declareUsed(config, agent, ATOM)).rejects.toThrow(/names MultiVault/);
  });

  it('refuses to declare a skill that was not served through ARP', async () => {
    const agent = fakeAgent([]);
    const config: LoopConfig = {
      contentUrl: 'http://content.test',
      sponsorUrl: 'http://sponsor.test',
      registry: REGISTRY,
      multiVault: MULTI_VAULT,
      stateDir: join(dir, '.arp'),
      fetch: services(agent.address).fake,
    };
    await expect(declareUsed(config, agent, ATOM)).rejects.toThrow(/arp_get_skill first/);
  });

  it('installs the skill into the skills directory when one is set, under its own name', async () => {
    const agent = fakeAgent([]);
    const skillsDir = join(dir, 'project', '.claude', 'skills');
    const config: LoopConfig = {
      contentUrl: 'http://content.test',
      sponsorUrl: 'http://sponsor.test',
      registry: REGISTRY,
      multiVault: MULTI_VAULT,
      stateDir: join(dir, '.arp'),
      skillsDir,
      projectReceipts: join(dir, 'project', '.arp', 'receipts.jsonl'),
      ask: async () => 'accepted',
      fetch: services(agent.address).fake,
    };
    const skill = await getSkill(config, agent, ATOM);
    expect(skill.installedAt).toBe(join(skillsDir, 'thumbs', 'SKILL.md'));
    expect(readFileSync(join(skillsDir, 'thumbs', 'SKILL.md'), 'utf8')).toBe('# A skill\n');
    // The whole directory, scripts included (task 57).
    expect(readFileSync(join(skillsDir, 'thumbs', 'scripts', 'thumb.py'), 'utf8')).toBe("print('thumb')\n");
    expect(skill.files).toBe(2);
    // The line the hook reads to name the atom of `thumbs` when it sees it invoked.
    const line = JSON.parse(readFileSync(join(dir, 'project', '.arp', 'receipts.jsonl'), 'utf8'));
    expect(line).toMatchObject({ skill: 'thumbs', atom: ATOM, url: 'github.com/acme/skills?skill=thumbs' });
  });

  group('the person accepts before anything is installed (task 61)', () => {
    const base = (agentAddress: Address, skillsDir: string, over: Partial<LoopConfig> = {}): LoopConfig => ({
      contentUrl: 'http://content.test',
      sponsorUrl: 'http://sponsor.test',
      registry: REGISTRY,
      multiVault: MULTI_VAULT,
      stateDir: join(dir, '.arp'),
      skillsDir,
      projectReceipts: join(dir, 'project', '.arp', 'receipts.jsonl'),
      fetch: services(agentAddress).fake,
      ...over,
    });

    it('shows the person the files and the commit, and installs only on accept', async () => {
      const agent = fakeAgent([]);
      const skillsDir = join(dir, 'project', '.claude', 'skills');
      const pages: string[] = [];
      const skill = await getSkill(
        base(agent.address, skillsDir, {
          ask: async (prompt) => {
            pages.push(`${prompt.message}\n${prompt.confirm}`);
            // Nothing is on disk while the question is open.
            expect(existsSync(join(skillsDir, 'thumbs'))).toBe(false);
            return 'accepted';
          },
        }),
        agent,
        ATOM,
      );
      expect(skill.installedAt).toBe(join(skillsDir, 'thumbs', 'SKILL.md'));
      expect(pages).toHaveLength(1);
      expect(pages[0]).toContain('Install the skill "thumbs" from acme/skills?');
      expect(pages[0]).toContain('2 files');
      expect(pages[0]).toContain(`Install thumbs into ${join(skillsDir, 'thumbs')}`);
    });

    it('installs nothing when the person declines', async () => {
      const agent = fakeAgent([]);
      const skillsDir = join(dir, 'project', '.claude', 'skills');
      const skill = await getSkill(base(agent.address, skillsDir, { ask: async () => 'declined' }), agent, ATOM);
      expect(skill.notInstalled).toBe('declined');
      expect(skill.installedAt).toBeUndefined();
      expect(existsSync(join(skillsDir, 'thumbs'))).toBe(false);
      expect(existsSync(join(dir, 'project', '.arp', 'receipts.jsonl'))).toBe(false);
    });

    it('installs nothing and keeps nothing when the client cannot ask', async () => {
      const agent = fakeAgent([]);
      const skillsDir = join(dir, 'project', '.claude', 'skills');
      const skill = await getSkill(base(agent.address, skillsDir, { ask: async () => 'unavailable' }), agent, ATOM);
      expect(skill.notInstalled).toBe('unavailable');
      expect(existsSync(join(skillsDir, 'thumbs'))).toBe(false);
      expect(existsSync(join(dir, 'project', '.arp', 'pending'))).toBe(false);
    });

    it('treats a config with no way to ask as nobody to ask: there is no path that skips the question', async () => {
      const agent = fakeAgent([]);
      const skillsDir = join(dir, 'project', '.claude', 'skills');
      const skill = await getSkill(base(agent.address, skillsDir), agent, ATOM);
      expect(skill.installedAt).toBeUndefined();
      expect(skill.notInstalled).toBe('unavailable');
      expect(existsSync(join(skillsDir, 'thumbs'))).toBe(false);
    });
  });

  it('refuses to overwrite a different SKILL.md of the same name, and writes nothing', async () => {
    const agent = fakeAgent([]);
    const skillsDir = join(dir, 'project', '.claude', 'skills');
    mkdirSync(join(skillsDir, 'thumbs'), { recursive: true });
    writeFileSync(join(skillsDir, 'thumbs', 'SKILL.md'), "# Somebody else's skill\n");
    const config: LoopConfig = {
      contentUrl: 'http://content.test',
      sponsorUrl: 'http://sponsor.test',
      registry: REGISTRY,
      multiVault: MULTI_VAULT,
      stateDir: join(dir, '.arp'),
      skillsDir,
      ask: async () => 'accepted',
      fetch: services(agent.address).fake,
    };
    await expect(getSkill(config, agent, ATOM)).rejects.toThrow(/already exists with different contents/);
    expect(readFileSync(join(skillsDir, 'thumbs', 'SKILL.md'), 'utf8')).toBe("# Somebody else's skill\n");
    expect(existsSync(join(skillsDir, 'thumbs', 'scripts', 'thumb.py'))).toBe(false);
    // The same skill fetched again is not a clash.
    rmSync(join(skillsDir, 'thumbs'), { recursive: true });
    await getSkill(config, agent, ATOM);
    expect((await getSkill(config, agent, ATOM)).files).toBe(2);
  });

  it('refuses a receipt that names another caller', async () => {
    const agent = fakeAgent([]);
    const config: LoopConfig = {
      contentUrl: 'http://content.test',
      sponsorUrl: 'http://sponsor.test',
      registry: REGISTRY,
      multiVault: MULTI_VAULT,
      stateDir: join(dir, '.arp'),
      fetch: services(privateKeyToAccount(generatePrivateKey()).address).fake,
    };
    await expect(getSkill(config, agent, ATOM)).rejects.toThrow(/another caller/);
  });
});
