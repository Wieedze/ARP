/**
 * Smoke-test the agent-server end-to-end without MetaMask.
 *
 * Reads from .env:
 *   PRIVATE_KEY              the operator EOA (acts as requester here)
 *   AGENT_PRIVATE_KEY        the runtime EOA (= the agent's payment target)
 *   AGENT_SERVER_PORT        defaults to 3001
 *   AGENT_MIN_BUDGET_TTRUST  defaults to 0.005
 *
 *   bun run scripts/test-agent-server.ts [path-to-sol]
 *
 * Steps:
 *   1. send AGENT_MIN_BUDGET_TTRUST from operator → runtime
 *   2. wait for the tx receipt
 *   3. POST /run with the contract code + tx hash + requester address
 *   4. pretty-print the response
 */

import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
    createPublicClient,
    createWalletClient,
    formatEther,
    http,
    parseEther,
    type Address,
    type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {intuitionTestnet} from "../app/src/lib/chains";

async function main() {
    const opPk = process.env.PRIVATE_KEY as Hex | undefined;
    const agentPk = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
    if (!opPk) throw new Error("PRIVATE_KEY required (operator EOA)");
    if (!agentPk) throw new Error("AGENT_PRIVATE_KEY required (runtime EOA)");

    const port = Number(process.env.AGENT_SERVER_PORT ?? "3001");
    const budget = parseEther(process.env.AGENT_MIN_BUDGET_TTRUST ?? "0.005");

    const contractPath = resolve(
        process.cwd(),
        process.argv[2] ?? "sample-contracts/Reentrant.sol",
    );
    const contractCode = readFileSync(contractPath, "utf8");

    const operator = privateKeyToAccount(opPk);
    const agent = privateKeyToAccount(agentPk);

    const publicClient = createPublicClient({
        chain: intuitionTestnet,
        transport: http(),
    });
    const operatorClient = createWalletClient({
        account: operator,
        chain: intuitionTestnet,
        transport: http(),
    });

    console.log("test-agent-server smoke test");
    console.log(`  operator (requester) ${operator.address}`);
    console.log(`  agent runtime        ${agent.address}`);
    console.log(`  contract             ${contractPath}`);
    console.log(`  budget               ${formatEther(budget)} tTRUST`);
    console.log("");

    // -------- 0. healthcheck --------
    const health = await fetch(`http://localhost:${port}/healthz`).catch(
        () => null,
    );
    if (!health || !health.ok) {
        throw new Error(
            `agent-server not reachable on localhost:${port}. Run \`bun run scripts/agent-server.ts\` first.`,
        );
    }
    const healthBody = (await health.json()) as {agent: Address};
    if (healthBody.agent.toLowerCase() !== agent.address.toLowerCase()) {
        throw new Error(
            `server reports agent=${healthBody.agent} but .env AGENT_PRIVATE_KEY derives to ${agent.address}`,
        );
    }
    console.log("[1/3] health check OK");

    // -------- 1. send payment --------
    console.log(`[2/3] sending ${formatEther(budget)} tTRUST → ${agent.address}…`);
    const paymentTxHash = await operatorClient.sendTransaction({
        to: agent.address,
        value: budget,
        chain: intuitionTestnet,
    });
    console.log(`      tx hash: ${paymentTxHash}`);
    await publicClient.waitForTransactionReceipt({hash: paymentTxHash});
    console.log("      confirmed");

    // -------- 2. POST /run --------
    console.log("[3/3] POST /run…");
    const res = await fetch(`http://localhost:${port}/run`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            contractCode,
            paymentTxHash,
            requesterAddress: operator.address,
        }),
    });
    const body = (await res.json()) as {
        report?: {
            contractName: string;
            findings: {severity: string; title: string}[];
            methodologiesUsed: string[];
        };
        stakes?: {
            methodology: string;
            matchedModule?: {name: string};
            skipped?: string;
            stake?: {amount: string; tx: string};
            error?: string;
        }[];
        receipt?: {agent: Address; signature: Hex};
        subcontract?: {
            subPaymentTxHash: string;
            specialistResponse: {
                report: {
                    findings: {severity: string; title: string}[];
                    methodologiesUsed: string[];
                };
                stakes: {
                    methodology: string;
                    matchedModule?: {name: string};
                    skipped?: string;
                    stake?: {amount: string; tx: string};
                    error?: string;
                }[];
                receipt: {agent: Address; signature: Hex};
            };
        } | null;
        error?: string;
    };

    if (!res.ok || body.error) {
        console.error("server error:", body.error ?? `HTTP ${res.status}`);
        process.exit(1);
    }

    console.log("");
    console.log("=== AUDIT REPORT ===");
    console.log(`contract:           ${body.report!.contractName}`);
    console.log(`findings:           ${body.report!.findings.length}`);
    for (const f of body.report!.findings) {
        console.log(`  [${f.severity.toUpperCase()}] ${f.title}`);
    }
    console.log(`methodologies:      ${body.report!.methodologiesUsed.join(", ")}`);

    console.log("");
    console.log("=== ON-CHAIN STAKES ===");
    for (const s of body.stakes!) {
        if (s.skipped === "no-match") {
            console.log(`  [skip]  "${s.methodology}" — no manifest match`);
        } else if (s.error) {
            console.log(
                `  [fail]  ${s.matchedModule?.name} — ${s.error.slice(0, 80)}`,
            );
        } else if (s.stake) {
            console.log(
                `  [ok]    ${s.matchedModule?.name} — staked ${formatEther(BigInt(s.stake.amount))} tTRUST, tx ${s.stake.tx.slice(0, 12)}…`,
            );
        }
    }

    console.log("");
    console.log("=== SIGNED RECEIPT (AUDITOR) ===");
    console.log(`agent:         ${body.receipt!.agent}`);
    console.log(`signature:     ${body.receipt!.signature.slice(0, 30)}…`);

    if (body.subcontract) {
        const sub = body.subcontract;
        console.log("");
        console.log("=== A2A SUBCONTRACT → SPECIALIST ===");
        console.log(`sub-payment tx:  ${sub.subPaymentTxHash}`);
        console.log(`specialist:      ${sub.specialistResponse.receipt.agent}`);
        console.log(`findings:        ${sub.specialistResponse.report.findings.length}`);
        for (const f of sub.specialistResponse.report.findings) {
            console.log(`  [${f.severity.toUpperCase()}] ${f.title}`);
        }
        console.log(`methodologies:   ${sub.specialistResponse.report.methodologiesUsed.join(", ")}`);
        console.log("");
        console.log("--- SPECIALIST ON-CHAIN STAKES ---");
        for (const s of sub.specialistResponse.stakes) {
            if (s.skipped === "no-match") {
                console.log(`  [skip]  "${s.methodology.slice(0, 60)}" — no manifest match`);
            } else if (s.error) {
                console.log(`  [fail]  ${s.matchedModule?.name} — ${s.error.slice(0, 100)}`);
            } else if (s.stake) {
                console.log(
                    `  [ok]    ${s.matchedModule?.name} — staked ${formatEther(BigInt(s.stake.amount))} tTRUST, tx ${s.stake.tx.slice(0, 12)}…`,
                );
            }
        }
        console.log("");
        console.log("--- SPECIALIST RECEIPT ---");
        console.log(`agent:         ${sub.specialistResponse.receipt.agent}`);
        console.log(`signature:     ${sub.specialistResponse.receipt.signature.slice(0, 30)}…`);
    }

    console.log("");
    console.log("OK. Refresh the marketplace home page — the audit tools' TVL just climbed.");
}

main().catch((err) => {
    console.error("test failed:", err);
    process.exit(1);
});
