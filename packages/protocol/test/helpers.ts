import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

import {parseEther} from "viem";
import type {Address, Hex} from "viem";

import type {MultiVaultReads} from "../src/declare/index.js";
import {type FetchLike, isRecord} from "@arp-protocol/graphql";
import {asAgentIdentityAtom} from "../src/verify/subject.js";

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

export function fixture(name: string): unknown {
    return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, "utf8"));
}

export const INTUITION_URL = "https://mainnet.intuition.sh/v1/graphql";

export type AgentSlug = "clawnch" | "bare-6649" | "captain-dackie" | "absent";

const CAIP_TO_SLUG: Record<string, AgentSlug> = {
    "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/2340": "clawnch",
    "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/6649": "bare-6649",
    "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/1380": "captain-dackie",
};

const SUBJECT_TO_SLUG: Record<string, AgentSlug> = {
    "0x20dd3a62fee16233e1747a597291dd8faa10a1eb6783afe2bc52eab62df89028": "clawnch",
    "0x0ea137804fd2180aca6c35474e7db6e3c2fb0f7990dd798452ed5b412610765e": "bare-6649",
    "0x45078ae569def2264355f77e592028dd6f1f5d6373c204fe82bf3141ab1861fb": "captain-dackie",
};

/** The live resolver URLs the recorded trust surfaces point at, mapped to recorded documents. */
export const RESOLVER_FIXTURES: Record<string, string | null> = {
    "https://api.deep3.ai/.well-known/intuition/erc8004/agents/8453/2340/erc8004-feedback-trust-assessment.json":
        "deep3-2340.assessment.json",
    "https://api.deep3.ai/.well-known/intuition/erc8004/agents/8453/6649/erc8004-feedback-trust-assessment.json":
        "deep3-6649.assessment.json",
    "https://api.deep3.ai/.well-known/intuition/erc8004/agents/8453/1380/erc8004-feedback-trust-assessment.json":
        "deep3-1380.assessment.json",
    "https://api.asterpay.io/.well-known/intuition/erc8004/agents/8453/2340/trust-assessment.json":
        "asterpay-2340.assessment.json",
    // Recorded live as a 404 on 2026-09-16 — a real provider advertising a
    // resolver URL that does not resolve. Kept as a fixture on purpose.
    "https://api.asterpay.io/.well-known/intuition/erc8004/agents/8453/1380/trust-assessment.json":
        null,
    "https://deep3.ai": null,
    "https://asterpay.io": null,
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {"content-type": "application/json"},
    });
}

/**
 * A `fetch` that serves the recorded fixtures and nothing else.
 *
 * Mocking sits here, at the network boundary, so every line between the public
 * API and the socket runs for real — including the GraphQL transport and the
 * document narrowing.
 */
export function fixtureFetch(overrides: Record<string, () => Response> = {}): FetchLike {
    return async (input, init) => {
        const override = overrides[input];
        if (override !== undefined) return override();

        if (input === INTUITION_URL) {
            const body: unknown = JSON.parse(String(init?.body ?? "{}"));
            const variables = isRecord(body) ? body["variables"] : null;
            if (!isRecord(variables))
                throw new Error(`unroutable GraphQL body: ${String(init?.body)}`);

            const objectId = variables["objectId"];
            if (typeof objectId === "string") {
                const order = variables["orderBy"];
                const offset = variables["offset"];
                const byMarketCap = JSON.stringify(order).includes("total_market_cap");
                const slug = byMarketCap
                    ? "economic-0"
                    : offset === 0
                      ? "evidence-0"
                      : `evidence-${String(offset)}`;
                return jsonResponse(fixture(`cohort-${slug}.json`));
            }

            const caipId = variables["caipId"];
            if (typeof caipId === "string") {
                const slug = CAIP_TO_SLUG[caipId] ?? "absent";
                return jsonResponse(fixture(`${slug}.preflight.json`));
            }

            const subjectId = variables["subjectId"];
            const predicateIds = variables["predicateIds"];
            if (typeof subjectId !== "string" || !Array.isArray(predicateIds)) {
                throw new Error(`unroutable GraphQL variables: ${JSON.stringify(variables)}`);
            }
            const slug = SUBJECT_TO_SLUG[subjectId];
            if (slug === undefined) throw new Error(`no fixture for subject ${subjectId}`);
            const kind = predicateIds.length === 2 ? "trust-surface" : "capabilities";
            return jsonResponse(fixture(`${slug}.${kind}.json`));
        }

        if (input in RESOLVER_FIXTURES) {
            const name = RESOLVER_FIXTURES[input];
            if (name === undefined || name === null) {
                return new Response("not found", {status: 404, statusText: "Not Found"});
            }
            return jsonResponse(fixture(name));
        }

        throw new Error(`fixtureFetch has no route for ${input}`);
    };
}

/** An EIP-1193 transport over recorded `eth_call` results, for the registry source. */
export function recordedEthCall(recorded: Record<string, {ownerOf: unknown; tokenURI: unknown}>) {
    const OWNER_OF = "0x6352211e";
    const TOKEN_URI = "0xc87b56dd";

    return async ({method, params}: {method: string; params?: unknown}): Promise<unknown> => {
        if (method === "eth_chainId") return "0x2105";
        if (method !== "eth_call") throw new Error(`unexpected RPC method ${method}`);
        const call = Array.isArray(params) ? params[0] : null;
        const data = isRecord(call) ? call["data"] : null;
        if (typeof data !== "string") throw new Error("eth_call without data");

        const tokenId = BigInt(`0x${data.slice(10)}`).toString();
        const entry = recorded[`8453:${tokenId}`];
        if (entry === undefined) throw new Error(`no recorded call for token ${tokenId}`);

        const result = data.startsWith(OWNER_OF)
            ? entry.ownerOf
            : data.startsWith(TOKEN_URI)
              ? entry.tokenURI
              : null;
        if (result === null) throw new Error(`unexpected selector ${data.slice(0, 10)}`);
        if (isRecord(result)) throw new Error("execution reverted");
        return result;
    };
}

/* -------------------------------------------------------------------------- */
/* A fake MultiVault reader, shared by every planner test                      */
/*                                                                            */
/* Extracted from `declare-plan.test.ts` when `hire-rate.test.ts` needed the   */
/* same chain state. Two copies of a reader that decides what a plan is        */
/* allowed to do is two places for the fixture to drift from the chain it      */
/* stands in for.                                                             */
/* -------------------------------------------------------------------------- */

export const MULTI_VAULT = "0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e" as Address;
export const RECEIVER = "0x1111111111111111111111111111111111111111" as Address;

/** The agent's ERC-8004 identity atom, branded the way a real caller must (ADR 0032). */
export const SUBJECT = asAgentIdentityAtom(
    "0xaaa0000000000000000000000000000000000000000000000000000000000001" as Hex,
    "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/1380",
);

export const TOOL_URI = "ipfs://bafkreiarpslitherschema";
export const OTHER_URI = "https://tools.example.org/semgrep.json";

/**
 * Deterministic stand-ins for the two `calculate*` views.
 *
 * Every nibble is valid hex. The first draft used `a70m` as a mnemonic prefix, which is not hex and
 * only one test noticed — the one that decodes the calldata. The other eighteen passed on an id
 * viem cannot parse, which is the vacuity shape: a fixture no assertion looks inside.
 */
export const idFor = (prefix: string, uri: string): Hex => {
    const body = (prefix + Buffer.from(uri).toString("hex")).slice(0, 64).padEnd(64, "0");
    return `0x${body}` as Hex;
};
export const atomIdFor = (uri: string): Hex => idFor("a70a", uri);
export const tripleIdFor = (uri: string): Hex => idFor("7319", uri);

/**
 * A reader over stated chain state.
 *
 * A mocked viem client would prove a call was shaped; this proves the plan was right given what the
 * chain says, which is the only thing the planner is responsible for. `calls` records every read so
 * a test can assert a cost was read **per plan** rather than carried as a constant.
 */
export function fakeReads(
    state: {
        existing?: ReadonlySet<string>;
        atomCost?: bigint;
        tripleCost?: bigint;
        curveId?: bigint;
        chainId?: number;
        minDeposit?: bigint;
        /**
         * The entry fee the previews take, in basis points. `0` by default so every assertion that
         * is about an amount stays about the amount.
         *
         * Measured on the real chains 2026-10-21: 200 bps on testnet 13579 for an atom, 100 for a
         * triple; 175 and 125 on mainnet 1155. It is set here only by the test that needs a deposit
         * to round down to **zero shares**, which is how the real chain refuses dust and the only
         * way `ZeroPositionError` is reachable with a non-zero `birthDeposit`.
         */
        feeBps?: bigint;
        /** What an account holds, keyed by lower-cased term id. */
        held?: Record<string, bigint>;
        /** The exit fee the redeem preview takes, in basis points. */
        exitBps?: bigint;
    } = {},
): MultiVaultReads & {reads: string[]} {
    const existing = state.existing ?? new Set<string>();
    const reads: string[] = [];
    /**
     * Which URI produced which atom id, recorded as the reads happen.
     *
     * The alternative — reverse-parsing the URI back out of the atom id — needs trailing zeros
     * stripped, and the hex of an ASCII URI can legitimately end in a zero nibble (`p` is `0x70`).
     * A lookup cannot be wrong that way.
     */
    const uriByAtomId = new Map<string, string>();
    /**
     * What a creation deposit buys, the way the chain computes it: the fee first, then the shares
     * **rounded down**. Rounding down is the part that matters — it is why a deposit can be
     * positive and still buy nothing.
     */
    const afterFees = (left: bigint) => {
        if (left <= 0n) return {shares: 0n, assetsAfterFixedFees: 0n, assetsAfterFees: 0n};
        const shares = (left * (10_000n - (state.feeBps ?? 0n))) / 10_000n;
        return {shares, assetsAfterFixedFees: left, assetsAfterFees: shares};
    };
    return {
        reads,
        address: MULTI_VAULT,
        chainId: state.chainId ?? 1155,
        async atomId(atomData: Hex) {
            reads.push("calculateAtomId");
            const uri = Buffer.from(atomData.slice(2), "hex").toString("utf8");
            const id = atomIdFor(uri);
            uriByAtomId.set(id, uri);
            return id;
        },
        async counterTripleId(tripleId: Hex) {
            reads.push(`getCounterIdFromTripleId:${tripleId}`);
            // Deterministic and distinct from the triple, which is all a caller can rely on. The
            // contract derives it from the three terms; the fake only has to be a stable bijection.
            return idFor("c0un", tripleId);
        },
        async tripleId(subject: Hex, predicate: Hex, objectId: Hex) {
            reads.push(`calculateTripleId:${subject}:${predicate}`);
            // Keyed off the URI when this reader computed the atom id, and off the object id
            // otherwise — which is the case when the planner reuses an atom the lookup found and
            // never calls `atomId` at all. An earlier version threw there, and the throw was a
            // bug in the fake rather than in the planner.
            const uri = uriByAtomId.get(objectId);
            return uri === undefined ? idFor("7319", objectId) : tripleIdFor(uri);
        },
        async termExists(termId: Hex) {
            reads.push("isTermCreated");
            return existing.has(termId.toLowerCase());
        },
        async atomCost() {
            reads.push("getAtomCost");
            return state.atomCost ?? parseEther("0.01");
        },
        async tripleCost() {
            reads.push("getTripleCost");
            return state.tripleCost ?? parseEther("0.1");
        },
        async defaultCurveId() {
            reads.push("getBondingCurveConfig");
            return state.curveId ?? 1n;
        },
        async minDeposit() {
            reads.push("getGeneralConfig");
            // 1n unless a test says otherwise, so the existing amount assertions stay about the
            // amount and not about the floor.
            return state.minDeposit ?? 1n;
        },
        /**
         * The real contract's behaviour, reduced to the one property the planner reads: the fee
         * comes out of `assets`, so what is left is what buys shares, and the fee alone buys none.
         *
         * Measured on both chains 2026-10-21 (`scripts/measure/preview-before-create.ts`). The
         * entry fee is dropped here — a percentage the fake does not need, because no assertion is
         * about the exact share count, only about zero against non-zero.
         */
        async previewAtomCreate(_termId: Hex, assets: bigint) {
            reads.push("previewAtomCreate");
            return afterFees(assets - (state.atomCost ?? parseEther("0.01")));
        },
        async previewTripleCreate(_termId: Hex, assets: bigint) {
            reads.push("previewTripleCreate");
            return afterFees(assets - (state.tripleCost ?? parseEther("0.1")));
        },
        /** Reverts on a term that does not exist, as the real one does. */
        async previewDeposit(termId: Hex, _curveId: bigint, assets: bigint) {
            reads.push("previewDeposit");
            if (!existing.has(termId.toLowerCase())) {
                throw new Error(`previewDeposit on a term that does not exist: ${termId}`);
            }
            return {shares: assets, assetsAfterFees: assets};
        },
        /** What the account holds. Keyed by term only — one holder is enough for a planner test. */
        async sharesOf(_account: Address, termId: Hex, _curveId: bigint) {
            reads.push("sharesOf");
            return state.held?.[termId.toLowerCase()] ?? 0n;
        },
        /**
         * The exit side of `previewDeposit`, and **lossy by default like it is not**: `exitBps`
         * defaults to 0 so an assertion about an amount stays about the amount, and the one test
         * that needs the fee to bite sets it.
         */
        async previewRedeem(termId: Hex, _curveId: bigint, shares: bigint) {
            reads.push("previewRedeem");
            if (!existing.has(termId.toLowerCase())) {
                throw new Error(`previewRedeem on a term that does not exist: ${termId}`);
            }
            const fee = (shares * (state.exitBps ?? 0n)) / 10_000n;
            return {assetsAfterFees: shares - fee, sharesUsed: shares};
        },
    };
}
