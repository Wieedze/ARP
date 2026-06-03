/**
 * Provision the second agent (Specialist) end-to-end:
 *
 *   1. Generate a fresh runtime keypair for Specialist.
 *   2. Mint an ERC-8004 agent NFT (Maria's EOA pays).
 *   3. Bind the new runtime via `setAgentWallet` (Specialist signs its
 *      consent EIP-712, Maria submits).
 *   4. Fund the Specialist runtime with a small gas budget so it can
 *      send its own approve + future redeem txs.
 *   5. Have Specialist runtime call MultiVault.approve(SA, DEPOSIT) so
 *      the operator's SA can deposit on its behalf via the sub-delegation
 *      chain.
 *   6. Print + append the new env vars to copy into `.env`.
 *
 *   .env reads:
 *     PRIVATE_KEY              operator EOA (owns both Smart Account + agent NFTs)
 *     INTUITION_TESTNET_RPC_URL
 *
 *   Run:
 *     bun run scripts/setup-second-agent.ts
 */

import {createPublicClient, createWalletClient, formatEther, http, parseEther, type Hex} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";

import {intuitionTestnet} from "../app/src/lib/chains";
import {deployments} from "../app/src/lib/deployments";
import {identityRegistryAbi} from "../app/src/lib/abi/identity-registry";
import {grantSmartAccountDepositApproval} from "../app/src/services/delegation-redeem";
import {
    createUserSmartAccount,
    deploySmartAccountIfNeeded,
} from "../app/src/services/smart-account";
import {designateAgentRuntimeWallet, registerAgent} from "../app/src/services/agent-identity";

const RUNTIME_FUNDING = parseEther("0.005"); // gas budget for Specialist

async function main() {
    const opPk = process.env.PRIVATE_KEY as Hex | undefined;
    if (!opPk) throw new Error("PRIVATE_KEY required (operator EOA)");

    const operator = privateKeyToAccount(opPk);

    const publicClient = createPublicClient({chain: intuitionTestnet, transport: http()});
    const operatorClient = createWalletClient({
        account: operator,
        chain: intuitionTestnet,
        transport: http(),
    });

    console.log("setup-second-agent");
    console.log(`  operator EOA      ${operator.address}`);
    console.log("");

    const opBalance = await publicClient.getBalance({address: operator.address});
    if (opBalance < parseEther("0.02")) {
        throw new Error(
            `Operator balance ${formatEther(opBalance)} tTRUST is low — need at least 0.02 for the setup (gas + funding + tx fees).`,
        );
    }

    // -------- 1. Generate Specialist runtime --------
    const specialistRuntimePk = generatePrivateKey();
    const specialistAccount = privateKeyToAccount(specialistRuntimePk);
    console.log(`[1/5] generated runtime keypair`);
    console.log(`      address  ${specialistAccount.address}`);
    console.log(`      privkey  ${specialistRuntimePk.slice(0, 14)}…${specialistRuntimePk.slice(-6)}`);

    // -------- 2. Mint the agent NFT (operator pays) --------
    console.log("[2/5] minting ERC-8004 agent NFT…");
    const {agentId, tx: mintTx} = await registerAgent({
        walletClient: operatorClient,
        publicClient,
    });
    console.log(`      agentId #${agentId.toString()}  tx ${mintTx}`);

    // -------- 3. Designate Specialist as the runtime of this NFT --------
    console.log("[3/5] designating Specialist runtime (with our pre-generated key)…");
    const {tx: designateTx} = await designateAgentRuntimeWallet({
        agentId,
        operatorWalletClient: operatorClient,
        publicClient,
        runtimePrivateKey: specialistRuntimePk,
    });
    console.log(`      tx ${designateTx}`);

    // Sanity check: on-chain matches our local key.
    const onChainRuntime = await publicClient.readContract({
        address: deployments.arp.identityRegistry,
        abi: identityRegistryAbi,
        functionName: "getAgentWallet",
        args: [agentId],
    });
    if (onChainRuntime.toLowerCase() !== specialistAccount.address.toLowerCase()) {
        throw new Error(
            `on-chain runtime ${onChainRuntime} does not match our local key ${specialistAccount.address}`,
        );
    }

    // -------- 4. Fund the Specialist runtime (gas) --------
    console.log(`[4/5] funding Specialist runtime with ${formatEther(RUNTIME_FUNDING)} tTRUST gas…`);
    const fundTx = await operatorClient.sendTransaction({
        to: specialistAccount.address,
        value: RUNTIME_FUNDING,
        chain: intuitionTestnet,
    });
    await publicClient.waitForTransactionReceipt({hash: fundTx});
    console.log(`      tx ${fundTx}`);

    // -------- 5. Specialist approves the SA to deposit on its behalf --------
    const sa = await createUserSmartAccount({
        owner: operator.address,
        signer: {account: operator},
    });
    await deploySmartAccountIfNeeded({
        smartAccount: sa,
        funderWalletClient: operatorClient,
    });
    const specialistWalletClient = createWalletClient({
        account: specialistAccount,
        chain: intuitionTestnet,
        transport: http(),
    });
    console.log(`[5/5] Specialist runtime granting DEPOSIT approval to SA ${sa.address}…`);
    const approveTx = await grantSmartAccountDepositApproval({
        agentWalletClient: specialistWalletClient,
        smartAccountAddress: sa.address,
        publicClient,
    });
    console.log(`      tx ${approveTx}`);

    console.log("");
    console.log("===========================================================");
    console.log("Specialist agent ready. Append to .env:");
    console.log("");
    console.log(`AGENT2_AGENT_ID=${agentId.toString()}`);
    console.log(`AGENT2_RUNTIME_ADDRESS=${specialistAccount.address}`);
    console.log(`AGENT2_PRIVATE_KEY=${specialistRuntimePk}`);
    console.log("===========================================================");
}

main().catch((err) => {
    console.error("setup-second-agent failed:", err);
    process.exit(1);
});
