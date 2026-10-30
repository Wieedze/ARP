/** Fetch a skill through a server, keep the receipt, and leave the hook able to name the atom.
 *
 *      bun run apps/mcp/src/fetch-skill.ts <atomId|url> [--out <path>]
 *      ARP_NODE=http://localhost:3002 bun run apps/mcp/src/fetch-skill.ts 0xf205…
 *      ARP_AGENT_PRIVATE_KEY=0x… bun run apps/mcp/src/fetch-skill.ts 0xf205…   # named in the receipt
 *
 *  This is the agent's side of the content path. Without it the server's receipt exists and nothing
 *  on the agent's machine knows it does.
 *
 *  ## The one thing it is for
 *
 *  A runtime hands a skill's **name** and not its origin, and a name does not identify a tool: 104
 *  of the catalogue's 499 distinct names are carried by more than one repository with identical
 *  files. So `apps/hook/src/hook.ts` could record what was invoked and never which atom it
 *  was, and `resolveInvocations` refused every ambiguous one rather than guessing.
 *
 *  The fetch is the only moment both facts are in the same place. So it writes them down:
 *
 *  ```
 *  .arp/receipts.jsonl   one line per fetch: the skill, its atom, its url, the receipt
 *  .arp/skills/<name>/SKILL.md   the bytes, unchanged, so the digest still checks
 *  ```
 *
 *  The hook reads the first and fills `ref`. That is `tasks/31` deliverable 3, and it is the half
 *  of the content path that is about identification rather than about evidence.
 *
 *  ## What it verifies before keeping anything
 *
 *  Both halves, every time, because a receipt nobody checks is a log entry:
 *
 *  - the signature recovers to the address the receipt declares (`verifyContentReceipt`);
 *  - the bytes that arrived hash to the digest the receipt names (`receiptMatchesContent`).
 *
 *  A receipt that fails either is **reported and not kept**. The content is still written, because
 *  the bytes are the bytes and the agent asked for them — what is refused is recording a
 *  corroboration that does not hold.
 *
 *  ## The key
 *
 *  `ARP_AGENT_PRIVATE_KEY`, optional, used for exactly one off-chain EIP-712 signature so the
 *  receipt can name the caller. **Nothing is sent to a chain and nothing is signed for a chain.**
 *  Without it the fetch still works and the receipt names nobody, which is a served state and not
 *  an error (`tasks/31` §5.3).
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { keccak256, stringToBytes, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  contentRequestTypedData,
  receiptMatchesContent,
  type SignedContentReceipt,
  skillRefFromUrl,
  verifyContentReceipt,
} from '@arp-protocol/core';
import { contentIndexFor } from './content.js';

const BASE = process.env['ARP_NODE'] ?? 'http://localhost:3002';
const RECEIPTS = '.arp/receipts.jsonl';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const target = process.argv[2];
if (target === undefined || target.startsWith('--')) {
  console.error('usage: bun run apps/mcp/src/fetch-skill.ts <atomId|url> [--out <path>]');
  process.exit(1);
}

/** An atom id, or a tool URL resolved to one through the catalogue recorded for that chain. */
function atomIdOf(input: string, chainId: number): Hex | null {
  if (/^0x[0-9a-fA-F]{64}$/.test(input)) return input.toLowerCase() as Hex;
  for (const [atom, url] of contentIndexFor(chainId)) {
    if (url === input || url.replace('https://', '') === input.replace('https://', '')) {
      return atom as Hex;
    }
  }
  return null;
}

// The server's chain first, because the catalogue is per chain and a URL resolves to a different
// atom id on each — the id is a pure function of the URL, so the record is what differs.
const info = (await (await fetch(BASE)).json()) as { chain?: { id?: number } };
const chainId = info.chain?.id;
if (typeof chainId !== 'number') {
  console.error(`${BASE} did not answer with a chain id. Is the server running?`);
  process.exit(1);
}

const atom = atomIdOf(target, chainId);
if (atom === null) {
  console.error(`${target} is neither an atom id nor a tool URL catalogued on chain ${chainId}.`);
  process.exit(1);
}

// One off-chain signature, so the receipt can name who asked. The caller supplies the nonce, which
// is what makes a replayed request the same receipt rather than a second one.
const rawKey = process.env['ARP_AGENT_PRIVATE_KEY']?.trim();
const nonce = keccak256(stringToBytes(`${atom}-${Date.now()}`));
let query = `nonce=${nonce}`;
if (rawKey !== undefined && rawKey.length > 0) {
  // The cast adds the `0x` prefix viem's type wants. `privateKeyToAccount` throws on anything that
  // is not a key, which is the validation — asserting the shape here would only move the error.
  const account = privateKeyToAccount((rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as Hex);
  const signature = await account.signTypedData(contentRequestTypedData(atom, nonce, chainId));
  query += `&by=${account.address}&sig=${signature}`;
}

const response = await fetch(`${BASE}/content/${atom}?${query}`);
if (!response.ok) {
  const body = (await response.json()) as { error?: string; reason?: string };
  console.error(`${response.status} ${body.error ?? ''} — ${body.reason ?? ''}`);
  process.exit(1);
}

const bytes = new Uint8Array(await response.arrayBuffer());
const header = response.headers.get('x-arp-receipt');
const signed = header === null ? null : (JSON.parse(header) as SignedContentReceipt);
// The receipt's own url first: it is what the server says it served, and the index is this repo's
// record of the same thing. They agree unless the catalogue is stale, and the receipt is the one
// under a signature.
const url = signed?.receipt.url ?? contentIndexFor(chainId).get(atom) ?? target;
const ref = skillRefFromUrl(url);

const out = arg('out') ?? `.arp/skills/${ref?.skill ?? atom}/SKILL.md`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);

console.log(`tool      ${ref === null ? url : `${ref.repo} ?skill=${ref.skill}`}`);
console.log(`path      ${response.headers.get('x-arp-path')}`);
console.log(`bytes     ${bytes.byteLength}  →  ${out}`);

if (signed === null) {
  console.log('receipt   none — the server is running without a signing key');
  process.exit(0);
}

const verdict = await verifyContentReceipt(signed);
const matches = receiptMatchesContent(signed.receipt, bytes);
console.log(
  `signature ${verdict.status}${verdict.status === 'valid' ? ` by ${verdict.signer}` : ''}`,
);
console.log(
  `digest    ${matches ? 'matches the bytes' : 'DOES NOT MATCH'}  ${signed.receipt.digest}`,
);
console.log(`served to ${signed.receipt.to ?? '(nobody — no key was given)'}`);

// A receipt that does not hold is not recorded. The bytes stay, because the agent asked for them;
// what is refused is writing down a corroboration that is not one.
if (verdict.status !== 'valid' || !matches) {
  console.error('\nthe receipt did not verify, so nothing was recorded for the hook to read.');
  process.exit(1);
}

if (ref === null) {
  console.log('\nnot a repository-and-skill URL, so there is no name for the hook to match.');
  process.exit(0);
}

mkdirSync(dirname(RECEIPTS), { recursive: true });
appendFileSync(
  RECEIPTS,
  `${JSON.stringify({
    skill: ref.skill,
    atom: signed.receipt.atom,
    url: signed.receipt.url,
    at: new Date(signed.receipt.servedAt * 1000).toISOString(),
    path: signed.receipt.path,
    digest: signed.receipt.digest,
    node: signed.node,
    to: signed.receipt.to,
    receipt: signed,
  })}\n`,
);
console.log(`\nrecorded in ${RECEIPTS} — the hook can now name this atom for \`${ref.skill}\`.`);

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
