import {Link} from "react-router-dom";

import {RingLoader} from "../brand/RingLoader";
import {Sigil} from "../brand/Sigil";
import {useFindAgents} from "../../hooks/use-find-agents";
import {StakerCount} from "./StakerCount";
import {useChainChoice} from "../../lib/chain-choice";
import {controlClass} from "../../lib/control-class";
import {formatTrust, truncateMiddle} from "../../services/trust-format";

/**
 * Find an agent by what it declared it can do.
 *
 * ## It was a page, twice over, and both times wrongly
 *
 * First as `/hire` — hiring a stranger needs their runtime address, which you only have if you
 * already know them, so a page that found agents could not hire them (ADR `0060`). Then as
 * `/discover`, which listed the same objects with the same figures as `/agents`: one paged, one
 * filtered. Two pages for one list.
 *
 * It is a **filter on the directory** now, and split in two so it can actually behave like one:
 * `CapabilityFilter` is the input and sits in the index's toolbar beside the sort, and
 * `CapabilityResults` *replaces* the cohort table while a search is live. It was a titled section
 * stacked above the list, with its own "Find by capability" heading and the list's "The whole
 * cohort" heading under it — two headings for one list, which is what the user objected to
 * (2026-10-27): _« surtout en haut avec le find capability et le titre erc8004 agents, ça ne va
 * pas du tout »_.
 *
 * ## What this is and is not
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

/**
 * The input, for the index's toolbar. No heading — the page already has one, and the placeholder
 * plus the examples underneath say what it searches.
 */
export function CapabilityFilter({
    value,
    onChange,
    onSubmit,
}: {
    value: string;
    onChange: (next: string) => void;
    onSubmit: (domain: string) => void;
}) {
    return (
        <div>
            <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    onSubmit(value);
                }}
            >
                <input
                    type="search"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder="What it says it can do"
                    aria-label="Filter agents by declared capability"
                    className="h-9 w-[min(16rem,100%)] rounded-[var(--radius-control)] border border-[color:var(--color-rule)] bg-[color:var(--color-bg)] px-3 font-mono text-[length:var(--text-body-sm)]"
                />
                <button
                    type="submit"
                    disabled={value.trim().length === 0}
                    className={`h-9 ${controlClass}`}
                >
                    Filter
                </button>
                {value.trim().length === 0 ? null : (
                    <button
                        type="button"
                        onClick={() => {
                            onChange("");
                            onSubmit("");
                        }}
                        className="h-9 px-2 font-mono text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]! border-transparent!"
                    >
                        Clear
                    </button>
                )}
            </form>

            {/* The vocabulary is the graph's, not ours, so the examples are ones that return
                something. Measured on mainnet 2026-10-27: `MCP Server` 50, the rest one each. */}
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-grey)]">
                    try
                </span>
                {SUGGESTIONS.map((suggestion) => (
                    <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                            onChange(suggestion);
                            onSubmit(suggestion);
                        }}
                        className="px-1.5 py-0.5 font-mono text-[length:var(--text-label)] border-transparent! text-[color:var(--color-steel)]! hover:text-[color:var(--color-fg)]!"
                    >
                        {suggestion}
                    </button>
                ))}
            </div>
        </div>
    );
}

/** The results, which stand in for the cohort table while a filter is live. */
export function CapabilityResults({domain}: {domain: string}) {
    const chain = useChainChoice();
    const query = useFindAgents(domain);

    return (
        <section aria-label={`Agents declaring ${domain}`}>
            <div>
                {domain.trim().length === 0 ? null : query.isPending ? (
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
    const chain = useChainChoice();
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
                        // `group` is what lets the arrow appear on hover; `focus-within` is what
                        // lets it appear for a keyboard, which `opacity-0` would otherwise hide
                        // from entirely.
                        className="group flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[color:var(--color-rule)] py-3 hover:bg-[color:var(--color-surface-hover)]"
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
                        {/* The mark, the count, the amount — and **nothing at all** when nobody
                            has backed it. It read "no backing", which is a sentence about an
                            absence; an empty cell says the same thing without being read (user,
                            2026-10-27). */}
                        {candidate.backingAssets === null ? (
                            <span />
                        ) : (
                            <span className="flex shrink-0 items-center gap-3 font-mono text-[length:var(--text-body-sm)] tabular-nums">
                                <span className="text-[color:var(--color-steel)]">
                                    <StakerCount count={candidate.backers} />
                                </span>
                                <span>
                                    {formatTrust(candidate.backingAssets)} {chain.symbol}
                                </span>
                            </span>
                        )}
                        {/* An arrow, and only on hover or focus. It said "Who hired it →" — a
                            leftover from the hire flow ADR `0060` deleted, and wrong twice over:
                            nothing here hires, and the page it opens is the atom's whole standing,
                            not one question about it. Naming the destination needs a sentence; the
                            arrow says "there is more" and the row is already a link to it. */}
                        <Link
                            to={`/atom/${candidate.atomId}`}
                            aria-label={`Open ${candidate.label ?? candidate.atomId}`}
                            className="shrink-0 font-mono text-[color:var(--color-grey)]! opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-[color:var(--color-fg)]! focus-visible:opacity-100"
                        >
                            →
                        </Link>
                    </li>
                ))}
            </ul>
        </>
    );
}
