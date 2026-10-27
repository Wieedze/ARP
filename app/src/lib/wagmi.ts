import {createConfig, http} from "wagmi";
import {injected, walletConnect} from "wagmi/connectors";

import {intuitionTestnet} from "./chains";
import {intuitionMainnet} from "./intuition-mainnet";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

/**
 * Wagmi v3 config.
 *
 * Connectors:
 *   - `injected()` — covers MetaMask browser extension and any other
 *     `window.ethereum` provider. Always enabled.
 *   - `walletConnect({ projectId })` — only registered if a project ID is
 *     set via `VITE_WALLETCONNECT_PROJECT_ID`. Without one, WalletConnect
 *     is silently dropped (MetaMask-only mode for dev).
 *
 * Two chains, and both are first-class. Intuition **testnet** (13579) is where every ARP contract
 * lives — the `IdentityRegistry`, and the agent and delegation flows that depend on it. Intuition
 * **mainnet** (1155) is where the ERC-8004 cohort and its vaults are. No ARP contract is deployed
 * on 1155 and none is addressed from it.
 *
 * Mainnet used to be here "only so the trust panel can request a network switch". That is no longer
 * the shape: the chain toggle (`lib/chain-choice.ts`) picks either one for both reads and writes, so
 * either chain may be the one a wallet is asked to switch to. Testnet stays first in the array
 * because it is the safe default for a connector that ignores the explicit `chain` argument.
 *
 * Every `writeContract` in the app names its chain explicitly, so a wallet parked on the wrong
 * network is caught by viem before a transaction is built rather than after — and for anything on
 * the MultiVault the named chain comes off the **quote**, which is what the deposit was priced
 * against.
 */
export const wagmiConfig = createConfig({
    chains: [intuitionTestnet, intuitionMainnet],
    transports: {
        [intuitionTestnet.id]: http(),
        [intuitionMainnet.id]: http(),
    },
    connectors: [injected(), ...(projectId ? [walletConnect({projectId, showQrModal: true})] : [])],
});

declare module "wagmi" {
    interface Register {
        config: typeof wagmiConfig;
    }
}
