import {getWalletClient} from "@wagmi/core";

import {wagmiConfig} from "../lib/wagmi";

/**
 * The wallet's own client, requested **without pinning a chain id**.
 *
 * A client built for one chain reports that chain whatever the wallet is really doing. Every write
 * path here checks the wallet's own `eth_chainId` against mainnet before it builds anything, and it
 * can only do that if the client it is handed tells the truth.
 *
 * Extracted from `use-agent-import.ts` when the second caller appeared, rather than copied: the
 * no-pinned-chain property is the whole point of the function, and a copy is where it would quietly
 * stop being true in one of them.
 */
export async function connectedWalletClient() {
    const walletClient = await getWalletClient(wagmiConfig);
    if (walletClient === null || walletClient.account === undefined) {
        throw new Error("No wallet client — reconnect your wallet and try again.");
    }
    return walletClient;
}
