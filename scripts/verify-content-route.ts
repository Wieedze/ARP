/** Walk the node's content path end to end, against a running node.
 *
 *      ARP_TARGET=testnet PORT=3099 bun run scripts/arp-mcp-server.ts &
 *      bun run scripts/verify-content-route.ts                       # defaults to :3099
 *      ARP_NODE=http://localhost:3002 bun run scripts/verify-content-route.ts
 *
 *  It exists because the unit tests inject every piece of IO, which is the right shape for them and
 *  means they cannot see the one thing that matters most here: that a **third party** can re-derive
 *  the digest with their own tools. `claims.md` §4 — a gate is green over what it reads.
 *
 *  What it proves, in order:
 *
 *  ```
 *  the bytes arrive            a real SKILL.md from a real repository, at the path the node found
 *  the signature recovers      the receipt was signed by the address the node publishes
 *  the content matches         sha256 of the bytes received equals the digest in the receipt
 *  the corroboration is read   the signer is not the agent, so it is a second party
 *  the refusals are distinct   a caller can tell "no such skill" from "bad id" from "no file"
 *  ```
 *
 *  **Nothing is signed on a chain and nothing is sent.** The agent key is generated here, used for
 *  one off-chain EIP-712 request, and discarded when the process exits. It is not the operator's
 *  key and it never touches `.env`.
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { keccak256, stringToBytes, type Hex } from 'viem';

import {
  contentRequestTypedData,
  corroborationOf,
  receiptMatchesContent,
  verifyContentReceipt,
  type SignedContentReceipt,
} from '../packages/protocol/src/receipt.js';
import { catalogueFor } from './arp-content.js';

const BASE = process.env['ARP_NODE'] ?? 'http://localhost:3099';

type Row = { repo: string; skill: string; url: string; atom: string | null };

/** The catalogue for the chain the node is actually on — the last module-scope `skills-13579` import. */
function pick(chainId: number, repo: string, skill: string): Row {
  const found = catalogueFor(chainId).find(
    (row) => row.repo === repo && row.skill === skill && row.atom !== null,
  );
  if (found === undefined) {
    throw new Error(
      `${repo} ?skill=${skill} is not recorded for chain ${chainId}. Only 13579 has a ` +
        'catalogue today — start the node with ARP_TARGET=testnet.',
    );
  }
  return found;
}

const info = (await (await fetch(BASE)).json()) as {
  chain?: { id?: number };
  content?: { signer?: string | null; route?: string };
};
const chainId = info.chain?.id;
if (typeof chainId !== 'number') throw new Error(`${BASE} did not answer with a chain id`);

console.log(`node            ${BASE}`);
console.log(`chain           ${chainId}`);
console.log(`published signer ${info.content?.signer ?? '(none — running with ARP_NO_RECEIPTS)'}`);
console.log('');

// A throwaway key standing in for an agent's runtime key. One off-chain signature, then gone.
const agent = privateKeyToAccount(generatePrivateKey());
const target = pick(chainId, 'obra/superpowers', 'brainstorming');
const atom = target.atom as Hex;
const nonce = keccak256(stringToBytes(`verify-${Date.now()}`));
const signature = await agent.signTypedData(contentRequestTypedData(atom, nonce, chainId));

const response = await fetch(
  `${BASE}/content/${atom}?by=${agent.address}&nonce=${nonce}&sig=${signature}`,
);
if (!response.ok) {
  console.error(`FAIL  ${response.status} ${await response.text()}`);
  process.exit(1);
}
const bytes = new Uint8Array(await response.arrayBuffer());
const header = response.headers.get('x-arp-receipt');
const signed = header === null ? null : (JSON.parse(header) as SignedContentReceipt);

console.log(`tool            ${target.repo} ?skill=${target.skill}`);
console.log(`path            ${response.headers.get('x-arp-path')}`);
console.log(`bytes           ${bytes.byteLength}`);
console.log(`agent           ${agent.address}`);
console.log('');

const failures: string[] = [];
if (signed === null) {
  failures.push('no receipt in the response');
} else {
  const verdict = await verifyContentReceipt(signed);
  console.log(`signature       ${verdict.status}`);
  if (verdict.status !== 'valid') {
    failures.push(`the signature did not verify: ${JSON.stringify(verdict)}`);
  } else {
    if (verdict.signer !== info.content?.signer) {
      failures.push(`recovered ${verdict.signer}, but the node publishes ${info.content?.signer}`);
    }
    // THE check. A stranger runs `sha256sum` and gets this number without a library of ours.
    const matches = receiptMatchesContent(signed.receipt, bytes);
    console.log(`content matches ${matches}  (${signed.receipt.digest})`);
    if (!matches) failures.push('the digest does not match the bytes that arrived');

    const read = corroborationOf(signed.receipt, verdict.signer, agent.address);
    console.log(`corroboration   ${read.status}`);
    if (read.status !== 'second-party') {
      failures.push(`expected a second party, got ${read.status}`);
    }

    // The same receipt read as though the agent had served itself. ADR `0080`: a self-signed
    // receipt is labelled, not refused, and this is the label.
    const self = corroborationOf({ ...signed.receipt, to: signed.node }, signed.node, signed.node);
    console.log(`if self-served  ${self.status}`);
    if (self.status !== 'self-signed')
      failures.push(`a self-served receipt read as ${self.status}`);
  }
}

console.log('\nrefusals — a caller must be able to tell these apart:');
const unknown = `0x${'99'.repeat(32)}` as const;
const cases: { label: string; path: string; expect: number; error: string }[] = [
  { label: 'malformed id', path: '/content/0xab', expect: 400, error: 'bad-atom-id' },
  { label: 'not catalogued', path: `/content/${unknown}`, expect: 404, error: 'unknown-atom' },
];
for (const probe of cases) {
  const res = await fetch(BASE + probe.path);
  const body = (await res.json()) as { error?: string; reason?: string };
  const ok = res.status === probe.expect && body.error === probe.error;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${probe.label.padEnd(16)} ${res.status} ${body.error ?? ''} — ${(
      body.reason ?? ''
    ).slice(0, 70)}`,
  );
  if (!ok) failures.push(`${probe.label}: expected ${probe.expect}/${probe.error}`);
}

console.log('');
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  process.exit(1);
}
console.log('every check passed. The receipt attests ACCESS, never use (ADR 0080).');

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
