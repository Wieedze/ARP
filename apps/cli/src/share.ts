/**
 * `arp share`: whether this machine's failure memory may become public lines (`docs/tasks/70` item 2).
 *
 * Off until the person runs `arp share on`. The decision and the content are in
 * `@arp-protocol/core` (`share-failures.ts`). Writing is injected, so nothing here reaches a network
 * by itself, and with sharing off the writer is never called.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  decideShare,
  installedFromSkillLock,
  isSharingOn,
  parseLocalFailures,
  type ShareDecision,
  type SharedLine,
  sharedLineKey,
} from '@arp-protocol/core';

export type ShareEnv = { arpHome: string; home: string };

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

function shared(env: ShareEnv): Set<string> {
  const keys = new Set<string>();
  for (const row of (read(join(env.arpHome, 'shared-failures.jsonl')) ?? '').split('\n')) {
    if (row.trim() === '') continue;
    try {
      keys.add(sharedLineKey(JSON.parse(row) as SharedLine)); // our own file, written below
    } catch {
      continue; // a half-written last line: at worst one line is offered again, and it is idempotent on chain
    }
  }
  return keys;
}

export function decide(env: ShareEnv): ShareDecision & { on: boolean } {
  const on = isSharingOn(read(join(env.arpHome, 'sharing.json')));
  const decision = decideShare({
    on,
    failures: parseLocalFailures(read(join(env.arpHome, 'failures.jsonl')) ?? ''),
    installed: installedFromSkillLock(read(join(env.home, '.agents', '.skill-lock.json'))),
    alreadyShared: shared(env),
  });
  return { ...decision, on };
}

export function setSharing(env: ShareEnv, on: boolean): void {
  mkdirSync(env.arpHome, { recursive: true });
  writeFileSync(join(env.arpHome, 'sharing.json'), `${JSON.stringify({ failures: on })}\n`);
}

/** Sends what the decision allows. A line is recorded only once written, so a failed one is tried again. */
export async function sendShared(
  env: ShareEnv,
  write: (line: SharedLine) => Promise<void>,
): Promise<{ sent: number; failed: number }> {
  const { on, lines } = decide(env);
  if (!on) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const line of lines) {
    try {
      await write(line);
      appendFileSync(join(env.arpHome, 'shared-failures.jsonl'), `${JSON.stringify(line)}\n`);
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed };
}

const WHY = {
  sharing_off: 'sharing is off',
  no_public_source: 'no known public source',
  several_sources: 'several sources with this name',
} as const;

/** What a person reads before and after turning it on: exactly what would be public. */
export function describe(decision: ShareDecision & { on: boolean }): string {
  const out = [`sharing is ${decision.on ? 'on' : 'off'}`];
  if (decision.lines.length > 0) {
    out.push('', 'would be public on testnet 13579:');
    for (const line of decision.lines) out.push(`  ${line.toolUrl}  failed  ${line.reason}`);
  }
  if (decision.keptLocal.length > 0) {
    out.push('', 'stays on this machine:');
    for (const row of decision.keptLocal) out.push(`  ${row.skill}: ${WHY[row.why]}`);
  }
  return `${out.join('\n')}\n`;
}
