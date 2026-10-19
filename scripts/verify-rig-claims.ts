/** Check each rig fixture's `exercises` claim against what the probe actually observed.
 *
 *      bun run scripts/verify-cohort.ts --target intuition-testnet --ids 1,2,3,4,5 --tools --out /tmp/gate.json
 *      bun run scripts/verify-rig-claims.ts /tmp/gate.json
 *
 *  Exists because the unit tests **cannot** close this class, and reporting that they did was wrong.
 *
 *  `erc8004/test/rig-files.test.ts` checks the *checkability* axis — `probeable` against
 *  `not-checkable` — and, inside `not-checkable`, the code. That is everything derivable from the
 *  document alone. But `confirmed` and `inconclusive` are both `probeable` before a request is sent,
 *  so a unit test cannot tell them apart, and **the mutation that actually shipped lives exactly
 *  there**: `rig-dead` claimed `confirmed/dead` while the probe returned
 *  `inconclusive/transport-error`. Measured: flipping that claim leaves the unit suite green.
 *
 *  The probe is the only authority on the distinction, which is why the original defect surfaced at
 *  the gate and not in the suite. So this reads the gate's own report — it adds no requests of its
 *  own and touches no network.
 *
 *  Exits non-zero on a mismatch, so it can gate.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { NotCheckableCode } from '../erc8004/src/verify/types.js';
import { FILES, dataUri } from './rig-registration-files.js';

/** Imported rather than hand-copied, so a fifth member cannot be silently skipped. */
const NOT_CHECKABLE_CODES = [
  'templated',
  'non-http-identifier',
  'unparseable-url',
  'empty',
] as const satisfies readonly NotCheckableCode[];

type Outcome = { status: string; code: string };
type Report = {
  registry: string;
  agents: {
    tokenId: string;
    document: { status: string };
    endpoints: { name: string | null; outcome: Outcome }[];
  }[];
};

/** Which agent id carries which fixture. Mirrors `deployments/13579.json` `arp.rigAgents`. */
const AGENT_BY_SLUG: Record<string, string> = {
  'rig-confirmed': '3',
  'rig-dead': '4',
  'rig-unprobeable': '5',
};

/**
 * The hashes `deployments/13579.json` records, read rather than copied.
 *
 * **Only reproducible with `ARP_MCP_ENDPOINT` unset**: `OWN_ENDPOINT` reads the environment and the
 * fixture is hashed after substitution, so anyone with it exported sees a false DRIFT. Said here
 * because a drift detector that cries wolf gets ignored.
 */
const RECORDED_HASHES: Record<string, string> = (() => {
  try {
    const d = JSON.parse(
      readFileSync(new URL('../deployments/13579.json', import.meta.url), 'utf8'),
    ) as {
      arp?: {
        rigAgents?: { agents?: Record<string, { slug?: string; documentSha256_16?: string }> };
      };
    };
    const agents = d.arp?.rigAgents?.agents ?? {};
    return Object.fromEntries(
      Object.values(agents)
        .filter((a) => a.slug !== undefined && a.documentSha256_16 !== undefined)
        .map((a) => [a.slug as string, a.documentSha256_16 as string]),
    );
  } catch {
    return {};
  }
})();

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('usage: bun run scripts/verify-rig-claims.ts <gate report json>');
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Report;

/**
 * Every `status/code` pair the prose names.
 *
 * Deliberately exact: `confirmed/dead` and `inconclusive/transport-error` are different claims and
 * collapsing them to "probeable" is what let the shipped mutation through.
 */
function claimedPairs(exercises: string): string[] {
  const explicit = exercises.match(/\b(confirmed|inconclusive|not-checkable)\/[a-z-]+/g) ?? [];
  // The fixtures also write the natural form — "not-checkable ×2 — templated and
  // non-http-identifier" — so a bare status followed by its codes counts too. Requiring the slash
  // form would have made rig-unprobeable unverifiable, which is the vacuity shape twice over.
  const bare: string[] = [];
  for (const status of ['confirmed', 'inconclusive', 'not-checkable'] as const) {
    if (!new RegExp(`\\b${status}\\b`).test(exercises)) continue;
    const codes = NOT_CHECKABLE_CODES.filter((c) => exercises.includes(c));
    if (status === 'not-checkable' && codes.length > 0) {
      bare.push(...codes.map((c) => `not-checkable/${c}`));
    }
  }
  return [...new Set([...explicit, ...bare])];
}

let failures = 0;
let checked = 0;

console.log(`report:   ${reportPath}`);
console.log(`registry: ${report.registry}\n`);

for (const file of FILES) {
  const tokenId = AGENT_BY_SLUG[file.slug];
  const agent = report.agents.find((a) => a.tokenId === tokenId);
  if (!agent) {
    console.log(`  SKIP  ${file.slug} — agent ${tokenId} not in this report`);
    continue;
  }

  const observed = new Set(agent.endpoints.map((e) => `${e.outcome.status}/${e.outcome.code}`));
  const claims = claimedPairs(file.exercises);
  if (claims.length === 0) {
    console.log(`  FAIL  ${file.slug} — \`exercises\` names no status/code pair to check against`);
    failures += 1;
    continue;
  }

  for (const claim of claims) {
    checked += 1;
    if (observed.has(claim)) {
      console.log(`  ok    ${file.slug.padEnd(18)} claims ${claim.padEnd(38)} observed`);
    } else {
      console.log(
        `  FAIL  ${file.slug.padEnd(18)} claims ${claim.padEnd(38)} observed ${[...observed].join(', ')}`,
      );
      failures += 1;
    }
  }

  // The fixtures are the source of truth for permanent mints, so an edit to FILES that is not
  // re-minted diverges silently. The hash is recorded in deployments/13579.json.
  // sha256, first 16 hex — the same derivation deployments/13579.json records, so the two can
  // actually be compared. An earlier draft used Bun.hash, which produced a different digest and
  // made this look like a drift detector while comparing nothing.
  const hash = createHash('sha256').update(dataUri(file.doc)).digest('hex').slice(0, 16);
  const recorded = RECORDED_HASHES[file.slug];
  const drift = recorded !== undefined && recorded !== hash;
  console.log(
    `        ${' '.repeat(18)} document sha256 ${hash}` +
      (recorded === undefined
        ? '  (nothing recorded to compare)'
        : drift
          ? `  DRIFT — deployments records ${recorded}`
          : '  matches deployments'),
  );
  if (drift) failures += 1;
}

console.log(
  `\n${checked} claims checked · ${failures} mismatched` +
    (failures === 0 ? '' : '\n\nA mismatch means the prose and the probe disagree. Fix the prose.'),
);
if (failures > 0) process.exit(1);
