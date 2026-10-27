import {type ReactNode} from "react";
import {Link, useLocation} from "react-router-dom";

import {SourceMark} from "./SourceMark";

/**
 * The nav: the mark and the wordmark at top left, everything else to the right.
 *
 * ## It was a split nav with the mark centred, and it broke (user, 2026-10-27)
 *
 * ADR `0057` §3 specified `1fr auto 1fr` with the logo in the middle. That holds for four links. It
 * stops holding the moment a wallet connects, because the right side then carries three links, a
 * two-button chain toggle and an address — and the fixed centre column has no give, so the right
 * group wraps under a half-empty left one.
 *
 * So the mark moves to the left, which is also where the user asked for it, and the right side gets
 * the whole remaining width to wrap inside. The centred version is recorded in `0057`; this is the
 * amendment.
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
            className={`group inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em] whitespace-nowrap ${
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

export function NavSplit({children}: {children: ReactNode}) {
    return (
        <header className="border-b border-[color:var(--color-rule)] px-6">
            {/* `min-h` rather than `h`: with a wallet connected the right group can take two lines
                at a narrow width, and a fixed height would clip it. */}
            <div className="mx-auto flex min-h-[88px] w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-8 gap-y-4 py-3">
                <Link to="/" aria-label="ARP, home" className="flex items-center gap-3">
                    <SourceMark size={40} />
                    {/* Archivo 800 at width 125%, per ADR `0057` §1. `font-stretch` is inline
                        because Tailwind has no utility for it and an arbitrary property would be
                        the second failure class `rules/ui.md` names — a class that emits nothing. */}
                    <span
                        className="font-display text-[22px] font-extrabold leading-none tracking-[-0.02em] text-[color:var(--color-fg)]"
                        style={{fontStretch: "125%"}}
                    >
                        ARP
                    </span>
                </Link>
                <nav className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3">
                    {children}
                </nav>
            </div>
        </header>
    );
}

export {NavLink};
