import {describe, expect, it} from "vitest";
import {
    decodeAbiParameters,
    keccak256,
    toBytes,
    toFunctionSelector,
} from "viem";

import {deployments} from "../deployments";
import {
    MULTI_VAULT_COMPOSE_SELECTORS,
    composeAndStakeCaveats,
    domainScopeCaveat,
    publishModuleCaveats,
    trustStakeCapCaveat,
} from "../caveat-builder";

const ARP = deployments.arp;

describe("domainScopeCaveat", () => {
    it("encodes the hashed allowed-domain list and binds to our enforcer", () => {
        const caveat = domainScopeCaveat(["solidity-audit", "code-review"]);
        expect(caveat.enforcer).toBe(ARP.domainScopeEnforcer);
        expect(caveat.args).toBe("0x");

        const [hashes] = decodeAbiParameters(
            [{type: "bytes32[]"}],
            caveat.terms,
        );
        expect(hashes).toEqual([
            keccak256(toBytes("solidity-audit")),
            keccak256(toBytes("code-review")),
        ]);
    });

    it("rejects an empty allowedDomains list", () => {
        expect(() => domainScopeCaveat([])).toThrow(/non-empty/);
    });
});

describe("trustStakeCapCaveat", () => {
    it("ABI-encodes (cap, period) and binds to our enforcer", () => {
        const cap = 10n ** 18n;
        const period = 86_400n;
        const caveat = trustStakeCapCaveat(cap, period);
        expect(caveat.enforcer).toBe(ARP.trustStakeCapEnforcer);
        const [decodedCap, decodedPeriod] = decodeAbiParameters(
            [{type: "uint256"}, {type: "uint256"}],
            caveat.terms,
        );
        expect(decodedCap).toBe(cap);
        expect(decodedPeriod).toBe(period);
    });

    it("rejects a zero periodSeconds (enforcer would revert on chain)", () => {
        expect(() => trustStakeCapCaveat(1n, 0n)).toThrow(/periodSeconds/);
    });
});

describe("composeAndStakeCaveats", () => {
    it("emits 3 caveats: AllowedTargets, AllowedMethods, TrustStakeCap", () => {
        const caveats = composeAndStakeCaveats({cap: 10n ** 18n, periodSeconds: 86_400n});
        expect(caveats).toHaveLength(3);
        // Third is our enforcer — addresses on the first two come from the
        // MetaMask environment, which we don't hard-code, but we can sanity
        // check by asserting their `terms` round-trip.
        expect(caveats[2].enforcer).toBe(ARP.trustStakeCapEnforcer);
    });

    it("locks the target list to the deployed MultiVault address", () => {
        const caveats = composeAndStakeCaveats({cap: 1n, periodSeconds: 1n});
        // AllowedTargets terms is a packed sequence of 20-byte addresses
        // without a length prefix. We expect exactly one address — the
        // MultiVault — which is 20 bytes = 40 hex chars + 0x.
        const targetsCaveat = caveats[0];
        expect(targetsCaveat.terms.length).toBe(2 + 40);
        expect(targetsCaveat.terms.toLowerCase()).toBe(
            deployments.intuition.multiVault.toLowerCase(),
        );
    });

    it("locks the method list to exactly deposit/createAtoms/createTriples", () => {
        const caveats = composeAndStakeCaveats({cap: 1n, periodSeconds: 1n});
        // AllowedMethods terms is a packed sequence of 4-byte selectors.
        // 3 selectors → 12 bytes → 24 hex chars + 0x.
        const methodsCaveat = caveats[1];
        expect(methodsCaveat.terms.length).toBe(2 + 24);
        const expected = MULTI_VAULT_COMPOSE_SELECTORS.map((sig) =>
            toFunctionSelector(sig).slice(2),
        ).join("");
        expect(methodsCaveat.terms.slice(2).toLowerCase()).toBe(expected.toLowerCase());
    });
});

describe("publishModuleCaveats", () => {
    it("emits 2 caveats: DomainScope + TrustStakeCap", () => {
        const caveats = publishModuleCaveats({
            allowedDomains: ["solidity-audit"],
            cap: 10n ** 18n,
            periodSeconds: 86_400n,
        });
        expect(caveats).toHaveLength(2);
        expect(caveats[0].enforcer).toBe(ARP.domainScopeEnforcer);
        expect(caveats[1].enforcer).toBe(ARP.trustStakeCapEnforcer);
    });

    it("preserves the domain order in the encoded hash list", () => {
        const caveats = publishModuleCaveats({
            allowedDomains: ["a", "b", "c"],
            cap: 1n,
            periodSeconds: 1n,
        });
        const [hashes] = decodeAbiParameters(
            [{type: "bytes32[]"}],
            caveats[0].terms,
        );
        expect(hashes).toEqual([
            keccak256(toBytes("a")),
            keccak256(toBytes("b")),
            keccak256(toBytes("c")),
        ]);
    });
});
