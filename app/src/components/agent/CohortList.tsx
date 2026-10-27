import {Link} from "react-router-dom";

import {Sigil} from "../brand/Sigil";

import type {CohortRow, CohortView} from "../../services/agent-cohort";

/**
 * The cohort as a list, not as 25 boxes.
 *
 * One grid, one hairline under each row, everything numeric in mono and
 * right-aligned so the columns read down. The two figures a reader is being
 * asked to judge an agent on — how many statements exist about it, and what is
 * staked on it — sit in their own columns rather than buried in prose.
 *
 * Every market cap carries its position count. These atoms hold one or two
 * positions each; a bare number would suggest a depth of opinion that is not
 * there.
 *
 * Below `sm` the four columns collapse to two and the name spans both rows, so
 * the numbers stay stacked against the right edge instead of forcing the page
 * wider than the screen. The column headers go with them, so each numeric cell
 * carries its own unit — visible at that width, and in the accessibility tree
 * at every width, since a `display: none` label is a label nothing can read.
 */

const ROW_GRID =
    "grid grid-cols-[minmax(0,1fr)_minmax(7rem,10rem)] sm:grid-cols-[1.75rem_minmax(0,1fr)_5.5rem_minmax(8rem,11rem)] items-start gap-x-4 gap-y-0.5";

/**
 * The agent's generated glyph, in place of the avatar it chose.
 *
 * User decision, 2026-10-27: the sigil over the image. An avatar is whatever the agent uploaded and
 * roughly half the cohort has none; the sigil is drawn from what it **declared**, so it carries
 * information and is the same glyph for the same agent everywhere.
 *
 * Absent when nothing was declared — a glyph of nothing but its centre is identical for every such
 * agent, so the hairline square stays for those. An empty square is honest about an empty
 * declaration.
 */
function Glyph({row}: {row: CohortRow}) {
    if (row.modules.length === 0) return <Placeholder />;
    return (
        <span className="hidden sm:block mt-0.5">
            <Sigil agentId={row.key} modules={row.modules} size={28} />
        </span>
    );
}

/** Not a grey block pretending to load — a hairline square that stays empty. */
function Placeholder() {
    return (
        <span
            aria-hidden
            className="hidden sm:block w-7 h-7 mt-0.5 border border-[color:var(--color-rule)]"
        />
    );
}

function RowBody({row}: {row: CohortRow}) {
    const notes: string[] = [];
    if (row.identityProblem !== null) notes.push(row.identityProblem);
    if (row.isFallbackMetadata) notes.push("indexer stand-in, not a chosen name");

    return (
        <>
            <Glyph row={row} />

            <span className="min-w-0 row-span-2 sm:row-span-1">
                <span className="block truncate font-medium leading-tight">{row.name}</span>
                {/*
                 * Only when there is something to say. Wraps rather than
                 * truncates: at 400px this track is ~176px and both of these
                 * strings are longer than that, and truncating would drop the
                 * reason an unlinkable row is unlinkable.
                 */}
                {notes.length === 0 ? null : (
                    <span className="block font-mono text-[length:var(--text-label)] leading-tight text-[color:var(--color-steel)] break-words">
                        {notes.join(" · ")}
                    </span>
                )}
            </span>

            <span className="font-mono text-[length:var(--text-body-sm)] leading-tight text-right tabular-nums">
                {row.statementCount === null ? "—" : row.statementCount.toLocaleString("en-US")}
                <span className="sm:sr-only text-[color:var(--color-steel)]"> statements</span>
            </span>

            <span className="text-right min-w-0">
                <span className="block font-mono text-[length:var(--text-body-sm)] leading-tight tabular-nums">
                    <span className="sr-only">staked on its atom: </span>
                    {row.marketCap ?? "—"}
                </span>
                <span className="block font-mono text-[length:var(--text-label)] leading-tight text-[color:var(--color-steel)] break-words">
                    {row.positions}
                </span>
            </span>
        </>
    );
}

export function CohortList({view}: {view: CohortView}) {
    if (view.rows.length === 0) {
        return (
            <p className="mt-8 max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                This page came back empty — the offset has run off the end of the list.
            </p>
        );
    }

    return (
        <div className="mt-8">
            <div
                className={`${ROW_GRID} hidden sm:grid pb-2 border-b border-[color:var(--color-rule-strong)] font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]`}
                aria-hidden
            >
                <span />
                <span>Agent</span>
                <span className="text-right">Statements</span>
                <span className="text-right">Staked on its atom</span>
            </div>

            <ul className="border-t border-[color:var(--color-rule-strong)] sm:border-t-0">
                {view.rows.map((row) => (
                    <li key={row.key} className="border-b border-[color:var(--color-rule)]">
                        {row.href === null ? (
                            <div className={`${ROW_GRID} py-2.5`}>
                                <RowBody row={row} />
                            </div>
                        ) : (
                            <Link to={row.href} className={`${ROW_GRID} py-2.5`}>
                                <RowBody row={row} />
                            </Link>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
