import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { backfill, readTranscript } from '../src/backfill.ts';

const SKILL = 'Base directory for this skill: /s/clip\n\nRun:\n\n```bash\nvidcut --in a.mp4\n```\n';
const base = { sessionId: 's1', cwd: '/nowhere', timestamp: '2026-11-01T10:00:00Z' };
const tool = (id: string, name: string, input: unknown) =>
  JSON.stringify({ ...base, type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
const body = JSON.stringify({ ...base, type: 'user', isMeta: true, message: { content: [{ type: 'text', text: SKILL }] } });
const result = (id: string, text: string, isError = true) =>
  JSON.stringify({ ...base, type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: text }] } });

const useClip = [tool('a', 'Skill', { skill: 'clip' }), result('a', 'Launching skill: clip', false), body];

test('a failure of a command the skill asks for gives its closed reason', () => {
  const lines = [...useClip, tool('b', 'Bash', { command: 'vidcut --in private.mp4' }), result('b', 'Exit code 127\nvidcut: command not found')];
  expect(readTranscript(lines.join('\n'), 'f')).toEqual({
    uses: 1,
    failures: [{ at: base.timestamp, session: 's1', skill: 'clip', source: null, reason: 'missing-program' }],
  });
});

test('nothing for another command, a refusal, a success, or a failure before the skill', () => {
  const before = [tool('z', 'Bash', { command: 'vidcut x' }), result('z', 'vidcut: command not found')];
  const after = [
    tool('b', 'Bash', { command: 'cargo build' }), result('b', 'cargo: command not found'),
    tool('c', 'Bash', { command: 'vidcut y' }), result('c', "The user doesn't want to proceed with this tool use."),
    tool('d', 'Bash', { command: 'vidcut z' }), result('d', 'no such file or directory', false),
  ];
  expect(readTranscript([...before, ...useClip, ...after].join('\n'), 'f').failures).toEqual([]);
});

test('a skill opened by slash command counts, and a broken line stops nothing', () => {
  const lines = ['{broken tool_use', body, tool('b', 'Bash', { command: 'vidcut' }), result('b', 'vidcut: command not found')];
  const read = readTranscript(lines.join('\n'), 'f');
  expect(read.uses).toBe(1);
  expect(read.failures[0]?.skill).toBe('clip');
});

test('the context comes from what the person asked before the failure', () => {
  const asked = JSON.stringify({ ...base, type: 'user', message: { content: 'cut this video please' } });
  const lines = [asked, ...useClip, tool('b', 'Bash', { command: 'vidcut' }), result('b', 'vidcut: command not found')];
  expect(readTranscript(lines.join('\n'), 'f').failures[0]).toMatchObject({ domain: 'video' });
});

test('a Skill call that failed does not claim the next skill loaded', () => {
  const lines = [
    tool('g', 'Skill', { skill: 'ghost' }), result('g', 'Unknown skill: ghost'),
    body, tool('b', 'Bash', { command: 'vidcut' }), result('b', 'vidcut: command not found'),
  ];
  expect(readTranscript(lines.join('\n'), 'f').failures[0]?.skill).toBe('clip');
});

test('two Skill calls in one message each keep their own text', () => {
  const other = JSON.stringify({ ...base, type: 'user', isMeta: true, message: { content: [{ type: 'text', text: 'Base directory for this skill: /s/ocr\n\n```bash\nocrtool a\n```\n' }] } });
  const lines = [
    tool('a', 'Skill', { skill: 'clip' }), tool('c', 'Skill', { skill: 'ocr' }), body, other,
    tool('b', 'Bash', { command: 'vidcut' }), result('b', 'vidcut: command not found'),
  ];
  const read = readTranscript(lines.join('\n'), 'f');
  expect(read.uses).toBe(2);
  expect(read.failures[0]?.skill).toBe('clip');
});

test('a directory with a space is read whole, so its parent folder is not the skill', () => {
  const spaced = JSON.stringify({ ...base, type: 'user', isMeta: true, message: { content: [{ type: 'text', text: 'Base directory for this skill: /mnt/c/Max Foo/skills/clip\n\nRun.\n' }] } });
  const lines = [spaced, tool('b', 'Bash', { command: 'bash /mnt/c/Max/other.sh' }), result('b', 'bash: command not found')];
  expect(readTranscript(lines.join('\n'), 'f').failures).toEqual([]);
});

test('a cancelled command is no failure here either, as in the live hook', () => {
  const lines = [...useClip, tool('b', 'Bash', { command: 'vidcut' }), result('b', 'interrupted by user: command not found')];
  expect(readTranscript(lines.join('\n'), 'f').failures).toEqual([]);
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arp-backfill-'));
  process.env['ARP_HOME'] = join(dir, 'home');
});
afterEach(() => {
  delete process.env['ARP_HOME'];
  rmSync(dir, { recursive: true, force: true });
});

test('backfill walks the folders, writes no command, and a second run adds nothing', () => {
  mkdirSync(join(dir, 'p', 'sub'), { recursive: true });
  writeFileSync(
    join(dir, 'p', 'sub', 't.jsonl'),
    [...useClip, tool('b', 'Bash', { command: 'vidcut private.mp4' }), result('b', 'vidcut: command not found')].join('\n'),
  );
  expect(backfill(dir)).toEqual({ transcripts: 1, uses: 1, added: 1, file: join(dir, 'home', 'failures.jsonl') });
  expect(backfill(dir).added).toBe(0);
  const path = join(dir, 'home', 'failures.jsonl');
  expect(existsSync(path)).toBe(true);
  expect(readFileSync(path, 'utf8')).not.toContain('private');
});
