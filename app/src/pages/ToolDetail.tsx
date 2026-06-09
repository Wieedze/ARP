import {useEffect, useState} from "react";
import {Link, useParams} from "react-router-dom";
import {formatEther, parseEther, stringToHex, type Hex} from "viem";
import {getWalletClient} from "@wagmi/core";
import {useAccount, useWalletClient} from "wagmi";

import {multiVaultAbi} from "../lib/abi/multi-vault";
import {publicClient} from "../lib/clients";
import {deployments} from "../lib/deployments";
import {wagmiConfig} from "../lib/wagmi";
import {useAtomStake} from "../hooks/use-atom-stake";
import {useModule} from "../hooks/use-modules";
import {depositOnAtom} from "../services/atom-stake";
import {ensureAtomForURI} from "../services/intuition-graph";

type StepStatus = "idle" | "pending" | "done" | "error";

/**
 * Tool detail page (`/tool/:id`).
 *
 * Read-only metadata + vault metrics, plus a single human action: stake
 * tTRUST on the tool's atom from your own wallet. Agent runtimes do not
 * use this page — they discover + stake via `@arp-protocol/sdk` under a delegation
 * signed once by the operator. This page exists for humans browsing the
 * marketplace + showing how a runtime would integrate.
 */
export function ToolDetail() {
    const {id: idParam} = useParams();
    const moduleId = idParam ? BigInt(idParam) : null;
    const moduleQuery = useModule(moduleId);

    const {address: operatorAddress, isConnected} = useAccount();
    const {data: walletClient} = useWalletClient();

    const m = moduleQuery.data;

    // Tool atom IDs are content-derived from schemaURI via the MultiVault's
    // calculateAtomId(bytes32) view — fetch async on module load (ADR 0008).
    const [computedToolAtomId, setComputedToolAtomId] = useState<Hex | null>(null);
    useEffect(() => {
        if (!m) return;
        let cancelled = false;
        (async () => {
            const atomId = await publicClient.readContract({
                address: deployments.intuition.multiVault,
                abi: multiVaultAbi,
                functionName: "calculateAtomId",
                args: [stringToHex(m.schemaURI)],
            });
            if (!cancelled) setComputedToolAtomId(atomId);
        })().catch(() => {
            /* surface in UI later if needed */
        });
        return () => {
            cancelled = true;
        };
    }, [m]);

    const stakeQuery = useAtomStake(computedToolAtomId ?? undefined);

    // Human stake state
    const [amountInput, setAmountInput] = useState("0.05");
    const [stakeStatus, setStakeStatus] = useState<StepStatus>("idle");
    const [stakeError, setStakeError] = useState<string | null>(null);
    const [stakeSteps, setStakeSteps] = useState<{
        toolAtomTx?: string;
        toolAtomCreated?: boolean;
        depositTx?: string;
    }>({});

    async function getActiveWalletClient() {
        if (walletClient && walletClient.account) return walletClient;
        const fetched = await getWalletClient(wagmiConfig);
        if (!fetched || !fetched.account) {
            throw new Error("No wallet client available — make sure your wallet is connected.");
        }
        return fetched;
    }

    /**
     * Human stake — your wallet locks tTRUST on the tool's atom. No
     * triple, no agent identity. Ensures the tool atom exists first (any
     * caller pays atomCost once, subsequent stakers reuse it).
     */
    async function handleStake() {
        if (!m) return;
        setStakeStatus("pending");
        setStakeError(null);
        try {
            const amount = parseEther(amountInput.trim());
            const wc = await getActiveWalletClient();

            const toolAtomRes = await ensureAtomForURI({
                uri: m.schemaURI,
                walletClient: wc,
                publicClient,
            });
            setStakeSteps((s) => ({
                ...s,
                toolAtomTx: toolAtomRes.tx,
                toolAtomCreated: toolAtomRes.created,
            }));

            const depositTx = await depositOnAtom({
                atomId: toolAtomRes.atomId,
                amount,
                walletClient: wc,
                publicClient,
            });
            await publicClient.waitForTransactionReceipt({hash: depositTx});
            setStakeSteps((s) => ({...s, depositTx}));
            await stakeQuery.refetch();
            setStakeStatus("done");
        } catch (err) {
            setStakeStatus("error");
            setStakeError((err as Error).message);
        }
    }

    if (!moduleId) {
        return (
            <p className="text-[color:var(--color-fg-60)]">Invalid module ID.</p>
        );
    }

    if (moduleQuery.isLoading) {
        return <p className="text-[color:var(--color-fg-60)]">Loading module…</p>;
    }

    if (moduleQuery.error || !m) {
        return (
            <p className="text-[color:var(--color-fg-60)]">
                Module not found.{" "}
                <Link className="text-[color:var(--color-accent)]" to="/">
                    Back to modules
                </Link>
            </p>
        );
    }

    const stakeBusy = stakeStatus === "pending";

    return (
        <article>
            <Link
                to="/"
                className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-40)]"
            >
                ← modules
            </Link>

            <header className="mt-4 mb-10 grid sm:grid-cols-[1fr_auto] gap-x-8 gap-y-2 items-baseline">
                <h1 className="font-sans text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                    {m.name}
                </h1>
                <span className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-accent)]">
                    {m.domain}
                </span>
            </header>

            {/* ---------- Metadata table ---------- */}
            <dl className="grid grid-cols-[8rem_1fr] gap-y-3 gap-x-4 text-[length:var(--text-body-sm)] border-y border-[color:var(--color-border)] py-6">
                <dt className="text-[color:var(--color-fg-40)] uppercase tracking-wider text-[length:var(--text-label)]">
                    Module ID
                </dt>
                <dd className="font-mono">#{m.id.toString()}</dd>

                <dt className="text-[color:var(--color-fg-40)] uppercase tracking-wider text-[length:var(--text-label)]">
                    Creator
                </dt>
                <dd className="font-mono">
                    <a
                        href={`${deployments.chain.explorerUrl}/address/${m.creator}`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {m.creator}
                    </a>
                </dd>

                <dt className="text-[color:var(--color-fg-40)] uppercase tracking-wider text-[length:var(--text-label)]">
                    Schema URI
                </dt>
                <dd className="font-mono break-all">{m.schemaURI}</dd>

                <dt className="text-[color:var(--color-fg-40)] uppercase tracking-wider text-[length:var(--text-label)]">
                    Registered
                </dt>
                <dd className="font-mono">
                    {new Date(Number(m.createdAt) * 1000).toISOString()}
                </dd>
            </dl>

            {m.description ? (
                <p className="mt-6 text-[color:var(--color-fg-60)]">{m.description}</p>
            ) : null}

            {/* ---------- Reputation metrics ---------- */}
            <section className="mt-12">
                <h2 className="font-medium mb-4">Reputation</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Metric
                        label="Total staked"
                        value={
                            stakeQuery.data
                                ? `${formatEther(stakeQuery.data.totalAssets)} tTRUST`
                                : "—"
                        }
                    />
                    <Metric
                        label="Shares minted"
                        value={
                            stakeQuery.data
                                ? stakeQuery.data.totalShares.toString()
                                : "—"
                        }
                    />
                    <Metric
                        label="Tool atom"
                        value={
                            computedToolAtomId
                                ? `${computedToolAtomId.slice(0, 10)}…`
                                : "—"
                        }
                    />
                </div>
            </section>

            {/* ---------- Stake on this tool (human path) ---------- */}
            <section className="mt-12">
                <h2 className="font-medium mb-2">Stake on this tool</h2>

                {!isConnected ? (
                    <p className="text-[color:var(--color-fg-60)] text-[length:var(--text-body-sm)]">
                        Connect your wallet to stake.
                    </p>
                ) : stakeStatus === "done" ? (
                    <StakeSummary
                        steps={stakeSteps}
                        operatorAddress={operatorAddress ?? null}
                    />
                ) : (
                    <div>
                        <label className="block text-[length:var(--text-body-sm)] mb-2">
                            <span className="text-[color:var(--color-fg-60)]">
                                Amount
                            </span>
                            <input
                                type="text"
                                value={amountInput}
                                onChange={(e) => setAmountInput(e.target.value)}
                                disabled={stakeBusy}
                                className="mt-1 block w-48 bg-transparent border border-[color:var(--color-border)] px-3 py-1.5 font-mono focus:outline-none focus:border-[color:var(--color-accent)]"
                            />
                            <span className="ml-2 font-mono text-[color:var(--color-fg-40)]">
                                tTRUST
                            </span>
                        </label>
                        <button
                            type="button"
                            onClick={handleStake}
                            disabled={stakeBusy}
                            className="px-3 py-1.5 text-[length:var(--text-body-sm)]"
                        >
                            {stakeBusy ? "Staking…" : "Stake"}
                        </button>
                        {stakeError ? (
                            <p className="mt-4 text-[length:var(--text-body-sm)] font-mono break-all">
                                Error: {stakeError}
                            </p>
                        ) : null}
                        {stakeSteps.toolAtomTx || stakeSteps.depositTx ? (
                            <div className="mt-4">
                                <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)] mb-1">
                                    Progress
                                </p>
                                <PartialSteps steps={stakeSteps} />
                            </div>
                        ) : null}
                    </div>
                )}
            </section>

            {/* ---------- How runtimes use this tool ---------- */}
            <section className="mt-16">
                <h2 className="font-medium mb-2">How a runtime uses this tool</h2>
                <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] mb-6 max-w-[680px]">
                    A runtime embeds{" "}
                    <span className="font-mono">@arp-protocol/sdk</span>, holds a one-time
                    delegation signed by its operator, and declares + stakes on
                    tools it actually composes with — automatically, every time
                    it works.
                </p>
                <pre className="font-mono text-[length:var(--text-body-sm)] border border-[color:var(--color-border)] p-4 overflow-x-auto">
{`import {createArpClient, findModuleBySchemaURI} from "@arp-protocol/sdk";

// 1. Discover this tool (read-only, no auth).
const arp = createArpClient();
const tool = await findModuleBySchemaURI(arp, ${JSON.stringify(m.schemaURI)});

// 2. After the agent actually uses the tool, declare + stake
//    via the delegation its operator signed once. Pseudocode —
//    your runtime supplies the redeemer + delegation chain:
await runtime.declareUsage({
    toolAtomId: tool.atomId,
    stakeWei: parseEther("0.01"),
});`}
                </pre>
            </section>
        </article>
    );
}

function Metric({label, value}: {label: string; value: string}) {
    return (
        <div className="border border-[color:var(--color-border)] p-3">
            <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)] mb-1">
                {label}
            </p>
            <p className="font-mono text-[length:var(--text-body)]">{value}</p>
        </div>
    );
}

function StakeSummary({
    steps,
    operatorAddress,
}: {
    steps: {
        toolAtomTx?: string;
        toolAtomCreated?: boolean;
        depositTx?: string;
    };
    operatorAddress: `0x${string}` | null;
}) {
    const shortAddr = operatorAddress
        ? `${operatorAddress.slice(0, 6)}…${operatorAddress.slice(-4)}`
        : "your wallet";
    return (
        <div className="border border-[color:var(--color-accent)] p-4">
            <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-accent)] mb-3">
                Stake recorded
            </p>
            <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] mb-4 max-w-[640px]">
                Your wallet{" "}
                <span className="font-mono">{shortAddr}</span> now holds a
                position on this tool's atom. The tool's TVL grew by the
                staked amount.
            </p>
            <ResultLine
                label="Tool atom"
                tx={steps.toolAtomTx}
                note={steps.toolAtomCreated ? "created" : "reused"}
            />
            <ResultLine label="Stake on tool atom" tx={steps.depositTx} />
        </div>
    );
}

function PartialSteps({
    steps,
}: {
    steps: {
        toolAtomTx?: string;
        depositTx?: string;
    };
}) {
    return (
        <ul className="text-[length:var(--text-body-sm)] font-mono">
            {steps.toolAtomTx ? <li>✓ tool atom — {short(steps.toolAtomTx)}</li> : null}
            {steps.depositTx ? <li>✓ stake — {short(steps.depositTx)}</li> : null}
        </ul>
    );
}

function ResultLine({
    label,
    tx,
    note,
}: {
    label: string;
    tx?: string;
    note?: string;
}) {
    return (
        <p className="font-mono text-[length:var(--text-body-sm)] mb-1">
            <span className="text-[color:var(--color-fg-60)]">{label}</span>
            {note ? (
                <span className="ml-2 text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)]">
                    {note}
                </span>
            ) : null}
            {tx ? (
                <>
                    {"  "}
                    <a
                        href={`${deployments.chain.explorerUrl}/tx/${tx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[color:var(--color-accent)]"
                    >
                        {short(tx)} ↗
                    </a>
                </>
            ) : null}
        </p>
    );
}

function short(s: string): string {
    return `${s.slice(0, 8)}…${s.slice(-6)}`;
}
