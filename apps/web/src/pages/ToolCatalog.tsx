import {useState} from "react";
import {Link, useSearchParams} from "react-router-dom";

import {DomainRail} from "../components/tool/DomainRail";
import {Segmented} from "../components/tool/ToolCatalogControls";
import {linkClass} from "../lib/control-class";
import type {ToolListingOrder} from "@arp-protocol/core";

import {PageLoading} from "../components/brand/PageLoading";
import {ToolCatalogList} from "../components/tool/ToolCatalogList";
import {useDomainTree} from "../hooks/use-domain-tree";
import {useTagIndex} from "../hooks/use-tag-index";
import {useToolCatalog} from "../hooks/use-tool-catalog";
import {
    livenessOf,
    rankTools,
    TOOL_CURVES,
    TOOL_GROUPINGS,
    TOOL_INDEXES,
    TOOL_SORT_AXES,
    toolIndexOf,
    type ToolGrouping,
    type ToolIndex,
    type ToolSortAxis,
} from "../services/tool-catalog";
import {useSkillFacts} from "../hooks/use-skill-facts";

/**
 * `/tools` — tools agents declared using, with what is staked behind each.
 *
 * Agent declarations only. The `uses` predicate is shared and most of what sits on it is ordinary
 * prose, filtered out in the query rather than shown under a caveat.
 *
 * It reads **Intuition mainnet**. The banner that used to say so is gone (ADR `0058`); the warning
 * now lives in the confirmation step, where a wallet is about to open.
 *
 * This is the nav's "Tools" (user, 2026-10-20), so the `h1` is "Tools" and the subtitle carries the
 * population and the chain — `/` lists a different population on a different chain and still says
 * "Tools" too, which its own heading will have to resolve.
 *
 * No order by score, and no column for one: ARP composes none (ADR `0046`).
 */

export function ToolCatalog() {
    // `conviction`, not `priced-edges`. The old default ranked by how many claims carry a position
    // and is gone from the control (`TOOL_ORDERS`); money behind a claim is what separates it from
    // an assertion, so the list opens on the amount rather than on a free count.
    // The chain read's own order, which no longer decides what the reader sees: the list is
    // gated and sorted here, over the whole population rather than a page of it. Kept because the
    // query takes one, and `conviction` makes the cache warm on the figure most readers open with.
    const order: ToolListingOrder = "conviction";
    /**
     * Which axis the list is sorted on, above the liveness gate.
     *
     * **Not a weight.** Composing one score means deciding how much stake is worth against
     * popularity, and that is chosen rather than measured — publish it and whoever has capital
     * pushes on whichever term weighs most. So the page gates and sorts: the gate is liveness,
     * which nobody can pay to change, and above it the axis belongs to the reader with every
     * figure beside the others.
     */
    const [axis, setAxis] = useState<ToolSortAxis>("staked");
    // Curve 1 is the default because it is the durable signal: linear, so a position's gain follows
    // the tool's growth rather than the holder's timing. Curve 2 is where the money sits today, and
    // that is a different question — `TOOL_CURVES` has the measurement.
    /**
     * The curve the figures are read at. Fixed: the user took the control off this page
     * (2026-10-29), and the profile page, where a position is held on one curve or the other,
     * keeps it.
     */
    const curveId = TOOL_CURVES[0]?.id ?? 1;
    const [searchParams, setSearchParams] = useSearchParams();
    const index: ToolIndex = searchParams.get("index") === "repos" ? "repos" : "skills";
    const chooseIndex = (next: ToolIndex) =>
        setSearchParams(next === "skills" ? {} : {index: next}, {replace: true});
    /**
     * What the tool is **for**, and `null` by default.
     *
     * The one axis on this page that no other listing can offer: npm's search for "payment" returns
     * 25,501 rows ranked on the string, the MCP registry holds 11,582 servers with no field for what
     * they do. Here a reader names a need and the subtree under it is walked before anything is
     * ranked — the same call `arp_find_tools { domain }` makes for an agent, from the same code.
     */
    const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
    /**
     * Flat or grouped by repository. **Not a filter** — it removes no row, it decides how the same
     * rows are laid out, which is why it sits beside `Order` rather than in the rail.
     */
    const [grouping, setGrouping] = useState<ToolGrouping>("flat");
    const toggleDomain = (domain: string) =>
        setPicked((current) => {
            const next = new Set(current);
            // A second click on a picked domain removes it. Nothing here is radio-like: narrowing
            // to "image or video" is one question, not two.
            if (!next.delete(domain)) next.add(domain);
            return next;
        });
    const domains = useDomainTree();
    const tags = useTagIndex(domains.tree);
    const inDomain = tags.index.idsUnder([...picked], domains.tree);
    const query = useToolCatalog(order, curveId);
    const view = query.data;
    /**
     * The filtered rows and what the filters could not answer, derived here rather than in the JSX.
     *
     * It was an IIFE wrapping a three-deep ternary inside the render, which recomputed every render
     * and could not be reached by `useMemo`. Three branches read as three branches when they are not
     * nested inside an expression.
     */
    // Two narrowings, and the domain one runs first because it is a different kind of question:
    // `matchesFilter` asks what is known about a tool's declarations, the domain asks what the tool
    // is for. `null` means no domain was picked — not "a domain with nothing in it", which is why
    // the hook returns `null` rather than an empty set.
    const {factFor, repoFactFor} = useSkillFacts();
    const visible = rankTools(
        (view?.rows ?? [])
            .filter((row) => inDomain === null || inDomain.has(row.key.toLowerCase()))
            .filter((row) => toolIndexOf(row) === index),
        axis,
        (row) => ({
            // A skill's liveness is its repository's: `source` names it, and the row's own label
            // is tried too, for a repository's own entry.
            liveness: livenessOf(
                repoFactFor(row.source === null ? row.label : `github.com/${row.source}`),
            ),
            installs: factFor(row.label)?.installs ?? null,
        }),
    );
    const countIn = (which: ToolIndex) =>
        (view?.rows ?? []).filter((row) => toolIndexOf(row) === which).length;

    return (
        <section>
            <header className="grid items-end gap-x-8 gap-y-6 pt-14 pb-10 md:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                    <h1 className="type-display">Tools</h1>
                    {/* **Two indexes, one read.** Skills and repositories are filed in the same
                        catalogue, and the user asked for them to read as two lists. So the switch
                        is set in display type under the title, as a choice of what page you are on,
                        not as one more toolbar control. */}
                    <IndexTabs
                        selected={index}
                        onChange={chooseIndex}
                        countIn={view === undefined ? null : countIn}
                    />
                </div>
                <dl className="flex overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--color-rule)]">
                    {/* The count of what is SHOWN, not of what was read. It was `view.rows.length`,
                        which the index and the domain filter
                        contradicts constantly — "57" over two rows is a false claim about the list
                        the reader is looking at (`rules/claims.md`). */}
                    <Fact label="In the list">
                        {view === undefined ? "—" : visible.length.toLocaleString("en-US")}
                    </Fact>
                </dl>
            </header>

            {/* The toolbar on its own rule, like the index's. It was inline with the `h1`, which
                at `--text-display` put four controls against a single word. */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-[color:var(--color-rule)] py-3.5">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <Segmented
                        label="Order"
                        selected={axis}
                        onChange={setAxis}
                        options={TOOL_SORT_AXES}
                    />
                    {/* Grouping by repository only means something for skills: a repository
                        is its own group. */}
                    {index === "skills" ? (
                        <Segmented
                            label="Group"
                            selected={grouping}
                            onChange={setGrouping}
                            options={TOOL_GROUPINGS}
                        />
                    ) : null}
                </div>
            </div>

            {/* The rail is a column, not a drawer: at 13rem it costs a fifth of the width and
                never hides, so a reader always sees what the list is narrowed to. Below `md` it
                stacks above the list, where it is still short enough to scroll past. */}
            <div className="grid gap-x-10 gap-y-8 pt-6 md:grid-cols-[13rem_minmax(0,1fr)] md:items-start">
                <DomainRail
                    options={domains.options}
                    selected={picked}
                    counts={(domain) => tags.index.countFor(domain, domains.tree)}
                    onToggle={toggleDomain}
                    onClear={() => setPicked(new Set())}
                />

                <div className="min-w-0">
                    {/* The list survives a failed refetch: `keepPreviousData` still holds the rows, and
                replacing them with an error would lose a good read to a transient one. */}
                    {view === undefined ? (
                        query.error === null ? (
                            <PageLoading label="Reading the tools">
                                reading declared tools from the intuition graph
                            </PageLoading>
                        ) : (
                            <Failure error={query.error} onRetry={() => void query.refetch()} />
                        )
                    ) : visible.length === 0 && view.rows.length > 0 ? (
                        // Narrowed to empty, which is a different state from an empty catalogue: "nothing
                        // matches what you asked" against "nothing exists", and the second would be false.
                        <div className="max-w-[60ch]">
                            <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                                no rows match
                            </p>
                            <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                                {picked.size > 0
                                    ? "Clear the domain filter to see them."
                                    : `None in ${index === "skills" ? "skills" : "repositories"} yet.`}
                            </p>
                        </div>
                    ) : view.rows.length === 0 ? (
                        // An empty region with nothing in it reads as a failed read, so the state is said.
                        // And it says what would fill it, per `rules/ui.md`, because on this page the answer
                        // is one click away and the emptiness is not informative about any tool.
                        <div className="max-w-[60ch]">
                            <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                                nothing here yet
                            </p>
                            <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                                A row appears when somebody registers a tool, or an agent declares
                                using one.
                            </p>
                            <Link
                                to="/register?what=tool"
                                className={`mt-4 inline-block ${linkClass}`}
                            >
                                Register the first one →
                            </Link>
                        </div>
                    ) : (
                        <>
                            <ToolCatalogList
                                rows={visible}
                                curveId={view.curveId}
                                grouping={grouping}
                            />
                            {/* Only when it happened: a prefix presented as the whole set is the one thing
                        this page could get wrong without anyone noticing. */}
                            {view.truncated ? (
                                <p className="mt-6 text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                                    The read hit its limit — these are the first rows, not all of
                                    them.
                                </p>
                            ) : null}
                            {query.error === null ? null : <StaleNotice />}
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}

/**
 * The two indexes as two words in display type, the current one in paper and the other dim.
 *
 * Buttons with `aria-pressed`, like `Segmented`: it switches what the list shows, it does not
 * navigate. The count rides beside each word so the reader sees both sizes before choosing.
 */
function IndexTabs({
    selected,
    onChange,
    countIn,
}: {
    selected: ToolIndex;
    onChange: (next: ToolIndex) => void;
    countIn: ((which: ToolIndex) => number) | null;
}) {
    return (
        <div
            role="group"
            aria-label="Index"
            className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-2"
        >
            {TOOL_INDEXES.map((entry) => {
                const isSelected = entry.id === selected;
                return (
                    <button
                        key={entry.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onChange(entry.id)}
                        // Banged: `index.css`'s unlayered `button { border; color }` beats any
                        // utility, as `lib/control-class` lists.
                        className={`flex items-baseline gap-2 border-0! border-b-2! bg-transparent px-0 pb-1 type-face text-[26px] leading-none ${
                            isSelected
                                ? "border-[color:var(--color-accent)]! text-[color:var(--color-fg)]!"
                                : "border-transparent! text-[color:var(--color-grey)]! hover:text-[color:var(--color-silver)]!"
                        }`}
                    >
                        {entry.label}
                        <span className="font-mono text-[length:var(--text-body-sm)] tabular-nums text-[color:var(--color-steel)]">
                            {countIn === null ? "—" : countIn(entry.id).toLocaleString("en-US")}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** One boxed figure in the header, matching the index's. */
function Fact({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <div className="flex min-w-[7.5rem] flex-col gap-1.5 px-5 py-3.5 [&+&]:border-l [&+&]:border-l-[color:var(--color-rule)]">
            <dt className="font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--color-steel)]">
                {label}
            </dt>
            <dd className="type-face text-[26px] leading-none tabular-nums">{children}</dd>
        </div>
    );
}

/** The rows on screen are the last good read, and a newer one failed. */
function StaleNotice() {
    return (
        <p className="mt-6 pl-5 border-l border-[color:var(--color-rule-strong)] text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] max-w-[64ch]">
            These rows are the last successful read. The most recent one failed.
        </p>
    );
}

function Failure({error, onRetry}: {error: Error; onRetry: () => void}) {
    return (
        <div className="pl-5 border-l border-[color:var(--color-rule-strong)] max-w-[64ch]">
            <p className="font-medium">The graph read failed.</p>
            <p className="mt-2 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] break-words">
                {error.message}
            </p>
            <button
                type="button"
                onClick={onRetry}
                className="mt-4 px-3 py-1 text-[length:var(--text-body-sm)] border border-[color:var(--color-rule-strong)]"
            >
                Try again
            </button>
        </div>
    );
}
