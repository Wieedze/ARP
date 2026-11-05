/**
 * How many skills would a failure's context reach through the table, and is it right? `docs/tasks/70`
 * item 2, ADR `0140`.
 *
 *     bun run scripts/measure/skill-context-coverage.ts
 *
 * Read-only, offline. Two populations, never added:
 *   - the catalogue, `data/catalogue/skill-facts.json`, whole: a name and a description;
 *   - a search sample, `data/measurements/skills-find-names-2026-11-05.txt`: what `skills@1.7.6 find`
 *     returned for 12 needs chosen by hand (video editing, pdf, send email, database migration, web
 *     scraping, write a blog post, transcribe audio, stripe payments, code review, generate image,
 *     spreadsheet, deploy to cloud). Names only, where the hook also has the description, and the needs
 *     lean towards categories the table has, so its figure is not the whole market's.
 *
 * A person's words and a search's domain come first in the hook and are not counted here. Prints a
 * fixed sample of 40 distinct names from what each population placed, to read by hand. `WRONG` is that
 * reading, 2026-11-05, on this table: change the table and the sample needs reading again.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { classifySkill } from '../../packages/protocol/src/skill-domains.js';

const SALT = 'skill-context-2026-11-05';
const WRONG: Record<string, readonly string[]> = {
  catalogue: ['animation-performance', 'animation-vocabulary', 'scaffold-exercises', 'codex-pet', 'agent-browser', 'short-editing'],
  search: ['service-helpagent-coordinate', 'fleet-management', 'ios-redteam-pipeline', 'list-hygiene-monitor', 'engineering-system-designer', 'sci-extract'],
};
const order = (text: string) => createHash('sha256').update(SALT + text).digest('hex');

function wilson(hits: number, total: number): [number, number] {
  const z = 1.96;
  const p = hits / total;
  const d = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const half = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return [(centre - half) / d, (centre + half) / d];
}

function report(label: 'catalogue' | 'search', rows: { name: string; text: string }[]) {
  const placed = rows.map((row) => ({ ...row, domain: classifySkill(row.name, row.text) }));
  const hit = placed.filter((row) => row.domain !== null);
  console.log(`${label}: ${hit.length} of ${rows.length} get a domain`);
  const distinct = [...new Map(hit.map((row) => [row.name, row])).values()];
  const sample = distinct.sort((a, b) => order(a.name).localeCompare(order(b.name))).slice(0, 40);
  const wrong = sample.filter((row) => WRONG[label]?.includes(row.name));
  const [low, high] = wilson(wrong.length, sample.length);
  console.log(`  read by hand: ${wrong.length} of ${sample.length} wrong (Wilson 95% ${(low * 100).toFixed(0)}% to ${(high * 100).toFixed(0)}%)`);
  for (const row of sample) {
    console.log(`  ${wrong.includes(row) ? 'WRONG' : 'ok'}\t${row.domain}\t${row.name}\t${row.text.slice(0, 70)}`);
  }
}

// The file's own documented shape: a `facts` map keyed by the skill's normalised URL.
const { facts } = JSON.parse(readFileSync('data/catalogue/skill-facts.json', 'utf8')) as {
  facts: Record<string, { description?: string }>;
};
report(
  'catalogue',
  Object.entries(facts).flatMap(([key, value]) => {
    const name = new URLSearchParams(key.split('?')[1] ?? '').get('skill');
    return name === null ? [] : [{ name, text: value.description ?? '' }];
  }),
);

const names = readFileSync('data/measurements/skills-find-names-2026-11-05.txt', 'utf8').split('\n').filter(Boolean);
report(
  'search',
  names.map((row) => ({ name: row.split('@').pop() ?? row, text: '' })),
);
