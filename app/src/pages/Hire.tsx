import {useState} from "react";
import {Link} from "react-router-dom";

import {RingLoader} from "../components/brand/RingLoader";
import {Sigil} from "../components/brand/Sigil";
import {useFindAgents} from "../hooks/use-find-agents";
import {useChainChoice} from "../lib/chain-choice";
import {controlClass, linkClass} from "../lib/control-class";
import {formatTrust, truncateMiddle} from "../services/trust-format";

/**
 * Find an agent to hire. `tasks/25`'s first step, on screen.
 *
 * ## What this page is and is not
 *
 * It is a search over what agents **declared about themselves** — `has category`, `has tag`,
 * `has type`, `implement`, `use`, `compatible with` — filtered to subjects the graph can prove are
 * real ERC-8004 agents. It is **not a ranking**: ARP publishes no score (ADR `0046`), so the order
 * is what the market put behind each one and nothing else.
 *
 * ## Why an agent can show no backing at all
 *
 * Creating an atom seeds its vault with `minShare`, so an unbacked agent still reports a figure on
 * the chain. The connector returns `null` for it instead (ADR `0042`), and a row with no backing
 * says so rather than printing dust as if it were a market. On mainnet that is most of them.
 */

const SUGGESTIONS = ["MCP Server", "defi", "smart_contracts", "A2A Agent", "trading"];

export function Hire() {
    const chain = useChainChoice();
    const [domain, setDomain] = useState("");
    const [submitted, setSubmitted] = useState("");
    const query = useFindAgents(submitted);

    return (
        <section>
            <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] font-semibold tracking-tight">
                Hire an agent
            </h1>

            <form
                className="mt-8 flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    setSubmitted(domain);
                }}
            >
                <div>
                    <label
                        htmlFor="hire-domain"
                        className="block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]"
                    >
                        What should it be able to do
                    </label>
                    <input
                        id="hire-domain"
                        type="text"
                        value={domain}
                        onChange={(event) => setDomain(event.target.value)}
                        placeholder="MCP Server"
                        className="mt-2 w-80 border border-[color:var(--color-rule-strong)] bg-transparent px-3 py-1.5 font-mono"
                    />
                </div>
                <button type="submit" disabled={domain.trim().length === 0} className={controlClass}>
                    Search
                </button>
            </form>

            {/* The vocabulary is the graph's, not ours, so the examples are ones that return
                something. Measured on mainnet 2026-10-27: `MCP Server` 50, the rest one each. */}
            <div className="mt-3 flex flex-wrap items-baseline gap-2 text-[length:var(--text-body-sm)]">
                <span className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                    try
                </span>
                {SUGGESTIONS.map((suggestion) => (
                    <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                            setDomain(suggestion);
                            setSubmitted(suggestion);
                        }}
                        className="px-2 py-1 text-[length:var(--text-body-sm)] border-[color:var(--color-rule)]! text-[color:var(--color-steel)]!"
                    >
                        {suggestion}
                    </button>
                ))}
            </div>

            <div className="mt-10">
                {submitted.trim().length === 0 ? null : query.isPending ? (
                    <div aria-live="polite" aria-busy className="flex items-center gap-4">
                        <RingLoader size={32} label="Searching" />
                        <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            reading {chain.label.toLowerCase()}
                        </p>
                    </div>
                ) : query.isError ? (
                    <p className="max-w-[60ch] text-[length:var(--text-body-sm)]" role="alert">
                        {query.error instanceof Error ? query.error.message : String(query.error)}
                    </p>
                ) : query.data === undefined || query.data.agents.length === 0 ? (
                    <div className="max-w-[60ch]">
                        <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            nothing declared that
                        </p>
                        <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            The vocabulary is whatever agents wrote about themselves. Try one of the
                            examples above, or switch chain.
                        </p>
                    </div>
                ) : (
                    <Candidates page={query.data} />
                )}
            </div>
        </section>
    );
}

function Candidates({page}: {page: NonNullable<ReturnType<typeof useFindAgents>["data"]>}) {
    return (
        <>
            <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                {page.agents.length} declared {page.domain}
                {page.truncated ? " — first page" : ""}
            </p>

            <ul className="mt-6 border-t border-[color:var(--color-rule-strong)]">
                {page.agents.map((candidate) => (
                    <li
                        key={candidate.atomId}
                        className="flex flex-wrap items-start gap-x-6 gap-y-2 border-b border-[color:var(--color-rule)] py-3"
                    >
                        {/* The glyph is generated from what the agent declared, so two candidates
                            are distinguishable before either name is read. */}
                        <Sigil
                            agentId={candidate.atomId}
                            modules={[{name: candidate.matched.label ?? "", state: "declared"}]}
                            size={48}
                        />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                                {candidate.label ?? truncateMiddle(candidate.atomId)}
                            </span>
                            <span className="block font-mono text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                                {candidate.matched.label ?? "—"}
                            </span>
                        </span>
                        <span className="text-right font-mono text-[length:var(--text-body-sm)] tabular-nums">
                            {candidate.backingAssets === null ? (
                                <span className="font-sans text-[color:var(--color-steel)]">
                                    no backing
                                </span>
                            ) : (
                                <>
                                    {formatTrust(candidate.backingAssets)}
                                    <span className="block text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                                        {candidate.backers}{" "}
                                        {candidate.backers === 1 ? "backer" : "backers"}
                                    </span>
                                </>
                            )}
                        </span>
                        {/* `/tool/atom/:atomId` is really "an atom and the `uses` edges pointing
                            at it", and for an agent's identity atom those edges are **who declared
                            hiring it**. The content is right; the route's name is a leftover from
                            when only tools had one. Labelled for what it gives rather than for
                            where it goes. */}
                        <Link to={`/tool/atom/${candidate.atomId}`} className={linkClass}>
                            Who hired it →
                        </Link>
                    </li>
                ))}
            </ul>
        </>
    );
}
