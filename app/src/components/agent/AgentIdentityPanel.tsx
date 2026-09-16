import type {TrustPanelView} from "../../services/agent-trust";
import {agentRegistryExplorerUrl, truncateMiddle} from "../../services/trust-format";

/**
 * The left column: who this agent is, according to whom.
 *
 * `isFallbackMetadata` is called out rather than hidden. Roughly half the
 * mainnet cohort carries an indexer-synthesised `Agent 8453:6649` name and an
 * 8004scan URL; rendering that as if the agent had chosen it would misdescribe
 * the majority of the population this panel exists to serve.
 */

function Field({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <div className="border-t border-[color:var(--color-border)] pt-2">
            <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                {label}
            </dt>
            <dd className="mt-1 font-mono text-[length:var(--text-body-sm)] break-all">
                {children}
            </dd>
        </div>
    );
}

function registrationFileSummary(uri: string): string {
    if (uri.startsWith("data:")) {
        return `inline data URI · ${uri.length.toLocaleString("en-US")} chars`;
    }
    return truncateMiddle(uri, 28, 12);
}

export function AgentIdentityPanel({view}: {view: TrustPanelView}) {
    const explorerUrl = agentRegistryExplorerUrl(view.chainId, view.registry, view.tokenId);

    return (
        <aside>
            <dl className="flex flex-col gap-3">
                <Field label="CAIP-19">{view.caip19}</Field>
                <Field label="Registry">
                    {explorerUrl !== null ? (
                        <a href={explorerUrl} target="_blank" rel="noreferrer">
                            {truncateMiddle(view.registry, 10, 8)} ↗
                        </a>
                    ) : (
                        truncateMiddle(view.registry, 10, 8)
                    )}
                </Field>
                <Field label="Token id">{view.tokenId}</Field>
                <Field label="Owner">
                    {view.owner === null ? (
                        <span className="text-[color:var(--color-fg-60)]">
                            not read — the registry source did not answer
                        </span>
                    ) : (
                        truncateMiddle(view.owner, 10, 8)
                    )}
                </Field>
                <Field label="Intuition atom">
                    {view.atomTermId === null ? (
                        <span className="text-[color:var(--color-fg-60)]">
                            no atom — this agent is not in the Intuition graph
                        </span>
                    ) : (
                        truncateMiddle(view.atomTermId, 12, 8)
                    )}
                </Field>
                <Field label="Registration file">
                    {view.registrationFile === null ? (
                        <span className="text-[color:var(--color-fg-60)]">none published</span>
                    ) : (
                        registrationFileSummary(view.registrationFile)
                    )}
                </Field>
                {view.url !== null ? (
                    <Field label={view.isFallbackMetadata ? "URL (indexer stand-in)" : "URL"}>
                        <a href={view.url} target="_blank" rel="noreferrer">
                            {truncateMiddle(view.url, 30, 10)} ↗
                        </a>
                    </Field>
                ) : null}
            </dl>

            <p className="mt-6 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                Sources consulted:{" "}
                <span className="font-mono">{view.sourcesConsulted.join(", ")}</span>.
                {view.marketCapableSources.length === 0
                    ? " None of them can see stake, so an empty market means unknown, not empty."
                    : ` Markets from ${view.marketCapableSources.join(", ")}.`}
            </p>
        </aside>
    );
}
