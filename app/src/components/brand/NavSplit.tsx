import {type ReactNode} from "react";
import {Link, useLocation} from "react-router-dom";

import {SourceMark} from "./SourceMark";

/**
 * The split nav: links right-aligned on the left, the mark in the centre, links left-aligned on the
 * right. ADR `0057` §3.
 *
 * A three-column grid of `1fr auto 1fr` is what centres the mark on the **page** rather than
 * between the link groups, so the logo stays put as labels change length. Flexbox with
 * `justify-between` would drift.
 *
 * **No ruler, no tick marks, no decoration under the nav** — the user rejected all three
 * (`HANDOFF.md` §3). One hairline, nothing else.
 *
 * The current page is marked by a **Saffron filled dot**, not by a colour change alone: the accent
 * is the only warm thing on the page, so where it sits is where you are. `aria-current="page"` is
 * what the dot renders from, so the visual and the announced state cannot drift apart.
 */

function NavLink({to, children}: {to: string; children: ReactNode}) {
    const {pathname} = useLocation();
    const current = pathname === to;

    return (
        <Link
            to={to}
            {...(current ? {"aria-current": "page" as const} : {})}
            // `text-…!` because `a { color: inherit }` is unlayered in `index.css` and beats an
            // unbanged utility — the table in `lib/control-class.ts` has the full list. The hover
            // colour needs the bang for the same reason, and `group` is what lets the dot follow it.
            className={`group inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em] ${
                current
                    ? "text-[color:var(--color-fg)]!"
                    : "text-[color:var(--color-steel)]! hover:text-[color:var(--color-fg)]!"
            }`}
        >
            <span
                aria-hidden="true"
                className={`h-[6px] w-[6px] shrink-0 rounded-full border ${
                    current
                        ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]"
                        : "border-[color:var(--color-steel)] group-hover:border-[color:var(--color-fg)] group-hover:bg-[color:var(--color-fg)]"
                }`}
            />
            {children}
        </Link>
    );
}

export function NavSplit({
    left,
    right,
}: {
    /** Rendered right-aligned, so the group reads inward toward the mark. */
    left: ReactNode;
    /** Rendered left-aligned, same reason. */
    right: ReactNode;
}) {
    return (
        <header className="h-[88px] border-b border-[color:var(--color-rule)] px-6">
            <div className="mx-auto grid h-full w-full max-w-[1080px] grid-cols-[1fr_auto_1fr] items-center gap-6">
                <nav className="flex flex-wrap items-center justify-end gap-6">{left}</nav>
                <Link to="/" aria-label="ARP, home">
                    <SourceMark size={56} />
                </Link>
                <nav className="flex flex-wrap items-center justify-start gap-6">{right}</nav>
            </div>
        </header>
    );
}

export {NavLink};
