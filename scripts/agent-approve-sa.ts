/**
 * One-time setup — runtime EOA approves the operator's Smart Account to
 * deposit on its behalf, so subsequent agent-loop redemptions can stake
 * into vaults with `receiver = runtime`.
 *
 * Why this is a separate script (not inside agent-loop):
 *   - `MultiVault.approvals` mapping is `internal` — there is no public
 *     getter to check the current state cheaply.
 *   - Scanning `ApprovalTypeUpdated` events on every loop start adds an
 *     RPC roundtrip for an operation that genuinely happens once.
 *   - Following the ERC-20 pattern: operators run approve once at setup
 *     and the runtime assumes it from there. Cleanest separation.
 *
 *   .env reads:
 *     AGENT_PRIVATE_KEY        — runtime EOA, must already be funded with gas
 *     DELEGATION_PUBLISH_JSON  — to recover the Smart Account address (the
 *                                delegation's `delegator`); accepts either
 *                                this or DELEGATION_COMPOSE_JSON, they share
 *                                the same SA.
 *
 *   Run:
 *     bun run scripts/agent-approve-sa.ts
 */

import {
    createPublicClient,
    createWalletClient,
    formatEther,
    http,
    type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {intuitionTestnet} from "../app/src/lib/chains";
import {deserializeDelegation} from "../app/src/services/delegation";
import {grantSmartAccountDepositApproval} from "../app/src/services/delegation-redeem";

async function main() {
    const agentPk = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
    if (!agentPk) throw new Error("AGENT_PRIVATE_KEY required");
    const delegationJson =
        process.env.DELEGATION_PUBLISH_JSON ?? process.env.DELEGATION_COMPOSE_JSON;
    if (!delegationJson) {
        throw new Error(
            "DELEGATION_PUBLISH_JSON or DELEGATION_COMPOSE_JSON required to recover the Smart Account address",
        );
    }
    const delegation = deserializeDelegation(delegationJson);
    const smartAccountAddress = delegation.delegator;

    const agentAccount = privateKeyToAccount(agentPk);
    const publicClient = createPublicClient({chain: intuitionTestnet, transport: http()});
    const agentWalletClient = createWalletClient({
        account: agentAccount,
        chain: intuitionTestnet,
        transport: http(),
    });

    const balance = await publicClient.getBalance({address: agentAccount.address});
    if (balance === 0n) {
        throw new Error(
            `Runtime ${agentAccount.address} has 0 tTRUST — fund it from the operator wallet before running this script.`,
        );
    }

    console.log("agent-approve-sa — one-time setup");
    console.log(`  runtime address  ${agentAccount.address}`);
    console.log(`  smart account    ${smartAccountAddress}`);
    console.log(`  runtime balance  ${formatEther(balance)} tTRUST`);
    console.log("");
    console.log("granting DEPOSIT approval to the SA…");

    const tx = await grantSmartAccountDepositApproval({
        agentWalletClient,
        smartAccountAddress,
        publicClient,
    });
    console.log(`  tx               ${tx}`);
    console.log("");
    console.log("Done. The agent-loop can now stake on behalf of the runtime.");
    console.log("Run:   bun run scripts/agent-loop.ts");
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("\nagent-approve-sa failed:", err);
    process.exit(1);
});
