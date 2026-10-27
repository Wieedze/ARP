import {describe, expect, it} from "vitest";
import {decodeAbiParameters, toFunctionSelector, type Address} from "viem";

import {HIRE_SELECTORS} from "../src/hire/caveats.js";
import {
    HireBoundMissingError,
    prepareHire,
    ROOT_AUTHORITY,
    type HireEnvironment,
} from "../src/hire/plan.js";

const BUYER = "0x1111111111111111111111111111111111111111" as Address;
const SELLER = "0x2222222222222222222222222222222222222222" as Address;
const MULTIVAULT = "0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e" as Address;

/**
 * The framework's addresses on Intuition mainnet 1155 at version 1.3.0, read from
 * `@metamask/delegation-deployments` on 2026-10-27. Injected rather than resolved so these tests
 * neither need the kit at runtime nor break when it ships a new version — the point under test is
 * what ARP builds, not what MetaMask deploys.
 */
const ENV: HireEnvironment = {
    delegationManager: "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as Address,
    caveatEnforcers: {
        NativeTokenTransferAmountEnforcer: "0xaaaa000000000000000000000000000000000001" as Address,
        AllowedTargetsEnforcer: "0xaaaa000000000000000000000000000000000002" as Address,
        AllowedMethodsEnforcer: "0xaaaa000000000000000000000000000000000003" as Address,
        TimestampEnforcer: "0xaaaa000000000000000000000000000000000004" as Address,
    },
};

const base = {
    buyer: BUYER,
    seller: SELLER,
    budget: 1_000_000_000_000_000_000n,
    multiVault: MULTIVAULT,
    chainId: 1155,
    environment: ENV,
};

describe("prepareHire", () => {
    it("bounds the budget, the target and the methods, and names each for a reader", async () => {
        const plan = await prepareHire(base);
        expect(plan.bounds.map((b) => b.name)).toEqual([
            "NativeTokenTransferAmountEnforcer",
            "AllowedTargetsEnforcer",
            "AllowedMethodsEnforcer",
        ]);
        expect(plan.bounds.every((b) => b.describes.length > 0)).toBe(true);
        expect(plan.delegation.caveats).toHaveLength(3);
        expect(plan.budget).toBe(base.budget);
        expect(plan.expiresAt).toBeNull();
    });

    it("spends the buyer's balance, not the seller's", async () => {
        const plan = await prepareHire(base);
        expect(plan.delegation.delegator).toBe(BUYER);
        expect(plan.delegation.delegate).toBe(SELLER);
    });

    /**
     * The safety property of the whole module. A seller that could call `redeem` could name itself
     * as the receiver and return the buyer's deposits to its own wallet — inside the budget, inside
     * the target, and inside every other bound. The exclusion is not an oversight to tidy up later.
     */
    it("never authorises redeem", () => {
        expect(HIRE_SELECTORS.some((s) => s.startsWith("function redeem"))).toBe(false);
        expect(HIRE_SELECTORS).toHaveLength(3);
    });

    it("encodes the exact selectors the framework will check", async () => {
        const plan = await prepareHire(base);
        const methods = plan.bounds.find((b) => b.name === "AllowedMethodsEnforcer");
        const expected = HIRE_SELECTORS.map((s) => toFunctionSelector(s).slice(2)).join("");
        expect(methods?.terms.slice(2)).toBe(expected);
    });

    it("encodes the budget as the maximum the authority may move in total", async () => {
        const plan = await prepareHire({...base, budget: 42n});
        const amount = plan.bounds.find((b) => b.name === "NativeTokenTransferAmountEnforcer");
        const [decoded] = decodeAbiParameters([{type: "uint256"}], amount?.terms ?? "0x");
        expect(decoded).toBe(42n);
    });

    it("adds the expiry only when asked, and reports it", async () => {
        const expiresAt = 1_800_000_000;
        const plan = await prepareHire({...base, expiresAt});
        expect(plan.bounds.map((b) => b.name)).toContain("TimestampEnforcer");
        expect(plan.delegation.caveats).toHaveLength(4);
        expect(plan.expiresAt).toBe(expiresAt);
    });

    /**
     * Two hires with identical terms hash identically without this, so the second is
     * indistinguishable from a replay of the first. `rules/metamask-delegation.md` requires it.
     */
    it("gives two identical hires different salts", async () => {
        const a = await prepareHire(base);
        const b = await prepareHire(base);
        expect(a.delegation.salt).not.toBe(b.delegation.salt);
    });

    it("descends from root unless a parent authority is given", async () => {
        expect((await prepareHire(base)).delegation.authority).toBe(ROOT_AUTHORITY);
        const parent = `0x${"ab".repeat(32)}` as const;
        expect((await prepareHire({...base, authority: parent})).delegation.authority).toBe(parent);
    });

    /**
     * ADR `0038`. The struct has no `signature` field at all, rather than an empty one: a `"0x"`
     * there is one cast away from being handed to a redeemer as though it were signed.
     */
    it("returns nothing signed, and no field that could be mistaken for a signature", async () => {
        const plan = await prepareHire(base);
        expect("signature" in plan.delegation).toBe(false);
        expect(Object.keys(plan.delegation).sort()).toEqual([
            "authority",
            "caveats",
            "delegate",
            "delegator",
            "salt",
        ]);
    });

    it("refuses a budget of zero or less rather than building an unbounded authority", async () => {
        await expect(prepareHire({...base, budget: 0n})).rejects.toThrow(/greater than zero/);
        await expect(prepareHire({...base, budget: -1n})).rejects.toThrow(/greater than zero/);
    });

    /**
     * A chain where an enforcer is missing must fail loudly. Silently dropping the bound would
     * produce a delegation that signs cleanly and spends without a ceiling.
     */
    it("refuses to build when a bound's enforcer is not deployed", async () => {
        const crippled: HireEnvironment = {
            delegationManager: ENV.delegationManager,
            caveatEnforcers: {...ENV.caveatEnforcers, NativeTokenTransferAmountEnforcer: undefined},
        };
        await expect(prepareHire({...base, environment: crippled})).rejects.toBeInstanceOf(
            HireBoundMissingError,
        );
    });
});
