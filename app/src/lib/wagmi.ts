import {createConfig, http} from "wagmi";
import {injected, walletConnect} from "wagmi/connectors";

import {intuitionTestnet} from "./chains";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

/**
 * Wagmi v3 config bound to Intuition Testnet.
 *
 * Connectors:
 *   - `injected()` — covers MetaMask browser extension and any other
 *     `window.ethereum` provider. Always enabled.
 *   - `walletConnect({ projectId })` — only registered if a project ID is
 *     set via `VITE_WALLETCONNECT_PROJECT_ID`. Without one, WalletConnect
 *     is silently dropped (MetaMask-only mode for dev).
 *
 * The single-chain config is intentional. The pivot brief (`docs/00_HACKATHON_PIVOT.md`)
 * scopes the whole hackathon to Intuition Testnet; multi-chain support is
 * explicitly out of MVP scope.
 */
export const wagmiConfig = createConfig({
    chains: [intuitionTestnet],
    transports: {
        [intuitionTestnet.id]: http(),
    },
    connectors: [
        injected(),
        ...(projectId ? [walletConnect({projectId, showQrModal: true})] : []),
    ],
});

declare module "wagmi" {
    interface Register {
        config: typeof wagmiConfig;
    }
}
