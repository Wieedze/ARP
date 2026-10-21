import {Link} from "react-router-dom";

import type {ToolRow} from "../../services/tool-catalog";

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
            <span className="sm:sr-only block text-[length:var(--text-label)] text-[color:var(--color-fg-60)] font-sans">
                {label}
            </span>
        </span>
    );
}

function Row({row}: {row: ToolRow}) {
    return (
        <li className="border-b border-[color:var(--color-border)]">
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
                            down. */}
                        <span className="block font-sans font-normal text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-60)]">
                            {row.provenance === "registered"
                                ? row.stakers === null || row.stakers === 0
                                    ? "registered"
                                    : `registered · ${row.stakers} on the tool`
                                : "declared by agents"}
                        </span>
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
                        <span className="text-[color:var(--color-fg-60)]"> TRUST</span>
                        {/* The counter only when something stands against it, so the cell is empty
                            rather than carrying a zero that reads as agreement. */}
                        {row.opposeTrust === null ? null : (
                            <span className="block text-[length:var(--text-label)] text-[color:var(--color-fg-60)] font-sans">
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
            className={`${ROW_GRID} hidden sm:grid pb-2 border-b border-[color:var(--color-border-strong)] font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]`}
        >
            <span>Tool</span>
            <span className="text-right">Declarations</span>
            <span className="text-right">Paid for</span>
            {/* The curve is part of a TRUST sum's population (`rules/claims.md` §2). It belongs on
                the figure rather than in a footer line nobody needs twice. */}
            <span className="text-right" title={`Read on bonding curve ${curveId}`}>
                Staked behind
            </span>
        </div>
    );
}

export function ToolCatalogList({rows, curveId}: {rows: ToolRow[]; curveId: number}) {
    return (
        <div>
            <Headers curveId={curveId} />
            <ul>
                {rows.map((row) => (
                    <Row key={row.key} row={row} />
                ))}
            </ul>
        </div>
    );
}
