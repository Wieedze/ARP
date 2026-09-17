import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

import type {FetchLike} from "../src/http.js";
import {isRecord} from "../src/json.js";

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
