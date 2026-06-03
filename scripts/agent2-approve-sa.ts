/**
 * Re-grant the Specialist runtime → SA DEPOSIT approval explicitly.
 *
 * The `MultiVault.approvals` mapping is `internal` with no public getter,
 * so we cannot read whether the approval is already set. The contract's
 * `approve` is idempotent at the storage level — writing the same value
 * to the same slot is cheap. So this script always calls it.
 *
 *   .env reads:
 *     AGENT2_PRIVATE_KEY        runtime privkey for the Specialist
 *     DELEGATION_COMPOSE_JSON   used only to recover the operator's SA
 *                               address (== delegation.delegator)
 *
 *   Run:
 *     bun run scripts/agent2-approve-sa.ts
 */

import {createPublicClient, createWalletClient, formatEther, http, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {intuitionTestnet} from "../app/src/lib/chains";
import {deserializeDelegation} from "../app/src/services/delegation";
import {grantSmartAccountDepositApproval} from "../app/src/services/delegation-redeem";

async function main() {
    const agentPk = process.env.AGENT2_PRIVATE_KEY as Hex | undefined;
    if (!agentPk) throw new Error("AGENT2_PRIVATE_KEY required");
    const composeJson =
        process.env.DELEGATION_COMPOSE_JSON ??
        process.env.DELEGATION_PUBLISH_JSON;
    if (!composeJson) {
        throw new Error(
            "DELEGATION_COMPOSE_JSON or DELEGATION_PUBLISH_JSON required to recover the SA address",
        );
    }
    const compose = deserializeDelegation(composeJson);
    const saAddress = compose.delegator;

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
            `Specialist runtime ${agentAccount.address} has 0 tTRUST — fund it first.`,
        );
    }

    console.log("agent2-approve-sa");
    console.log(`  specialist runtime  ${agentAccount.address}`);
    console.log(`  smart account       ${saAddress}`);
    console.log(`  runtime balance     ${formatEther(balance)} tTRUST`);
    console.log("");
    console.log("granting DEPOSIT approval to the SA…");

    const tx = await grantSmartAccountDepositApproval({
        agentWalletClient,
        smartAccountAddress: saAddress,
        publicClient,
    });
    console.log(`  tx ${tx}`);
    console.log("");
    console.log("Done. The Specialist can now receive stake shares via the sub-delegation chain.");
}

main().catch((err) => {
    console.error("agent2-approve-sa failed:", err);
    process.exit(1);
});
