import { handleHookEvent } from '../src/hook.js';
import type { ServerEntry } from '../src/mcp-config.js';
import { compact, readStatus, renderStatus, renderToolDetail } from '../src/status.js';
import { failure, fakeClock, post, pre, tempDb } from './helpers.js';

const servers = new Map<string, ServerEntry>([
  ['github', { transport: 'remote', url: 'https://api.githubcopilot.com/mcp/' }],
  [
    'postgres',
    { transport: 'local', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'] },
  ],
]);

function seed() {
  const { db } = tempDb();
  const clock = fakeClock(Date.parse('2026-11-09T10:00:00Z'));
  for (let i = 0; i < 12; i += 1) {
    handleHookEvent(db, pre('mcp__github__list', `g${i}`), { clock, servers });
    clock.advance(200 + i);
    handleHookEvent(db, post('mcp__github__list', `g${i}`), { clock, servers });
  }
  for (let i = 0; i < 5; i += 1) {
    handleHookEvent(db, failure('mcp__postgres__query', `p${i}`, 'HTTP 503'), { clock, servers });
  }
  handleHookEvent(db, post('mcp__postgres__query', 'p9'), { clock, servers });
  return { db, now: new Date(clock.now()) };
}

describe('arp status', () => {
  it('computes calls, success and median per tool', () => {
    const { db, now } = seed();
    const { tools } = readStatus(db, { now });
    const github = tools.find((t) => t.name === 'github')!;
    expect(github.calls).toBe(12);
    expect(github.you).toBe(1);
    expect(github.medianMs).toBe(206);
    const postgres = tools.find((t) => t.name === 'postgres')!;
    expect(postgres.outcomes).toEqual({ tool_error: 5, ok: 1 });
    expect(postgres.you).toBeCloseTo(1 / 6);
  });

  it('sorts by urgency, then by calls', () => {
    const { db, now } = seed();
    // Without a network reading every verdict is "not enough data", so calls decide.
    expect(readStatus(db, { now }).tools.map((t) => t.name)).toEqual(['github', 'postgres']);
  });

  it('renders a table with the network column marked as not read', () => {
    const { db, now } = seed();
    const text = renderStatus(readStatus(db, { now }), 7);
    expect(text).toContain('tool');
    expect(text).toContain('not read yet');
    expect(text).toContain('not enough data');
    expect(text.split('\n')[1]).toMatch(/^github\s+12\s+100 %/);
  });

  it('details one tool by day and by failure', () => {
    const { db, now } = seed();
    const text = renderToolDetail(db, 'postgres', { now })!;
    expect(text).toContain('https://www.npmjs.com/package/@modelcontextprotocol/server-postgres');
    expect(text).toContain('tool_error 503   5');
    expect(renderToolDetail(db, 'nope', { now })).toBeNull();
  });

  it('folds calls older than 90 days into daily counts', () => {
    const { db } = seed();
    compact(db, new Date('2027-03-01T00:00:00Z'));
    expect(db.prepare('SELECT COUNT(*) AS n FROM calls').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT SUM(calls) AS calls, SUM(ok) AS ok FROM calls_daily').get()).toEqual({
      calls: 18,
      ok: 13,
    });
  });

  it('says so when nothing is recorded', () => {
    const { db } = tempDb();
    expect(renderStatus(readStatus(db), 7)).toContain('No MCP tool call recorded yet');
  });
});
