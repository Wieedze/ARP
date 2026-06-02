/**
 * Task 03b Phase 4 — End-to-end demo of the ARP delegation flow.
 *
 *   user EOA -> user Smart Account (delegator)
 *                  |
 *                  | signs delegation (caveats: DomainScope + TrustStakeCap)
 *                  v
 *           agent EOA (delegate) -> redeems against DelegationManager
 *                                       |
 *                                       v
 *                                ModuleRegistry.registerModule
 *
 * Two flows are exercised on real Intuition Testnet:
 *
 *   HAPPY  — agent registers a module in the authorized "solidity-audit"
 *            domain. Both enforcers pass. Tx confirms. Module id appears
 *            on-chain.
 *
 *   REVERT — agent tries to register in an UNAUTHORIZED "url-classification"
 *            domain. DomainScopeEnforcer.beforeHook reverts with
 *            DomainNotAllowed(bytes32). The whole redemption aborts.
 *
 * Required env (in .env at repo root):
 *   PRIVATE_KEY        — owner of the user Smart Account
 *   AGENT_PRIVATE_KEY  — agent EOA (separate from PRIVATE_KEY)
 *
 * Run:
 *   bun run scripts/demo-delegation.ts
 */

import {
    createPublicClient,
    createWalletClient,
    http,
    parseEther,
    type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {intuitionTestnet} from "../app/src/lib/chains";
import {
    domainScopeCaveat,
    trustStakeCapCaveat,
} from "../app/src/lib/caveat-builder";
import {
    buildDelegation,
    signDelegationAs,
} from "../app/src/services/delegation";
import {
    buildRegisterModuleExecution,
    redeemArpDelegation,
} from "../app/src/services/agent-action";
import {
    createUserSmartAccount,
    deploySmartAccountIfNeeded,
} from "../app/src/services/smart-account";

const SOLIDITY_AUDIT_DOMAIN = "solidity-audit";
const UNAUTHORIZED_DOMAIN = "url-classification";

const DEMO_SCHEMA_URI = "ipfs://bafkreiembmtprqzufrdkvig74lskv6iazuatblm4hwmtxkf5a3v67mkdkm";

async function main() {
    const userPrivateKey = process.env.PRIVATE_KEY as Hex | undefined;
    const agentPrivateKey = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
    if (!userPrivateKey) throw new Error("PRIVATE_KEY env var required");
    if (!agentPrivateKey) throw new Error("AGENT_PRIVATE_KEY env var required (see .env.example)");

    const userAccount = privateKeyToAccount(userPrivateKey);
    const agentAccount = privateKeyToAccount(agentPrivateKey);

    const publicClient = createPublicClient({chain: intuitionTestnet, transport: http()});
    const userWalletClient = createWalletClient({
        account: userAccount,
        chain: intuitionTestnet,
        transport: http(),
    });
    const agentWalletClient = createWalletClient({
        account: agentAccount,
        chain: intuitionTestnet,
        transport: http(),
    });

    // -------- 1. Create + deploy the user's Smart Account --------
    //
    // The Smart Account is counterfactual at first (deterministic address,
    // no bytecode). The DelegationManager invokes `executeFromExecutor`
    // on the delegator after enforcer checks — so the SA must be a real
    // contract at its address. We deploy via the SimpleFactory directly,
    // funded by the user's EOA. Bundler/userOp flow is Task 04b.

    const userSmartAccount = await createUserSmartAccount({
        owner: userAccount.address,
        signer: {account: userAccount},
    });

    console.log("user EOA:           ", userAccount.address);
    console.log("user Smart Account: ", userSmartAccount.address);
    console.log("agent EOA:          ", agentAccount.address);
    console.log("");

    const deployTx = await deploySmartAccountIfNeeded({
        smartAccount: userSmartAccount,
        funderWalletClient: userWalletClient,
    });
    if (deployTx) {
        console.log("Smart Account deployed:", deployTx);
    } else {
        console.log("Smart Account already deployed.");
    }
    console.log("");

    const agentBalance = await publicClient.getBalance({address: agentAccount.address});
    console.log("agent balance:      ", agentBalance.toString(), "wei", `(${Number(agentBalance) / 1e18} tTRUST)`);
    if (agentBalance === 0n) {
        throw new Error("Agent EOA has 0 tTRUST — fund it from the user wallet before running the demo.");
    }

    // -------- 2. Build + sign the delegation --------

    const caveats = [
        domainScopeCaveat([SOLIDITY_AUDIT_DOMAIN]),
        trustStakeCapCaveat(parseEther("10"), 86_400n), // 10 tTRUST per day
    ];

    const unsignedDelegation = buildDelegation({
        delegator: userSmartAccount.address,
        delegate: agentAccount.address,
        caveats,
    });

    const signedDelegation = await signDelegationAs({
        delegation: unsignedDelegation,
        smartAccount: userSmartAccount,
    });

    console.log("\n[delegation signed via Smart Account]");
    console.log("  delegator (SA):   ", signedDelegation.delegator);
    console.log("  delegate (agent): ", signedDelegation.delegate);
    console.log("  authority:        ", signedDelegation.authority);
    console.log("  caveats:          ", signedDelegation.caveats.length, "→", signedDelegation.caveats.map((c) => c.enforcer));
    console.log("  signature:        ", signedDelegation.signature.slice(0, 24) + "…");

    // -------- 3. HAPPY PATH — register in authorized domain --------

    console.log("\n[HAPPY] agent registers in", SOLIDITY_AUDIT_DOMAIN, "(authorized)…");
    const happyExecution = buildRegisterModuleExecution({
        name: "Demo Audit Module",
        domain: SOLIDITY_AUDIT_DOMAIN,
        schemaURI: DEMO_SCHEMA_URI,
        description: "ARP delegation demo — registered under user authority.",
    });

    const happyTx = await redeemArpDelegation({
        signedDelegation,
        execution: happyExecution,
        agentWalletClient,
    });
    const happyReceipt = await publicClient.waitForTransactionReceipt({hash: happyTx});
    console.log("  tx:               ", happyTx);
    console.log("  status:           ", happyReceipt.status, `(block ${happyReceipt.blockNumber})`);

    // -------- 4. REVERT PATH — register in unauthorized domain --------

    console.log("\n[REVERT] agent tries to register in", UNAUTHORIZED_DOMAIN, "(not authorized)…");
    const badExecution = buildRegisterModuleExecution({
        name: "Bad Module",
        domain: UNAUTHORIZED_DOMAIN,
        schemaURI: DEMO_SCHEMA_URI,
        description: "Should revert via DomainScopeEnforcer.",
    });

    try {
        const badTx = await redeemArpDelegation({
            signedDelegation,
            execution: badExecution,
            agentWalletClient,
        });
        console.error("  UNEXPECTED: tx accepted:", badTx);
        process.exit(2);
    } catch (err) {
        const msg = (err as Error).message ?? String(err);
        const short = msg.length > 240 ? msg.slice(0, 240) + "…" : msg;
        console.log("  reverted as expected:");
        console.log("  ", short);
    }

    console.log("\nDemo complete.");
}

main().catch((err) => {
    console.error("\nDemo failed:", err);
    process.exit(1);
});
