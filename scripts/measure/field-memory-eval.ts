/**
 * Does an agent take a failure on this machine into account? The rules are `docs/tasks/68` §7,
 * written before the first run.
 *
 *     (cd apps/cli && bun run build)
 *     bun run scripts/measure/field-memory-eval.ts --list <file holding `npx skills find` output>
 *
 * Spends real money through `claude -p`: at most $0.50 a session, and it stops past $5 in total.
 * Each session's throwaway folder stays in the system's temporary directory.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PER_ARM = 5;
const SESSION_CAP = '0.50';
const TOTAL_CAP = 5;
const FAILURE_WORDS = /\b(failed|failure|failures)\b|missing-program|failed_on_this_machine/i;

const listAt = process.argv.indexOf('--list');
const listPath = process.argv[listAt + 1];
if (listAt === -1 || listPath === undefined) throw new Error('pass --list <file>');
const list = readFileSync(listPath, 'utf8');
const cli = resolve('apps/cli/dist/cli.js');
const stamp = new Date().toISOString().slice(0, 16).replaceAll('-', '').replaceAll(':', '');
const out = resolve(`data/measurements/field-memory-eval-${stamp}.jsonl`);

const prompt = (search: string) =>
  `I need to convert a web page to clean markdown. Call the arp_pulse tool once, with limit 5 and search_output set to exactly this text:\n\n${search}\n\n` +
  'Then tell me which one skill you would install, and why, in a few sentences. Install nothing. ' +
  'End with a last line holding only the skill as source@skill.';

type Run = { arm: 'A' | 'B'; pick: string | null; says: boolean; cost: number; text: string };

let total = 0;

function session(arm: 'A' | 'B', planted: string | null): Run {
  const dir = mkdtempSync(join(tmpdir(), 'arp-field-'));
  const home = join(dir, 'home');
  mkdirSync(home);
  if (planted !== null) {
    const skill = planted.split('@').pop() ?? planted;
    writeFileSync(
      join(home, 'failures.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), session: 'planted', skill, source: null, reason: 'missing-program' })}\n`,
    );
  }
  const config = join(dir, 'mcp.json');
  writeFileSync(
    config,
    JSON.stringify({ mcpServers: { arp: { command: 'node', args: [cli, 'mcp'], env: { ARP_HOME: home } } } }),
  );
  const result = spawnSync(
    'claude',
    [
      '-p', prompt(list),
      '--model', 'sonnet',
      '--mcp-config', config,
      '--strict-mcp-config',
      '--allowedTools', 'mcp__arp__arp_pulse',
      '--max-budget-usd', SESSION_CAP,
      '--output-format', 'json',
    ],
    { cwd: dir, encoding: 'utf8', input: '', timeout: 300_000, maxBuffer: 20_000_000 },
  );
  let text = '';
  let cost = 0;
  try {
    const parsed = JSON.parse(result.stdout) as { result?: unknown; total_cost_usd?: unknown }; // claude's json output, read field by field
    text = typeof parsed.result === 'string' ? parsed.result : '';
    cost = typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : 0;
  } catch {
    text = '';
  }
  const last = text.trim().split('\n').pop()?.replace(/[`*\s]/g, '') ?? '';
  const run: Run = { arm, pick: /^[^@\s]+@[^@\s]+$/.test(last) ? last : null, says: FAILURE_WORDS.test(text), cost, text };
  total += cost;
  appendFileSync(out, `${JSON.stringify({ ...run, planted, at: new Date().toISOString() })}\n`);
  return run;
}

function arm(name: 'A' | 'B', planted: string | null): Run[] {
  const runs: Run[] = [];
  for (let index = 0; index < PER_ARM; index += 1) {
    if (total >= TOTAL_CAP) throw new Error(`stopped at $${total.toFixed(2)}: past the cap`);
    runs.push(session(name, planted));
  }
  return runs;
}

const order = [...list.matchAll(/^(\S+@\S+)/gm)].map((match) => match[1] ?? '');
const b = arm('B', null);
const counts = new Map<string, number>();
for (const run of b) if (run.pick !== null) counts.set(run.pick, (counts.get(run.pick) ?? 0) + 1);
const top = Math.max(0, ...counts.values());
const planted = order.find((name) => counts.get(name) === top) ?? [...counts.keys()][0] ?? null;
if (planted === null) throw new Error('arm B picked nothing, so there is no default to move');
const a = arm('A', planted);

const noPick = [...a, ...b].filter((run) => run.pick === null).length;
const valid = (counts.get(planted) ?? 0) >= 3 && noPick <= 2;
const aSays = a.filter((run) => run.says).length;
const bQuiet = b.filter((run) => !run.says).length;
const verdict = !valid ? 'not valid' : aSays >= 4 && bQuiet >= 4 ? 'worked' : aSays <= 2 ? 'did not work' : 'unclear';

const summary = {
  planted,
  armBPickedPlanted: counts.get(planted) ?? 0,
  noPick,
  armASaysIt: aSays,
  armBQuiet: bQuiet,
  armAChoseOtherwise: a.filter((run) => run.pick !== null && run.pick !== planted).length,
  verdict,
  totalCostUsd: Number(total.toFixed(2)),
  raw: out,
};
appendFileSync(out, `${JSON.stringify({ summary })}\n`);
console.log(JSON.stringify(summary, null, 2));
