import {useChainChoice} from "../../lib/chain-choice";
import {sigilModulesOf} from "../../services/agent-sigil";
import type {TrustPanelView} from "../../services/agent-trust";
import {
    agentRegistryExplorerUrl,
    chainAddressExplorerUrl,
    intuitionPortalUrl,
    truncateMiddle,
} from "../../services/trust-format";
import {Hint} from "../brand/Hint";
import {useListedCapabilities} from "../../hooks/use-listed-capabilities";
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
 * **They are back in one column, and the reason is different from the one that moved them out.**
 * They ran in two because they were the body of a full-width numbered section, where a single
 * stack of seven was a thin ribbon. They now sit in the page's 18rem identity column — the shape
 * the user asked for after seeing the atom page: _« la page tools est vraiment mieux, je voudrais
 * la même chose pour la page detailed agent »_ — where two columns would be two strips of four
 * characters each.
 */

/**
 * A fact that **decides** something, set above the reference.
 *
 * The section had seven fields in one grid at one weight, one size and one colour — the user's
 * verdict: _« la hiérarchie d'importance, là c'est pas pratique, tout est pareil »_. He is right,
 * and `rules/ui.md` says so first: hierarchy comes from type weight and size, not from boxes.
 *
 * The split is by consequence, not by taste. **Owner** decides who may declare for this agent —
 * `services/declare-use.ts` refuses every other wallet. **Registration file** decides whether
 * anything it claims can be checked at all. Those two change what a reader can do. A CAIP-19 and a
 * registry address are true, necessary, and never the first question.
 */
function LeadField({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <div>
            <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                {label}
            </dt>
            <dd className="mt-1.5 font-mono text-[length:var(--text-body)] break-all">
                {children}
            </dd>
        </div>
    );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <div className="border-t border-[color:var(--color-rule)] pt-2">
            <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                {label}
            </dt>
            <dd className="mt-1 font-mono text-[length:var(--text-body-sm)] break-all text-[color:var(--color-silver)]">
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
 * The agent's mark, for the page header — the **same glyph the directory draws** for it.
 *
 * Generated from the chain rather than relayed from a source: a dot per edge the agent declared
 * about itself, placed by a hash of the edge's object and the agent's atom, so the same agent draws
 * the same glyph in the list and here.
 *
 * It used to read `uses` edges only (ADR `0057` §5) while the list read the cohort's whole
 * capability sample, and no listed agent carries a `uses` edge — measured 2026-10-30, 0 of 25 on
 * each chain — so every agent had a glyph in the list and none on its page. The user chose the
 * list's reading for both. The seed is the agent's atom id for the same reason: the list's row key
 * moved with the page's order.
 *
 * Every dot is hollow, and that is the state of the graph rather than a loading state — `proven`
 * needs a third party's receipt and nothing reads one yet (`services/agent-sigil.ts`).
 *
 * `null` when the agent declared nothing: a glyph of nothing but its core is the same glyph for
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
    const listed = useListedCapabilities(view.atomTermId);
    // No atom resolved means no row in the directory to match, so the profile's own `uses` group
    // is the only reading there is.
    const modules =
        view.atomTermId === null
            ? sigilModulesOf(view.capabilities)
            : (listed.data ?? []).map((name) => ({name, state: "declared" as const}));
    if (modules.length === 0) return null;

    return (
        <div className="flex shrink-0 items-start gap-2">
            <Sigil
                agentId={view.atomTermId ?? view.caip19}
                modules={modules}
                viewerStaked={viewerStaked}
                size={size}
                title={`${view.name ?? view.tokenId}: ${modules.length} ${
                    modules.length === 1 ? "declaration" : "declarations"
                }, none proven`}
            />
            <Hint label="What this glyph shows">
                One dot per thing this agent declared about itself — tools, types, tags. Hollow
                means nobody has confirmed it.
            </Hint>
        </div>
    );
}

export function AgentIdentityPanel({view}: {view: TrustPanelView}) {
    // The atom lives on the graph this page reads, so its portal link follows the chain toggle.
    const chain = useChainChoice();
    const explorerUrl = agentRegistryExplorerUrl(view.chainId, view.registry, view.tokenId);
    const ownerUrl = view.owner === null ? null : chainAddressExplorerUrl(view.chainId, view.owner);

    return (
        <dl>
            {/* The two facts that decide something, above the reference and at body size rather
                than the label size everything else here uses. */}
            <div className="grid gap-y-5">
                <LeadField label="Owner">
                    {view.owner === null ? (
                        <span className="text-[color:var(--color-steel)]">not read</span>
                    ) : ownerUrl === null ? (
                        truncateMiddle(view.owner, 10, 8)
                    ) : (
                        <a href={ownerUrl} target="_blank" rel="noreferrer">
                            {truncateMiddle(view.owner, 10, 8)} ↗
                        </a>
                    )}
                </LeadField>
                <LeadField label="Registration file">
                    {view.registrationFile === null ? (
                        <span className="text-[color:var(--color-steel)]">none published</span>
                    ) : (
                        registrationFileSummary(view.registrationFile)
                    )}
                </LeadField>
            </div>

            {/* The plumbing. True, necessary, and never the first question — so it is set quieter
                and below, instead of competing with the two above it. */}
            <div className="mt-8 grid gap-y-3">
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
                <Field label="Intuition atom">
                    {view.atomTermId === null ? (
                        <span className="text-[color:var(--color-steel)]">
                            not in the Intuition graph
                        </span>
                    ) : (
                        <a
                            href={intuitionPortalUrl("atom", view.atomTermId, chain.isMainnet)}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {truncateMiddle(view.atomTermId, 12, 8)} ↗
                        </a>
                    )}
                </Field>
                {view.url !== null ? (
                    <Field label={view.isFallbackMetadata ? "URL (indexer stand-in)" : "URL"}>
                        <a href={view.url} target="_blank" rel="noreferrer">
                            {truncateMiddle(view.url, 30, 10)} ↗
                        </a>
                    </Field>
                ) : null}
            </div>
        </dl>
    );
}
