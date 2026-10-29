import {Link} from "react-router-dom";
import {useChainChoice} from "../../lib/chain-choice";
import {useSkillFacts, type SkillFact} from "../../hooks/use-skill-facts";

import {groupByRepo, type ToolGroup, type ToolGrouping, type ToolRow} from "../../services/tool-catalog";

/**
 * Tools as a list, not as N boxes.
 *
 * One grid, one hairline under each row, every figure in mono and right-aligned so the columns read
 * down. Four columns and no more: the name, how many declarations exist, how many somebody paid to
 * stand behind, and the TRUST summed across them. Nothing restates a column in prose.
 *
 * **A row says which population it came from**, under the name and in small type rather than as a
 * fifth column. The figure means something different in each: a `declared` row's TRUST is summed
 * across the edges agents wrote, a `registered` row's is what sits on the tool's own atom. Same
 * column, two questions — so the row has to say which. The tool's own page carries the per-edge
 * markets and **not** the atom's vault, so it does not yet spell the distinction out; until it does,
 * this sub-label is the only place it is said.
 *
 * Below `sm` the four columns collapse to two and the name spans **three** rows, because there are
 * three numeric cells: with `row-span-2` the third one overflows column 2 and wraps to the next
 * row's first column, landing out of line with the two above it. `CohortList` spans two because it
 * has two.
 *
 * `Headers` is built from `ROW_GRID` rather than a hand-written copy — the string already carries
 * its own `sm:` variants, so there is nothing to prefix and no second grid to keep in step.
 */

const ROW_GRID =
    "grid grid-cols-[minmax(0,1fr)_minmax(6rem,9rem)] sm:grid-cols-[minmax(0,1fr)_5rem_5rem_minmax(7rem,10rem)] items-start gap-x-4 gap-y-0.5";

/**
 * One figure with the label its column header carries at wider widths.
 *
 * `sm:sr-only`, never `sm:hidden`: above `sm` the header supplies the label visually, but this is a
 * plain grid and not a table, so nothing associates a header with a cell programmatically. A
 * `display: none` label is a label nothing can read, and a screen reader would get three bare
 * numbers per row.
 */
function Figure({value, label}: {value: string; label: string}) {
    return (
        <span className="font-mono text-[length:var(--text-body-sm)] tabular-nums text-right leading-tight">
            {value}
            <span className="sm:sr-only block text-[length:var(--text-label)] text-[color:var(--color-steel)] font-sans">
                {label}
            </span>
        </span>
    );
}

function Row({row, fact}: {row: ToolRow; fact: SkillFact | null}) {
    const {symbol} = useChainChoice();
    return (
        <li className="border-b border-[color:var(--color-rule)]">
            <Link
                to={row.href}
                className="block py-3 hover:bg-[color:var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--color-accent)]"
            >
                <div className={ROW_GRID}>
                    <span
                        // The full value on hover, because the column truncates: a label clips at
                        // narrow widths, and an atom id standing in for a missing label is a hex
                        // string nothing else explains.
                        title={row.name}
                        className={`min-w-0 row-span-3 sm:row-span-1 block truncate leading-tight ${
                            row.isUnnamed
                                ? "font-mono text-[length:var(--text-body-sm)]"
                                : "font-medium"
                        }`}
                    >
                        {row.name}
                        {/* Under the name, not a column: it qualifies the row rather than measuring
                            it, and a fifth column would be a fifth column on a list that reads
                            down. The repository comes first because it is the part a reader scans
                            for; what kind of row it is follows. */}
                        <span className="block font-sans font-normal text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]">
                            {row.source === null ? null : (
                                <span className="font-mono normal-case tracking-normal">
                                    {row.source}
                                    <span className="px-1.5 text-[color:var(--color-rule-strong)]">
                                        ·
                                    </span>
                                </span>
                            )}
                            {row.provenance === "registered"
                                ? row.stakers === null || row.stakers === 0
                                    ? "registered"
                                    : `registered · ${row.stakers} on the tool`
                                : "declared by agents"}
                            {/* Installs sit here rather than in a fifth column. They are not a
                                figure this page ranks on — they are somebody else's count and
                                cannot tell two identical files apart — but they are what tells a
                                reader whether anybody has ever run this. */}
                            {fact?.installs === null || fact === null ? null : (
                                <span className="font-mono normal-case tracking-normal">
                                    <span className="px-1.5 text-[color:var(--color-rule-strong)]">
                                        ·
                                    </span>
                                    {`${Intl.NumberFormat("en-US", {notation: "compact"}).format(fact.installs)} installs`}
                                </span>
                            )}
                        </span>
                        {/* The author's own sentence, not ours. A list of slugs is not an index:
                            this is the line that lets a reader pick without opening each row. One
                            line, clipped — the full text is on the atom's page. */}
                        {fact === null || fact.description.length === 0 ? null : (
                            <span className="mt-0.5 block truncate font-sans text-[length:var(--text-body-sm)] font-normal text-[color:var(--color-silver)]">
                                {fact.description}
                            </span>
                        )}
                    </span>

                    <Figure value={String(row.declarations)} label="declarations" />
                    {/* An unknown stays empty rather than printing a zero, like the oppose cell
                        below. A registered row's declarations are counted but not priced: pricing
                        them needs the per-edge vaults, which is the declared read. */}
                    <Figure
                        value={row.paidDeclarations === null ? "—" : String(row.paidDeclarations)}
                        label="paid for"
                    />
                    <span className="font-mono text-[length:var(--text-body-sm)] tabular-nums text-right leading-tight">
                        <span className="sr-only">staked behind it: </span>
                        {row.supportTrust}
                        <span className="text-[color:var(--color-steel)]"> {symbol}</span>
                        {/* The counter only when something stands against it, so the cell is empty
                            rather than carrying a zero that reads as agreement. */}
                        {row.opposeTrust === null ? null : (
                            <span className="block text-[length:var(--text-label)] text-[color:var(--color-steel)] font-sans">
                                {row.opposeTrust} against
                            </span>
                        )}
                    </span>
                </div>
            </Link>
        </li>
    );
}

function Headers({curveId}: {curveId: number}) {
    return (
        <div
            // `aria-hidden` because every cell carries its own `sr-only` label: without it a
            // screen reader reads the header and then the label again, for every row.
            aria-hidden
            className={`${ROW_GRID} hidden sm:grid pb-2 border-b border-[color:var(--color-rule-strong)] font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]`}
        >
            {/* The same words as the controls above, and the same word `/agents` uses for the
                same thing. **"Claims", never "Used"**: the number counts sentences agents wrote,
                and whether the use happened is unknowable from outside (`docs/14`). */}
            <span>Tool</span>
            <span className="text-right">Claims</span>
            <span className="text-right">Paid for</span>
            {/* The curve is part of a TRUST sum's population (`rules/claims.md` §2). It belongs on
                the figure rather than in a footer line nobody needs twice. */}
            <span className="text-right" title={`Read on bonding curve ${curveId}`}>
                Staked
            </span>
        </div>
    );
}

/**
 * One repository, with its skills folded away until asked for.
 *
 * `<details>` rather than a button and a piece of state: it opens with the keyboard, it is in the
 * accessibility tree as a disclosure without an `aria-` attribute to get wrong, and the browser
 * keeps the open ones open on its own.
 *
 * The count is the whole summary — 71 skills from one repository is the fact that decides whether
 * a reader opens it, and it is why grouping exists at all.
 */
function RepoGroup({
    group,
    curveId,
    factFor,
}: {
    group: ToolGroup;
    curveId: number;
    factFor: (label: string | null) => SkillFact | null;
}) {
    return (
        <details className="border-b border-[color:var(--color-rule)]">
            <summary className="flex cursor-pointer items-baseline justify-between gap-4 py-3 marker:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--color-accent)]">
                <span className="min-w-0 truncate font-medium">{group.repo}</span>
                <span className="shrink-0 font-mono text-[length:var(--text-body-sm)] tabular-nums text-[color:var(--color-steel)]">
                    {group.rows.length}
                </span>
            </summary>
            {/* Indented and hairlined on the left so an open group reads as belonging to its
                repository rather than as the list resuming. */}
            <ul className="mb-2 ml-3 border-l border-[color:var(--color-rule)] pl-4">
                {group.rows.map((row) => (
                    <Row key={row.key} row={row} fact={factFor(row.label)} />
                ))}
            </ul>
            <span className="sr-only">{`on bonding curve ${curveId}`}</span>
        </details>
    );
}

export function ToolCatalogList({
    rows,
    curveId,
    grouping = "flat",
}: {
    rows: ToolRow[];
    curveId: number;
    grouping?: ToolGrouping;
}) {
    const {factFor} = useSkillFacts();
    if (grouping === "repo") {
        // No column headers: a group's own line carries a name and a count and nothing a header
        // would describe. The headers return with the rows, inside each open group.
        return (
            <div>
                {groupByRepo(rows).map((group) => (
                    <RepoGroup
                        key={group.repo}
                        group={group}
                        curveId={curveId}
                        factFor={factFor}
                    />
                ))}
            </div>
        );
    }
    return (
        <div>
            <Headers curveId={curveId} />
            <ul>
                {rows.map((row) => (
                    <Row key={row.key} row={row} fact={factFor(row.label)} />
                ))}
            </ul>
        </div>
    );
}
