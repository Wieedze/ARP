/** Take a hierarchy triple out of ARP's tree by redeeming the position behind it.
 *
 *      ARP_TARGET=testnet bun run scripts/seed/retire-domain-edge.ts --child card-payment --parent payment --json /tmp/r.json
 *      bun run scripts/agent/agent-send-plan.ts --chain 13579 --plan /tmp/r.json --execute
 *
 *  Plans and prints. **Signs nothing and sends nothing** — `agent-send-plan.ts` is the only place in
 *  this repo that holds a key (ADR `0038`).
 *
 *  ## This is the edit mechanism, and it is the only one
 *
 *  ARP's tree is the set of hierarchy triples the attestor holds a position on (the user,
 *  2026-10-28: _« on crée ou on se positionne … ça nous permet de faire le scope des domaines
 *  existants dans ARP »_). So the tree is editable in both directions without the graph ever
 *  changing: take a position and the triple joins, redeem it and the triple leaves.
 *
 *  **The triple itself is permanent.** Intuition has no deletion. What this changes is whether
 *  *our* reading contains it — anyone reading without the attestor filter still sees it, for ever.
 *  "Retire" is accurate for the tree and wrong for the chain, and the difference matters to anybody
 *  who reads the graph unfiltered.
 *
 *  Before this, the only retirement anybody here had thought of was depositing on the triple's
 *  counter-triple, which costs money to express a correction. Redeeming *returns* money.
 *
 *  ## It does not come back whole
 *
 *  Measured on testnet 13579, 2026-10-28, on `card-payment is a sub-domain of payment`: a
 *  0.002000000002 deposit redeems for **0.0009801** — the entry fee was taken on the way in and the
 *  exit fee is taken on the way out. So an edit costs about half the stake. That is a reason to get
 *  a label right the first time, not a reason to avoid correcting one.
 *
 *  `minAssets` is the slippage floor and is read from `previewRedeem` rather than left at zero:
 *  zero accepts any price, which on a bonding curve between planning and signing is how a position
 *  leaves for less than it was quoted.
 */
import { writeFileSync } from 'node:fs';

import { formatEther, stringToHex, type Hex } from 'viem';

import { encodeRedeem, multiVaultReads } from '../../packages/protocol/src/declare/index.js';

const TARGETS = { mainnet: 1155, testnet: 13579 } as const;

/** `is a sub-domain of`. The predicate the tree is built on. */
const IS_A_SUB_DOMAIN_OF = '0x9c2e2f2018dbfaa74fd3fd86cd54a62b16e771936f5d342e3751db8d0c046f80' as Hex;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const child = arg('child');
const parent = arg('parent');
if (child === undefined || parent === undefined) {
  console.error('usage: --child <label> --parent <label> [--json <path>]');
  process.exit(1);
}

const targetName = (process.env['ARP_TARGET'] ?? 'testnet') as keyof typeof TARGETS;
const chainId = TARGETS[targetName];
if (chainId === undefined) {
  console.error(`ARP_TARGET must be one of ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}
if (chainId === 1155) {
  console.error('refusing mainnet: no ADR authorises ARP redeeming a mainnet position from a script.');
  process.exit(1);
}

const attestor = process.env['AGENT_ADDRESS'];
if (attestor === undefined) {
  // The receiver of the redeemed assets, and the account whose shares are being counted. Read from
  // the environment rather than passed on the command line: a typo here sends the proceeds to an
  // address nobody controls, and `send-plan.ts` verifies the signer against this same variable.
  console.error('AGENT_ADDRESS must be set — it is the account holding the position and the receiver.');
  process.exit(1);
}

const record = (await import(`../../data/deployments/${chainId}.json`)) as {
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

const curveId = await reads.defaultCurveId();
// A domain atom is a plain string, so its data is the label's bytes — the same construction
// `seed-domain-tree.ts` used to create it, and the reason the id can be re-derived from the label
// alone. Not `atomDataForUri`, whose name would misdescribe what this is.
const childId = await reads.atomId(stringToHex(child));
const parentId = await reads.atomId(stringToHex(parent));
const tripleId = await reads.tripleId(childId, IS_A_SUB_DOMAIN_OF, parentId);

if (!(await reads.termExists(tripleId))) {
  console.error(`no triple "${child} is a sub-domain of ${parent}" on chain ${chainId}`);
  process.exit(1);
}

const shares = await reads.sharesOf(attestor as Hex, tripleId, curveId);
if (shares === 0n) {
  console.log(`${attestor} holds no position on "${child} is a sub-domain of ${parent}".`);
  console.log('Nothing to retire — it is already outside the tree.');
  process.exit(0);
}

const preview = await reads.previewRedeem(tripleId, curveId, shares);

console.log(`chain       ${chainId} (${targetName})`);
console.log(`triple      ${tripleId}`);
console.log(`            ${child} — is a sub-domain of — ${parent}`);
console.log(`holder      ${attestor}`);
console.log(`shares      ${shares}`);
console.log(`returns     ${formatEther(preview.assetsAfterFees)} (after the exit fee)`);
console.log(`\nAfter this the triple stays on chain for ever. What changes is that ARP's tree,`);
console.log(`which is the set of hierarchy triples this address has a position on, no longer`);
console.log(`contains it. A reader without the attestor filter still sees it.`);

const calls = [
  {
    kind: 'redeem',
    chainId,
    to: multiVault,
    // Redeem is NOT payable. A value here would be sending TRUST in order to collect TRUST.
    value: '0',
    data: encodeRedeem(attestor as Hex, tripleId, curveId, shares, preview.assetsAfterFees),
    why: `retire "${child} is a sub-domain of ${parent}" from ARP's tree`,
  },
];

const jsonPath = arg('json');
if (jsonPath === undefined) {
  console.log('\npass --json <path> to write the plan, then send it with agent-send-plan.ts');
} else {
  writeFileSync(jsonPath, JSON.stringify(calls, null, 2));
  console.log(`\nplan written to ${jsonPath}`);
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
