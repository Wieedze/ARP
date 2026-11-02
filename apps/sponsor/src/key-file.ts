/** Where the treasury key comes from, and the one chain this service runs on.
 *
 *  **A 0600 file, never the key itself in an environment variable** (ADR `0089` §3, task 37c). The
 *  environment names the file; the file holds the key. An environment is inherited by every child
 *  process and printed by every crash reporter that dumps it; a file readable by its owner alone is
 *  not. The policy is the one every ARP key file follows, `readKeyFile` in `@arp-protocol/core/node`
 *  (ADR `0116`): the mode is checked before the file is read, so a key left world-readable is
 *  refused without ever being loaded, and the error never includes the file's content.
 */
export { KeyFileError, readKeyFile } from '@arp-protocol/core/node';

/** Intuition testnet. ADR `0092` item 1 and ADR `0094`: the service is testnet-only until a new ADR. */
export const SPONSOR_CHAIN_ID = 13579;

/** Refuse any chain but testnet 13579, whatever the RPC answers. */
export function assertSponsorChain(chainId: number): void {
  if (chainId !== SPONSOR_CHAIN_ID) {
    throw new Error(
      `the sponsoring service runs on testnet ${SPONSOR_CHAIN_ID} only; the RPC is on chain ${chainId}`,
    );
  }
}
