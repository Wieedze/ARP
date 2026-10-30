/** Whether the atom ids `data/catalogue/skills-<chainId>.json` records are the ids the chain computes.
 *
 *      bun run scripts/measure/catalogue-atom-ids.ts --chain 13579
 *      bun run scripts/measure/catalogue-atom-ids.ts --chain 13579 --json data/measurements/catalogue-atom-ids-<date>.json
 *
 *  Read-only. Two `eth_call`s per row — `calculateAtomId` and `isTermCreated` — both `pure`/`view`,
 *  no key, no value, nothing signed.
 *
 *  **`--chain` is required and there is no default.** The address and the RPC come from
 *  `data/deployments/<chainId>.json` read at call time, and the catalogue from
 *  `data/catalogue/skills-<chainId>.json` the same way. `rules/portability.md` rule 1, and the reason it
 *  is written this way rather than with an `ARP_TARGET` default is the defect this file was asked
 *  for alongside: a module-scope `data/catalogue/skills-13579.json` in a process whose chain was
 *  configurable served testnet ids from a mainnet MCP server.
 *
 *  ## The question it exists to answer
 *
 *  `packages/protocol/src/content-serve.ts` builds a **reverse index**: atom id to tool URL, from
 *  each row's *recorded* `atom`. Every consequence of the content path rides on that index being
 *  right, because the id is the only input to `GET /content/:atomId` and the URL it yields is what
 *  the MCP server fetches and what the receipt names under a signature. An id mapped to the wrong URL
 *  would make the MCP server sign for the wrong tool, and `receipt.ts` cannot detect it: the digest is
 *  over whatever bytes came back from whatever URL the index gave.
 *
 *  ADR `0054` says a tool's atom derives from its normalised URL, so the whole set is re-derivable.
 *  This re-derives it. The catalogue says so of itself — *"a RECORD, not a source of truth"* — and
 *  that sentence is only worth anything if somebody runs the derivation.
 *
 *  ## Why the derivation needs the chain
 *
 *  `calculateAtomId` is **not** `keccak256` of the atom's data, which is the obvious guess and was
 *  mine. The script reports `localKeccakAgreed` so the claim is a figure rather than an assertion;
 *  it is the reason `contentIndexFor` skips a row with no recorded id instead of computing one, and
 *  the reason that skip is a real cost rather than laziness.
 *
 *  ## What it does not claim
 *
 *  **Nothing about the triples.** A tool's atom existing says nothing about whether any `uses` edge
 *  points at it, and `tagTriple` is not checked here.
 *
 *  **Nothing about what is pinned.** `isTermCreated` says the term exists on chain; whether the
 *  `ipfs://` document behind it was ever pinned — which is what makes the atom *readable* rather
 *  than merely extant — is a separate question `measure/tool-atom-shape.ts` asks.
 *
 *  **Nothing about the 61 being wrong to seed.** It reports that an unrecorded row's derived atom
 *  exists, which makes `unknown` the wrong word for it. Whether the recording run should happen is
 *  a decision, not a measurement.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { createPublicClient, http, keccak256, parseAbi, stringToHex, type Hex } from 'viem';

import { toolAtomUri, normaliseToolUrl } from '../../packages/protocol/src/declare/tool-thing.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const chainArg = arg('chain');
if (chainArg === undefined || !/^\d+$/.test(chainArg)) {
  console.error('usage: bun run scripts/measure/catalogue-atom-ids.ts --chain <chainId> [--json <path>]');
  process.exit(1);
}
const chainId = Number(chainArg);

type DeploymentRecord = { chain?: { rpcUrl?: string }; intuition?: { multiVault?: string } };

/** Read per chain at call time, never imported: the address and the RPC both differ. */
function deploymentFor(id: number): { rpcUrl: string; multiVault: Hex } {
  const record = JSON.parse(
    readFileSync(new URL(`../../data/deployments/${id}.json`, import.meta.url), 'utf8'),
  ) as DeploymentRecord;
  const rpcUrl = record.chain?.rpcUrl;
  const multiVault = record.intuition?.multiVault;
  if (rpcUrl === undefined || multiVault === undefined) {
    console.error(`data/deployments/${id}.json is missing an rpcUrl or a multiVault`);
    process.exit(1);
  }
  return { rpcUrl, multiVault: multiVault as Hex };
}

type CataloguedSkill = { repo: string; skill: string; url: string; atom: string | null };

/** The catalogue recorded for one chain. An absent file is nothing recorded, not an error. */
function catalogueFor(id: number): CataloguedSkill[] {
  try {
    const raw = readFileSync(new URL(`../../data/catalogue/skills-${id}.json`, import.meta.url), 'utf8');
    return (JSON.parse(raw) as { skills?: CataloguedSkill[] }).skills ?? [];
  } catch {
    return [];
  }
}

const { rpcUrl, multiVault } = deploymentFor(chainId);
const rows = catalogueFor(chainId);
if (rows.length === 0) {
  console.error(`data/catalogue/skills-${chainId}.json records no skills — nothing to re-derive.`);
  process.exit(1);
}

const client = createPublicClient({ transport: http(rpcUrl, { batch: true, timeout: 30_000 }) });
const abi = parseAbi([
  'function calculateAtomId(bytes data) pure returns (bytes32)',
  'function isTermCreated(bytes32 id) view returns (bool)',
]);

/** Bounded concurrency. A public RPC answers 16 in flight comfortably and 600 at once does not. */
async function pool<T, R>(items: readonly T[], width: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      for (;;) {
        const index = next++;
        const item = items[index];
        if (item === undefined) return;
        out[index] = await f(item);
      }
    }),
  );
  return out;
}

type Derived = {
  repo: string;
  skill: string;
  url: string;
  recorded: string | null;
  /** The id the chain computes from `toolAtomUri(url)`. */
  derived: string;
  /** `keccak256` of the same bytes, to settle whether the chain read is necessary. */
  localKeccak: string;
  onChain: boolean;
  normalised: boolean;
};

console.log(`chain ${chainId}  multiVault ${multiVault}`);
console.log(`re-deriving ${rows.length} rows from data/catalogue/skills-${chainId}.json …`);

const derived = await pool(rows, 16, async (row): Promise<Derived> => {
  const data = stringToHex(toolAtomUri(row.url));
  const id = (await client.readContract({
    address: multiVault,
    abi,
    functionName: 'calculateAtomId',
    args: [data],
  })) as string;
  const onChain = (await client.readContract({
    address: multiVault,
    abi,
    functionName: 'isTermCreated',
    args: [id as Hex],
  })) as boolean;
  let normalised = false;
  try {
    normalised = normaliseToolUrl(row.url) === row.url;
  } catch {
    normalised = false;
  }
  return {
    repo: row.repo,
    skill: row.skill,
    url: row.url,
    recorded: row.atom,
    derived: id,
    localKeccak: keccak256(data),
    onChain,
    normalised,
  };
});

const recorded = derived.filter((row) => row.recorded !== null);
const unrecorded = derived.filter((row) => row.recorded === null);

/** The finding that would mean the MCP server signs for the wrong tool. */
const mismatched = recorded.filter(
  (row) => row.derived.toLowerCase() !== row.recorded!.toLowerCase(),
);
/** A recorded id the chain does not have. The index would resolve it and the fetch would succeed. */
const recordedNotOnChain = recorded.filter((row) => !row.onChain);
/** An unrecorded row whose atom exists anyway — so `unknown` is the wrong word for it. */
const unrecordedOnChain = unrecorded.filter((row) => row.onChain);
const localKeccakAgreed = derived.filter(
  (row) => row.localKeccak.toLowerCase() === row.derived.toLowerCase(),
);
const notNormalised = derived.filter((row) => !row.normalised);

/** Two rows deriving one id: the reverse index is a Map, so the later row would win silently. */
const byDerived = new Map<string, Derived[]>();
for (const row of derived) {
  const key = row.derived.toLowerCase();
  byDerived.set(key, [...(byDerived.get(key) ?? []), row]);
}
const collisions = [...byDerived.entries()]
  .filter(([, group]) => group.length > 1)
  .map(([id, group]) => ({ atom: id, rows: group.map((row) => `${row.repo}?skill=${row.skill}`) }));

const byUrl = new Map<string, number>();
for (const row of derived) byUrl.set(row.url, (byUrl.get(row.url) ?? 0) + 1);
const duplicateUrls = [...byUrl.entries()]
  .filter(([, n]) => n > 1)
  .map(([url, n]) => ({ url, rows: n }));

const out = {
  measuredAt: new Date().toISOString(),
  chainId,
  multiVault,
  rpcUrl,
  source: `data/catalogue/skills-${chainId}.json`,
  method:
    'calculateAtomId(stringToHex(toolAtomUri(url))) and isTermCreated(id), both read off the ' +
    'MultiVault. Read-only: two eth_calls per row, nothing signed.',
  counts: {
    rows: derived.length,
    recorded: recorded.length,
    unrecorded: unrecorded.length,
    mismatched: mismatched.length,
    recordedNotOnChain: recordedNotOnChain.length,
    unrecordedOnChain: unrecordedOnChain.length,
    derivedOnChain: derived.filter((row) => row.onChain).length,
    localKeccakAgreed: localKeccakAgreed.length,
    collisions: collisions.length,
    duplicateUrls: duplicateUrls.length,
    urlsNotAlreadyNormalised: notNormalised.length,
  },
  mismatched,
  recordedNotOnChain: recordedNotOnChain.map((row) => `${row.repo}?skill=${row.skill}`),
  unrecordedOnChain: unrecordedOnChain.map((row) => ({
    repo: row.repo,
    skill: row.skill,
    url: row.url,
    atom: row.derived,
  })),
  collisions,
  duplicateUrls,
  urlsNotAlreadyNormalised: notNormalised.map((row) => row.url),
  rows: derived,
};

console.log('');
console.log(`rows                       ${out.counts.rows}`);
console.log(`  with a recorded atom     ${out.counts.recorded}`);
console.log(`  with none                ${out.counts.unrecorded}`);
console.log('');
console.log(`recorded id != derived id  ${out.counts.mismatched}   <- a wrong one makes the MCP server sign for the wrong tool`);
console.log(`recorded id not on chain   ${out.counts.recordedNotOnChain}`);
console.log(
  `unrecorded, atom on chain  ${out.counts.unrecordedOnChain}   <- "unknown" is the wrong word ` +
    'for these',
);
console.log(`derived id on chain, all   ${out.counts.derivedOnChain} of ${out.counts.rows}`);
console.log('');
console.log(`two rows, one derived id   ${out.counts.collisions}   <- the reverse index would lose one`);
console.log(`duplicate urls             ${out.counts.duplicateUrls}`);
console.log(`urls not already normalised ${out.counts.urlsNotAlreadyNormalised}`);
console.log('');
console.log(
  `local keccak256 agreed     ${out.counts.localKeccakAgreed} of ${out.counts.rows}   <- ` +
    'if 0, calculateAtomId is not keccak of the data and the chain read is necessary',
);

for (const row of mismatched) {
  console.log(`\nMISMATCH ${row.repo}?skill=${row.skill}`);
  console.log(`  recorded ${row.recorded}`);
  console.log(`  derived  ${row.derived}`);
}

const path = arg('json');
if (path !== undefined) {
  writeFileSync(path, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`\nwritten to ${path}`);
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
