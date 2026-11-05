import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { askedBySkill, failureReason, programsOf } from '../src/skill-failure.ts';

const HOOK = join(import.meta.dir, '..', 'src', 'hook.ts');
const SKILL = '---\nname: clip\n---\nRun this:\n\n```bash\nvidcut --in a.mp4\npython3 scripts/render.py\n```\n';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arp-failure-'));
  mkdirSync(join(dir, '.claude', 'skills', 'clip'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'skills', 'clip', 'SKILL.md'), SKILL);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fire(payload: Record<string, unknown>): void {
  Bun.spawnSync(['bun', HOOK], {
    stdin: new TextEncoder().encode(JSON.stringify({ session_id: 's1', cwd: dir, ...payload })),
    env: { ...process.env, HOME: dir, ARP_HOME: join(dir, 'home'), ARP_SESSION_LOG: join(dir, 'session.jsonl') },
  });
}

const useSkill = () => fire({ tool_name: 'Skill', tool_input: { skill: 'clip' }, tool_response: 'loaded' });
const bashFails = (command: string, error: string) =>
  fire({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command }, error });

function failures(): Record<string, unknown>[] {
  const path = join(dir, 'home', 'failures.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test('each output maps to its closed reason, and anything else to none', () => {
  expect(failureReason('zsh: command not found: vidcut')).toBe('missing-program');
  expect(failureReason("ModuleNotFoundError: No module named 'cv2'")).toBe('missing-program');
  expect(failureReason('Error: OPENAI_API_KEY is not set')).toBe('missing-key');
  expect(failureReason('HTTP 401 Unauthorized')).toBe('missing-key');
  expect(failureReason('cat: a.mp4: No such file or directory')).toBe('missing-file');
  expect(failureReason('tests failed: 3 of 10')).toBeNull();
});

test('output that only looks like a key or a file gives no reason', () => {
  for (const text of [
    '3 failed, 403 passed',
    'error at line 401',
    'wrote 403 bytes',
    'Unexpected token, missing semicolon',
    'this config is not missing credentials',
    "Property 'withResolvers' does not exist on type 'PromiseConstructor'",
    'relation "users" does not exist',
    'so it does not exist yet',
    'FAILED tests/test_api.py::test_unauthorized_user - assert 200 == 400',
    'src/file.ts(3,1): error TS2339: Property x does not exist on type Y',
  ]) {
    expect([text, failureReason(text)]).toEqual([text, null]);
  }
  expect(failureReason('HTTP/1.1 403 Forbidden')).toBe('missing-key');
  expect(failureReason('request failed with status code 401')).toBe('missing-key');
  expect(failureReason('the file a.mp4 does not exist')).toBe('missing-file');
});

test('programsOf reads each part of a command, and what a runner was given', () => {
  expect(programsOf('cd x && FOO=1 vidcut --in a | tee out')).toEqual(['cd', 'vidcut', 'tee']);
  expect(programsOf('npx -y remotion render')).toEqual(['remotion']);
  expect(programsOf('python3 scripts/render.py')).toEqual(['render.py']);
});

test('a command counts only when the skill asks for it or runs from its directory', () => {
  expect(askedBySkill('vidcut --in b.mp4', SKILL, '/s/clip')).toBe(true);
  expect(askedBySkill('python3 scripts/render.py', SKILL, '/s/clip')).toBe(true);
  expect(askedBySkill('bash /s/clip/setup.sh', SKILL, '/s/clip')).toBe(true);
  expect(askedBySkill('python3 mine.py', SKILL, '/s/clip')).toBe(false);
  expect(askedBySkill('cargo build', SKILL, '/s/clip')).toBe(false);
});

test('a path or a file name counts only on its boundary', () => {
  expect(askedBySkill('bash /s/clip-tools/run.sh', SKILL, '/s/clip')).toBe(false);
  expect(askedBySkill('bash /s/clip', SKILL, '/s/clip')).toBe(true);
  expect(askedBySkill('python3 der.py', SKILL, '/s/clip')).toBe(false);
});

test('a successful command writes nothing', () => {
  useSkill();
  fire({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'vidcut a' }, tool_response: 'done' });
  expect(failures()).toEqual([]);
});

test('a skill in ARP_SKILLS_DIR is found', () => {
  const root = join(dir, 'elsewhere');
  mkdirSync(join(root, 'far'), { recursive: true });
  writeFileSync(join(root, 'far', 'SKILL.md'), '```bash\nfartool a\n```\n');
  const env = { ...process.env, HOME: dir, ARP_HOME: join(dir, 'home'), ARP_SESSION_LOG: join(dir, 'session.jsonl'), ARP_SKILLS_DIR: root };
  const send = (payload: Record<string, unknown>) =>
    Bun.spawnSync(['bun', HOOK], { stdin: new TextEncoder().encode(JSON.stringify({ session_id: 's1', cwd: dir, ...payload })), env });
  send({ tool_name: 'Skill', tool_input: { skill: 'far' }, tool_response: 'loaded' });
  send({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'fartool a' }, error: 'fartool: command not found' });
  expect(failures().map((row) => row['skill'])).toEqual(['far']);
});

test('a failure the skill asked for is recorded, without the command or its output', () => {
  useSkill();
  bashFails('vidcut --in secret-name.mp4', 'zsh: command not found: vidcut');
  const rows = failures();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ session: 's1', skill: 'clip', reason: 'missing-program' });
  expect(JSON.stringify(rows[0])).not.toContain('secret-name');
  expect(JSON.stringify(rows[0])).not.toContain('command not found');
});

test('the same failure twice in a session is one line, and another reason is another', () => {
  useSkill();
  bashFails('vidcut a', 'command not found: vidcut');
  bashFails('vidcut b', 'command not found: vidcut');
  bashFails('vidcut c', 'Error: VID_API_KEY is not set');
  expect(failures().map((row) => row['reason'])).toEqual(['missing-program', 'missing-key']);
});

test('nothing is recorded with no skill, for another command, or for an unexplained failure', () => {
  bashFails('vidcut a', 'command not found: vidcut');
  useSkill();
  bashFails('cargo build', 'command not found: cargo');
  bashFails('vidcut a', 'segmentation fault');
  expect(failures()).toEqual([]);
});

test('a cancelled command is not a failure, and a shell call never reaches the session log', () => {
  useSkill();
  bashFails('vidcut a', 'interrupted by user: command not found');
  expect(failures()).toEqual([]);
  const log = readFileSync(join(dir, 'session.jsonl'), 'utf8').trim().split('\n');
  expect(log).toHaveLength(1);
});
