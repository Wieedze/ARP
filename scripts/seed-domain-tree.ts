/** Plan a domain tree: the atoms, the hierarchy edges, and the `has tag` edges onto real tools.
 *
 *      ARP_TARGET=testnet bun run scripts/seed-domain-tree.ts --json /tmp/domains.json
 *      bun run scripts/agent-send-plan.ts --chain 13579 --plan /tmp/domains.json --execute
 *
 *  Plans and prints. **Signs nothing and sends nothing** — `agent-send-plan.ts` is the only place
 *  in this repo that holds a key (ADR `0038`).
 *
 *  ## What it is for
 *
 *  One tree has to serve two readings, or the guard rail does not guard the search
 *  (`docs/18_THE_DOMAIN_TREE.md`):
 *
 *    - **down**, from a domain to the tools under it — what `arp_find_tools` needs and has never had;
 *    - **up**, from a tool's domain to the domain a delegation was scoped on — the path an agent
 *      presents as a witness, because the MultiVault has no reverse index.
 *
 *  ## Plain-string atoms, not pinned Things, and that is measured
 *
 *  A pinned `Thing` hashes a document with three free-text fields, so two publishers of one term
 *  get two nodes with two markets. Measured on mainnet 1155, 2026-10-28
 *  (`scripts/measure/tag-object-discipline.ts`): of 1,666 distinct tag objects, **53 labels are
 *  carried by more than one atom, 118 atoms in all** — `DeFi`×5, `Gaming`×4, `Security`×4. The
 *  three inspected by hand are all pinned Things, and `Infra`'s two differ only by a description
 *  somebody wrote and by a `url` that is the literal string `"null"` in one of them.
 *
 *  A plain string has no document and therefore no fields to disagree about: its id is
 *  `calculateAtomId(stringToHex(label))` — a pure function of the label, so anyone recomputes it
 *  from the label alone, and one normalisation rule gives exactly one node. (It is **not** plain
 *  `keccak256` of the data, whatever `atomDataForUri`'s docstring says:
 *  `keccak256(stringToHex("tool"))` is `0x6563ece9…` and the atom is `0xd6cc02f5…`. The id has to
 *  be read from the contract, which `reads.atomId` does.) That is ADR `0054`'s argument for tool URLs, applied to vocabulary. Measured the same
 *  day: `tool` and `payment` each exist as exactly **one** plain-string atom, with the same id on
 *  both chains, and neither has ever been used as the object of a triple.
 *
 *  ## The `has tag` atom this writes with
 *
 *  `0x7ec36d20…`, on **both** chains — not `hasTagForWriting(chainId)`, which returns
 *  `0x6de69cc0…` on 13579 on the authority of `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md:1025`
 *  ("use `0x6de69cc0…` for testnet writes to match each network's in-use vocabulary"). Measured on
 *  testnet 13579, 2026-10-28: `0x7ec36d20…` carries **52,781** edges there and `0x6de69cc0…`
 *  carries **311**. The guide's testnet recommendation holds 0.6% of that chain's `has tag` edges,
 *  so following it would write where almost nothing reads. `hasTagForWriting` is exported and has
 *  no callers, so nothing has been written the wrong way yet.
 *
 *  ## `assets` is `cost + minDeposit`
 *
 *  Passing the cost alone creates a term with **no position** — it exists on the chain and does not
 *  exist as a market (ADR `0053`). Here that matters twice over: an edge with no position behind it
 *  carries no path under the stake rule, so a hierarchy edge created with the fee alone would be
 *  invisible to the very reading it exists for. Both numbers are read off the chain at plan time;
 *  they are 100× apart between chains (`rules/portability.md` rule 3).
 */
import { writeFileSync } from 'node:fs';

import { formatEther, stringToHex, type Hex } from 'viem';

import { encodeCreateAtom, encodeCreateTriple, multiVaultReads } from '../packages/protocol/src/declare/index.js';
import { atomDataForUri } from '../packages/protocol/src/declare/multivault.js';
import { normaliseToolUrl, toolAtomUri } from '../packages/protocol/src/declare/tool-thing.js';

const TARGETS = { mainnet: 1155, testnet: 13579 } as const;

/** `is a sub-domain of`. The atom the liquid-democracy repo already publishes with on 13579, so a
 *  domain minted in either project is the same node. 42 edges there, 0 on mainnet. */
const IS_A_SUB_DOMAIN_OF = '0x9c2e2f2018dbfaa74fd3fd86cd54a62b16e771936f5d342e3751db8d0c046f80' as Hex;

/** `has tag`, the `Keywords` atom pinning `https://schema.org/keywords`. See the header. */
const HAS_TAG = '0x7ec36d201c842dc787b45cb5bb753bea4cf849be3908fb1b0a7d067c3c3cc1f5' as Hex;

/** The root. Every path climbs to it, and it is the one arbitrary choice in the whole system. */
const ROOT = 'tool';

/**
 * The tree and the tags, read from `catalogue/domains.proposal.json` rather than written here.
 *
 * They used to be two literals in this file, which was fine for a three-triple smoke test and is
 * not fine for 116 calls: the assignment of 53 tools to 17 domains is reviewable data, and a
 * reviewer should be able to read it without reading a script. The file also carries *why* each
 * tool landed where it did, which a tuple cannot.
 *
 * Two things in that file are deliberately NOT planned here:
 *
 *   - **`card-payment`**, already on chain and breaking the one-word rule. `assertOneWord` refuses
 *     it, so it cannot be re-planned by accident; its replacement `card` is in the proposal.
 *   - **`security`**, which ends up with zero tools because snyk/saw-mcp publishes no description.
 *     A domain nobody's tool sits under is a term we do not need yet.
 */
type Proposal = {
  domains: {label: string; verdict: string}[];
  secondLevel: {child: string; parent: string}[];
  _toolAssignment: {
    tools: {url: string; does: string; is: string}[];
    unassignedTools: {url: string; is: string}[];
  };
};

const proposal = (await import('../catalogue/domains.proposal.json')) as {default: Proposal};
const plan = proposal.default;

const SECOND_LEVEL = new Map(plan.secondLevel.map((entry) => [entry.child, entry.parent]));

/** `[child, parent]`, spelled out as the triple it stands for: `child is a sub-domain of parent`.
 *  A domain with no entry in `secondLevel` hangs off the root. */
const HIERARCHY: readonly [string, string][] = plan.domains
  .filter((entry) => entry.label !== 'security')
  .map((entry) => [entry.label, SECOND_LEVEL.get(entry.label) ?? ROOT] as [string, string]);

/** `[tool URL, domain]` — the `has tag` triples, both axes.
 *
 *  Axis 1 covers the 43 tools whose own published description says what they are for. Axis 2 covers
 *  all 53, because `kind` is known for every one of them even where the purpose is not — which is
 *  the one place that axis earns its keep on its own. */
const TAGS: readonly [string, string][] = [
  ...plan._toolAssignment.tools.map((tool) => [tool.url, tool.does] as [string, string]),
  ...plan._toolAssignment.tools.map((tool) => [tool.url, tool.is] as [string, string]),
  ...plan._toolAssignment.unassignedTools.map((tool) => [tool.url, tool.is] as [string, string]),
];

/**
 * The normalisation rule, applied before anything is hashed: lowercase, accents stripped.
 *
 * An atom's identity is its bytes, so `Design` and `design` are two nodes for ever, with no repair
 * available on a graph that has no deletion. Measured on testnet 13579: that exact pair exists,
 * with the typo `motion-desing` attached to one of them.
 */
function normaliseLabel(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * **One word. No hyphens, ever.** The user's rule, 2026-10-28: _« tout ne doit faire que un mot pas
 * de mot tiret jamais ok si quelque chose est bancale on crer un nouveau termes »_.
 *
 * It is enforced here rather than trusted, because the previous version of this file *hyphenated*
 * multi-word labels instead of refusing them, and that is how `card-payment` reached 13579 — one
 * atom and two edges, permanent, created about an hour before the rule was stated. A rule that
 * lives only in a conversation gets broken by the next script that runs.
 *
 * The compounds it refuses all had a one-word term available that nobody had to invent:
 * `browser-automation` → `browser`, `project-management` → `collaboration`,
 * `software-development` → `development`, `code-quality` → `quality` (3 existing uses on 13579),
 * `card-payment` → `card`. Where no one-word term fits, the instruction is to coin one — not to
 * join two with a hyphen.
 *
 * Predicates are **not** covered: `has tag` and `is a sub-domain of` are the ecosystem's existing
 * phrases, not vocabulary ARP chooses, and `has tag` alone carries 58,064 edges. If that reading is
 * wrong the predicate list is the only thing that changes.
 */
function assertOneWord(label: string): void {
  if (/[-\s_]/.test(label)) {
    console.error(
      `refusing "${label}": a domain is one word, never hyphenated. Coin a new term instead of joining two.`,
    );
    process.exit(1);
  }
}

/** The atom data for a domain. A plain string, deliberately — see the header. */
function atomDataForLabel(label: string): Hex {
  return stringToHex(label);
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const targetName = (process.env['ARP_TARGET'] ?? 'testnet') as keyof typeof TARGETS;
const chainId = TARGETS[targetName];
if (chainId === undefined) {
  console.error(`ARP_TARGET must be one of ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}
if (chainId === 1155) {
  // `rules/security.md`: mainnet writes are a separate question from mainnet deployment, and
  // neither is answered by a seeding script. No ADR authorises minting vocabulary on 1155.
  console.error('refusing mainnet: minting domain atoms on 1155 is not authorised by any ADR.');
  process.exit(1);
}

const record = (await import(`../deployments/${chainId}.json`)) as {
  default: { intuition: { multiVault: string }; chain: { rpcUrl: string } };
};
const multiVault = record.default.intuition.multiVault as Hex;
const rpcUrl =
  process.env['INTUITION_RPC_URL'] ??
  process.env['INTUITION_TESTNET_RPC_URL'] ??
  record.default.chain.rpcUrl;

const { createPublicClient, http } = await import('viem');
const client = createPublicClient({ transport: http(rpcUrl) });
const reads = multiVaultReads({ address: multiVault, chainId, client });

const [atomCost, tripleCost, minDeposit] = await Promise.all([
  reads.atomCost(),
  reads.tripleCost(),
  reads.minDeposit(),
]);
const atomAssets = atomCost + minDeposit;
const tripleAssets = tripleCost + minDeposit;

console.log(`chain         ${chainId} (${targetName})`);
console.log(`multiVault    ${multiVault}`);
console.log(`per atom      ${formatEther(atomAssets)}   = atomCost + minDeposit (read from chain)`);
console.log(`per triple    ${formatEther(tripleAssets)}   = tripleCost + minDeposit\n`);

// ---- 1. the domain labels, normalised once ----------------------------------------------------
const labels = new Set<string>([ROOT]);
for (const [child, parent] of HIERARCHY) {
  labels.add(normaliseLabel(child));
  labels.add(normaliseLabel(parent));
}
for (const [, domain] of TAGS) labels.add(normaliseLabel(domain));

// Every label, including the root, before a single id is derived: the check has to run before the
// plan is built or it is advice rather than a guard.
for (const label of labels) assertOneWord(label);

type PlannedCall = {
  kind: string;
  chainId: number;
  to: Hex;
  value: string;
  data: Hex;
  why: string;
};

const atomCalls: PlannedCall[] = [];
const idOf = new Map<string, Hex>();
console.log('domains');
for (const label of [...labels].sort()) {
  const data = atomDataForLabel(label);
  const atomId = await reads.atomId(data);
  idOf.set(label, atomId);
  const exists = await reads.termExists(atomId);
  console.log(`  ${exists ? 'exists ' : 'CREATE '}  ${atomId.slice(0, 14)}…  ${label}`);
  if (exists) continue;
  atomCalls.push({
    kind: 'create-atom',
    // Carried on every call, never inferred at signing time: `send-plan.ts` refuses a plan whose
    // calls disagree with its `--chain`.
    chainId,
    to: multiVault,
    value: atomAssets.toString(),
    data: encodeCreateAtom(data, atomAssets),
    why: `domain atom "${label}" (plain string, so its id is a pure function of the label)`,
  });
}

// ---- 2. the hierarchy edges -------------------------------------------------------------------
const tripleCalls: PlannedCall[] = [];
console.log('\nhierarchy');
for (const [rawChild, rawParent] of HIERARCHY) {
  const child = normaliseLabel(rawChild);
  const parent = normaliseLabel(rawParent);
  const childId = idOf.get(child) as Hex;
  const parentId = idOf.get(parent) as Hex;
  const tripleId = await reads.tripleId(childId, IS_A_SUB_DOMAIN_OF, parentId);
  const exists = await reads.termExists(tripleId);
  console.log(`  ${exists ? 'exists ' : 'CREATE '}  ${child} — is a sub-domain of — ${parent}`);
  if (exists) continue;
  tripleCalls.push({
    kind: 'create-triple',
    chainId,
    to: multiVault,
    value: tripleAssets.toString(),
    data: encodeCreateTriple(childId, IS_A_SUB_DOMAIN_OF, parentId, tripleAssets),
    why: `${child} is a sub-domain of ${parent}`,
  });
}

// ---- 3. the `has tag` edges onto real tools ---------------------------------------------------
console.log('\ntags');
for (const [rawUrl, rawDomain] of TAGS) {
  const url = normaliseToolUrl(rawUrl);
  const domain = normaliseLabel(rawDomain);
  const toolId = await reads.atomId(atomDataForUri(toolAtomUri(url)));
  if (!(await reads.termExists(toolId))) {
    // A tag whose subject does not exist would revert the whole batch with
    // `MultiVault_TermDoesNotExist`, so it is refused here rather than on chain.
    console.error(`  REFUSED  ${url} has no atom on chain ${chainId} — seed the catalogue first`);
    process.exit(1);
  }
  const domainId = idOf.get(domain) as Hex;
  const tripleId = await reads.tripleId(toolId, HAS_TAG, domainId);
  const exists = await reads.termExists(tripleId);
  console.log(`  ${exists ? 'exists ' : 'CREATE '}  ${url} — has tag — ${domain}`);
  if (exists) continue;
  tripleCalls.push({
    kind: 'create-triple',
    chainId,
    to: multiVault,
    value: tripleAssets.toString(),
    data: encodeCreateTriple(toolId, HAS_TAG, domainId, tripleAssets),
    why: `${url} has tag ${domain}`,
  });
}

// Atoms before triples, because `createTriples` reverts with `MultiVault_TermDoesNotExist` if a
// referenced atom has not landed yet, and `send-plan.ts` sends sequentially awaiting each receipt.
const calls = [...atomCalls, ...tripleCalls];
const total = calls.reduce((sum, call) => sum + BigInt(call.value), 0n);

console.log(
  `\n${atomCalls.length} atoms + ${tripleCalls.length} triples = ${calls.length} calls, ` +
    // Not a ternary on `chainId`: the mainnet refusal above narrows it to 13579, so `tsc` proves
    // the other branch unreachable.
    `${formatEther(total)} tTRUST`,
);

if (calls.length === 0) {
  console.log('nothing to plan — the tree is already on chain.');
  process.exit(0);
}

const jsonPath = arg('json');
if (jsonPath === undefined) {
  console.log('\npass --json <path> to write the plan, then send it with agent-send-plan.ts');
} else {
  // A bare array: `agent-send-plan.ts` refuses anything else, and each call carries its own
  // `chainId` so wrapping the plan in a second copy of it would be two places to disagree.
  writeFileSync(jsonPath, JSON.stringify(calls, null, 2));
  console.log(`\nplan written to ${jsonPath}`);
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
