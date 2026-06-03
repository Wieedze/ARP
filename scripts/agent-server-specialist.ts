/**
 * Specialist agent server — port 3002.
 *
 * Subcontract endpoint. Receives a deep-security audit task from the
 * primary Auditor, along with:
 *   - the sub-delegation Auditor signed (delegating a slice of its
 *     compose authority to this Specialist's runtime)
 *   - the root compose delegation (so the validation chain is complete)
 *   - the parent payment tx hash (Maria → Auditor) for traceability
 *   - the subcontract payment tx hash (Auditor → Specialist runtime) for
 *     fee validation
 *
 *   .env reads:
 *     AGENT2_PRIVATE_KEY                      Specialist runtime privkey
 *     AGENT_SERVER_SPECIALIST_PORT            defaults to 3002
 *     AGENT_SUBCONTRACT_MIN_FEE_TTRUST        minimum fee Auditor must
 *                                             have paid (default 0.001)
 *
 *   POST /run body:
 *     {
 *       contractCode: string,
 *       parentPaymentTxHash: 0x...,   // Maria → Auditor (for traceability)
 *       subPaymentTxHash:    0x...,   // Auditor → Specialist runtime (fee)
 *       subDelegation:       Delegation,  // signed by Auditor's runtime
 *       rootDelegation:      Delegation,  // signed by Maria's SA
 *       auditorAddress:      0x...,   // Auditor's runtime, for fee check
 *     }
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
import {auditContract} from "./agent-auditor";
import {
    formatStakeActions,
    stakeOnUsedMethodologies,
    type StakeAction,
} from "./agent-stake-on-use";
import type {Delegation} from "@metamask/smart-accounts-kit";

type RunBody = {
    contractCode: string;
    parentPaymentTxHash: Hex;
    subPaymentTxHash: Hex;
    subDelegation: Delegation;
    rootDelegation: Delegation;
    auditorAddress: Address;
    requesterAddress: Address;
};

async function main() {
    const agentPk = process.env.AGENT2_PRIVATE_KEY as Hex | undefined;
    if (!agentPk) throw new Error("AGENT2_PRIVATE_KEY required");
    const port = Number(process.env.AGENT_SERVER_SPECIALIST_PORT ?? "3002");
    const minFee = parseEther(
        process.env.AGENT_SUBCONTRACT_MIN_FEE_TTRUST ?? "0.001",
    );

    const agentAccount = privateKeyToAccount(agentPk);
    const publicClient = createPublicClient({
        chain: intuitionTestnet,
        transport: http(),
    });
    const agentWalletClient = createWalletClient({
        account: agentAccount,
        chain: intuitionTestnet,
        transport: http(),
    });

    console.log("agent-server-specialist starting");
    console.log(`  runtime address  ${agentAccount.address}`);
    console.log(`  port             ${port}`);
    console.log(`  min sub-fee      ${formatEther(minFee)} tTRUST`);
    console.log("");

    Bun.serve({
        port,
        async fetch(req) {
            const url = new URL(req.url);

            if (req.method === "OPTIONS") return corsPreflight();

            if (url.pathname === "/healthz" && req.method === "GET") {
                return json({
                    ok: true,
                    role: "specialist",
                    agent: agentAccount.address,
                });
            }

            if (url.pathname === "/run" && req.method === "POST") {
                try {
                    const body = (await req.json()) as RunBody;
                    const result = await handleRun({
                        body,
                        publicClient,
                        agentWalletClient,
                        agentAccount,
                        minFee,
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
    agentAccount: ReturnType<typeof privateKeyToAccount>;
    minFee: bigint;
}) {
    const {body, publicClient, agentWalletClient, agentAccount, minFee} = params;

    if (
        !body.contractCode ||
        !body.subPaymentTxHash ||
        !body.subDelegation ||
        !body.rootDelegation
    ) {
        throw new Error(
            "missing required fields: contractCode, subPaymentTxHash, subDelegation, rootDelegation",
        );
    }

    // -------- 1. Validate the subcontract payment (Auditor → us) --------
    const tx = await publicClient.getTransaction({hash: body.subPaymentTxHash});
    if (!tx) throw new Error(`subPaymentTx ${body.subPaymentTxHash} not found`);
    if (tx.to?.toLowerCase() !== agentAccount.address.toLowerCase()) {
        throw new Error(
            `sub-payment recipient ${tx.to} does not match Specialist runtime ${agentAccount.address}`,
        );
    }
    if (tx.value < minFee) {
        throw new Error(
            `sub-fee ${formatEther(tx.value)} below minimum ${formatEther(minFee)} tTRUST`,
        );
    }
    if (tx.from.toLowerCase() !== body.auditorAddress.toLowerCase()) {
        throw new Error(
            `sub-payment sender ${tx.from} does not match declared Auditor ${body.auditorAddress}`,
        );
    }
    console.log(
        `[run] sub-payment validated: ${formatEther(tx.value)} tTRUST from ${tx.from}`,
    );

    // -------- 2. Validate the sub-delegation chain shape --------
    if (
        body.subDelegation.delegate.toLowerCase() !==
        agentAccount.address.toLowerCase()
    ) {
        throw new Error(
            `subDelegation.delegate ${body.subDelegation.delegate} is not this Specialist runtime`,
        );
    }
    if (
        body.subDelegation.delegator.toLowerCase() !==
        body.rootDelegation.delegate.toLowerCase()
    ) {
        throw new Error(
            `subDelegation.delegator ${body.subDelegation.delegator} must equal rootDelegation.delegate ${body.rootDelegation.delegate}`,
        );
    }
    // The framework will validate the cryptographic chain on-chain at
    // redemption. We've done the structural checks; signatures are
    // verified by the DelegationManager when we redeem.
    console.log("[run] sub-delegation chain shape OK");

    // -------- 3. Audit with the Specialist persona --------
    const tmp = mkdtempSync(join(tmpdir(), "arp-specialist-"));
    const file = join(tmp, "Subject.sol");
    writeFileSync(file, body.contractCode, "utf8");
    console.log(`[run] running specialist audit on ${file}…`);
    const report = await auditContract(file);
    console.log(
        `[run] specialist audit complete: ${report.findings.length} findings, methodologies: ${report.methodologiesUsed.join(", ")}`,
    );

    // -------- 4. Stake using the delegation chain [leaf, root] --------
    console.log(`[run] staking on Specialist's used methodologies via chain…`);
    const stakes: StakeAction[] = await stakeOnUsedMethodologies({
        methodologiesUsed: report.methodologiesUsed,
        composeDelegation: [body.subDelegation, body.rootDelegation],
        agentWalletClient,
        publicClient,
        agentSelfThing: {
            name: `ARP Specialist runtime ${agentAccount.address.slice(0, 8)}`,
            description: `Specialist ARP agent, runtime ${agentAccount.address}, parent ${body.auditorAddress}.`,
        },
    });
    console.log(formatStakeActions(stakes));

    // -------- 5. Sign the receipt --------
    const requestHash = keccak256(
        toHex(
            JSON.stringify({
                contractCode: body.contractCode,
                parentPaymentTxHash: body.parentPaymentTxHash,
                subPaymentTxHash: body.subPaymentTxHash,
                requesterAddress: body.requesterAddress,
            }),
        ),
    );
    const resultHash = keccak256(toHex(report.rawResponse));
    const digest = keccak256(
        toHex(`${requestHash}|${resultHash}|${agentAccount.address}`),
    );
    const signature = await agentAccount.signMessage({message: {raw: digest}});

    return {
        report,
        stakes,
        receipt: {
            role: "specialist",
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

function replacer(_key: string, value: unknown): unknown {
    if (typeof value === "bigint") return value.toString();
    return value;
}

void readFileSync; // unused but kept for parity with auditor server

main().catch((err) => {
    console.error("agent-server-specialist failed to start:", err);
    process.exit(1);
});
