/** The weekly review list (task 59, ADR `0115`): what the sponsor filed, new categories first.
 *
 *      bun run scripts/verify/category-review.ts
 *      bun run scripts/verify/category-review.ts --days 30
 *
 *  Read-only, and local: it reads the sponsor's own log, `category-log.jsonl` under `ARP_HOME`
 *  (default `~/.arp`), or `SPONSOR_CATEGORY_LOG` when the sponsor was started with one. No network.
 *
 *  Validation is automatic and the review comes after it, so this lists what already landed. A new
 *  category that duplicates another leaves the index when ARP withdraws its position on its
 *  parent edge (`docs/25` §8); nothing is deleted on chain.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { arpHome } from '../../packages/protocol/src/node/local-state.js';

/** One line of the log, as `apps/sponsor/src/routes/propose-category.ts` writes it. */
type Entry = {
  at: number;
  label: string;
  parent: string | null;
  newCategory: boolean;
  subjectId: string;
  reason: string;
  transactions: string[];
  status?: 'complete' | 'partial';
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const days = Number(arg('days') ?? '7');
if (!Number.isFinite(days) || days <= 0) {
  console.error('--days must be a positive number');
  process.exit(1);
}

const override = process.env['SPONSOR_CATEGORY_LOG']?.trim();
const path = override !== undefined && override !== '' ? override : join(arpHome(), 'category-log.jsonl');
if (!existsSync(path)) {
  console.log(`${path}: no log yet, so nothing was filed`);
  process.exit(0);
}

// `at` is the sponsor's clock, `Date.now()` (`apps/sponsor/src/routes/context.ts`): milliseconds.
const since = Date.now() - days * 86_400_000;

const lines = readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '');
const entries: Entry[] = [];
let unreadable = 0;
for (const line of lines) {
  try {
    entries.push(JSON.parse(line) as Entry); // the sponsor is this file's only writer
  } catch {
    unreadable += 1;
  }
}
const recent = entries.filter((entry) => entry.at >= since);
const created = recent.filter((entry) => entry.newCategory);
const tagged = recent.filter((entry) => !entry.newCategory);
const day = (entry: Entry): string => new Date(entry.at).toISOString().slice(0, 10);
const partial = (entry: Entry): string => (entry.status === 'partial' ? '   PARTIAL' : '');

console.log(`${path}`);
console.log(
  `last ${days} day(s): ${recent.length} of ${entries.length} entries — ${created.length} new categor${created.length === 1 ? 'y' : 'ies'}, ${tagged.length} tag(s) with an existing one` +
    (unreadable > 0 ? `, ${unreadable} unreadable line(s)` : ''),
);

if (created.length > 0) {
  console.log('\nNEW CATEGORIES — check each is not a duplicate');
  for (const entry of created) {
    console.log(`  ${day(entry)}  ${entry.label} → ${entry.parent ?? '?'}${partial(entry)}`);
    console.log(`              why: ${entry.reason}`);
    console.log(`              skill ${entry.subjectId}`);
  }
}

if (tagged.length > 0) {
  const byLabel = new Map<string, Entry[]>();
  for (const entry of tagged) byLabel.set(entry.label, [...(byLabel.get(entry.label) ?? []), entry]);
  console.log('\nTAGS WITH AN EXISTING CATEGORY');
  for (const [label, list] of [...byLabel.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const flagged = list.filter((entry) => entry.status === 'partial').length;
    console.log(`  ${label.padEnd(16)} ${list.length}${flagged > 0 ? `   ${flagged} PARTIAL` : ''}`);
  }
}
