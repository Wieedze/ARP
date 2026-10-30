import {Link} from "react-router-dom";
import {useChainChoice} from "../../lib/chain-choice";
import {useSkillFacts, type SkillFact} from "../../hooks/use-skill-facts";

import {type ToolRow} from "../../services/tool-catalog";

/**
 * Tools as a list, not as N boxes.
 *
 * One grid, one hairline under each row, every figure in mono and right-aligned so the columns read
 * down. Four columns and no more: the name, the deposits that passed ARP's proof gate ("Usage"),
 * every other deposit ("Declared"), and the TRUST summed across the edges. Proven first, by the
 * user's decision (ADR `0094` §2), and never weighted against each other. Nothing restates a column
 * in prose.
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

function countText(count: number | null): string {
    return count === null || count === 0 ? "" : String(count);
}

function Row({row, fact, stars}: {row: ToolRow; fact: SkillFact | null; stars: number | null}) {
    const {symbol} = useChainChoice();
    return (
        <li className="border-b border-[color:var(--color-rule)]">
            <Link
                to={row.href}
                className="block py-4 hover:bg-[color:var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--color-accent)]"
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
                        {/* **Only what differs between rows.** "REGISTERED · 1 ON THE TOOL" used
                            to sit here and was identical on all 715: a line that cannot vary is
                            not information, it is the width it occupies. `declared by agents` is
                            kept because it is rare and it changes what the figures mean. */}
                        <span className="block font-mono text-[length:var(--text-label)] font-normal text-[color:var(--color-steel)]">
                            {row.source}
                            {fact?.installs === null || fact === null ? null : (
                                <>
                                    {row.source === null ? null : (
                                        <span className="px-1.5 text-[color:var(--color-rule-strong)]">
                                            ·
                                        </span>
                                    )}
                                    {`${Intl.NumberFormat("en-US", {notation: "compact"}).format(fact.installs)} installs`}
                                </>
                            )}
                            {/* A repository's own figure, which its "Most stars" order sorts on. */}
                            {stars === null ? null : (
                                <>
                                    {row.source === null &&
                                    (fact === null || fact.installs === null) ? null : (
                                        <span className="px-1.5 text-[color:var(--color-rule-strong)]">
                                            ·
                                        </span>
                                    )}
                                    {`${Intl.NumberFormat("en-US", {notation: "compact"}).format(stars)} stars`}
                                </>
                            )}
                            {row.provenance === "declared" ? (
                                <span className="pl-1.5 font-sans uppercase tracking-wider">
                                    · declared by agents
                                </span>
                            ) : null}
                        </span>
                        {/* The author's own sentence, not ours. A list of slugs is not an index:
                            this is the line that lets a reader pick without opening each row. One
                            line, clipped — the full text is on the atom's page. */}
                        {/* `--color-steel` and not `--color-silver`: three lines at body weight
                            compete, and the name has to win. 5.9:1 is AA and is what `ui.md` gives
                            secondary text. */}
                        {fact === null || fact.description.length === 0 ? null : (
                            <span className="mt-1 block truncate font-sans text-[length:var(--text-body-sm)] font-normal text-[color:var(--color-steel)]">
                                {fact.description}
                            </span>
                        )}
                    </span>

                    {/* A zero is blanked, not printed. On a page where nothing has been declared
                        yet, a column of 715 zeros reads as data and is noise. An unknown stays
                        empty too, like the oppose cell below: a registered row's deposits are on
                        its edges, which is the declared read. */}
                    <Figure value={countText(row.provenDeposits)} label="usage" />
                    <Figure value={countText(row.declaredDeposits)} label="declared" />
                    <span className="font-mono text-[length:var(--text-body-sm)] tabular-nums text-right leading-tight">
                        {/* **Creation dust is not a stake.** Creating a term seeds its vault with
                            `minDeposit` (ADR `0042`), so every one of the 715 registered rows
                            reported 0.00098 tTRUST under "Staked" while nobody had staked on any
                            of them. `positionCount` is the discriminator: one position is the
                            creator's own, and the figure appears when somebody else arrives. */}
                        {row.provenance === "registered" && (row.stakers ?? 0) <= 1 ? null : (
                            <>
                                <span className="sr-only">staked behind it: </span>
                                {row.supportTrust}
                                <span className="text-[color:var(--color-steel)]"> {symbol}</span>
                            </>
                        )}
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
            {/* **"Usage" only for what passed the proof gate.** The user rejected "Most used" for
                unproven edges (2026-10-27): whether a use happened is unknowable from outside
                (`docs/14`). A sponsored deposit carries a proof that it did — a payment another
                party made, or a fetch through ARP (ADR `0094` §2) — so the word is true of that
                column and of nothing else here. */}
            <span>Tool</span>
            <span className="text-right">Usage</span>
            <span className="text-right">Declared</span>
            {/* The curve is part of a TRUST sum's population (`rules/claims.md` §2). It belongs on
                the figure rather than in a footer line nobody needs twice. */}
            <span className="text-right" title={`Read on bonding curve ${curveId}`}>
                Staked
            </span>
        </div>
    );
}

export function ToolCatalogList({
    rows,
    curveId,
    showStars = false,
}: {
    rows: ToolRow[];
    curveId: number;
    /** Repositories show their GitHub stars; a skill's would be its repository's, tied. */
    showStars?: boolean;
}) {
    const {factFor, repoFactFor} = useSkillFacts();
    return (
        <div>
            <Headers curveId={curveId} />
            <ul>
                {rows.map((row) => (
                    <Row
                        key={row.key}
                        row={row}
                        fact={factFor(row.label)}
                        stars={showStars ? (repoFactFor(row.label)?.stars ?? null) : null}
                    />
                ))}
            </ul>
        </div>
    );
}
