import {useState} from "react";
import {Link} from "react-router-dom";

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
 * wider than the screen.
 */

const ROW_GRID =
    "grid grid-cols-[minmax(0,1fr)_minmax(7rem,10rem)] sm:grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_minmax(8rem,11rem)] items-start gap-x-4 gap-y-0.5";

function Avatar({src, name}: {src: string; name: string}) {
    const [failed, setFailed] = useState(false);
    if (failed) return <Placeholder />;
    return (
        <img
            src={src}
            alt=""
            aria-hidden
            width={24}
            height={24}
            loading="lazy"
            onError={() => setFailed(true)}
            title={name}
            className="hidden sm:block w-6 h-6 mt-0.5 object-cover border border-[color:var(--color-border-strong)]"
        />
    );
}

/** Not a grey block pretending to load — a hairline square that stays empty. */
function Placeholder() {
    return (
        <span
            aria-hidden
            className="hidden sm:block w-6 h-6 mt-0.5 border border-[color:var(--color-border)]"
        />
    );
}

function RowBody({row}: {row: CohortRow}) {
    return (
        <>
            {row.imageUrl === null ? (
                <Placeholder />
            ) : (
                <Avatar src={row.imageUrl} name={row.name} />
            )}

            <span className="min-w-0 row-span-2 sm:row-span-1">
                <span className="block truncate font-medium">{row.name}</span>
                <span className="block font-mono text-[length:var(--text-label)] text-[color:var(--color-fg-60)] truncate">
                    {row.identityProblem ?? row.identity}
                    {row.isFallbackMetadata ? " · indexer stand-in, not a chosen name" : null}
                </span>
            </span>

            <span className="font-mono text-[length:var(--text-body-sm)] text-right tabular-nums">
                {row.statementCount === null ? "—" : row.statementCount.toLocaleString("en-US")}
                <span className="sm:hidden text-[color:var(--color-fg-60)]"> statements</span>
            </span>

            <span className="text-right min-w-0">
                <span className="block font-mono text-[length:var(--text-body-sm)] tabular-nums">
                    {row.marketCap ?? "—"}
                </span>
                <span className="block font-mono text-[length:var(--text-label)] text-[color:var(--color-fg-60)] break-words">
                    {row.positions}
                </span>
            </span>
        </>
    );
}

export function CohortList({view}: {view: CohortView}) {
    if (view.rows.length === 0) {
        return (
            <p className="mt-8 max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                This page of the cohort came back empty. Every agent listed here declares{" "}
                <span className="font-mono">implement → ERC-8004</span> in the Intuition graph, and
                an empty page past the start of the list means the offset has run off the end of it.
            </p>
        );
    }

    return (
        <div className="mt-8">
            <div
                className={`${ROW_GRID} hidden sm:grid pb-2 border-b border-[color:var(--color-border-strong)] font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]`}
            >
                <span aria-hidden />
                <span>Agent</span>
                <span className="text-right">Statements</span>
                <span className="text-right">Staked on its atom</span>
            </div>

            <ul className="border-t border-[color:var(--color-border-strong)] sm:border-t-0">
                {view.rows.map((row) => (
                    <li key={row.key} className="border-b border-[color:var(--color-border)]">
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
