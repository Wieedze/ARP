import type {Address} from "viem";
import {intuitionMainnet} from "@arp-protocol/core";

/**
 * Intuition **mainnet** (chain 1155) — the network the ERC-8004 agent cohort and its
 * `has trust provider` vaults actually live on.
 *
 * ## What is left here, and what moved
 *
 * This module was the mainnet half of a two-world app: a read client, an explorer helper and the
 * constants, kept apart from `lib/deployments.ts` "so a mainnet read can never be served from a
 * testnet constant by accident, and so that grepping for `intuition-mainnet` finds every place real
 * value is at stake".
 *
 * That separation did its job and has been superseded by a better one. `lib/chain-choice.ts` now
 * holds **both** worlds as data and hands the selected one to every read and every write, so the
 * place real value is at stake is no longer a grep for a module name — it is `isMainnet` on the
 * chain a quote was priced against, which the quote carries and the confirmation step prints.
 *
 * So the client and the two URL helpers are gone: a client pinned to one chain is exactly what the
 * toggle exists to remove, and `chain.explorerUrl` replaces `mainnetTxUrl`/`mainnetAddressUrl`.
 * What remains is the three constants, which `chain-choice` composes and the tests assert against.
 *
 * `intuitionMainnet` is re-exported from `@arp-protocol/core` rather than redefined — one chain
 * definition, one source of truth.
 */
export {intuitionMainnet};

/** Intuition's MultiVault on mainnet. Atoms, triples, bonding curves, deposits. */
export const INTUITION_MAINNET_MULTIVAULT: Address = "0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e";

export const INTUITION_MAINNET_CHAIN_ID = 1155;

export const INTUITION_MAINNET_EXPLORER = "https://explorer.intuition.systems";
