/**
 * `arp backfill`: fills the local failure memory from old Claude Code transcripts, so a new user has
 * a history on the first day. It applies the hook's own rule (`skill-failure.ts`) and sends nothing.
 *
 * Follows `skill-stats` (`src/parse.ts`, MIT, Copyright (c) 2026 Alex Neyman, read at `1fc7767`) for
 * the shape of a `Skill` tool use, the session id's fallback to the file name, and how `textOf` joins
 * a message's blocks. Reading a skill's body and a command's result is this file's own. Codex rollouts
 * are left out: no session was available to test them on.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import { readRequires } from '@arp-protocol/core';

import { isCancelled } from './classify.ts';
import {
  appendFailure,
  arpHome,
  askedBySkill,
  contextOf,
  type FailureLine,
  failureReason,
  skillDirectory,
} from './skill-failure.ts';

type Block = { type?: unknown; name?: unknown; id?: unknown; input?: unknown; text?: unknown; tool_use_id?: unknown; is_error?: unknown; content?: unknown };
type Skill = { name: string; directory: string; markdown: string };

const BODY = /^Base directory for this skill: ([^\n]+)/;

function blocksOf(content: unknown): Block[] {
  // A transcript's blocks vary by type, and every field is checked where it is read.
  return Array.isArray(content) ? (content as Block[]) : [];
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  return blocksOf(content)
    .map((block) => (typeof block?.text === 'string' ? block.text : ''))
    .join('\n');
}

const lastPart = (name: string) => name.split(':').pop() ?? name;

function fromDisk(name: string, cwd: string): Skill | null {
  try {
    const directory = skillDirectory(name, cwd);
    return directory === null ? null : { name, directory, markdown: readFileSync(join(directory, 'SKILL.md'), 'utf8') };
  } catch {
    return null;
  }
}

/** Reads one transcript. The skill's own text is preferred, as a file on disk may have changed since. */
export function readTranscript(text: string, fallback: string): { uses: number; failures: FailureLine[] } {
  const active: Skill[] = [];
  const commands = new Map<string, string>();
  /** `Skill` calls whose body has not arrived, by call id. */
  const pending = new Map<string, string>();
  const failures: FailureLine[] = [];
  let uses = 0;
  let words = '';

  for (const line of text.split('\n')) {
    if (!/tool_use|tool_result|Base directory for this skill|"user"/.test(line)) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>; // read field by field below
    } catch {
      continue;
    }
    if (entry['isSidechain'] === true) continue;
    const message = entry['message'] as { content?: unknown } | undefined; // a transcript line's shape
    const content = message?.content;
    const session = typeof entry['sessionId'] === 'string' ? entry['sessionId'] : fallback;
    const cwd = typeof entry['cwd'] === 'string' ? entry['cwd'] : '';
    const at = typeof entry['timestamp'] === 'string' ? entry['timestamp'] : '';

    if (entry['type'] === 'assistant') {
      for (const block of blocksOf(content)) {
        if (block?.type !== 'tool_use' || typeof block.id !== 'string') continue;
        const input = (block.input ?? {}) as Record<string, unknown>; // read field by field
        if (block.name === 'Skill' && typeof input['skill'] === 'string') {
          uses += 1;
          pending.set(block.id, input['skill']);
          const known = fromDisk(input['skill'], cwd);
          if (known !== null) active.unshift(known);
        } else if (block.name === 'Bash' && typeof input['command'] === 'string') {
          commands.set(block.id, input['command']);
        }
      }
      continue;
    }
    if (entry['type'] !== 'user') continue;

    const typed = textOf(content);
    if (entry['isMeta'] !== true && typed.trim() !== '' && !typed.trimStart().startsWith('<')) words = typed;

    const directory = BODY.exec(textOf(content))?.[1]?.trim();
    if (entry['isMeta'] === true && directory !== undefined) {
      const folder = basename(directory);
      const call = [...pending].find(([, name]) => lastPart(name) === folder);
      if (call === undefined) uses += 1;
      else pending.delete(call[0]);
      const name = call?.[1] ?? folder;
      const known = active.findIndex((skill) => skill.name === name);
      if (known !== -1) active.splice(known, 1);
      active.unshift({ name, directory, markdown: textOf(content) });
      continue;
    }

    for (const block of blocksOf(content)) {
      if (block?.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue;
      // A `Skill` call that failed brings no body, and must not claim the next skill's.
      if (block.is_error === true) pending.delete(block.tool_use_id);
      if (block.is_error !== true) continue;
      const command = commands.get(block.tool_use_id);
      if (command === undefined) continue;
      const output = textOf(block.content).slice(0, 4000);
      if (isCancelled(output)) continue;
      const reason = failureReason(output);
      if (reason === null) continue;
      const skill = active.find((candidate) => askedBySkill(command, candidate.markdown, candidate.directory));
      if (skill === undefined) continue;
      const domain = contextOf(words, readRequires(skill.markdown).description);
      failures.push({ at, session, skill: skill.name, source: null, ...(domain === null ? {} : { domain }), reason });
    }
  }
  return { uses, failures };
}

function transcripts(root: string): string[] {
  const found: string[] = [];
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return found;
  }
  for (const name of names) {
    const path = join(root, name);
    try {
      if (statSync(path).isDirectory()) found.push(...transcripts(path));
      else if (name.endsWith('.jsonl')) found.push(path);
    } catch {
      continue;
    }
  }
  return found;
}

export function backfill(root: string = join(homedir(), '.claude', 'projects')): {
  transcripts: number;
  uses: number;
  added: number;
  file: string;
} {
  const files = transcripts(root);
  let uses = 0;
  let added = 0;
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const read = readTranscript(text, basename(file, '.jsonl'));
    uses += read.uses;
    for (const failure of read.failures) if (appendFailure(failure)) added += 1;
  }
  return { transcripts: files.length, uses, added, file: join(arpHome(), 'failures.jsonl') };
}
