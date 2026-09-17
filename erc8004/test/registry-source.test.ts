import {custom} from "viem";
import {describe, expect, it} from "vitest";

import {resolveRef} from "../src/caip.js";
import {createErc8004Client} from "../src/client.js";
import {isRecord} from "../src/json.js";
import {getAgentProfile, marketCapableSources, resolveAgent} from "../src/profile.js";
import {erc8004RegistrySource, SUPPORTED_CHAINS} from "../src/sources/erc8004-registry/index.js";
import {fixture, recordedEthCall} from "./helpers.js";

function recordedRegistrySource() {
    const recorded = fixture("registry-base.json");
    if (!isRecord(recorded)) throw new Error("registry fixture is not an object");
    const calls: Record<string, {ownerOf: unknown; tokenURI: unknown}> = {};
    for (const [key, value] of Object.entries(recorded)) {
        if (!isRecord(value)) continue;
        calls[key] = {ownerOf: value["ownerOf"], tokenURI: value["tokenURI"]};
    }
    return erc8004RegistrySource({
        transports: {8453: custom({request: recordedEthCall(calls)})},
    });
}

const CLAWNCH = resolveRef({chainId: 8453, tokenId: "2340"});
const ABSENT = resolveRef({chainId: 8453, tokenId: "999999999"});

describe("erc8004RegistrySource", () => {
    it("resolves an agent straight from the registry contract", async () => {
        const identity = await recordedRegistrySource().resolveAgent(CLAWNCH);
        expect(identity?.owner).toBe("0x729a121c347cd89C14f5FF9CD289cA8c70B1de1d");
        expect(identity?.caip19).toBe(
            "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/2340",
        );
        expect(identity?.provenance.sourceId).toBe("erc8004-registry");
    });

    it("exposes the registration file URI without parsing it", async () => {
        const identity = await recordedRegistrySource().resolveAgent(CLAWNCH);
        expect(identity?.registrationFile?.startsWith("data:application/json;base64,")).toBe(true);
        // Parsing it into capabilities is a later phase. Nothing is inferred here.
        expect(identity?.metadata).toEqual({
            name: null,
            description: null,
            image: null,
            url: null,
            isFallback: false,
        });
    });

    it("returns null for a token id that was never minted", async () => {
        await expect(recordedRegistrySource().resolveAgent(ABSENT)).resolves.toBeNull();
    });

    it("returns null for a chain whose registry it cannot reach", async () => {
        const ref = resolveRef({chainId: 137, tokenId: "1"});
        await expect(recordedRegistrySource().resolveAgent(ref)).resolves.toBeNull();
    });

    it("covers the three chains the ERC-8004 registry is deployed on", () => {
        expect(
            Object.keys(SUPPORTED_CHAINS)
                .map(Number)
                .sort((a, b) => a - b),
        ).toEqual([1, 56, 8453]);
    });

    it("declares no trust claims and no capabilities, rather than inventing empty ones", async () => {
        const source = recordedRegistrySource();
        await expect(source.getAssessments(CLAWNCH)).resolves.toEqual([]);
        const capabilities = await source.getCapabilities(CLAWNCH);
        expect(capabilities.types).toEqual([]);
        expect(capabilities.provenance.note).toContain("registration file");
    });

    it("implements no getMarkets, because a registry has no market", () => {
        expect(recordedRegistrySource().getMarkets).toBeUndefined();
    });
});

describe("portability — a client with Intuition removed entirely", () => {
    // The point of the source split. If this passes, the claim that Intuition is
    // a substrate rather than a dependency is tested rather than asserted.
    const registryOnlyClient = () =>
        createErc8004Client({
            sources: [recordedRegistrySource()],
            fetch: async () => {
                throw new Error("a registry-only client must not make an HTTP request");
            },
        });

    it("still resolves an agent", async () => {
        const identity = await resolveAgent(registryOnlyClient(), {
            chainId: 8453,
            tokenId: "2340",
        });
        expect(identity?.owner).toBe("0x729a121c347cd89C14f5FF9CD289cA8c70B1de1d");
        expect(identity?.provenance.sourceId).toBe("erc8004-registry");
    });

    it("still builds a profile, and says plainly that no source here can see stake", async () => {
        const client = registryOnlyClient();
        const profile = await getAgentProfile(client, {chainId: 8453, tokenId: "2340"});

        expect(profile.sourcesConsulted).toEqual(["erc8004-registry"]);
        expect(profile.identity?.registrationFile).toBeTruthy();
        expect(profile.assessments).toEqual([]);
        expect(profile.markets).toEqual([]);
        expect(profile.sourceErrors).toEqual([]);
        // Empty markets means something different here than on a graph-backed
        // client: not "nobody staked", but "nothing configured can see stake".
        expect(profile.marketCapableSources).toEqual([]);
        expect(marketCapableSources(client)).toEqual([]);
    });
});
