import {describe, expect, it} from "vitest";

import {deployments} from "../../lib/deployments";
import {
    INTUITION_MAINNET_CHAIN_ID,
    INTUITION_MAINNET_MULTIVAULT,
} from "../../lib/intuition-mainnet";
import {ERC8004_GRAPHQL_URL, erc8004Client} from "../erc8004-connector";

/**
 * The panel reads mainnet while every ARP contract stays on testnet. These
 * assertions exist because the failure is silent: pointed at the testnet
 * indexer the panel would render an empty graph and present it as an answer.
 */
describe("erc8004 connector configuration", () => {
    it("reads the Intuition mainnet indexer", () => {
        expect(ERC8004_GRAPHQL_URL).toBe("https://mainnet.intuition.sh/v1/graphql");
    });

    it("is not the testnet indexer ARP's own contracts are indexed by", () => {
        expect(ERC8004_GRAPHQL_URL).not.toBe(deployments.chain.graphqlUrl);
        expect(deployments.chain.chainId).not.toBe(INTUITION_MAINNET_CHAIN_ID);
    });

    it("stakes against the mainnet MultiVault, not the testnet one", () => {
        expect(INTUITION_MAINNET_MULTIVAULT).toBe("0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e");
        expect(INTUITION_MAINNET_MULTIVAULT).not.toBe(deployments.intuition.multiVault);
    });

    it("consults the graph first and the registry contract second", () => {
        const client = erc8004Client();
        expect(client.sources.map((source) => source.id)).toEqual([
            "intuition",
            "erc8004-registry",
        ]);
    });

    it("reuses one client rather than rebuilding a transport per read", () => {
        expect(erc8004Client()).toBe(erc8004Client());
    });
});
