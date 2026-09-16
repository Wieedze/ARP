import {createPublicClient, http, type Address} from "viem";
import {intuitionMainnet} from "@arp-protocol/sdk";

/**
 * Intuition **mainnet** (chain 1155) — the network the ERC-8004 agent cohort
 * and its `has trust provider` vaults actually live on.
 *
 * ARP's own contracts are on Intuition **testnet** (13579, see
 * `lib/deployments.ts`). The two are deliberately kept in separate modules so a
 * mainnet read can never be served from a testnet constant by accident, and so
 * that grepping for `intuition-mainnet` finds every place real value is at
 * stake. ADR 0017 authorises deposits into existing vaults here and nothing
 * else.
 *
 * `intuitionMainnet` is re-exported from `@arp-protocol/sdk` rather than
 * redefined — one chain definition, one source of truth.
 */
export {intuitionMainnet};

/** Intuition's MultiVault on mainnet. Atoms, triples, bonding curves, deposits. */
export const INTUITION_MAINNET_MULTIVAULT: Address = "0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e";

export const INTUITION_MAINNET_CHAIN_ID = 1155;

export const INTUITION_MAINNET_EXPLORER = "https://explorer.intuition.systems";

/**
 * Read-only client for mainnet. Every panel read goes through this, regardless
 * of which chain the user's wallet is connected to — the panel is a mainnet
 * view and stays one even while the wallet sits on testnet.
 */
export const intuitionMainnetClient = createPublicClient({
    chain: intuitionMainnet,
    transport: http(),
});

/** `https://explorer.intuition.systems/tx/0x…` */
export function mainnetTxUrl(hash: string): string {
    return `${INTUITION_MAINNET_EXPLORER}/tx/${hash}`;
}

/** `https://explorer.intuition.systems/address/0x…` */
export function mainnetAddressUrl(address: string): string {
    return `${INTUITION_MAINNET_EXPLORER}/address/${address}`;
}
