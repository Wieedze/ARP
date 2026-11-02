import {hashDelegation} from "@metamask/delegation-core";
import {getSmartAccountsEnvironment, type Delegation} from "@metamask/smart-accounts-kit";
import {describe, expect, it} from "vitest";
import {decodeAbiParameters, getAddress, parseEther, type Hex} from "viem";

import {intuitionTestnet} from "../../lib/chains";
import {deployments} from "../../lib/deployments";
import {parseCapInput, stakeDelegation} from "../delegation";
import {describeCaveat, describeDelegation, formatPeriod} from "../delegation-view";

/**
 * The two pure halves of `/account`'s delegation flow: what the form builds, and what a row reads
 * back from the signed struct. Nothing here signs or reads a chain.
 */
const SA: Hex = "0x00000000000000000000000000000000000000Aa";
const RUNTIME: Hex = "0x00000000000000000000000000000000000000d1";
const SALT: Hex = `0x${"07".repeat(32)}`;
const ENFORCERS = getSmartAccountsEnvironment(intuitionTestnet.id).caveatEnforcers;

function signed(): Delegation {
    return {
        ...stakeDelegation({
            delegator: SA,
            delegate: RUNTIME,
            cap: parseEther("1.5"),
            periodSeconds: 86_400n,
            salt: SALT,
        }),
        signature: "0x1234",
    };
}

describe("parseCapInput", () => {
    it("reads a tTRUST amount as wei", () => {
        expect(parseCapInput(" 1.5 ")).toEqual({cap: parseEther("1.5")});
    });

    it("refuses zero, a negative, and text", () => {
        expect(parseCapInput("0")).toEqual({error: "Cap must be above 0"});
        expect(parseCapInput("-1")).toHaveProperty("error");
        expect(parseCapInput("one")).toHaveProperty("error");
        expect(parseCapInput("")).toHaveProperty("error");
    });
});

describe("stakeDelegation", () => {
    it("names the delegate and carries the three compose-and-stake caveats, cap last", () => {
        const d = stakeDelegation({
            delegator: SA,
            delegate: RUNTIME,
            cap: 5n,
            periodSeconds: 3_600n,
            salt: SALT,
        });
        expect(d.delegate).toBe(RUNTIME);
        expect(d.delegator).toBe(SA);
        expect(d.salt).toBe(SALT);
        expect(d.caveats.map((c) => c.enforcer)).toEqual([
            ENFORCERS.AllowedTargetsEnforcer,
            ENFORCERS.AllowedMethodsEnforcer,
            deployments.arp.trustStakeCapEnforcer,
        ]);
        const [cap, period] = decodeAbiParameters(
            [{type: "uint256"}, {type: "uint256"}],
            d.caveats[2].terms,
        );
        expect([cap, period]).toEqual([5n, 3_600n]);
    });

    it("draws a fresh salt when none is given, so two delegations are distinguishable", () => {
        const a = stakeDelegation({delegator: SA, delegate: RUNTIME, cap: 1n, periodSeconds: 1n});
        const b = stakeDelegation({delegator: SA, delegate: RUNTIME, cap: 1n, periodSeconds: 1n});
        expect(a.salt).not.toBe(b.salt);
    });
});

describe("describeDelegation", () => {
    it("reads the cap, the period and every enforcer back from the signed struct", () => {
        const view = describeDelegation(signed());
        expect(view.delegate).toBe(getAddress(RUNTIME));
        expect(view.caveats).toEqual([
            {kind: "named", enforcer: ENFORCERS.AllowedTargetsEnforcer, name: "AllowedTargets"},
            {kind: "named", enforcer: ENFORCERS.AllowedMethodsEnforcer, name: "AllowedMethods"},
            {
                kind: "stake-cap",
                enforcer: getAddress(deployments.arp.trustStakeCapEnforcer),
                cap: parseEther("1.5"),
                periodSeconds: 86_400n,
            },
        ]);
    });

    it("computes the hash the DelegationManager keys revocation by", () => {
        const d = signed();
        expect(describeDelegation(d).hash).toBe(hashDelegation({...d, salt: BigInt(d.salt)}));
    });

    it("lists an unknown enforcer by address instead of dropping it", () => {
        const stranger: Hex = "0x000000000000000000000000000000000000bEEF";
        expect(describeCaveat({enforcer: stranger, terms: "0x"})).toEqual({
            kind: "unknown",
            enforcer: getAddress(stranger),
        });
    });

    it("shows a stake-cap caveat with undecodable terms as unknown, not as a cap", () => {
        expect(
            describeCaveat({enforcer: deployments.arp.trustStakeCapEnforcer, terms: "0x01"}).kind,
        ).toBe("unknown");
    });
});

describe("formatPeriod", () => {
    it("prints whole days, then whole hours, then seconds", () => {
        expect(formatPeriod(604_800n)).toBe("7d");
        expect(formatPeriod(7_200n)).toBe("2h");
        expect(formatPeriod(90n)).toBe("90s");
        expect(formatPeriod(0n)).toBe("0s");
    });
});
