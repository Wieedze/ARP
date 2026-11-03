import {stringToHex, type Hex} from "viem";

import type {DomainTree} from "../domains.js";
import {HAS_TAG, IS_A_SUB_DOMAIN_OF} from "../sources/intuition/terms.js";
import {encodeCreateAtom, encodeCreateTriple, type MultiVaultReads} from "./multivault.js";
import type {PreparedCall} from "./types.js";

/**
 * A category anyone can add, by the same rules as the rest (task 59, ADR `0115`,
 * `docs/25_THE_DOMAIN_TREE.md` §8).
 *
 * The rules used to live only in `scripts/seed/seed-domain-tree.ts`, which a terminal session runs
 * and nothing else can. Here they are one implementation for the MCP server, the web app and the
 * sponsor. Like every plan in this package it signs nothing and sends nothing (ADR `0038`).
 *
 * Three writes, always the same three: the label's plain-string atom if it is new,
 * `(category, is a sub-domain of, parent)`, and `(skill, has tag, category)` — one tag, at the
 * deepest category (ADR `0074`). Each carries cost + `minDeposit`, or the index does not read it
 * (ADR `0053`).
 */

export type CategoryRule =
    | "empty"
    | "hyphen"
    | "compound"
    | "reason"
    | "exists"
    | "parent"
    | "skill";

export type CategoryRefusal = {status: "refused"; rule: CategoryRule; detail: string};

export type CategoryPlan = {
    status: "planned";
    chainId: number;
    label: string;
    parent: string;
    categoryId: Hex;
    subDomainTripleId: Hex;
    tagTripleId: Hex;
    calls: PreparedCall[];
    /** The sum of every call's `value`: what signing the plan spends. */
    totalValue: bigint;
};

export type CategoryProposal = {
    /** The new category's label, as proposed. Normalised before anything else. */
    label: string;
    /** An existing category the new one sits under. */
    parent: string;
    /** The skill or tool atom that none of the existing categories fits. */
    subjectId: Hex;
    /** Why no existing category fits. Kept with the proposal; required. */
    reason: string;
};

export type CategoryDeps = {
    reads: MultiVaultReads;
    /** Whether a label is already a category reachable from `tool`, read from the index. */
    isCategory(label: string): Promise<boolean>;
    /** Compounds allowed with their reason (`domains.proposal.json`); a space passes only here. */
    compounds: ReadonlyMap<string, string>;
};

/**
 * `isCategory` from a tree read with `readDomainTree`: a label is a category when it climbs to the
 * root along edges that carry a position. Read the tree with the index's attestor, so a category
 * somebody else filed does not count as one here either.
 */
export function isCategoryIn(
    tree: Pick<DomainTree, "pathToRoot">,
): (label: string) => Promise<boolean> {
    return async (label) => tree.pathToRoot(label).found;
}

/**
 * Lowercase, accents stripped, inner whitespace collapsed to one space. Applied before anything is
 * hashed: `Design` and `design` would be two nodes for ever on a graph that deletes nothing.
 */
export function normaliseCategoryLabel(raw: string): string {
    return raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * One word by default, two when necessary, a hyphen never (the user's rule, ADR `0088`). A label
 * with a space passes only if it is a listed compound. `null` when the label passes.
 */
export function checkCategoryLabel(
    label: string,
    compounds: ReadonlyMap<string, string>,
): CategoryRefusal | null {
    if (label.length === 0) return {status: "refused", rule: "empty", detail: "the label is empty"};
    if (/[-_]/.test(label)) {
        return {
            status: "refused",
            rule: "hyphen",
            detail: `"${label}": never a hyphen or an underscore; write a compound with a space`,
        };
    }
    if (label.includes(" ") && !compounds.get(label)?.trim()) {
        return {
            status: "refused",
            rule: "compound",
            detail: `"${label}": one word unless a listed compound says why no single word fits`,
        };
    }
    return null;
}

export async function planCategory(
    proposal: CategoryProposal,
    deps: CategoryDeps,
): Promise<CategoryPlan | CategoryRefusal> {
    const label = normaliseCategoryLabel(proposal.label);
    const parent = normaliseCategoryLabel(proposal.parent);

    const refused = checkCategoryLabel(label, deps.compounds);
    if (refused !== null) return refused;
    if (proposal.reason.trim().length === 0) {
        return {status: "refused", rule: "reason", detail: "say why no existing category fits"};
    }
    // The rules cannot see meaning, so they refuse what they can see: a second node for a label
    // that is already a category, and an orphan that would not climb to `tool`.
    if (await deps.isCategory(label)) {
        return {
            status: "refused",
            rule: "exists",
            detail: `"${label}" is already a category; tag with it`,
        };
    }
    if (!(await deps.isCategory(parent))) {
        return {
            status: "refused",
            rule: "parent",
            detail: `"${parent}" is not a category under tool`,
        };
    }
    if (!(await deps.reads.termExists(proposal.subjectId))) {
        return {status: "refused", rule: "skill", detail: "the skill to tag is not on chain"};
    }

    const {reads} = deps;
    const [atomCost, tripleCost, stake] = await Promise.all([
        reads.atomCost(),
        reads.tripleCost(),
        reads.minDeposit(),
    ]);
    const atomAssets = atomCost + stake;
    const tripleAssets = tripleCost + stake;

    const categoryData = stringToHex(label);
    const [categoryId, parentId] = await Promise.all([
        reads.atomId(categoryData),
        reads.atomId(stringToHex(parent)),
    ]);
    const [subDomainTripleId, tagTripleId] = await Promise.all([
        reads.tripleId(categoryId, IS_A_SUB_DOMAIN_OF, parentId),
        reads.tripleId(proposal.subjectId, HAS_TAG, categoryId),
    ]);
    const [atomOn, edgeOn, tagOn] = await Promise.all(
        [categoryId, subDomainTripleId, tagTripleId].map((id) => reads.termExists(id)),
    );

    const calls: PreparedCall[] = [];
    if (!atomOn) {
        calls.push({
            kind: "create-atom",
            chainId: reads.chainId,
            to: reads.address,
            value: atomAssets,
            data: encodeCreateAtom(categoryData, atomAssets),
            why: `the category "${label}"`,
        });
    }
    if (!edgeOn) {
        calls.push({
            kind: "create-triple",
            chainId: reads.chainId,
            to: reads.address,
            value: tripleAssets,
            data: encodeCreateTriple(categoryId, IS_A_SUB_DOMAIN_OF, parentId, tripleAssets),
            why: `"${label}" is a sub-domain of "${parent}"`,
        });
    }
    if (!tagOn) {
        calls.push({
            kind: "create-triple",
            chainId: reads.chainId,
            to: reads.address,
            value: tripleAssets,
            data: encodeCreateTriple(proposal.subjectId, HAS_TAG, categoryId, tripleAssets),
            why: `the skill has tag "${label}"`,
        });
    }

    return {
        status: "planned",
        chainId: reads.chainId,
        label,
        parent,
        categoryId,
        subDomainTripleId,
        tagTripleId,
        calls,
        totalValue: calls.reduce((sum, call) => sum + call.value, 0n),
    };
}
