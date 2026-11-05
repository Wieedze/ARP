import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OWN = '0xC165A2AD2E540A4069E02834009161E2b4490d5A';
const ELSEWHERE = '0x00000000000000000000000000000000000000f1';
const ATOM = `0x${'aa'.repeat(32)}`;

const mocks = vi.hoisted(() => ({
  atomId: vi.fn(),
  getPulseUsage: vi.fn(),
  findAgentsInDomains: vi.fn(),
  walletControlsSubject: vi.fn(),
  getAgentEndpoints: vi.fn(),
  findAgentsWithEndpoints: vi.fn(),
}));

vi.mock('@arp-protocol/core', async (original) => ({
  ...(await original<typeof import('@arp-protocol/core')>()),
  resolveAgent: async () => null,
  resolveAgentAtom: async () => ({ status: 'found', atom: `0x${'aa'.repeat(32)}` }),
  getAgentEndpoints: mocks.getAgentEndpoints,
  findAgentsWithEndpoints: mocks.findAgentsWithEndpoints,
  getPulseUsage: mocks.getPulseUsage,
  readLineReceipts: async () => ({ receipts: [], unreadable: [], othersNotRead: 0 }),
  findAgentsInDomains: mocks.findAgentsInDomains,
  findAgents: async () => ({ agents: [] }),
  readDomainTree: async () => ({ subtree: () => [], pathToRoot: () => ({ found: true, path: [] }) }),
  walletControlsSubject: mocks.walletControlsSubject,
}));

vi.mock('../src/host-guard.js', () => ({ hostGuard: () => ({ allowPrivate: true }) }));

vi.mock('../src/config.js', async (original) => ({
  ...(await original<typeof import('../src/config.js')>()),
  chainId: 13579,
  record: { arp: { identityRegistry: OWN, endpointBinding: { hasEndpoint: `0x${'e1'.repeat(32)}` } } },
  IN_CONTEXT_OF: `0x${'c1'.repeat(32)}`,
  reads: { atomId: mocks.atomId },
}));

const UNPROVEN = [{ endpoint: 'https://node.example', tripleId: '0x1', createdAt: null, status: 'unproven', proofs: [] }];
mocks.getAgentEndpoints.mockResolvedValue(UNPROVEN);
mocks.findAgentsWithEndpoints.mockResolvedValue({ agents: [], truncated: false });

const { agentEndpoints, findAgents } = await import('../src/handlers/agents.js');
const { pulse } = await import('../src/handlers/pulse.js');

async function answer(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as { result: { content: { text: string }[] } }; // what `text` writes
  return JSON.parse(body.result.content[0]?.text ?? '{}') as Record<string, unknown>; // our own JSON
}
const line = {
  tripleId: '0xl1',
  agent: { atomId: '0xhirer', label: 'Agent 13579:6' },
  writer: '0xwriter',
  holders: [],
  declaredAt: null,
  domains: ['document'],
  outcomes: ['worked'],
  lines: [{ domain: 'document', outcome: 'worked', reasons: [] }],
};
const usageOf = (declarations: unknown[]) => new Map([[ATOM, { declarations, byOthers: [], truncated: false }]]);

describe('arp_agent_endpoints', () => {
  beforeEach(() => {
    mocks.getPulseUsage.mockReset().mockResolvedValue(usageOf([line]));
    mocks.atomId.mockReset().mockResolvedValue(ATOM);
    mocks.walletControlsSubject.mockReset().mockResolvedValue('yes');
  });
  const ask = (args: Record<string, unknown>) =>
    agentEndpoints(1, { agent_chain_id: 13579, agent_token_id: '2', ...args }).then(answer);

  it('reads an agent on the known registry with its canonical atom', async () => {
    const out = await ask({ registry: OWN });
    expect(out['lines']).toHaveLength(1);
  });

  it('uses this chain registry when none is given', async () => {
    const out = await ask({});
    expect(String(out['caip19'])).toContain(OWN);
    expect(out['lines']).toHaveLength(1);
  });

  it('reads no lines for a registry it does not know, and still shows the addresses', async () => {
    const out = await ask({ registry: ELSEWHERE });
    expect(out['lines']).toBeNull();
    expect(out['signed_endpoints']).toHaveLength(1);
    expect(mocks.getPulseUsage).not.toHaveBeenCalled();
  });

  it("does not read another agent's record as this token's", async () => {
    mocks.atomId.mockResolvedValue(`0x${'bb'.repeat(32)}`);
    const out = await ask({ registry: OWN });
    expect(out['lines']).toBeNull();
    expect(mocks.getPulseUsage).not.toHaveBeenCalled();
  });
});

describe('arp_find_agents with a domain', () => {
  beforeEach(() => {
    mocks.atomId.mockReset().mockResolvedValue(`0x${'d0'.repeat(32)}`);
    mocks.findAgentsInDomains
      .mockReset()
      .mockResolvedValue({ agents: [{ atomId: ATOM, label: 'Agent 2', caip19: null, ambiguous: true }], truncated: false });
    mocks.walletControlsSubject.mockReset();
  });
  const rows = async () => (await findAgents(1, { domain: 'document' }).then(answer))['used_here'] as Record<string, number>[];

  it('counts a line written by the wallet that controls the agent it names', async () => {
    mocks.getPulseUsage.mockReset().mockResolvedValue(usageOf([line]));
    mocks.walletControlsSubject.mockResolvedValue('yes');
    expect((await rows())[0]).toMatchObject({ wallets_worked: 1, lines_in_domain: 1, lines_not_counted: 0 });
  });

  it('shows and does not count a line written in another agent name', async () => {
    mocks.getPulseUsage.mockReset().mockResolvedValue(usageOf([line]));
    mocks.walletControlsSubject.mockResolvedValue('no');
    expect((await rows())[0]).toMatchObject({ wallets_worked: 0, lines_in_domain: 0, lines_not_counted: 1 });
  });

  it('leaves out an agent with no line in the domain', async () => {
    mocks.getPulseUsage.mockReset().mockResolvedValue(usageOf([{ ...line, domains: [], lines: [] }]));
    expect(await rows()).toEqual([]);
  });

  describe('the same threshold as skills', () => {
    const OTHER = `0x${'cc'.repeat(32)}`;
    const agents = [
      { atomId: ATOM, label: 'first', caip19: null, ambiguous: false },
      { atomId: OTHER, label: 'second', caip19: null, ambiguous: false },
    ];
    const lines = (count: number, outcome = 'worked') =>
      Array.from({ length: count }, (_, index) => ({
        ...line,
        writer: `0xw${outcome}${index}`,
        outcomes: [outcome],
        lines: [{ domain: 'document', outcome, reasons: [] }],
      }));
    const usage = (first: unknown[], second: unknown[]) =>
      new Map([
        [ATOM, { declarations: first, byOthers: [], truncated: false }],
        [OTHER, { declarations: second, byOthers: [], truncated: false }],
      ]);
    const labels = async () => (await rows()).map((row) => row['label']);

    beforeEach(() => {
      mocks.findAgentsInDomains.mockResolvedValue({ agents, truncated: false });
      mocks.walletControlsSubject.mockResolvedValue('yes');
    });

    it('keeps the order under 3 wallets, and still shows them', async () => {
      mocks.getPulseUsage.mockReset().mockResolvedValue(usage(lines(1), lines(2)));
      expect(await labels()).toEqual(['first', 'second']);
      expect((await rows())[1]).toMatchObject({
        wallets_worked: 2,
        too_few_wallets_to_move_the_order: { worked: 2, failed: 0 },
      });
    });

    it('moves the order from 3 wallets, and says nothing was left out', async () => {
      mocks.getPulseUsage.mockReset().mockResolvedValue(usage(lines(2), lines(3)));
      expect(await labels()).toEqual(['second', 'first']);
      expect((await rows())[0]).not.toHaveProperty('too_few_wallets_to_move_the_order');
    });

    it('does not let one failed line sink an agent', async () => {
      mocks.getPulseUsage.mockReset().mockResolvedValue(usage(lines(1, 'failed'), lines(1)));
      expect(await labels()).toEqual(['first', 'second']);
    });

    it('moves the order from 3 wallets saying failed', async () => {
      mocks.getPulseUsage.mockReset().mockResolvedValue(usage(lines(3, 'failed'), lines(1)));
      expect(await labels()).toEqual(['second', 'first']);
    });

    it('keeps an agent with 2 wallets findable: only its rank does not move', async () => {
      mocks.getPulseUsage.mockReset().mockResolvedValue(usage(lines(2), []));
      expect(await rows()).toHaveLength(1);
      expect((await rows())[0]).toMatchObject({ label: 'first', wallets_worked: 2 });
    });
  });

  it('comes back from arp_pulse beside the skills, as one search', async () => {
    mocks.getPulseUsage.mockReset().mockResolvedValue(usageOf([line]));
    mocks.walletControlsSubject.mockResolvedValue('yes');
    const out = await pulse(1, { search_output: '', domain: 'document' }).then(answer);
    expect((out['agents'] as { used_here: unknown[] }).used_here).toHaveLength(1);
  });

  it('says plainly when arp_pulse has neither words nor a domain to look for agents with', async () => {
    const out = await pulse(1, { search_output: '' }).then(answer);
    expect(out['agents']).toBeNull();
    expect(String(out['agents_note'])).toContain('domain');
  });

  describe('a need in its own words, from the run that found nobody (docs/tasks/70, step 6)', () => {
    // The offer `scripts/demo/agent-call-handler.ts` serves, copied because apps import no script.
    const offer = {
      description: 'Answers from a private collection of internal project notes that are published nowhere else.',
      input: '{"note": "<the note id>"}',
      output: '{"note": "<id>", "text": "<the note>"}',
    };
    beforeEach(() => {
      mocks.getPulseUsage.mockReset().mockResolvedValue(new Map());
      mocks.findAgentsInDomains.mockReset().mockResolvedValue({ agents: [], truncated: false });
      mocks.findAgentsWithEndpoints.mockReset().mockResolvedValue({
        agents: [{ atomId: ATOM, label: 'Agent 13579:2', caip19: `eip155:13579/erc721:${OWN}/2`, ambiguous: false }],
        truncated: false,
      });
      mocks.getAgentEndpoints.mockReset().mockResolvedValue([
        { endpoint: 'https://node.example', tripleId: '0x1', createdAt: null, status: 'bound', proofs: [] },
      ]);
      vi.stubGlobal('fetch', async () => Response.json({ minBudgetWei: '1000', offer }));
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      mocks.getAgentEndpoints.mockReset().mockResolvedValue(UNPROVEN);
    });

    it('finds the agent whose offer answers, though the domain tried is not its own', async () => {
      const out = await pulse(1, {
        search_output: '',
        queries: ['internal project note', 'orchard-17 review budget', 'company project notes'],
        domain: 'business',
      }).then(answer);
      const agents = out['agents'] as { used_here: unknown[]; offers_matching_need: Record<string, unknown>[] };
      expect(agents.used_here).toEqual([]);
      expect(agents.offers_matching_need).toHaveLength(1);
      expect(agents.offers_matching_need[0]).toMatchObject({
        agent_token_id: '2',
        registry: OWN,
        address: 'https://node.example',
        answers_now: true,
      });
      expect(agents.offers_matching_need[0]?.['words_matched']).toEqual(['internal', 'project', 'note']);
    });

    it('does not offer an agent for a need its offer says nothing about', async () => {
      const out = await pulse(1, { search_output: '', queries: ['video editing silence'] }).then(answer);
      expect((out['agents'] as { offers_matching_need: unknown[] }).offers_matching_need).toEqual([]);
    });

    it('does not offer an agent whose node does not answer', async () => {
      vi.stubGlobal('fetch', async () => new Response('', { status: 530 }));
      const out = await pulse(1, { search_output: '', queries: ['internal project note'] }).then(answer);
      expect((out['agents'] as { offers_matching_need: unknown[] }).offers_matching_need).toEqual([]);
    });
  });

  it('says lines are not read on a chain whose record has no predicate for them', async () => {
    vi.resetModules();
    vi.doMock('../src/config.js', async (original) => ({
      ...(await original<typeof import('../src/config.js')>()),
      IN_CONTEXT_OF: `0x${'0'.repeat(64)}`,
    }));
    const fresh = await import('../src/handlers/agents.js');
    const out = await fresh.findAgents(1, { domain: 'document' }).then(answer);
    expect(out['used_here']).toBeNull();
    vi.doUnmock('../src/config.js');
  });
});
