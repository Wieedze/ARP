import {
    createErc8004Client,
    erc8004RegistrySource,
    getAgentProfile,
    INTUITION_MAINNET_GRAPHQL,
    intuitionSource,
    type AgentProfile,
    type AgentRef,
    type Erc8004Client,
} from "@arp-protocol/erc8004";

/**
 * The app's single `Erc8004Client`.
 *
 * Pinned to Intuition **mainnet** on purpose. `deployments.chain.graphqlUrl` is
 * the testnet indexer and it does not mirror the ERC-8004 cohort — reading the
 * panel through it would render an empty graph and call it an answer. The panel
 * is a mainnet view; the wallet's connected chain has no bearing on it.
 *
 * Both default sources are kept:
 *
 *   - `intuitionSource` — trust claims, capabilities and the only markets.
 *   - `erc8004RegistrySource` — the registry contract itself, which is where
 *     `owner` and the raw `registrationFile` come from. Its failure lands in
 *     `profile.sourceErrors` rather than taking the profile down.
 */
export const ERC8004_GRAPHQL_URL = INTUITION_MAINNET_GRAPHQL;

let cached: Erc8004Client | null = null;

export function erc8004Client(): Erc8004Client {
    if (cached === null) {
        cached = createErc8004Client({
            sources: [intuitionSource({graphqlUrl: ERC8004_GRAPHQL_URL}), erc8004RegistrySource()],
        });
    }
    return cached;
}

/**
 * Fetch one agent's merged profile.
 *
 * Never throws for "this agent does not exist" — that comes back as a profile
 * whose `identity` is `null`. It *does* throw when every source failed at a
 * step, which is a different thing and the caller should say so.
 */
export function fetchAgentProfile(ref: AgentRef, client = erc8004Client()): Promise<AgentProfile> {
    return getAgentProfile(client, ref);
}
