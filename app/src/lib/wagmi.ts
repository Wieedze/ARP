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
 * Two chains, and the order matters. Intuition **testnet** (13579) is first
 * and is where every ARP contract lives — registering a module, an agent or a
 * delegation all happen there. Intuition **mainnet** (1155) is here only so the
 * trust panel can request a network switch and sign a deposit into an existing
 * MultiVault vault (ADR 0017). No ARP contract is deployed on 1155 and none is
 * addressed from it.
 *
 * Every `writeContract` in the app names its chain explicitly, so a wallet
 * parked on the wrong network is caught by viem before a transaction is built
 * rather than after.
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
