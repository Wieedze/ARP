/** Read a runtime's session log and name what it invoked.
 *
 *      bun run apps/mcp/src/session-log.ts [--log .arp/session.jsonl]
 *
 *  A thin reader. The resolution lives in `@arp-protocol/core` (`src/session.ts`), where it is
 *  pure and tested — a function that decided what ARP asserts had no business importing a file
 *  path, and `scripts/` has no test harness to catch it if it did.
 */
import { readFileSync } from 'node:fs';

import { catalogueFor } from './content.js';
import { parseSessionLog, resolveInvocations } from '@arp-protocol/core';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const path = arg('log') ?? process.env['ARP_SESSION_LOG'] ?? '.arp/session.jsonl';
// The catalogue is a per-chain record and the name resolves to a different atom id on each, so the
// chain is an argument. It was `skills-13579.json` imported at module scope — `portability.md`
// rule 1 — which reads a testnet record whatever the caller is working against.
const chainId = Number(arg('chain') ?? process.env['ARP_CHAIN_ID'] ?? 13579);
const log = parseSessionLog(readFileSync(path, 'utf8'));
const rows = catalogueFor(chainId);
const resolved = resolveInvocations(log, rows);

console.log(`${log.length} invocation(s) in ${path}, against chain ${chainId}'s catalogue`);
console.log(`${rows.length} tool(s) in that catalogue\n`);
for (const row of resolved) {
  if (row.status === 'resolved') {
    console.log(`  RESOLVED   ${row.name.padEnd(30)} x${row.calls}  ${row.repo}`);
  } else if (row.status === 'ambiguous') {
    console.log(
      `  AMBIGUOUS  ${row.name.padEnd(30)} x${row.calls}  ${row.candidates.length} repositories carry it`,
    );
    for (const candidate of row.candidates) console.log(`               ${candidate.repo}`);
  } else if (row.status === 'unrecorded') {
    // One tool carries the name and the catalogue holds no atom id for it. Its atom exists on
    // chain — 61 of 662 rows on 13579, measured — so what it needs is a recording run, not a
    // reference, and the two wants are different fixes.
    console.log(`  UNRECORDED ${row.name.padEnd(30)} x${row.calls}  ${row.repo}`);
    console.log(`               no atom id in the catalogue. Derivable from ${row.url}`);
  } else {
    console.log(`  UNKNOWN    ${row.name.padEnd(30)} x${row.calls}  (${row.kind})`);
  }
}

const count = (status: string) => resolved.filter((row) => row.status === status).length;
console.log(
  `\n${count('resolved')} ready to declare · ${count('ambiguous')} need a reference · ` +
    `${count('unrecorded')} need an atom id recorded · ${count('unknown')} not catalogued`,
);

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
