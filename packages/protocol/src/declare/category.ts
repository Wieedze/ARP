import {stringToHex, type Address, type Hex} from "viem";

import type {DomainTree} from "../domains.js";
import {HAS_TAG, IS_A_SUB_DOMAIN_OF} from "../sources/intuition/terms.js";
import {planSponsoredDeposit} from "../sponsor/plan.js";
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
    | "charset"
    | "compound"
    | "reason"
    | "exists"
    | "parent"
    | "skill";

export type CategoryRefusal = {status: "refused"; rule: CategoryRule; detail: string};

export type CategoryPlan = {
    status: "planned";
    chainId: number;
    /** False when the label was already a category: then only the tag is planned. */
    newCategory: boolean;
    label: string;
    /** `null` for an existing category, whose parent is not the proposer's to choose. */
    parent: string | null;
    categoryId: Hex;
    /** `null` for an existing category. */
    subDomainTripleId: Hex | null;
    tagTripleId: Hex;
    calls: PreparedCall[];
    /** The sum of every call's `value`: what signing the plan spends. */
    totalValue: bigint;
};

export type CategoryProposal = {
    /** The new category's label, as proposed. Normalised before anything else. */
    label: string;
    /** An existing category the new one sits under. Ignored when `label` is already a category. */
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
    /**
     * Whether a label is already a node of the index's tree in any state: a category, or one that
     * is tied, unparented or in a cycle. Such a label is refused as `exists`: a new parent edge
     * on it would be an edge the proposer chose for a node already there (security review, task
     * 59). Absent, only {@link isCategory} is asked.
     */
    isKnown?(label: string): Promise<boolean>;
    /** Whether the subject is a skill or tool, not just any term on chain. Absent, any term passes. */
    isTool?(subjectId: Hex): Promise<boolean>;
    /** Compounds allowed with their reason (`domains.proposal.json`); a space passes only here. */
    compounds: ReadonlyMap<string, string>;
    /**
     * For a writer that is itself an attestor (the sponsor, ADR `0124`). The index reads positions,
     * not creators, so a term that exists with no attestor's position is invisible: 44 of the 66
     * `is a sub-domain of` triples on testnet 13579 were, measured 2026-11-03 by
     * `intuition-integrator`. With this, such a term gets a `minDeposit` deposit from `depositor`
     * instead of nothing. Without it, the plan only creates what is missing, as before.
     */
    backing?: {attestors: readonly Address[]; depositor: Address};
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
    // NFKC first, so compatibility forms (full-width letters, ligatures) fold before accents go.
    return raw
        .normalize("NFKC")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
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
    // Lowercase ASCII letters and digits, and single spaces between words: nothing invisible, no
    // look-alike from another script, and no `#` or `:`, which the sponsor's ledger keys use.
    if (!/^[a-z0-9]+(?: [a-z0-9]+)*$/.test(label)) {
        return {
            status: "refused",
            rule: "charset",
            detail: `"${label}": letters a to z, digits and single spaces only`,
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

    if (!(await deps.reads.termExists(proposal.subjectId))) {
        return {status: "refused", rule: "skill", detail: "the skill to tag is not on chain"};
    }
    if (deps.isTool !== undefined && !(await deps.isTool(proposal.subjectId))) {
        return {status: "refused", rule: "skill", detail: "the subject is not a skill or a tool"};
    }

    // An existing category is a valid choice, and path C's common one (the user, 2026-11-03):
    // only the tag is written, the parent is ignored, the reason is optional, and the label rules
    // do not apply, since a category such as `card-payment` predates them.
    const existing = await deps.isCategory(label);
    let parent: string | null = null;
    if (!existing) {
        const refused = checkCategoryLabel(label, deps.compounds);
        if (refused !== null) return refused;
        if (proposal.reason.trim().length === 0) {
            return {status: "refused", rule: "reason", detail: "say why no existing category fits"};
        }
        // A node the tree already holds in another state (tied, unparented, a cycle, or only a
        // parent) is not new: a parent edge for it would be one the proposer chose.
        if (deps.isKnown !== undefined && (await deps.isKnown(label))) {
            return {
                status: "refused",
                rule: "exists",
                detail: `"${label}" is already in the tree but does not reach tool`,
            };
        }
        parent = normaliseCategoryLabel(proposal.parent);
        if (!(await deps.isCategory(parent))) {
            return {
                status: "refused",
                rule: "parent",
                detail: `"${parent}" is not a category under tool`,
            };
        }
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
    const categoryId = await reads.atomId(categoryData);
    const parentId = parent === null ? null : await reads.atomId(stringToHex(parent));
    const [subDomainTripleId, tagTripleId] = await Promise.all([
        parentId === null
            ? Promise.resolve(null)
            : reads.tripleId(categoryId, IS_A_SUB_DOMAIN_OF, parentId),
        reads.tripleId(proposal.subjectId, HAS_TAG, categoryId),
    ]);
    const [atomOn, edgeOn, tagOn] = await Promise.all([
        existing ? Promise.resolve(true) : reads.termExists(categoryId),
        subDomainTripleId === null ? Promise.resolve(true) : reads.termExists(subDomainTripleId),
        reads.termExists(tagTripleId),
    ]);

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
    if (!edgeOn && parentId !== null && subDomainTripleId !== null) {
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

    // A term that exists but that no attestor backs is not in the index: back it.
    const backing = deps.backing;
    if (backing !== undefined) {
        const curveId = await reads.defaultCurveId();
        const toBack: Hex[] = [];
        if (edgeOn && subDomainTripleId !== null) toBack.push(subDomainTripleId);
        if (tagOn) toBack.push(tagTripleId);
        for (const termId of toBack) {
            const held = await Promise.all(
                backing.attestors.map((who) => reads.sharesOf(who, termId, curveId)),
            );
            if (held.some((shares) => shares > 0n)) continue;
            const deposit = await planSponsoredDeposit({
                receiver: backing.depositor,
                termId,
                amount: stake,
                reads,
                curveId,
            });
            calls.push(deposit.call);
        }
    }

    return {
        status: "planned",
        chainId: reads.chainId,
        newCategory: !existing,
        label,
        parent,
        categoryId,
        subDomainTripleId,
        tagTripleId,
        calls,
        totalValue: calls.reduce((sum, call) => sum + call.value, 0n),
    };
}
