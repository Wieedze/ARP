/**
 * Headless agent runtime — Task 04c demo prop.
 *
 *   .env reads:
 *     PRIVATE_KEY              — operator EOA (used to derive the Smart
 *                                Account address for sanity checks; no
 *                                signing happens with this key here).
 *     AGENT_PRIVATE_KEY        — runtime EOA, the delegate of both
 *                                delegations.
 *     DELEGATION_PUBLISH_JSON  — JSON of the signed publish delegation
 *                                (`/agent` step 4 → "Copy as .env").
 *     DELEGATION_COMPOSE_JSON  — JSON of the signed compose delegation.
 *     MANIFEST_PATH            — defaults to `scripts/manifest-modules.json`
 *
 *   What it does:
 *     1. Pin + ensure the agent's self-atom on Intuition (one-time).
 *     2. For each entry of the manifest:
 *        a. If the operator's publish-delegation authorizes this domain →
 *           call `redeemRegisterModule` (catches DomainNotAllowed
 *           gracefully).
 *        b. After publish: ensure the module's tool atom (createAtoms via
 *           compose delegation), declare the (agent, uses, tool) triple,
 *           stake a small amount of tTRUST on the tool atom.
 *     3. Print structured per-step log lines: action, tx, vault TVL.
 *
 * Run:
 *     bun run scripts/agent-loop.ts
 */

import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
    createPublicClient,
    createWalletClient,
    formatEther,
    http,
    parseEther,
    type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {intuitionTestnet} from "../app/src/lib/chains";
import {deployments} from "../app/src/lib/deployments";
import {moduleRegistryAbi} from "../app/src/lib/abi/module-registry";
import {multiVaultAbi} from "../app/src/lib/abi/multi-vault";
import {deserializeDelegation} from "../app/src/services/delegation";
import {
    redeemDeclareTriple,
    redeemEnsureAtomForThing,
    redeemEnsureAtomForURI,
    redeemRegisterModule,
    redeemStakeOnAtom,
} from "../app/src/services/delegation-redeem";

type ManifestEntry = {
    name: string;
    domain: string;
    schemaURI: string;
    description: string;
};

async function main() {
    const agentPk = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
    if (!agentPk) throw new Error("AGENT_PRIVATE_KEY required");
    const publishJson = process.env.DELEGATION_PUBLISH_JSON;
    const composeJson = process.env.DELEGATION_COMPOSE_JSON;
    if (!publishJson) throw new Error("DELEGATION_PUBLISH_JSON required (paste from /agent step 4)");
    if (!composeJson) throw new Error("DELEGATION_COMPOSE_JSON required");

    const manifestPath = resolve(
        process.cwd(),
        process.env.MANIFEST_PATH ?? "scripts/manifest-modules.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestEntry[];

    const publishDel = deserializeDelegation(publishJson);
    const composeDel = deserializeDelegation(composeJson);

    const agentAccount = privateKeyToAccount(agentPk);
    if (
        publishDel.delegate.toLowerCase() !== agentAccount.address.toLowerCase()
    ) {
        throw new Error(
            `Publish delegation delegate ${publishDel.delegate} != runtime ${agentAccount.address}`,
        );
    }
    if (
        composeDel.delegate.toLowerCase() !== agentAccount.address.toLowerCase()
    ) {
        throw new Error(
            `Compose delegation delegate ${composeDel.delegate} != runtime ${agentAccount.address}`,
        );
    }

    const publicClient = createPublicClient({chain: intuitionTestnet, transport: http()});
    const agentWalletClient = createWalletClient({
        account: agentAccount,
        chain: intuitionTestnet,
        transport: http(),
    });

    const balance = await publicClient.getBalance({address: agentAccount.address});
    if (balance === 0n) {
        throw new Error(
            `Agent ${agentAccount.address} has 0 tTRUST — fund it from the operator wallet first.`,
        );
    }

    log("agent runtime starting");
    log(`  runtime address  ${agentAccount.address}`);
    log(`  delegator (SA)   ${publishDel.delegator}`);
    log(`  balance          ${formatEther(balance)} tTRUST`);
    log(`  manifest         ${manifest.length} entries from ${manifestPath}`);

    // Pre-requisite (one-time, NOT done here): the runtime must have called
    // `MultiVault.approve(SA, DEPOSIT)` once so the SA can deposit on the
    // runtime's behalf. Run `bun run scripts/agent-approve-sa.ts` after the
    // initial funding step. The agent-loop deliberately does NOT check this
    // (no RPC scan, no state file) — if the approval is missing, the first
    // stake reverts with `MultiVault_SenderNotApproved` and the catch
    // surfaces a pointer.

    // -------- 1. Ensure the agent's self-atom -------------------------------
    log("\nensuring agent self-atom");
    const agentAtom = await redeemEnsureAtomForThing({
        signedDelegation: composeDel,
        agentWalletClient,
        publicClient,
        thing: {
            name: `ARP Agent runtime ${agentAccount.address.slice(0, 8)}`,
            description: `Headless ARP agent, runtime ${agentAccount.address}, delegator ${publishDel.delegator}.`,
        },
    });
    log(
        `  agent atom       ${agentAtom.atomId.slice(0, 12)}… ${agentAtom.created ? "(created)" : "(reused)"}`,
    );

    // -------- 2. Resolve the "uses" predicate atom --------------------------
    const usesAtom = await redeemEnsureAtomForThing({
        signedDelegation: composeDel,
        agentWalletClient,
        publicClient,
        thing: {
            name: "uses",
            description:
                "ARP predicate — links an agent atom to a tool atom that the " +
                "agent composes with. The triple (agent, uses, tool) is the " +
                "immutable layer of ARP's two-layer reputation model.",
        },
    });
    log(`  uses predicate   ${usesAtom.atomId.slice(0, 12)}…`);

    // -------- 3. Walk the manifest ------------------------------------------
    let published = 0;
    let composed = 0;
    let domainRejects = 0;

    for (const entry of manifest) {
        log(`\nprocessing ${entry.name} (${entry.domain})`);

        // 3.a — publish module via publish delegation (skip if already
        // registered — ADR 0013 makes ModuleRegistry enforce schemaURI
        // uniqueness, so an off-chain check here avoids burning gas on a
        // tx that would revert with ModuleAlreadyRegistered. The agent
        // still composes (triple + stake) below regardless: position
        // taking does not require having been the original publisher.
        const existingId = await publicClient.readContract({
            address: deployments.arp.moduleRegistry,
            abi: moduleRegistryAbi,
            functionName: "getModuleIdBySchemaURI",
            args: [entry.schemaURI],
        });

        if (existingId !== 0n) {
            log(`  already exists   #${existingId.toString()}  (skipping publish, taking position)`);
        } else {
            try {
                const tx = await redeemRegisterModule({
                    signedDelegation: publishDel,
                    agentWalletClient,
                    name: entry.name,
                    domain: entry.domain,
                    schemaURI: entry.schemaURI,
                    description: entry.description,
                });
                await publicClient.waitForTransactionReceipt({hash: tx});
                log(`  published        ${tx}`);
                published += 1;
            } catch (err) {
                const msg = (err as Error).message ?? String(err);
                // DomainNotAllowed(bytes32) — keccak256 first 4 bytes. Viem
                // surfaces the raw selector hex when the error isn't in the
                // provided ABI, so we match both the string (if a future ABI
                // version includes it) and the selector.
                if (msg.includes("DomainNotAllowed") || msg.includes("0xf2882f43")) {
                    log(`  domain rejected  ${entry.domain}  (DomainNotAllowed)`);
                    domainRejects += 1;
                    // No publish authority and no existing module to position
                    // on. Skip the entry entirely — the marketplace would have
                    // no module record to surface the stake against.
                    continue;
                }
                log(`  publish failed   ${truncate(msg)}`);
                continue;
            }
        }

        // 3.b — compose: ensure tool atom + declare triple + stake
        try {
            // The tool atom is created from the manifest's `schemaURI`
            // directly (ADR 0008 — the schemaURI IS the canonical tool URI).
            // Idempotent: if it already exists, redeemEnsureAtomForURI
            // returns the existing atomId without sending a tx.
            const toolAtomRes = await redeemEnsureAtomForURI({
                signedDelegation: composeDel,
                agentWalletClient,
                publicClient,
                uri: entry.schemaURI,
            });
            const toolAtomId = toolAtomRes.atomId;
            log(
                `  tool atom        ${toolAtomId.slice(0, 12)}…  ${toolAtomRes.created ? "(created)" : "(reused)"}`,
            );

            const tripleRes = await redeemDeclareTriple({
                signedDelegation: composeDel,
                agentWalletClient,
                publicClient,
                subjectAtomId: agentAtom.atomId,
                predicateAtomId: usesAtom.atomId,
                objectAtomId: toolAtomId,
            });
            if (tripleRes.created) {
                log(`  declared triple  ${tripleRes.tx}`);
            } else {
                log(`  triple           ${tripleRes.tripleId.slice(0, 12)}… (reused)`);
            }

            const stakeAmount = parseEther("0.001");
            const stakeTx = await redeemStakeOnAtom({
                signedDelegation: composeDel,
                agentWalletClient,
                publicClient,
                atomId: toolAtomId,
                amount: stakeAmount,
            });
            await publicClient.waitForTransactionReceipt({hash: stakeTx});
            log(`  staked           ${formatEther(stakeAmount)} tTRUST  tx=${stakeTx}`);

            const curveConfig = await publicClient.readContract({
                address: deployments.intuition.multiVault,
                abi: multiVaultAbi,
                functionName: "getBondingCurveConfig",
            });
            const [tvl, shares] = await publicClient.readContract({
                address: deployments.intuition.multiVault,
                abi: multiVaultAbi,
                functionName: "getVault",
                args: [toolAtomId, curveConfig.defaultCurveId],
            });
            log(`  vault            tvl=${formatEther(tvl)} tTRUST shares=${shares}`);
            composed += 1;
        } catch (err) {
            const msg = (err as Error).message ?? String(err);
            if (msg.includes("StakeExceedsCap")) {
                log(`  cap reached      (TrustStakeCapEnforcer reverted)`);
                break;
            }
            // 0xd76f6ff8 = MultiVault_SenderNotApproved — the runtime hasn't
            // approved the SA to deposit on its behalf yet. One-time setup.
            if (msg.includes("0xd76f6ff8") || msg.includes("SenderNotApproved")) {
                log(
                    `  setup missing    runtime has not approved SA to deposit.\n` +
                        `                  → run: bun run scripts/agent-approve-sa.ts\n` +
                        `                  then re-run this loop.`,
                );
                break;
            }
            log(`  compose failed   ${truncate(msg)}`);
        }
    }

    log(
        `\ndone. published=${published} composed=${composed} domainRejects=${domainRejects}`,
    );
}

function log(s: string) {
    // eslint-disable-next-line no-console
    console.log(s);
}

function truncate(s: string, n = 240): string {
    return s.length > n ? `${s.slice(0, n)}…` : s;
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("\nagent-loop failed:", err);
    process.exit(1);
});
