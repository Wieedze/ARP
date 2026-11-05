import { beforeEach, describe, expect, it, vi } from 'vitest';

const RETURNED = { source: 'a/returned', skill: 'one', installs: null, installsText: null, url: null };
const DECLARED_URL = 'https://github.com/b/declared?skill=two';
const atomOf = (uri: string) => (uri.includes('declared') ? '0xdeclared' : '0xreturned');

const mocks = vi.hoisted(() => ({ usage: new Map<string, unknown>(), declared: [] as { atomId: string; url: string }[], results: [] as unknown[] }));

vi.mock('@arp-protocol/core', async (original) => ({
  ...(await original<typeof import('@arp-protocol/core')>()),
  parseSkillsFind: () => mocks.results,
  findDeclaredTools: async () => mocks.declared,
  findToolAtoms: async (uris: string[]) => new Map(uris.map((uri) => [uri, atomOf(uri)])),
  getPulseUsage: async () => mocks.usage,
  readDomainTree: async () => ({ subtree: () => ['video'], pathToRoot: () => ({ found: true, path: ['video', 'tool'] }) }),
  readPulse: async (row: object) => ({ ...row, status: 'absent' }),
  toolAtomUri: (url: string) => url,
  findAgentsInDomains: async () => ({ agents: [], truncated: false }),
  findAgents: async () => ({ agents: [] }),
  findAgentsWithEndpoints: async () => ({ agents: [], truncated: false }),
}));

vi.mock('../src/config.js', async (original) => ({
  ...(await original<typeof import('../src/config.js')>()),
  chainId: 13579,
  IN_CONTEXT_OF: `0x${'c1'.repeat(32)}`,
  reads: { atomId: async () => `0x${'aa'.repeat(32)}` },
}));

const { pulse } = await import('../src/handlers/pulse.js');

const line = (writer: string, outcome: 'worked' | 'failed') => ({
  tripleId: `0x${writer}`,
  agent: { atomId: writer, label: null },
  writer,
  declaredAt: null,
  domains: ['video'],
  outcomes: [outcome],
  lines: [{ domain: 'video', outcome, reasons: [], form: 'nested' }],
});
const usage = (...declarations: ReturnType<typeof line>[]) => ({
  declarations,
  agents: declarations.length,
  wallets: declarations.length,
  byDomain: {},
  byOutcome: {},
  byReason: {},
  byOthers: [],
  truncated: false,
});
const wallets = (count: number, outcome: 'worked' | 'failed' = 'worked') =>
  usage(...Array.from({ length: count }, (_v, at) => line(`0xw${at}`, outcome)));

type Answer = { results_found: number; results?: unknown[]; skills: { name: string; score: number; unconfirmed?: string }[] };

async function ask(): Promise<Answer> {
  const response = await pulse(1, { search_output: 'unused', domain: 'video', limit: 5 });
  const body = (await response.json()) as { result: { content: { text: string }[] } }; // what `text` writes
  return JSON.parse(body.result.content[0]?.text ?? '{}') as Answer; // our own JSON
}

describe('arp_pulse and the threshold', () => {
  beforeEach(() => {
    mocks.results = [RETURNED];
    mocks.declared = [{ atomId: '0xdeclared', url: DECLARED_URL }];
    mocks.usage = new Map();
  });

  it('keeps out a skill the search did not return, at 2 wallets, and does not count it', async () => {
    mocks.usage = new Map([['0xdeclared', wallets(2)]]);
    const out = await ask();
    expect(out.results_found).toBe(1);
    expect(out.skills.map((skill) => skill.name)).toEqual(['one']);
  });

  it('lets it in from 3 wallets', async () => {
    mocks.usage = new Map([['0xdeclared', wallets(3)]]);
    const out = await ask();
    expect(out.results_found).toBe(2);
    expect(out.skills.map((skill) => skill.name)).toContain('two');
  });

  it('leaves nothing when the search found nothing and no declared skill qualifies', async () => {
    mocks.results = [];
    mocks.usage = new Map([['0xdeclared', wallets(2)]]);
    const out = await ask();
    expect(out.results).toEqual([]);
    expect(out.skills).toBeUndefined();
  });

  it('shows a line on a returned skill as unconfirmed, and leaves its score alone', async () => {
    const before = (await ask()).skills[0]?.score;
    mocks.usage = new Map([['0xreturned', wallets(1, 'failed')]]);
    const skill = (await ask()).skills[0];
    expect(skill?.unconfirmed).toBe("1 wallet said failed: not confirmed, below 3 wallets. Check it in the skill's file.");
    expect(skill?.score).toBe(before);
  });

  it('says nothing unconfirmed from 3 wallets, and moves the score', async () => {
    const before = (await ask()).skills[0]?.score ?? 0;
    mocks.usage = new Map([['0xreturned', wallets(3, 'failed')]]);
    const skill = (await ask()).skills[0];
    expect(skill?.unconfirmed).toBeUndefined();
    expect(skill?.score).toBeLessThan(before);
  });
});
