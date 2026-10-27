import {Link, useParams} from "react-router-dom";

import {PageLoading} from "../components/brand/PageLoading";
import {useAtomStanding, isAtomId} from "../hooks/use-atom-standing";
import {useChainChoice} from "../lib/chain-choice";
import {linkClass} from "../lib/control-class";
import {describePointers, type AtomView, type GroupView} from "../services/atom-standing-view";
import {truncateMiddle} from "../services/trust-format";
import {StakerCount} from "../components/agent/StakerCount";

/**
 * `/atom/:atomId` — one atom, its own market, and everything that points at it.
 *
 * ## It replaces `/atom/:atomId`, which was the same page under a narrower name
 *
 * That page read **only** `uses` edges, so a tool had somewhere to go and a tag, a category or a
 * protocol did not — `CapabilitySection` rendered those as dead text. The user's question
 * (2026-10-27): _« si les tools existent et les tags aussi et les supports aussi, pourquoi ne pas
 * avoir de page autour de ça ? »_
 *
 * They do exist. In Intuition every object of a triple is an atom with its own vault, so a tag
 * already has a market. What was missing was a reader that does not presume the predicate, which is
 * `getAtomStanding`. One page now serves a tool, a tag, a category, a protocol and an agent's atom,
 * because the question is the same each time: **who points at this, and what did they put behind
 * saying so.**
 *
 * The old route redirects here rather than 404ing — links to it exist in commits, in ADRs and in
 * whatever the user has bookmarked.
 *
 * ## What it reads and does not write
 *
 * Reads only. The deposit on an agent lives on the agent's page where its subject is unmistakable
 * (ADR `0017` safeguard 4), and the `uses` edge is a receipt rather than a market worth soliciting
 * a position on (ADR `0056`).
 *
 * ## The predicates are whatever the graph holds
 *
 * Grouped by predicate, and the predicate is any atom anybody chose. Measured live on mainnet
 * 2026-10-27, one book's atom is the object of edges whose predicates are `Ethereum`, `Bitcoin`,
 * `Donald Trump` and `prefers`. That is the honest state of a permissionless graph and the page
 * shows it rather than curating a shortlist — ARP points and prices, it does not store or judge
 * (ADR `0051`, `0046`).
 */
export function AtomPanel() {
    const {atomId} = useParams();
    const valid = isAtomId(atomId);
    const query = useAtomStanding(valid ? atomId : null);
    const chain = useChainChoice();

    if (!valid) {
        return (
            <section className="mt-10">
                <h1 className="type-title">Not an atom id</h1>
                <p className="mt-4 max-w-[60ch] text-[color:var(--color-steel)]">
                    An atom is addressed by its Intuition id — 0x followed by 32 bytes. Got{" "}
                    <span className="font-mono">{atomId ?? "nothing"}</span>.
                </p>
            </section>
        );
    }

    if (query.isPending) {
        return (
            <PageLoading label="Reading the atom">
                reading {truncateMiddle(atomId)} and everything pointing at it on{" "}
                {chain.label.toLowerCase()}
            </PageLoading>
        );
    }

    if (query.isError) {
        return (
            <section className="mt-10" aria-live="polite">
                <h1 className="type-title">The read failed</h1>
                <p className="mt-4 max-w-[60ch] font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] break-words">
                    {query.error instanceof Error ? query.error.message : String(query.error)}
                </p>
            </section>
        );
    }

    const view = query.data;

    return (
        <section className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-[18rem_1fr] md:items-start">
            <aside>
                <h1 className={`type-title ${view.titleIsId ? "font-mono" : ""}`}>{view.title}</h1>
                <Identity view={view} />
            </aside>

            <div className="min-w-0">
                {!view.exists ? (
                    <Missing atomId={view.atomId} />
                ) : view.groups.length === 0 ? (
                    <Empty atomId={view.atomId} />
                ) : (
                    <>
                        <p className="mb-8 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            {describePointers(view)}
                        </p>
                        {view.groups.map((group) => (
                            <Group key={group.predicateAtomId} group={group} />
                        ))}
                    </>
                )}
            </div>
        </section>
    );
}

/** The atom's own facts, including its own vault — which is never summed with its edges'. */
function Identity({view}: {view: AtomView}) {
    const chain = useChainChoice();
    return (
        <>
            <dl className="mt-6 border-t border-[color:var(--color-rule)] pt-4 text-[length:var(--text-body-sm)]">
                <Term label="Atom">
                    <span className="font-mono break-all">{view.atomId}</span>
                </Term>
                {view.type === null ? null : (
                    <Term label="Type">
                        <span className="font-mono">{view.type}</span>
                    </Term>
                )}
                {view.pinnedUri === null ? null : (
                    <Term label="Pinned at">
                        <span className="font-mono break-all">{view.pinnedUri}</span>
                    </Term>
                )}
                {/* The atom's own market — a different one from the edges below, and never summed
                    with them (ADR `0056`). It was "Backing the atom · 6.03586585 TRUST · 1 distinct
                    staker": a label, a figure and four words of prose for two numbers. The user
                    asked for the mark and the numbers and nothing else (2026-10-27).

                    Absent when nobody has backed it. It read "no backing", which is a sentence
                    about an absence — an empty cell says the same thing and says it faster. */}
                {view.ownBacking === null ? null : (
                    <Term label="Backed">
                        <Backing amount={view.ownBacking} positions={view.ownPositions} />
                    </Term>
                )}
            </dl>

            <a
                href={`${chain.explorerUrl}/address/${view.atomId}`}
                target="_blank"
                rel="noreferrer"
                className={`mt-6 inline-block text-[length:var(--text-body-sm)] ${linkClass}`}
            >
                Explorer →
            </a>
        </>
    );
}

/**
 * A staked figure: the person mark with its count, then the amount.
 *
 * `StakerCount` was already exactly what the user asked for — _« juste un svg avec une personne et
 * un chiffre ainsi que la somme totale »_ — and this page was spelling it out in words instead
 * (`1 distinct staker`). The mark says "accounts" without the noun, the digit says how many, and
 * the amount follows.
 *
 * The count is never dropped. ADR `0023`: every vault on this surface holds one or two positions,
 * so an amount on its own suggests a depth of opinion that is not there, and the count is the part
 * that stops it reading as a market. `StakerCount` carries the announced label, so a screen reader
 * still hears "1 distinct staker" where the screen shows a glyph and a digit.
 */
function Backing({amount, positions}: {amount: string; positions: number}) {
    return (
        <span className="flex shrink-0 items-center gap-3 font-mono text-[length:var(--text-body-sm)] tabular-nums">
            <span className="text-[color:var(--color-steel)]">
                <StakerCount count={positions} />
            </span>
            <span>{amount}</span>
        </span>
    );
}

function Term({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <>
            <dt className="mt-4 text-[color:var(--color-steel)] text-[length:var(--text-label)] uppercase tracking-wider first:mt-0">
                {label}
            </dt>
            <dd className="mt-1">{children}</dd>
        </>
    );
}

/**
 * One predicate's edges.
 *
 * The predicate is the heading because it is what the claims say. A reader scanning this page is
 * asking "what is said about this thing", and the answer is a list of verbs with subjects under
 * them.
 */
function Group({group}: {group: GroupView}) {
    return (
        <section className="mb-12">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[color:var(--color-rule-strong)] pb-2">
                <h2
                    className={`font-medium ${group.labelIsId ? "font-mono text-[length:var(--text-body-sm)]" : ""}`}
                >
                    {group.label}
                </h2>
                {group.backing === null ? null : (
                    <Backing amount={group.backing} positions={group.positions} />
                )}
            </div>
            <ul>
                {group.rows.map((row) => (
                    <li
                        key={row.tripleId}
                        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[color:var(--color-rule)] py-3"
                    >
                        {/* Every subject is an atom, so every subject is a link to its own page.
                            That is the whole fix: the graph is walkable in both directions now. */}
                        <Link
                            to={`/atom/${row.subjectAtomId}`}
                            className={`min-w-0 truncate ${row.nameIsId ? "font-mono" : ""} ${linkClass}`}
                        >
                            {row.name}
                        </Link>
                        <span className="flex items-center gap-4">
                            {row.backing === null ? null : (
                                <Backing amount={row.backing} positions={row.positions} />
                            )}
                            {row.opposition === null ? null : (
                                <span className="font-mono text-[length:var(--text-body-sm)] tabular-nums text-[color:var(--color-alarm)]">
                                    against {row.opposition}
                                </span>
                            )}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** The id resolves to nothing. Different from an atom nobody points at, and said differently. */
function Missing({atomId}: {atomId: string}) {
    return (
        <div>
            <h2 className="text-[length:var(--text-body)] font-medium">No such atom</h2>
            <p className="mt-3 max-w-[70ch] text-[color:var(--color-steel)]">
                <span className="font-mono">{truncateMiddle(atomId)}</span> is a well-formed id that
                this chain&rsquo;s graph does not hold. It may exist on the other chain, or not yet
                exist at all.
            </p>
        </div>
    );
}

/**
 * The atom is there and nothing points at it — the ordinary case for most atoms.
 *
 * Says what would be here, per `rules/ui.md`, and does not pretend the absence is informative:
 * nobody pointing at something is not evidence against it.
 */
function Empty({atomId}: {atomId: string}) {
    return (
        <div>
            <h2 className="text-[length:var(--text-body)] font-medium">Nothing points at it</h2>
            <p className="mt-3 max-w-[70ch] text-[color:var(--color-steel)]">
                No claim on this chain has{" "}
                <span className="font-mono">{truncateMiddle(atomId)}</span> as its object. A row
                appears when somebody writes one — a declared use, a tag, a category.
            </p>
        </div>
    );
}
