import {
    createErc8004Client,
    erc8004RegistrySource,
    getAgentProfile,
    INTUITION_MAINNET_GRAPHQL,
    intuitionSource,
    listAgents,
    type AgentPage,
    type AgentProfile,
    type AgentRef,
    type Erc8004Client,
    type ListAgentsOptions,
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

/**
 * Clients are cached per bonding curve, not globally.
 *
 * The market numbers this client reads are filtered to one curve, and the vault
 * a stake is deposited into is chosen by `defaultCurveId` read from
 * `getBondingCurveConfig()`. Those have to be the same curve or the panel shows
 * one market beside a position in another. Passing `undefined` uses the
 * package's default, which is what the first render does before the chain read
 * lands — on mainnet today both are `1`, so that render is already correct and
 * the key never changes.
 */
const clients = new Map<string, Erc8004Client>();

export function erc8004Client(curveId?: bigint): Erc8004Client {
    const key = curveId === undefined ? "default" : curveId.toString();
    const existing = clients.get(key);
    if (existing !== undefined) return existing;

    const client = createErc8004Client({
        sources: [
            intuitionSource({
                graphqlUrl: ERC8004_GRAPHQL_URL,
                ...(curveId === undefined ? {} : {curveId}),
            }),
            erc8004RegistrySource(),
        ],
    });
    clients.set(key, client);
    return client;
}

/**
 * Fetch one agent's merged profile.
 *
 * Never throws for "this agent does not exist" — that comes back as a profile
 * whose `identity` is `null`. It *does* throw when every source failed at a
 * step, which is a different thing and the caller should say so.
 */
export function fetchAgentProfile(
    ref: AgentRef,
    curveId?: bigint,
    client = erc8004Client(curveId),
): Promise<AgentProfile> {
    return getAgentProfile(client, ref);
}

/**
 * Fetch one page of the ERC-8004 cohort.
 *
 * No curve is passed, and that is deliberate rather than an omission: a listing
 * row shows the market on the agent's *own* atom summed across every bonding
 * curve, so there is no single curve to filter to. The panel, which does read
 * one curve, takes the one the chain reports.
 *
 * Throws when no source could produce a page. An empty page and a failed read
 * are different answers and the caller renders them differently.
 */
export function fetchAgentCohort(
    options: ListAgentsOptions,
    client = erc8004Client(),
): Promise<AgentPage> {
    return listAgents(client, options);
}
