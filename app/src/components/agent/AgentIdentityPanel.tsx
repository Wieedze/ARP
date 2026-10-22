import {sigilModulesOf} from "../../services/agent-sigil";
import type {TrustPanelView} from "../../services/agent-trust";
import {agentRegistryExplorerUrl, truncateMiddle} from "../../services/trust-format";
import {Hint} from "../brand/Hint";
import {Sigil} from "../brand/Sigil";

/**
 * The left column: who this agent is, according to whom.
 *
 * `isFallbackMetadata` is called out rather than hidden. Roughly half the
 * mainnet cohort carries an indexer-synthesised `Agent 8453:6649` name and an
 * 8004scan URL; rendering that as if the agent had chosen it would misdescribe
 * the majority of the population this panel exists to serve.
 *
 * **It opens with the sigil** (ADR `0057` §5), which is the one thing here generated from the chain
 * rather than relayed from a source: a dot per tool the agent declared using, placed by a hash of
 * the tool and the agent, so the same agent draws the same glyph everywhere and forever.
 *
 * Every dot is hollow, and that is the state of the graph rather than a loading state — `proven`
 * needs a third party's receipt and nothing reads one yet (`services/agent-sigil.ts`). The `Hint` is
 * what says so, on demand, instead of a sentence sitting in the column.
 */

function Field({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <div className="border-t border-[color:var(--color-rule)] pt-2">
            <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
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

export function AgentIdentityPanel({
    view,
    viewerStaked = false,
}: {
    view: TrustPanelView;
    /** The connected wallet holds a position on this agent's atom. Turns the sigil's core Saffron. */
    viewerStaked?: boolean;
}) {
    const explorerUrl = agentRegistryExplorerUrl(view.chainId, view.registry, view.tokenId);
    const modules = sigilModulesOf(view.capabilities);

    return (
        <aside>
            {/* Absent when the agent has declared no tools: a glyph of nothing but its core is the
                same glyph for every such agent, so it would stop being an identity and start being
                decoration. The empty case is already stated by the capability section. */}
            {modules.length === 0 ? null : (
                <div className="mb-8 flex items-start gap-3">
                    <Sigil
                        agentId={view.caip19}
                        modules={modules}
                        viewerStaked={viewerStaked}
                        size={104}
                        title={`${view.name ?? view.tokenId}: ${modules.length} declared ${
                            modules.length === 1 ? "tool" : "tools"
                        }, none proven`}
                    />
                    <Hint label="What this glyph shows">
                        One dot per tool this agent declared using. Hollow means nobody has
                        confirmed it — no receipt source exists yet.
                    </Hint>
                </div>
            )}
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
                        <span className="text-[color:var(--color-steel)]">
                            not read — the registry source did not answer
                        </span>
                    ) : (
                        truncateMiddle(view.owner, 10, 8)
                    )}
                </Field>
                <Field label="Intuition atom">
                    {view.atomTermId === null ? (
                        <span className="text-[color:var(--color-steel)]">
                            no atom — this agent is not in the Intuition graph
                        </span>
                    ) : (
                        truncateMiddle(view.atomTermId, 12, 8)
                    )}
                </Field>
                <Field label="Registration file">
                    {view.registrationFile === null ? (
                        <span className="text-[color:var(--color-steel)]">none published</span>
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
        </aside>
    );
}
