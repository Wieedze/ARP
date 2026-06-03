import {useEffect, useMemo, useState} from "react";
import {Link, useParams} from "react-router-dom";
import {
    formatEther,
    hashMessage,
    keccak256,
    recoverAddress,
    toHex,
    type Address,
    type Hex,
} from "viem";

import {deployments} from "../lib/deployments";
import {type HireResultPayload} from "./Hire";

/**
 * `/hire/result/:tx` — displays an audit result delivered by the agent
 * after a successful hire.
 *
 * The payload itself is in `sessionStorage` keyed by the payment tx
 * hash (the same hash that's part of the URL path). On mount we load
 * it; if missing (e.g. user opened the URL in a fresh tab), we render
 * an empty state pointing back to `/hire`.
 *
 * The page also verifies the signed receipt on the client — recovers
 * the signer from the signature + receipt digest and compares against
 * the declared agent address. Lights up green if they match, red if not.
 */
export function HireResult() {
    const {tx: paymentTxHash} = useParams();
    const payload = useMemo<HireResultPayload | null>(() => {
        if (!paymentTxHash) return null;
        const raw = sessionStorage.getItem(`arp.audit.${paymentTxHash}`);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as HireResultPayload;
        } catch {
            return null;
        }
    }, [paymentTxHash]);
    const [signerOk, setSignerOk] = useState<"unknown" | "ok" | "mismatch">(
        "unknown",
    );

    useEffect(() => {
        if (!payload) return;
        const {receipt} = payload.response;
        const digestStr = `${receipt.requestHash}|${receipt.resultHash}|${receipt.agent}`;
        // Mirror the server's keccak256(toHex(digestStr)) → personal_sign prefix.
        (async () => {
            const recovered = await recoverAddress({
                hash: hashMessage({raw: keccak256Browser(digestStr)}),
                signature: receipt.signature,
            });
            if (recovered.toLowerCase() === receipt.agent.toLowerCase()) {
                setSignerOk("ok");
            } else {
                setSignerOk("mismatch");
            }
        })().catch(() => setSignerOk("mismatch"));
    }, [payload]);

    if (!paymentTxHash) {
        return <EmptyState reason="Missing payment tx in URL" />;
    }
    if (!payload) {
        return <EmptyState reason="No result for this payment tx — start a new hire." />;
    }

    const {agent, paymentTxHash: paidTx, budgetWei, response} = payload;
    const {report, stakes, receipt} = response;

    return (
        <article>
            <Link
                to="/hire"
                className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-40)]"
            >
                ← hire
            </Link>

            <header className="mt-4 mb-10">
                <h1 className="font-sans text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                    {report.contractName}
                </h1>
                <p className="mt-2 text-[color:var(--color-fg-60)]">
                    Audit by Agent #{agent.agentId}. Receipt signed by the
                    runtime wallet.
                </p>
            </header>

            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 gap-x-4 text-[length:var(--text-body-sm)] border-y border-[color:var(--color-border)] py-6 mb-10">
                <dt className="text-[color:var(--color-fg-40)] uppercase tracking-wider text-[length:var(--text-label)]">
                    Payment
                </dt>
                <dd className="font-mono">
                    {formatEther(BigInt(budgetWei))} tTRUST{" "}
                    <ExplorerTxLink hash={paidTx} />
                </dd>

                <dt className="text-[color:var(--color-fg-40)] uppercase tracking-wider text-[length:var(--text-label)]">
                    Agent
                </dt>
                <dd className="font-mono">
                    #{agent.agentId} (
                    <ExplorerAddressLink address={agent.runtimeWallet} />)
                </dd>

                <dt className="text-[color:var(--color-fg-40)] uppercase tracking-wider text-[length:var(--text-label)]">
                    Receipt
                </dt>
                <dd className="font-mono">
                    {signerOk === "ok" ? (
                        <span className="text-[color:var(--color-accent)]">
                            verified — signer matches agent runtime
                        </span>
                    ) : signerOk === "mismatch" ? (
                        <span>signature mismatch — caution</span>
                    ) : (
                        <span className="text-[color:var(--color-fg-40)]">
                            verifying…
                        </span>
                    )}
                </dd>
            </dl>

            <section className="mb-12">
                <h2 className="font-medium mb-2">Summary</h2>
                <p className="text-[color:var(--color-fg-60)] max-w-[800px]">
                    {report.summary}
                </p>
            </section>

            <section className="mb-12">
                <h2 className="font-medium mb-4">
                    Findings ({report.findings.length})
                </h2>
                <ul className="space-y-4">
                    {report.findings.map((f, i) => (
                        <FindingRow key={i} finding={f} />
                    ))}
                </ul>
            </section>

            <section className="mb-12">
                <h2 className="font-medium mb-4">On-chain stakes posted</h2>
                <ul className="space-y-2">
                    {stakes.map((s, i) => (
                        <StakeRow key={i} stake={s} />
                    ))}
                </ul>
            </section>

            <section className="mb-12">
                <h2 className="font-medium mb-4">Signed receipt (Auditor)</h2>
                <dl className="font-mono text-[length:var(--text-body-sm)] grid grid-cols-[10rem_1fr] gap-y-2">
                    <dt className="text-[color:var(--color-fg-40)]">agent</dt>
                    <dd>
                        <ExplorerAddressLink address={receipt.agent} />
                    </dd>
                    <dt className="text-[color:var(--color-fg-40)]">requestHash</dt>
                    <dd className="break-all">{receipt.requestHash}</dd>
                    <dt className="text-[color:var(--color-fg-40)]">resultHash</dt>
                    <dd className="break-all">{receipt.resultHash}</dd>
                    <dt className="text-[color:var(--color-fg-40)]">signature</dt>
                    <dd className="break-all">{receipt.signature}</dd>
                </dl>
            </section>

            {response.subcontract ? (
                <SubcontractSection
                    subcontract={response.subcontract}
                    requesterAddress={payload.requesterAddress}
                    auditorAddress={agent.runtimeWallet}
                />
            ) : null}

            <details className="mb-10">
                <summary className="cursor-pointer font-medium mb-2">
                    Raw audit response (markdown)
                </summary>
                <pre className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] whitespace-pre-wrap break-words mt-3 p-3 border border-[color:var(--color-border)]">
                    {report.rawResponse}
                </pre>
            </details>
        </article>
    );
}

function SubcontractSection({
    subcontract,
    requesterAddress,
    auditorAddress,
}: {
    subcontract: NonNullable<HireResultPayload["response"]["subcontract"]>;
    requesterAddress: Address;
    auditorAddress: Address;
}) {
    const {subPaymentTxHash, specialistResponse} = subcontract;
    const {report, stakes, receipt} = specialistResponse;

    const [signerOk, setSignerOk] = useState<"unknown" | "ok" | "mismatch">(
        "unknown",
    );

    useEffect(() => {
        (async () => {
            const digest = `${receipt.requestHash}|${receipt.resultHash}|${receipt.agent}`;
            const recovered = await recoverAddress({
                hash: hashMessage({raw: keccak256Browser(digest)}),
                signature: receipt.signature,
            });
            setSignerOk(
                recovered.toLowerCase() === receipt.agent.toLowerCase()
                    ? "ok"
                    : "mismatch",
            );
        })().catch(() => setSignerOk("mismatch"));
    }, [receipt]);

    return (
        <section className="mb-12 border-t border-[color:var(--color-accent)] pt-8">
            <header className="mb-6">
                <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-accent)] mb-1">
                    A2A · sub-delegation
                </p>
                <h2 className="font-medium">
                    Specialist's deep-dive (subcontracted by Auditor)
                </h2>
                <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] mt-1">
                    The Auditor paid the Specialist a sub-fee and signed a
                    leaf delegation rooted at the requester's compose
                    authority. The Specialist ran an independent audit and
                    posted its own stakes via the chained delegation. Two
                    distinct reputations, one bounded budget.
                </p>
            </header>

            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 gap-x-4 text-[length:var(--text-body-sm)] border border-[color:var(--color-border)] p-4 mb-6">
                <dt className="text-[color:var(--color-fg-40)] uppercase tracking-wider text-[length:var(--text-label)]">
                    Sub-payment
                </dt>
                <dd className="font-mono">
                    <ExplorerTxLink hash={subPaymentTxHash} />{" "}
                    <span className="text-[color:var(--color-fg-40)]">
                        (Auditor → Specialist runtime)
                    </span>
                </dd>
                <dt className="text-[color:var(--color-fg-40)] uppercase tracking-wider text-[length:var(--text-label)]">
                    Chain
                </dt>
                <dd className="font-mono">
                    <ExplorerAddressLink address={requesterAddress} /> →{" "}
                    <ExplorerAddressLink address={auditorAddress} /> →{" "}
                    <ExplorerAddressLink address={receipt.agent} />
                </dd>
            </dl>

            <h3 className="font-medium mb-3 text-[length:var(--text-body-sm)] uppercase tracking-wider text-[color:var(--color-fg-40)]">
                Specialist findings ({report.findings.length})
            </h3>
            <ul className="space-y-4 mb-6">
                {report.findings.map((f, i) => (
                    <FindingRow key={i} finding={f} />
                ))}
            </ul>

            <h3 className="font-medium mb-3 text-[length:var(--text-body-sm)] uppercase tracking-wider text-[color:var(--color-fg-40)]">
                Specialist on-chain stakes
            </h3>
            <ul className="space-y-2 mb-6">
                {stakes.map((s, i) => (
                    <StakeRow key={i} stake={s} />
                ))}
            </ul>

            <h3 className="font-medium mb-3 text-[length:var(--text-body-sm)] uppercase tracking-wider text-[color:var(--color-fg-40)]">
                Specialist receipt
            </h3>
            <dl className="font-mono text-[length:var(--text-body-sm)] grid grid-cols-[10rem_1fr] gap-y-2 mb-3">
                <dt className="text-[color:var(--color-fg-40)]">agent</dt>
                <dd>
                    <ExplorerAddressLink address={receipt.agent} />{" "}
                    {signerOk === "ok" ? (
                        <span className="text-[color:var(--color-accent)]">
                            ✓ signature verified
                        </span>
                    ) : signerOk === "mismatch" ? (
                        <span>signature mismatch</span>
                    ) : (
                        <span className="text-[color:var(--color-fg-40)]">
                            verifying…
                        </span>
                    )}
                </dd>
                <dt className="text-[color:var(--color-fg-40)]">signature</dt>
                <dd className="break-all">{receipt.signature}</dd>
            </dl>
        </section>
    );
}

function FindingRow({
    finding,
}: {
    finding: HireResultPayload["response"]["report"]["findings"][number];
}) {
    const sev = finding.severity.toLowerCase();
    const color = useMemo(() => {
        if (sev === "critical") return "text-[color:var(--color-accent)]";
        if (sev === "high") return "text-[color:var(--color-accent)]";
        if (sev === "medium") return "text-[color:var(--color-fg)]";
        return "text-[color:var(--color-fg-40)]";
    }, [sev]);
    return (
        <li className="border border-[color:var(--color-border)] p-4">
            <div className="flex items-baseline justify-between gap-3 mb-2">
                <h3 className="font-medium">{finding.title}</h3>
                <span
                    className={[
                        "font-mono uppercase tracking-wider text-[length:var(--text-label)]",
                        color,
                    ].join(" ")}
                >
                    {finding.severity.toUpperCase()}
                </span>
            </div>
            {finding.location ? (
                <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-40)] mb-2">
                    {finding.location}
                </p>
            ) : null}
            <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                {finding.description}
            </p>
        </li>
    );
}

function StakeRow({
    stake,
}: {
    stake: HireResultPayload["response"]["stakes"][number];
}) {
    if (stake.skipped === "no-match") {
        return (
            <li className="text-[length:var(--text-body-sm)]">
                <span className="font-mono text-[color:var(--color-fg-40)]">
                    [skip]
                </span>{" "}
                <span className="text-[color:var(--color-fg-60)]">
                    {stake.methodology.slice(0, 80)} — no manifest match
                </span>
            </li>
        );
    }
    if (stake.error) {
        return (
            <li className="text-[length:var(--text-body-sm)]">
                <span className="font-mono">[fail]</span>{" "}
                {stake.matchedModule?.name} — {stake.error.slice(0, 80)}
            </li>
        );
    }
    return (
        <li className="text-[length:var(--text-body-sm)] font-mono">
            <span className="text-[color:var(--color-accent)]">[ok]</span>{" "}
            <span className="text-[color:var(--color-fg-60)]">
                {stake.matchedModule?.name}
            </span>{" "}
            — staked{" "}
            <span className="text-[color:var(--color-accent)]">
                {stake.stake
                    ? formatEther(BigInt(stake.stake.amount)) + " tTRUST"
                    : "0"}
            </span>{" "}
            {stake.stake ? <ExplorerTxLink hash={stake.stake.tx} /> : null}
        </li>
    );
}

function ExplorerTxLink({hash}: {hash: Hex}) {
    return (
        <a
            href={`${deployments.chain.explorerUrl}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="text-[color:var(--color-accent)]"
        >
            {hash.slice(0, 8)}…{hash.slice(-6)} ↗
        </a>
    );
}

function ExplorerAddressLink({address}: {address: Address}) {
    return (
        <a
            href={`${deployments.chain.explorerUrl}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="text-[color:var(--color-fg)]"
        >
            {address.slice(0, 6)}…{address.slice(-4)}
        </a>
    );
}

function EmptyState({reason}: {reason: string}) {
    return (
        <section>
            <p className="text-[color:var(--color-fg-60)] mb-6">{reason}</p>
            <Link
                to="/hire"
                className="text-[color:var(--color-accent)] text-[length:var(--text-body-sm)]"
            >
                Go to /hire →
            </Link>
        </section>
    );
}

/**
 * Browser-side `keccak256(toHex(string))` mirror of the server's receipt
 * digest computation. The server signs the result of this exact pipeline.
 */
function keccak256Browser(s: string): Hex {
    return keccak256(toHex(s));
}
