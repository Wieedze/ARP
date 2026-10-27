import {sigilModulesOf} from "../../services/agent-sigil";
import type {TrustPanelView} from "../../services/agent-trust";
import {
    agentRegistryExplorerUrl,
    chainAddressExplorerUrl,
    intuitionAtomUrl,
    truncateMiddle,
} from "../../services/trust-format";
import {Hint} from "../brand/Hint";
import {Sigil} from "../brand/Sigil";

/**
 * Section 01's body: who this agent is, according to whom.
 *
 * `isFallbackMetadata` is called out rather than hidden. Roughly half the mainnet cohort carries an
 * indexer-synthesised `Agent 8453:6649` name and an 8004scan URL; rendering that as if the agent
 * had chosen it would misdescribe the majority of the population this panel exists to serve.
 *
 * ## The sigil left this component
 *
 * It opened with the sigil (ADR `0057` §5), stacked above seven fields in a 17rem left column. That
 * column was the page's whole left side — a wall of metadata beside everything else, which is part
 * of why the layout did not read (user, 2026-10-27). The sigil is now **beside the agent's name in
 * the header**, where the reference puts it and where an identity mark belongs; the fields are the
 * body of a numbered section like every other.
 *
 * The fields run in two columns now rather than one 17rem stack, because they are short values and
 * a single column of seven made the section four screens tall on a phone and a thin ribbon on a
 * desktop.
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

/**
 * The agent's mark, for the page header.
 *
 * Generated from the chain rather than relayed from a source: a dot per tool the agent declared
 * using, placed by a hash of the tool and the agent, so the same agent draws the same glyph
 * everywhere and forever.
 *
 * Every dot is hollow, and that is the state of the graph rather than a loading state — `proven`
 * needs a third party's receipt and nothing reads one yet (`services/agent-sigil.ts`). The `Hint`
 * says so on demand, instead of a sentence sitting in the header.
 *
 * `null` when the agent declared no tools: a glyph of nothing but its core is the same glyph for
 * every such agent, so it would stop being an identity and start being decoration.
 */
export function AgentSigil({
    view,
    viewerStaked = false,
    size = 96,
}: {
    view: TrustPanelView;
    viewerStaked?: boolean;
    size?: number;
}) {
    const modules = sigilModulesOf(view.capabilities);
    if (modules.length === 0) return null;

    return (
        <div className="flex shrink-0 items-start gap-2">
            <Sigil
                agentId={view.caip19}
                modules={modules}
                viewerStaked={viewerStaked}
                size={size}
                title={`${view.name ?? view.tokenId}: ${modules.length} declared ${
                    modules.length === 1 ? "tool" : "tools"
                }, none proven`}
            />
            <Hint label="What this glyph shows">
                One dot per tool this agent declared using. Hollow means nobody has confirmed it —
                no receipt source exists yet.
            </Hint>
        </div>
    );
}

export function AgentIdentityPanel({view}: {view: TrustPanelView}) {
    const explorerUrl = agentRegistryExplorerUrl(view.chainId, view.registry, view.tokenId);
    const ownerUrl = view.owner === null ? null : chainAddressExplorerUrl(view.chainId, view.owner);

    return (
        <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
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
                    <span className="text-[color:var(--color-steel)]">not read</span>
                ) : ownerUrl === null ? (
                    truncateMiddle(view.owner, 10, 8)
                ) : (
                    <a href={ownerUrl} target="_blank" rel="noreferrer">
                        {truncateMiddle(view.owner, 10, 8)} ↗
                    </a>
                )}
            </Field>
            <Field label="Intuition atom">
                {view.atomTermId === null ? (
                    <span className="text-[color:var(--color-steel)]">
                        not in the Intuition graph
                    </span>
                ) : (
                    <a href={intuitionAtomUrl(view.atomTermId)} target="_blank" rel="noreferrer">
                        {truncateMiddle(view.atomTermId, 12, 8)} ↗
                    </a>
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
    );
}
