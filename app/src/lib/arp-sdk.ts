import {createArpClient, type ArpClient} from "@arp-protocol/core";

import {publicClient} from "./clients";
import {intuitionTestnet} from "./chains";
import {deployments} from "./deployments";

/**
 * The app's shared `@arp-protocol/core` client instance, reusing the existing
 * `publicClient` from the app layer so RPC config + caching live in
 * one place. Hooks and components that need read access to the trust
 * layer import this and call SDK functions directly — proving the SDK
 * works for any consumer, not just the hand-rolled hooks.
 */
export const arpClient: ArpClient = createArpClient({
    publicClient,
    deployment: {
        chain: intuitionTestnet,
        identityRegistry: deployments.arp.identityRegistry,
        moduleRegistry: deployments.arp.moduleRegistry,
        multiVault: deployments.intuition.multiVault,
    },
});
