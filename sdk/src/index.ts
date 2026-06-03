/**
 * `@arp/sdk` — runtime-agnostic discovery + reputation reads for the
 * Agent Reputation Protocol on Intuition Testnet.
 *
 * Quick start:
 *
 *     import { createArpClient, findTopAgents, getReputation } from "@arp/sdk";
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
    DEFAULT_DEPLOYMENT,
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

export {
    getAgents,
    getLiveAgents,
    getReputation,
    findTopAgents,
} from "./agents.js";

export type {
    Module,
    ModuleWithMetrics,
    Agent,
    AgentReputation,
    AgentWithReputation,
    FindTopAgentsOptions,
} from "./types.js";
