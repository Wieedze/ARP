/**
 * ARP's **own** contracts — the ModuleRegistry catalogue and the agents registered against it.
 *
 * Folded in from the separate `@arp-protocol/sdk` package on 2026-10-19 (ADR `0041`). Two
 * read-only client packages over the same chains, with no written boundary between them, was the
 * thing nobody could navigate. This namespace is the boundary: everything under `arp/` reads
 * **ARP's** deployment, and everything outside it reads the ERC-8004 and Intuition layers that
 * exist whether or not ARP does.
 *
 * Quick start:
 *
 *     import { createArpClient, findTopAgents, getReputation } from "@arp-protocol/core";
 *
 *     const arp = createArpClient();
 *     const top = await findTopAgents(arp, { domain: "solidity-audit" });
 *     console.log(top[0]);
 *     // → { agentId: 1n, runtimeWallet: "0x…", reputation: { totalStaked: 5000n, … } }
 *
 * All functions are read-only — the SDK never signs or sends
 * transactions. Plug it into any agent runtime to make trust-aware
 * decisions about which tools / agents to compose with.
 */

export {
    createArpClient,
    intuitionTestnet,
    intuitionMainnet,
    TESTNET_DEPLOYMENT,
    type ArpClient,
    type ArpClientConfig,
    type ArpDeployment,
} from "./client.js";

export {
    getAllModules,
    getModulesByDomain,
    findModuleBySchemaURI,
    getAllModulesWithMetrics,
    getModulesByDomainWithMetrics,
} from "./modules.js";

export {getAgents, getLiveAgents, getReputation, findTopAgents} from "./agents.js";

export type {
    Module,
    ModuleWithMetrics,
    Agent,
    AgentReputation,
    AgentWithReputation,
    FindTopAgentsOptions,
} from "./types.js";
