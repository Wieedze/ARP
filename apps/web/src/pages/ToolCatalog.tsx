import {useState} from "react";
import {Link, useSearchParams} from "react-router-dom";

import {DisplayTabs} from "../components/brand/DisplayTabs";
import {DomainRail} from "../components/tool/DomainRail";
import {Segmented} from "../components/tool/ToolCatalogControls";
import {controlClass, linkClass} from "../lib/control-class";
import type {ToolListingOrder} from "@arp-protocol/core";

import {PageLoading} from "../components/brand/PageLoading";
import {ToolCatalogList} from "../components/tool/ToolCatalogList";
import {useDomainTree} from "../hooks/use-domain-tree";
import {useTagIndex} from "../hooks/use-tag-index";
import {useReadsSignals, useToolCatalog} from "../hooks/use-tool-catalog";
import {
    livenessOf,
    pageOfTools,
    rankTools,
    TOOL_CURVES,
    TOOL_INDEXES,
    TOOL_PAGE_SIZE,
    toolIndexOf,
    skillUsageByRepo,
    toolSortAxesFor,
    type ToolIndex,
    type ToolSortAxis,
} from "../services/tool-catalog";
import {useSkillFacts} from "../hooks/use-skill-facts";

/**
 * `/tools` — tools, ordered by what the sponsor deposited in an agent's name.
 *
 * Agent declarations only. The `uses` predicate is shared and most of what sits on it is ordinary
 * prose, filtered out in the query rather than shown under a caveat.
 *
 * It reads the chain the toggle names, testnet by default (ADR `0105`). The banner that used to say
 * mainnet is gone (ADR `0058`); the warning now lives in the confirmation step, where a wallet is about to open.
 *
 * This is the nav's "Tools" (user, 2026-10-20), so the `h1` is "Tools" and the subtitle carries the
 * population and the chain — `/` lists a different population on a different chain and still says
 * "Tools" too, which its own heading will have to resolve.
 *
 * No order by score, and no column for one: ARP composes none (ADR `0046`).
 */

export function ToolCatalog() {
    // The chain read's own order, which does not decide what the reader sees: the list is gated
    // and sorted here on `axis`, over the whole population rather than a page of it. Kept because
    // the query takes one; `conviction` is only what keeps the cache key stable.
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
    const [chosenAxis, setChosenAxis] = useState<ToolSortAxis>("signals");
    // Where the reader is in the ranked list. Every control that changes what is ranked sends it
    // back to the first page: page 9 of one order is not a place in another.
    const [offset, setOffset] = useState(0);
    const setAxis = (next: ToolSortAxis) => {
        setChosenAxis(next);
        setOffset(0);
    };
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
    const query = useToolCatalog(order, curveId);
    const view = query.data;
    const axes = toolSortAxesFor(index, useReadsSignals());
    // Installs are a skill's figure and stars a repository's: switching index keeps the reader's
    // axis when the other index has it, and falls back to the index's first when it does not. Where
    // Signals cannot be read, that is its installs or stars.
    const axis: ToolSortAxis = axes.some((entry) => entry.id === chosenAxis)
        ? chosenAxis
        : (axes[0]?.id ?? "signals");
    const chooseIndex = (next: ToolIndex) => {
        setSearchParams(next === "skills" ? {} : {index: next}, {replace: true});
        setOffset(0);
    };
    /**
     * What the tool is **for**, and `null` by default.
     *
     * The one axis on this page that no other listing can offer: npm's search for "payment" returns
     * 25,501 rows ranked on the string, the MCP registry holds 11,582 servers with no field for what
     * they do. Here a reader names a need and the subtree under it is walked before anything is
     * ranked — the same call `arp_find_tools { domain }` makes for an agent, from the same code.
     */
    const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
    const toggleDomain = (domain: string) => {
        setOffset(0);
        setPicked((current) => {
            const next = new Set(current);
            // A second click on a picked domain removes it. Nothing here is radio-like: narrowing
            // to "image or video" is one question, not two.
            if (!next.delete(domain)) next.add(domain);
            return next;
        });
    };
    const domains = useDomainTree();
    const tags = useTagIndex(domains.tree);
    const inDomain = tags.index.idsUnder([...picked], domains.tree);
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
            stars:
                repoFactFor(row.source === null ? row.label : `github.com/${row.source}`)?.stars ??
                null,
        }),
    );
    const page = pageOfTools(visible, offset, TOOL_PAGE_SIZE);
    const countIn = (which: ToolIndex) =>
        (view?.rows ?? []).filter((row) => toolIndexOf(row) === which).length;

    return (
        <section>
            {/* The count of what is shown, after the index and the domain filter, is the pager's
                "1–25 of N" under the list, not a figure up here. */}
            <header className="pt-14 pb-10">
                <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
                    <h1 className="type-display">Tools</h1>
                    {/* **Two indexes, one read.** Skills and repositories are filed in the same
                        catalogue, and the user asked for them to read as two lists. The switch
                        sits beside the title and a little below its baseline (user, 2026-10-30),
                        as a choice of what page you are on, not as one more toolbar control. */}
                    <DisplayTabs
                        label="Index"
                        options={TOOL_INDEXES.map((entry) => ({
                            ...entry,
                            count: view === undefined ? null : countIn(entry.id),
                        }))}
                        selected={index}
                        onChange={chooseIndex}
                    />
                </div>
            </header>

            {/* The toolbar on its own rule, like the index's. It was inline with the `h1`, which
                at `--text-display` put four controls against a single word. */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-[color:var(--color-rule)] py-3.5">
                <Segmented label="Order" selected={axis} onChange={setAxis} options={axes} />
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
                    onClear={() => {
                        setPicked(new Set());
                        setOffset(0);
                    }}
                />

                <div className="min-w-0">
                    {/* The list survives a failed refetch: `keepPreviousData` still holds the rows, and
                replacing them with an error would lose a good read to a transient one. */}
                    {view === undefined ? (
                        query.error === null ? (
                            <PageLoading label="Reading the tools">
                                reading tools from the intuition graph
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
                            <Link to="/start/tool" className={`mt-4 inline-block ${linkClass}`}>
                                Register the first one →
                            </Link>
                        </div>
                    ) : (
                        <>
                            <ToolCatalogList
                                rows={page.rows}
                                curveId={view.curveId}
                                showStars={index === "repos"}
                                // From every row read, not the page: a repository's skills are in
                                // the other index.
                                repoUsage={
                                    index === "repos" ? skillUsageByRepo(view.rows) : undefined
                                }
                            />
                            <nav
                                aria-label="Tool pages"
                                className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3"
                            >
                                <p
                                    aria-live="polite"
                                    className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] tabular-nums"
                                >
                                    {page.rangeLabel}
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        disabled={!page.hasPrevious}
                                        onClick={() => setOffset(page.offset - TOOL_PAGE_SIZE)}
                                        className={controlClass}
                                    >
                                        ← Previous
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!page.hasNext}
                                        onClick={() => setOffset(page.offset + TOOL_PAGE_SIZE)}
                                        className={controlClass}
                                    >
                                        Next →
                                    </button>
                                </div>
                            </nav>
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
