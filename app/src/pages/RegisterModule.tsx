import {useMemo, useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {formatEther, parseEther, type Hex} from "viem";
import {getWalletClient} from "@wagmi/core";
import {useAccount, useWalletClient} from "wagmi";

import {publicClient} from "../lib/clients";
import {deployments} from "../lib/deployments";
import {wagmiConfig} from "../lib/wagmi";
import {useAllModules, useDomains} from "../hooks/use-modules";
import {registerModule} from "../services/register-module";

const MIN_STAKE_WEI = parseEther("0.001");

type Status = "idle" | "pending" | "done" | "error";

/**
 * `/modules/new` — anyone with a wallet on Intuition Testnet can register
 * a new tool. Two transactions:
 *   1. `ModuleRegistry.registerModule(...)`
 *   2. `MultiVault.createAtoms([schemaURIBytes], [atomCost + 0.001 tTRUST])`
 *
 * The 0.001 tTRUST initial stake is the anti-spam floor — keeps the
 * marketplace catalogue meaningful by making each entry cost something.
 */
export function RegisterModule() {
    const navigate = useNavigate();
    const {isConnected} = useAccount();
    const {data: walletClient} = useWalletClient();

    const {modules} = useAllModules();
    const knownDomains = useDomains(modules);

    const [name, setName] = useState("");
    const [domain, setDomain] = useState("");
    const [schemaURI, setSchemaURI] = useState("");
    const [description, setDescription] = useState("");
    const [status, setStatus] = useState<Status>("idle");
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{
        moduleId: bigint;
        registerTx: Hex;
        atomTx: Hex;
    } | null>(null);

    const schemaURITaken = useMemo(() => {
        if (!schemaURI.trim()) return false;
        return modules.some(
            (m) => m.schemaURI.trim().toLowerCase() === schemaURI.trim().toLowerCase(),
        );
    }, [modules, schemaURI]);

    const valid =
        name.trim().length > 0 &&
        domain.trim().length > 0 &&
        schemaURI.trim().length > 0 &&
        description.trim().length > 0 &&
        !schemaURITaken;

    async function getActiveWalletClient() {
        if (walletClient && walletClient.account) return walletClient;
        const fetched = await getWalletClient(wagmiConfig);
        if (!fetched || !fetched.account) {
            throw new Error("No wallet client — connect MetaMask first.");
        }
        return fetched;
    }

    async function handleSubmit() {
        setStatus("pending");
        setError(null);
        try {
            const wc = await getActiveWalletClient();
            const res = await registerModule({
                args: {
                    name: name.trim(),
                    domain: domain.trim(),
                    schemaURI: schemaURI.trim(),
                    description: description.trim(),
                },
                initialStakeWei: MIN_STAKE_WEI,
                walletClient: wc,
                publicClient,
            });
            setResult(res);
            setStatus("done");
        } catch (err) {
            setStatus("error");
            setError((err as Error).message);
        }
    }

    if (!isConnected) {
        return (
            <section>
                <PageHeader />
                <p className="text-[color:var(--color-fg-60)]">
                    Connect your wallet to register a tool.
                </p>
            </section>
        );
    }

    if (status === "done" && result) {
        return (
            <section>
                <PageHeader />
                <div className="border border-[color:var(--color-accent)] p-4 mb-6">
                    <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-accent)] mb-2">
                        Module registered
                    </p>
                    <p className="text-[color:var(--color-fg-60)] mb-3 max-w-[640px] text-[length:var(--text-body-sm)]">
                        Module{" "}
                        <span className="font-mono">
                            #{result.moduleId.toString()}
                        </span>{" "}
                        is in the registry, and its atom has{" "}
                        <span className="font-mono">
                            {formatEther(MIN_STAKE_WEI)} tTRUST
                        </span>{" "}
                        of initial stake from your wallet. The TVL ranking will
                        place it accordingly.
                    </p>
                    <p className="font-mono text-[length:var(--text-body-sm)] mb-1">
                        <span className="text-[color:var(--color-fg-40)]">
                            registerModule
                        </span>{" "}
                        <a
                            href={`${deployments.chain.explorerUrl}/tx/${result.registerTx}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[color:var(--color-accent)]"
                        >
                            {result.registerTx.slice(0, 10)}… ↗
                        </a>
                    </p>
                    <p className="font-mono text-[length:var(--text-body-sm)]">
                        <span className="text-[color:var(--color-fg-40)]">
                            createAtoms + stake
                        </span>{" "}
                        <a
                            href={`${deployments.chain.explorerUrl}/tx/${result.atomTx}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[color:var(--color-accent)]"
                        >
                            {result.atomTx.slice(0, 10)}… ↗
                        </a>
                    </p>
                </div>
                <div className="flex gap-3 text-[length:var(--text-body-sm)]">
                    <Link
                        to={`/tool/${result.moduleId.toString()}`}
                        className="text-[color:var(--color-accent)]"
                    >
                        View tool →
                    </Link>
                    <button
                        type="button"
                        onClick={() => {
                            navigate(0);
                        }}
                        className="text-[color:var(--color-fg-60)] hover:text-[color:var(--color-fg)]"
                    >
                        Register another
                    </button>
                </div>
            </section>
        );
    }

    return (
        <section>
            <PageHeader />
            <p className="text-[color:var(--color-fg-60)] mb-8 max-w-[640px]">
                Add a tool to the ARP catalogue. Anyone can publish — the
                marketplace ranks by economic conviction (TVL on the atom).
                Registration takes two transactions: the registry entry, then
                the atom creation with a{" "}
                <span className="font-mono">
                    {formatEther(MIN_STAKE_WEI)} tTRUST
                </span>{" "}
                initial stake as anti-spam floor.
            </p>

            <div className="space-y-5 max-w-[640px]">
                <Field
                    label="Name"
                    hint="The tool's display name. Shown in the marketplace list."
                >
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={status === "pending"}
                        placeholder="e.g. OpenZeppelin Defender"
                        className="block w-full bg-transparent border border-[color:var(--color-border)] px-3 py-2 font-mono text-[length:var(--text-body-sm)] focus:outline-none focus:border-[color:var(--color-accent)]"
                    />
                </Field>

                <Field
                    label="Domain"
                    hint="Categorisation. Pick an existing one to reuse, or type a new one."
                >
                    <input
                        type="text"
                        list="known-domains"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        disabled={status === "pending"}
                        placeholder="e.g. solidity-audit"
                        className="block w-full bg-transparent border border-[color:var(--color-border)] px-3 py-2 font-mono text-[length:var(--text-body-sm)] focus:outline-none focus:border-[color:var(--color-accent)]"
                    />
                    <datalist id="known-domains">
                        {knownDomains.map((d) => (
                            <option key={d} value={d} />
                        ))}
                    </datalist>
                </Field>

                <Field
                    label="Schema URI"
                    hint="Canonical identifier — typically an IPFS URI to pinned schema JSON, or a stable HTTPS URL. Must be unique."
                >
                    <input
                        type="text"
                        value={schemaURI}
                        onChange={(e) => setSchemaURI(e.target.value)}
                        disabled={status === "pending"}
                        placeholder="ipfs://… or https://…"
                        className="block w-full bg-transparent border border-[color:var(--color-border)] px-3 py-2 font-mono text-[length:var(--text-body-sm)] focus:outline-none focus:border-[color:var(--color-accent)]"
                    />
                    {schemaURITaken ? (
                        <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-40)] mt-1">
                            A module with this schemaURI already exists.
                        </p>
                    ) : null}
                </Field>

                <Field
                    label="Description"
                    hint="One sentence on what the tool does and when an agent would compose with it."
                >
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={status === "pending"}
                        rows={3}
                        className="block w-full bg-transparent border border-[color:var(--color-border)] px-3 py-2 font-mono text-[length:var(--text-body-sm)] focus:outline-none focus:border-[color:var(--color-accent)] resize-y"
                    />
                </Field>

                <div className="border border-[color:var(--color-border)] p-3 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    <p>
                        Cost to register:{" "}
                        <span className="font-mono text-[color:var(--color-fg)]">
                            {formatEther(MIN_STAKE_WEI)} tTRUST
                        </span>{" "}
                        initial stake + gas + atom creation cost (≈ negligible).
                        The stake stays on your wallet's position on the tool's
                        atom and contributes to its TVL.
                    </p>
                </div>

                <div className="pt-2">
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!valid || status === "pending"}
                        className="px-4 py-2 text-[length:var(--text-body-sm)]"
                    >
                        {status === "pending"
                            ? "Registering… (2 wallet popups)"
                            : "Register tool"}
                    </button>
                    {error ? (
                        <p className="mt-3 text-[length:var(--text-body-sm)] font-mono break-all">
                            Error: {error}
                        </p>
                    ) : null}
                </div>
            </div>
        </section>
    );
}

function PageHeader() {
    return (
        <header className="mb-8">
            <h1 className="font-sans text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                Register a tool
            </h1>
        </header>
    );
}

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label className="block text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)] mb-1">
                {label}
            </label>
            {children}
            <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-40)] mt-1">
                {hint}
            </p>
        </div>
    );
}
