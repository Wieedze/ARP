/**
 * After an audit completes, translate the cited methodologies into
 * on-chain actions:
 *
 *   1. Match each methodology name from the audit output to its
 *      `manifest-modules.json` entry by name keyword.
 *   2. For each match, ensure the tool atom exists on Intuition
 *      (`redeemEnsureAtomForURI` — idempotent).
 *   3. Declare a `(agent_self_atom, uses, tool_atom)` triple on the
 *      graph (idempotent — skip if already created).
 *   4. Stake a small amount of tTRUST on the tool atom — the agent's
 *      economic conviction that the methodology contributed.
 *
 * All three on-chain calls go through the compose delegation. Nothing
 * here knows about the audit's content — it only acts on the cited
 * methodology list. Reusable for any agent persona that wants to
 * "stake on what it used".
 */

import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {formatEther, parseEther, type Hex} from "viem";
import {
    type Account,
    type Chain,
    type PublicClient,
    type Transport,
    type WalletClient,
} from "viem";
import {type Delegation} from "@metamask/smart-accounts-kit";

import {
    redeemDeclareTriple,
    redeemEnsureAtomForThing,
    redeemEnsureAtomForURI,
    redeemStakeOnAtom,
} from "../app/src/services/delegation-redeem";

export type ManifestEntry = {
    name: string;
    domain: string;
    schemaURI: string;
    description: string;
};

export type StakeAction = {
    methodology: string;
    matchedModule?: ManifestEntry;
    skipped?: "no-match" | "no-budget";
    atomId?: Hex;
    triple?: {created: boolean; tripleId: Hex; tx?: Hex};
    stake?: {amount: bigint; tx: Hex};
    error?: string;
};

const DEFAULT_MANIFEST_PATH = resolve(process.cwd(), "scripts/manifest-modules.json");

let cachedManifest: ManifestEntry[] | null = null;

function loadManifest(path = DEFAULT_MANIFEST_PATH): ManifestEntry[] {
    if (cachedManifest) return cachedManifest;
    cachedManifest = JSON.parse(readFileSync(path, "utf8")) as ManifestEntry[];
    return cachedManifest;
}

/**
 * Fuzzy-match a methodology string against manifest module names.
 *
 * The agent's audit output may say:
 *   "Trail of Bits Secure Workflow Guide"
 *   "secure-workflow-guide skill"
 *   "TOB secure-workflow"
 *   "Slither static analysis"
 *
 * We normalize both sides (lowercase, strip non-alphanumeric) then check
 * containment in either direction. Good-enough for the hackathon scope;
 * a future version could use embeddings.
 */
function matchManifestEntry(
    methodology: string,
    manifest: ManifestEntry[],
): ManifestEntry | undefined {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const needle = norm(methodology);
    if (needle.length === 0) return undefined;

    for (const entry of manifest) {
        const hay = norm(entry.name);
        if (hay.includes(needle) || needle.includes(hay)) return entry;
    }
    // Match on key token only (e.g. "slither", "scsvs")
    const tokens = methodology
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4);
    for (const tok of tokens) {
        for (const entry of manifest) {
            if (entry.name.toLowerCase().includes(tok)) return entry;
        }
    }
    return undefined;
}

/**
 * Run the post-audit on-chain effects.
 *
 * @param params.methodologiesUsed  The methodology strings cited by the agent
 *                                  in its audit output (from `AuditReport`).
 * @param params.composeDelegation  The signed compose delegation for the agent
 *                                  (single Delegation, or chain `[leaf, root]`
 *                                  for sub-delegation flows).
 * @param params.agentWalletClient  The runtime EOA client (delegate).
 * @param params.publicClient       For reads + waitForTransactionReceipt.
 * @param params.agentSelfThing     The agent's identity Thing (used to
 *                                  ensure its self-atom exists if not yet).
 * @param params.stakePerUsage      Amount staked on each cited methodology's
 *                                  atom. Defaults to 0.001 tTRUST per call.
 * @param params.manifestPath       Optional override for the manifest file
 *                                  used to match methodology names.
 */
export async function stakeOnUsedMethodologies(params: {
    methodologiesUsed: string[];
    composeDelegation: Delegation | Delegation[];
    agentWalletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
    agentSelfThing: {name: string; description: string};
    stakePerUsage?: bigint;
    manifestPath?: string;
}): Promise<StakeAction[]> {
    const stakeAmount = params.stakePerUsage ?? parseEther("0.001");
    const manifest = loadManifest(params.manifestPath);

    // Ensure the agent's own atom exists (first call creates, subsequent reuse).
    const agentAtom = await redeemEnsureAtomForThing({
        signedDelegation: params.composeDelegation,
        agentWalletClient: params.agentWalletClient,
        publicClient: params.publicClient,
        thing: params.agentSelfThing,
    });

    // Ensure the canonical "uses" predicate atom exists (one-time, idempotent).
    const usesAtom = await redeemEnsureAtomForThing({
        signedDelegation: params.composeDelegation,
        agentWalletClient: params.agentWalletClient,
        publicClient: params.publicClient,
        thing: {
            name: "uses",
            description:
                "ARP predicate — links an agent atom to a tool atom that the " +
                "agent composes with. The triple (agent, uses, tool) is the " +
                "immutable layer of ARP's two-layer reputation model.",
        },
    });

    const actions: StakeAction[] = [];

    for (const methodology of params.methodologiesUsed) {
        const matched = matchManifestEntry(methodology, manifest);
        if (!matched) {
            actions.push({methodology, skipped: "no-match"});
            continue;
        }

        try {
            // 1. Ensure the tool atom exists for the matched manifest entry.
            const toolAtom = await redeemEnsureAtomForURI({
                signedDelegation: params.composeDelegation,
                agentWalletClient: params.agentWalletClient,
                publicClient: params.publicClient,
                uri: matched.schemaURI,
            });

            // 2. Declare (agent, uses, tool) triple. Idempotent — returns
            //    {created: false} if already on chain.
            const triple = await redeemDeclareTriple({
                signedDelegation: params.composeDelegation,
                agentWalletClient: params.agentWalletClient,
                publicClient: params.publicClient,
                subjectAtomId: agentAtom.atomId,
                predicateAtomId: usesAtom.atomId,
                objectAtomId: toolAtom.atomId,
            });

            // 3. Stake on the tool atom.
            const stakeTx = await redeemStakeOnAtom({
                signedDelegation: params.composeDelegation,
                agentWalletClient: params.agentWalletClient,
                publicClient: params.publicClient,
                atomId: toolAtom.atomId,
                amount: stakeAmount,
            });
            await params.publicClient.waitForTransactionReceipt({hash: stakeTx});

            actions.push({
                methodology,
                matchedModule: matched,
                atomId: toolAtom.atomId,
                triple: {
                    created: triple.created,
                    tripleId: triple.tripleId,
                    tx: triple.tx,
                },
                stake: {amount: stakeAmount, tx: stakeTx},
            });
        } catch (err) {
            actions.push({
                methodology,
                matchedModule: matched,
                error: (err as Error).message ?? String(err),
            });
        }
    }

    return actions;
}

/**
 * Pretty-print a list of stake actions for logging in the agent loop or
 * the HTTP server.
 */
export function formatStakeActions(actions: StakeAction[]): string {
    return actions
        .map((a) => {
            if (a.skipped === "no-match")
                return `  - "${a.methodology}" → no manifest match (skip)`;
            if (a.error)
                return `  - "${a.methodology}" → ${a.matchedModule?.name} → error: ${a.error.slice(0, 80)}`;
            const stake = a.stake
                ? `staked ${formatEther(a.stake.amount)} tTRUST`
                : "no stake";
            const triple = a.triple?.created
                ? "triple created"
                : a.triple
                  ? "triple reused"
                  : "no triple";
            return `  - "${a.methodology}" → ${a.matchedModule?.name} → ${triple}, ${stake}`;
        })
        .join("\n");
}
