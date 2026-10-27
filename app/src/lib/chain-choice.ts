import {createContext, useContext} from "react";
import {createPublicClient, http, type Address, type Chain, type PublicClient} from "viem";

import {intuitionTestnet} from "./chains";
import {deployments} from "./deployments";
import {
    INTUITION_MAINNET_EXPLORER,
    INTUITION_MAINNET_MULTIVAULT,
    intuitionMainnet,
} from "./intuition-mainnet";

/**
 * Which Intuition chain the **reads** on this page come from.
 *
 * ## Why this exists
 *
 * The app read mainnet everywhere while ARP's own loop ran on testnet, so it could not see its own
 * work: three `uses` edges with identified ERC-8004 subjects were written on 13579 on 2026-10-20 —
 * including one agent rating another — and every surface showed empty. The emptiness was a wrong
 * pointer, not missing data (user, 2026-10-27).
 *
 * ## What it does and does not switch
 *
 * **Reads only.** Every write path keeps its own explicit chain and its own guard: `trust-stake.ts`
 * still asserts the wallet is on mainnet before building a deposit, the registration flow still
 * targets ARP's testnet registry, and nothing here can move either of them. That separation is
 * deliberate and is why `lib/intuition-mainnet.ts` exists as its own module — "so a mainnet read can
 * never be served from a testnet constant by accident". A toggle the user operates is not an
 * accident; a toggle that silently re-aimed a signature would be.
 *
 * ## The trap, named because it is invisible
 *
 * **Every cached read must carry the chain in its query key.** Without it, switching serves the
 * other chain's answer from cache and the page shows testnet figures under a mainnet label — the
 * one-number-one-context failure (`rules/claims.md` §2) in its UI form. The hooks take `graphqlUrl`
 * and `chainId` from here and both go in the key.
 */

export type ChainChoice = {
    chain: Chain;
    chainId: number;
    /** Where graph reads go. */
    graphqlUrl: string;
    /** The MultiVault on this chain. Addresses differ; a default would be a chain constant. */
    multiVault: Address;
    explorerUrl: string;
    label: string;
    /** The native token's symbol — TRUST on 1155, tTRUST on 13579. Shown beside every amount. */
    symbol: string;
    isMainnet: boolean;
    /** A read-only client for this chain, memoised so hooks do not build one per render. */
    client: PublicClient;
};

const MAINNET_GRAPHQL = "https://mainnet.intuition.sh/v1/graphql";
const TESTNET_GRAPHQL = "https://testnet.intuition.sh/v1/graphql";

export function choiceFor(isMainnet: boolean): ChainChoice {
    return isMainnet
        ? {
              chain: intuitionMainnet,
              chainId: intuitionMainnet.id,
              graphqlUrl: MAINNET_GRAPHQL,
              multiVault: INTUITION_MAINNET_MULTIVAULT,
              explorerUrl: INTUITION_MAINNET_EXPLORER,
              label: "Mainnet",
              symbol: "TRUST",
              isMainnet: true,
              client: createPublicClient({chain: intuitionMainnet, transport: http()}),
          }
        : {
              chain: intuitionTestnet,
              chainId: intuitionTestnet.id,
              graphqlUrl: TESTNET_GRAPHQL,
              multiVault: deployments.intuition.multiVault,
              explorerUrl: deployments.chain.explorerUrl,
              label: "Testnet",
              symbol: "tTRUST",
              isMainnet: false,
              client: createPublicClient({chain: intuitionTestnet, transport: http()}),
          };
}

export const CHAIN_STORAGE_KEY = "arp.chain.v1";

/**
 * Mainnet by default.
 *
 * The cohort is there — 30,913 identities against 768 on testnet, measured 2026-10-27 — so a first
 * visit should land on the populated chain. A reader who wants to watch ARP's own loop switches,
 * which is the deliberate act the module note is about.
 */
export function readStored(): boolean {
    if (typeof localStorage === "undefined") return true;
    try {
        return localStorage.getItem(CHAIN_STORAGE_KEY) !== "testnet";
    } catch {
        // Private windows and blocked site data throw on access. Default rather than crash.
        return true;
    }
}

export type ChainChoiceValue = {choice: ChainChoice; setMainnet: (next: boolean) => void};

export const ChainChoiceContext = createContext<ChainChoiceValue | null>(null);

/** The chain this page reads from. Throws outside the provider rather than defaulting to one. */
export function useChainChoice(): ChainChoice {
    const context = useContext(ChainChoiceContext);
    if (context === null) throw new Error("useChainChoice: no ChainChoiceProvider above this");
    return context.choice;
}

export function useSetChain(): (isMainnet: boolean) => void {
    const context = useContext(ChainChoiceContext);
    if (context === null) throw new Error("useSetChain: no ChainChoiceProvider above this");
    return context.setMainnet;
}
