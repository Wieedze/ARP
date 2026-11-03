import {decodeFunctionData, type Hex} from "viem";
import {describe, expect, it} from "vitest";

import {checkCategoryLabel, normaliseCategoryLabel, planCategory} from "../src/declare/category.js";
import {multiVaultDeclareAbi} from "../src/declare/multivault.js";
import {HAS_TAG, IS_A_SUB_DOMAIN_OF} from "../src/sources/intuition/terms.js";
import {atomIdFor, fakeReads} from "./helpers.js";

const SKILL = atomIdFor("ipfs://some-skill");
const COMPOUNDS = new Map([["npm package", "the kind tag of an npm tool"]]);
const TREE = new Set(["tool", "design", "writing"]);

const deps = (existing: ReadonlySet<string> = new Set([SKILL.toLowerCase()])) => ({
    reads: fakeReads({existing, chainId: 13579, atomCost: 10n, tripleCost: 20n, minDeposit: 1n}),
    isCategory: async (label: string) => TREE.has(label),
    compounds: COMPOUNDS,
});

/** The decoded `createAtoms` / `createTriples` arguments, each an array per term. */
function argsOf(data: Hex): readonly (readonly unknown[])[] {
    // Every call this plan makes is createAtoms or createTriples, whose arguments are all arrays.
    return decodeFunctionData({abi: multiVaultDeclareAbi, data})
        .args as unknown as readonly (readonly unknown[])[];
}

const proposal = {
    label: "Slides",
    parent: "design",
    subjectId: SKILL,
    reason: "no presentation category",
};

describe("a category anyone can add (task 59)", () => {
    it("normalises before anything is hashed", () => {
        expect(normaliseCategoryLabel("  Présentation   Deck ")).toBe("presentation deck");
    });

    it("refuses a hyphen always, and a space unless it is a listed compound", () => {
        expect(checkCategoryLabel("card-payment", COMPOUNDS)?.rule).toBe("hyphen");
        expect(checkCategoryLabel("slide deck", COMPOUNDS)?.rule).toBe("compound");
        expect(checkCategoryLabel("npm package", COMPOUNDS)).toBeNull();
        expect(checkCategoryLabel("", COMPOUNDS)?.rule).toBe("empty");
    });

    it("plans the same three writes as every category: the atom, the parent edge, the tag", async () => {
        const plan = await planCategory(proposal, deps());
        if (plan.status !== "planned") throw new Error(plan.detail);

        expect(plan.label).toBe("slides");
        expect(plan.chainId).toBe(13579);
        expect(plan.calls.map((call) => call.kind)).toEqual([
            "create-atom",
            "create-triple",
            "create-triple",
        ]);
        // cost + minDeposit on each, or the index does not read the term (ADR 0053).
        expect(plan.calls.map((call) => call.value)).toEqual([11n, 21n, 21n]);
        expect(plan.totalValue).toBe(53n);

        expect(argsOf(plan.calls[1]!.data)[1]).toEqual([IS_A_SUB_DOMAIN_OF]);
        const tag = argsOf(plan.calls[2]!.data);
        expect(tag[0]).toEqual([SKILL]);
        expect(tag[1]).toEqual([HAS_TAG]);
    });

    it("writes nothing twice: an atom already on chain is reused", async () => {
        const first = await planCategory(proposal, deps());
        if (first.status !== "planned") throw new Error(first.detail);
        const again = await planCategory(
            proposal,
            deps(new Set([SKILL.toLowerCase(), first.categoryId.toLowerCase()])),
        );
        if (again.status !== "planned") throw new Error(again.detail);
        expect(again.calls.map((call) => call.kind)).toEqual(["create-triple", "create-triple"]);
    });

    it("refuses what the rules can see: an existing category, an orphan, no reason, no skill", async () => {
        expect(await planCategory({...proposal, label: "Design"}, deps())).toMatchObject({
            rule: "exists",
        });
        expect(await planCategory({...proposal, parent: "nowhere"}, deps())).toMatchObject({
            rule: "parent",
        });
        expect(await planCategory({...proposal, reason: "  "}, deps())).toMatchObject({
            rule: "reason",
        });
        expect(await planCategory(proposal, deps(new Set()))).toMatchObject({rule: "skill"});
    });
});
