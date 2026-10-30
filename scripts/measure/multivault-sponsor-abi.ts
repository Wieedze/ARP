/** Does the MultiVault deployed on 13579 have the two calls the sponsoring service relies on?
 *
 *  `docs/tasks/40` 40a: "Re-read the deployed MultiVault ABI on 13579 first." The facts in
 *  `packages/protocol/src/sponsor/approval.ts` were read from a local `intuition-contracts-v2`
 *  checkout; this reads them off the chain.
 *
 *      bun run scripts/measure/multivault-sponsor-abi.ts
 *
 *  **Read-only.** `eth_getCode`, `eth_getStorageAt` and `eth_call`. An `eth_call` executes against
 *  a copy of the state and is never broadcast, so nothing here is a transaction and no key is read.
 *  The two accounts below are arbitrary addresses that hold nothing and sign nothing.
 *
 *  What it checks, and why each one:
 *
 *  1. The address is a proxy, and the implementation behind it carries both selectors. A selector
 *     is pushed as `PUSH4 <selector>` (`0x63…`) by the dispatcher, so its presence in the runtime
 *     code is the ABI's presence.
 *  2. `approve(address,uint8)` from A for B, with `1` (`DEPOSIT`), executes. With `A == B` it reverts
 *     (`MultiVault.sol:362`'s self-approval check), and with `4` it reverts, because `ApprovalTypes`
 *     has four members (`NONE, DEPOSIT, REDEMPTION, BOTH`) and Solidity range-checks an enum.
 *  3. `deposit(address,bytes32,uint256,uint256)` from A for B, without an approval, reverts. With
 *     `A == B` the approval check passes and the call fails later, for another reason, which is the
 *     `sender == receiver` branch of `_isApprovedToDeposit`.
 *
 *  The revert data is printed raw, so a reader can decode it against the ABI themselves.
 *
 *  The addresses come from `data/deployments/13579.json`, not from this file (`claims.md` §5).
 */
import { readFileSync } from 'node:fs';

import {
  createPublicClient,
  encodeFunctionData,
  http,
  parseAbi,
  toFunctionSelector,
  type Address,
  type Hex,
} from 'viem';

type Deployment = {
  chain: { chainId: number; rpcUrl: string };
  intuition: { multiVault: Address };
};

const file = JSON.parse(readFileSync('data/deployments/13579.json', 'utf8')) as Deployment; // This repo's own record.
const client = createPublicClient({ transport: http(file.chain.rpcUrl) });

const A: Address = '0x000000000000000000000000000000000000a11c';
const B: Address = '0x000000000000000000000000000000000000b0b0';
const TERM: Hex = `0x${'00'.repeat(32)}`;

const abi = parseAbi([
  'function approve(address sender, uint8 approvalType)',
  'function deposit(address receiver, bytes32 termId, uint256 curveId, uint256 minShares) payable returns (uint256)',
]);

/** The errors the calls above can hit, named as `intuition-contracts-v2` declares them. A selector is
 *  matched, not assumed: an unmatched revert prints as bare. */
const ERRORS = [
  'MultiVault_CannotApproveOrRevokeSelf()',
  'MultiVault_SenderNotApproved()',
  'MultiVault_DepositBelowMinimumDeposit()',
  'MultiVault_TermDoesNotExist(bytes32)',
];

/** EIP-1967 `bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)`. */
const IMPLEMENTATION_SLOT: Hex =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

/** Raw `eth_call`, so the revert data comes back as the node returned it, undecoded. */
async function simulate(from: Address, data: Hex): Promise<string> {
  const reply = await fetch(file.chain.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ from, to: file.intuition.multiVault, data }, 'latest'],
    }),
  });
  // A JSON-RPC reply: `result` on success, `error` with optional revert `data` on failure.
  const json = (await reply.json()) as {
    result?: Hex;
    error?: { message?: string; data?: unknown };
  };
  if (json.error === undefined) return `executes, returns ${json.result ?? '0x'}`;
  const revert = typeof json.error.data === 'string' ? json.error.data : '0x';
  const named = ERRORS.find((e) => toFunctionSelector(e) === revert.slice(0, 10));
  return `reverts ${revert}${named === undefined ? ' (no named error: a bare revert)' : ` = ${named}`}`;
}

const chainId = await client.getChainId();
const proxyCode = (await client.getCode({ address: file.intuition.multiVault })) ?? '0x';
const slot = (await client.getStorageAt({
  address: file.intuition.multiVault,
  slot: IMPLEMENTATION_SLOT,
})) as Hex;
const implementation: Address = `0x${slot.slice(-40)}`;
const implCode = (await client.getCode({ address: implementation })) ?? '0x';
const block = await client.getBlockNumber();

const selectors = {
  'approve(address,uint8)': toFunctionSelector('approve(address,uint8)'),
  'deposit(address,bytes32,uint256,uint256)': toFunctionSelector(
    'deposit(address,bytes32,uint256,uint256)',
  ),
};

const result = {
  measuredAt: new Date().toISOString(),
  chainId,
  block: block.toString(),
  multiVault: file.intuition.multiVault,
  proxyCodeBytes: (proxyCode.length - 2) / 2,
  implementation,
  implementationCodeBytes: (implCode.length - 2) / 2,
  selectorsInImplementation: Object.fromEntries(
    Object.entries(selectors).map(([signature, selector]) => [
      signature,
      { selector, present: implCode.toLowerCase().includes(`63${selector.slice(2)}`) },
    ]),
  ),
  calls: {
    'approve(B, 1) from A': await simulate(
      A,
      encodeFunctionData({ abi, functionName: 'approve', args: [B, 1] }),
    ),
    'approve(A, 1) from A': await simulate(
      A,
      encodeFunctionData({ abi, functionName: 'approve', args: [A, 1] }),
    ),
    'approve(B, 4) from A': await simulate(
      A,
      encodeFunctionData({ abi, functionName: 'approve', args: [B, 4] }),
    ),
    'deposit(B, 0x00…, 1, 0) from A, no approval': await simulate(
      A,
      encodeFunctionData({ abi, functionName: 'deposit', args: [B, TERM, 1n, 0n] }),
    ),
    'deposit(A, 0x00…, 1, 0) from A': await simulate(
      A,
      encodeFunctionData({ abi, functionName: 'deposit', args: [A, TERM, 1n, 0n] }),
    ),
  },
};

console.log(JSON.stringify(result, null, 2));
