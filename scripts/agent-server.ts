/**
 * Agent server — HTTP wrapper around the auditor + on-chain effects.
 *
 *   Operator's `.env` reads:
 *     AGENT_PRIVATE_KEY        — runtime EOA (delegate of both delegations)
 *     DELEGATION_COMPOSE_JSON  — signed compose delegation (for staking)
 *     AGENT_SERVER_PORT        — defaults to 3001
 *     AGENT_MIN_BUDGET_TTRUST  — minimum tTRUST a caller must have paid
 *                               to the runtime before /run is honored
 *                               (defaults to 0.005)
 *
 *   Endpoints:
 *     POST /run        run an audit
 *     GET  /healthz    {"ok": true, agent: "<runtime address>"}
 *
 *   POST /run body:
 *     {
 *       contractCode: string,    // raw .sol content
 *       paymentTxHash: 0x...,    // a payment tx the caller already made to
 *                                // the runtime EOA, value >= minBudget
 *       requesterAddress: 0x...  // for the audit's reporting + signature scope
 *     }
 *
 *   POST /run response:
 *     {
 *       report: AuditReport,
 *       stakes: StakeAction[],
 *       receipt: {
 *         agent: 0x...,
 *         requestHash: 0x...,
 *         signature: 0x...    // ECDSA signature of the request+result digest
 *       }
 *     }
 *
 * Run with:
 *   bun run scripts/agent-server.ts
 *
 * Plays well with `curl`:
 *   curl -X POST http://localhost:3001/run \
 *     -H 'Content-Type: application/json' \
 *     -d '{"contractCode": "...", "paymentTxHash": "0x...", "requesterAddress": "0x..."}'
 */

import {readFileSync, writeFileSync, mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {
    createPublicClient,
    createWalletClient,
    formatEther,
    http,
    keccak256,
    parseEther,
    toHex,
    type Address,
    type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {intuitionTestnet} from "../app/src/lib/chains";
import {deserializeDelegation} from "../app/src/services/delegation";
import {auditContract} from "./agent-auditor";
import {
    formatStakeActions,
    stakeOnUsedMethodologies,
    type StakeAction,
} from "./agent-stake-on-use";

type RunBody = {
    contractCode: string;
    paymentTxHash: Hex;
    requesterAddress: Address;
};

async function main() {
    const agentPk = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
    if (!agentPk) throw new Error("AGENT_PRIVATE_KEY required");
    const composeJson = process.env.DELEGATION_COMPOSE_JSON;
    if (!composeJson)
        throw new Error("DELEGATION_COMPOSE_JSON required (copy from /agent step 4)");
    const port = Number(process.env.AGENT_SERVER_PORT ?? "3001");
    const minBudget = parseEther(process.env.AGENT_MIN_BUDGET_TTRUST ?? "0.005");

    const composeDelegation = deserializeDelegation(composeJson);
    const agentAccount = privateKeyToAccount(agentPk);

    if (
        composeDelegation.delegate.toLowerCase() !==
        agentAccount.address.toLowerCase()
    ) {
        throw new Error(
            `Compose delegation delegate ${composeDelegation.delegate} does not match runtime ${agentAccount.address}`,
        );
    }

    const publicClient = createPublicClient({
        chain: intuitionTestnet,
        transport: http(),
    });
    const agentWalletClient = createWalletClient({
        account: agentAccount,
        chain: intuitionTestnet,
        transport: http(),
    });

    console.log("agent-server starting");
    console.log(`  runtime address  ${agentAccount.address}`);
    console.log(`  delegator (SA)   ${composeDelegation.delegator}`);
    console.log(`  port             ${port}`);
    console.log(`  min budget       ${formatEther(minBudget)} tTRUST`);
    console.log("");

    Bun.serve({
        port,
        async fetch(req) {
            const url = new URL(req.url);

            if (req.method === "OPTIONS") return corsPreflight();

            if (url.pathname === "/healthz" && req.method === "GET") {
                return json({ok: true, agent: agentAccount.address});
            }

            if (url.pathname === "/run" && req.method === "POST") {
                try {
                    const body = (await req.json()) as RunBody;
                    const result = await handleRun({
                        body,
                        publicClient,
                        agentWalletClient,
                        composeDelegation,
                        agentAccount,
                        minBudget,
                    });
                    return json(result);
                } catch (err) {
                    const msg = (err as Error).message ?? String(err);
                    console.error("/run failed:", msg);
                    return json({error: msg}, 400);
                }
            }

            return new Response("Not found", {status: 404});
        },
    });

    console.log(`Listening on http://localhost:${port}`);
}

async function handleRun(params: {
    body: RunBody;
    publicClient: ReturnType<typeof createPublicClient>;
    agentWalletClient: ReturnType<typeof createWalletClient>;
    composeDelegation: ReturnType<typeof deserializeDelegation>;
    agentAccount: ReturnType<typeof privateKeyToAccount>;
    minBudget: bigint;
}) {
    const {body, publicClient, agentWalletClient, composeDelegation, agentAccount, minBudget} =
        params;

    if (!body.contractCode || !body.paymentTxHash || !body.requesterAddress) {
        throw new Error(
            "missing required fields: contractCode, paymentTxHash, requesterAddress",
        );
    }

    // -------- 1. Validate the payment on chain --------
    const tx = await publicClient.getTransaction({hash: body.paymentTxHash});
    if (!tx) throw new Error(`payment tx ${body.paymentTxHash} not found`);
    if (
        !tx.to ||
        tx.to.toLowerCase() !== agentAccount.address.toLowerCase()
    ) {
        throw new Error(
            `payment recipient ${tx.to} does not match runtime ${agentAccount.address}`,
        );
    }
    if (tx.value < minBudget) {
        throw new Error(
            `payment value ${formatEther(tx.value)} below minimum ${formatEther(minBudget)} tTRUST`,
        );
    }
    if (
        tx.from.toLowerCase() !== body.requesterAddress.toLowerCase()
    ) {
        throw new Error(
            `payment sender ${tx.from} does not match declared requester ${body.requesterAddress}`,
        );
    }
    console.log(`[run] payment validated: ${formatEther(tx.value)} tTRUST from ${tx.from}`);

    // -------- 2. Audit the contract via Claude subprocess --------
    const tmp = mkdtempSync(join(tmpdir(), "arp-audit-"));
    const file = join(tmp, "Subject.sol");
    writeFileSync(file, body.contractCode, "utf8");

    console.log(`[run] running audit on temp file ${file}…`);
    const report = await auditContract(file);
    console.log(
        `[run] audit complete: ${report.findings.length} findings, methodologies: ${report.methodologiesUsed.join(", ")}`,
    );

    // -------- 3. Translate methodologies into on-chain stakes --------
    console.log(`[run] staking on used methodologies…`);
    const stakes: StakeAction[] = await stakeOnUsedMethodologies({
        methodologiesUsed: report.methodologiesUsed,
        composeDelegation,
        agentWalletClient,
        publicClient,
        agentSelfThing: {
            name: `ARP Agent runtime ${agentAccount.address.slice(0, 8)}`,
            description: `Headless ARP agent — delegator ${composeDelegation.delegator}.`,
        },
    });
    console.log(formatStakeActions(stakes));

    // -------- 4. Sign the receipt --------
    const requestHash = keccak256(
        toHex(
            JSON.stringify({
                contractCode: body.contractCode,
                paymentTxHash: body.paymentTxHash,
                requesterAddress: body.requesterAddress,
            }),
        ),
    );
    const resultHash = keccak256(toHex(report.rawResponse));
    const receiptDigest = keccak256(
        toHex(`${requestHash}|${resultHash}|${agentAccount.address}`),
    );
    const signature = await agentAccount.signMessage({
        message: {raw: receiptDigest},
    });

    return {
        report,
        stakes,
        receipt: {
            agent: agentAccount.address,
            requestHash,
            resultHash,
            signature,
        },
    };
}

function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value, replacer), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}

function corsPreflight(): Response {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}

/**
 * `JSON.stringify` doesn't handle `bigint`. Convert to string when
 * encountered. Loses precision-as-number on the wire but the consumer
 * can parse back as BigInt if needed.
 */
function replacer(_key: string, value: unknown): unknown {
    if (typeof value === "bigint") return value.toString();
    return value;
}

main().catch((err) => {
    console.error("agent-server failed to start:", err);
    process.exit(1);
});
