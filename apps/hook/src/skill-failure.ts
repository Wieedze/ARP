import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { readRequires, type UsageReason } from '@arp-protocol/core';

import { classifyCall, failureText } from './classify.ts';
import type { ToolCall } from './payload.ts';

/** The hook can tell these three from a command's output. `not-the-right-tool` is a judgement. */
export type DetectedReason = Extract<UsageReason, 'missing-key' | 'missing-program' | 'missing-file'>;

const MISSING_KEY =
  /\b(api[ _-]?key|access[ _-]?token|credentials?)\b.{0,40}\b(missing|not set|not found|required|invalid|expired)\b|(?<!\bnot )\b(missing|no|invalid|expired)\b.{0,20}\b(api[ _-]?key|access[ _-]?token|credentials?)\b|\b(HTTP|status)(\/[\d.]+| code)?[ :=]*(401|403)\b|\b(401|403) (unauthori[sz]ed|forbidden)\b|\bunauthori[sz]ed\b|not authenticated|not logged in/i;
/** Case matters: `Unexpected token, missing semicolon` is not about a key. */
const MISSING_KEY_VARIABLE = /\b[A-Z0-9_]*(API_KEY|TOKEN|SECRET)\b.{0,30}\b(not set|missing|required|unset)\b/;
const MISSING_PROGRAM =
  /command not found|executable file not found|\bnot installed\b|No module named|spawn \S+ ENOENT|Cannot find module/i;
const MISSING_FILE =
  /No such file or directory|\bENOENT\b|file not found|\b(file|path|directory|folder)\b(?!\.).{0,80}\bdoes not exist\b/i;

/** Which closed reason a failure's text shows, or `null` when it shows none of them. */
export function failureReason(text: string): DetectedReason | null {
  if (MISSING_PROGRAM.test(text)) return 'missing-program';
  if (MISSING_KEY.test(text) || MISSING_KEY_VARIABLE.test(text)) return 'missing-key';
  if (MISSING_FILE.test(text)) return 'missing-file';
  return null;
}

const RUNNERS = new Set(['bash', 'bun', 'bunx', 'node', 'npx', 'python', 'python3', 'sh', 'uv', 'uvx', 'zsh']);

/** What each part of a shell command runs: the program, or what a runner was given. */
export function programsOf(command: string): string[] {
  const found: string[] = [];
  for (const part of command.split(/&&|\|\||[;|\n]/)) {
    const words = part
      .trim()
      .split(/\s+/)
      .filter((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
    const first = words[0];
    if (first === undefined || first === '') continue;
    const program = first.split('/').pop() ?? first;
    if (!RUNNERS.has(program)) {
      found.push(program);
      continue;
    }
    const target = words.slice(1).find((word) => !word.startsWith('-') && word !== 'run');
    if (target !== undefined) found.push(target.split('/').pop() ?? target);
  }
  return found;
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether this command is one the skill's own text asks for, or runs from the skill's directory. */
export function askedBySkill(command: string, markdown: string, directory: string): boolean {
  if (new RegExp(`${escaped(directory)}(?=[/\\s'"]|$)`).test(command)) return true;
  const { cli, runs } = readRequires(markdown);
  const named = new Set([...cli, ...runs]);
  return programsOf(command).some(
    (program) =>
      named.has(program) ||
      (program.includes('.') && new RegExp(`(?:^|[\\s\`'"/(])${escaped(program)}(?=[\\s\`'")]|$)`, 'm').test(markdown)),
  );
}

/** Skills this session used, the latest first. A missing or half-written log is an empty list. */
function skillsOfSession(log: string, session: string): { name: string; source: string | null }[] {
  if (!existsSync(log)) return [];
  const skills: { name: string; source: string | null }[] = [];
  for (const line of readFileSync(log, 'utf8').split('\n')) {
    try {
      const row = JSON.parse(line) as Record<string, unknown>; // read field by field below
      if (row['kind'] === 'skill' && row['session'] === session && typeof row['name'] === 'string') {
        skills.unshift({
          name: row['name'],
          source: typeof row['source'] === 'string' ? row['source'] : null,
        });
      }
    } catch {
      // The last line of a log still being written is the normal case.
    }
  }
  return skills;
}

/** A plugin's skill, `plugin:name`, is not looked for: where a plugin keeps its files was not tested. */
export function skillDirectory(name: string, cwd: string): string | null {
  const roots = [join(cwd, '.claude', 'skills'), join(homedir(), '.claude', 'skills')];
  const given = process.env['ARP_SKILLS_DIR'];
  if (given !== undefined && given !== '') roots.unshift(given);
  return roots.map((root) => join(root, name)).find((dir) => existsSync(join(dir, 'SKILL.md'))) ?? null;
}

/**
 * `arpHome` of `@arp-protocol/core/node`, restated: that module imports viem, and this file ships in
 * a hook that has to start with no dependency installed.
 */
export function arpHome(): string {
  const given = process.env['ARP_HOME']?.trim();
  return given !== undefined && given !== '' ? given : join(homedir(), '.arp');
}

export type FailureLine = {
  at: string;
  session: string;
  skill: string;
  source: string | null;
  reason: DetectedReason;
};

/** Appends unless this session, skill and reason are already there. Says whether it wrote. */
export function appendFailure(line: FailureLine): boolean {
  const path = join(arpHome(), 'failures.jsonl');
  const seen = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const key = `"session":${JSON.stringify(line.session)},"skill":${JSON.stringify(line.skill)},`;
  if (seen.split('\n').some((row) => row.includes(key) && row.includes(`"reason":"${line.reason}"`))) return false;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(line)}\n`);
  return true;
}

/**
 * Writes one line to `<arpHome>/failures.jsonl` when a failed command is one a skill of this session
 * asked for and its output shows a closed reason. At most one line per session, skill and reason.
 *
 * In the home directory and not the project's `.arp/`, because a key or a program missing here is
 * missing in the next project too. The line holds the reason and never the command or its output.
 */
export function recordSkillFailure(call: ToolCall, cwd: string): void {
  const classified = classifyCall(call);
  if (classified === null || classified.outcome === 'ok' || call.session === null) return;
  const command = call.input?.['command'];
  if (typeof command !== 'string') return;
  const reason = failureReason(failureText(call));
  if (reason === null) return;

  try {
    const log = process.env['ARP_SESSION_LOG'] ?? join(cwd, '.arp', 'session.jsonl');
    for (const skill of skillsOfSession(log, call.session)) {
      const directory = skillDirectory(skill.name, cwd);
      if (directory === null) continue;
      if (!askedBySkill(command, readFileSync(join(directory, 'SKILL.md'), 'utf8'), directory)) continue;

      appendFailure({ at: new Date().toISOString(), session: call.session, skill: skill.name, source: skill.source, reason });
      return;
    }
  } catch {
    // A session must not fail because a record could not be kept.
  }
}
