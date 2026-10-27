import {type ReactNode} from "react";
import {Link, useLocation} from "react-router-dom";

import {SourceMark} from "./SourceMark";

/**
 * The nav: items left, **the mark in the middle**, items right.
 *
 * ## It went left, then came back to the centre
 *
 * ADR `0057` §3 specified `1fr auto 1fr` with the logo centred. That broke the moment a wallet
 * connected — the right side then carried three links, a two-button chain toggle and an address,
 * and a fixed centre column has no give, so the right group wrapped under a half-empty left one.
 * It moved to the top left.
 *
 * The second design handoff keeps the centre mark, and the user asked for it back (2026-10-27):
 * _« le logo centrale aussi »_. The wrapping is solved rather than avoided: the two side groups are
 * `minmax(0,1fr)`, so each can shrink and wrap inside its own column instead of pushing the other,
 * and at narrow widths the whole grid collapses to one centred column. The reference's own
 * `justify-content: flex-end` / `flex-start` on the sides is what makes the two groups lean into
 * the mark rather than spread to the edges.
 *
 * ## No dots, except the one that means "you are here"
 *
 * The reference puts a hollow 6px ring beside every item and fills it on hover. The user cut that
 * (2026-10-27): _« sans les points à côté des noms sauf le point jaune quand sélectionné »_. So an
 * item is its label, and the **current** item gets a filled Saffron dot. That makes the accent do
 * one job on this surface — the accent is the only warm thing on the page, so where it sits is
 * where you are — and it reads at a glance instead of asking the eye to compare four rings.
 *
 * `aria-current="page"` is what the dot renders from, so the visual state and the announced state
 * cannot drift apart.
 *
 * **No ruler, no tick marks, no decoration under the nav** — the user rejected all three
 * (`HANDOFF.md` §3). One hairline, nothing else.
 */

function NavLink({to, children}: {to: string; children: ReactNode}) {
    const {pathname} = useLocation();
    // Exact for `/`, prefix otherwise, so `/agent/8453/2340` still lights "Agents"… except that
    // `/agent` and `/agents` are different items and `startsWith` would light both. The trailing
    // boundary check is what keeps them apart.
    const current =
        to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

    return (
        <Link
            to={to}
            {...(current ? {"aria-current": "page" as const} : {})}
            // `text-…!` because `a { color: inherit }` is unlayered in `index.css` and beats an
            // unbanged utility — the table in `lib/control-class.ts` has the full list.
            className={`inline-flex h-11 items-center gap-2.5 font-mono text-[12px] uppercase tracking-[0.12em] whitespace-nowrap ${
                current
                    ? "text-[color:var(--color-fg)]!"
                    : "text-[color:var(--color-steel)]! hover:text-[color:var(--color-fg)]!"
            }`}
        >
            {/* Only on the current item. An absent dot is not a hidden one: there is no reserved
                slot, so the labels sit flush and nothing shifts when a route changes — the gap
                belongs to the dot and disappears with it. */}
            {current ? (
                <span
                    aria-hidden="true"
                    className="h-[6px] w-[6px] shrink-0 rounded-full bg-[color:var(--color-accent)]"
                />
            ) : null}
            {children}
        </Link>
    );
}

/**
 * Items left of the mark, items right of it.
 *
 * Takes two groups rather than one list, because a centred mark needs to know what goes on each
 * side and a single `children` would have to be split by index — which is the kind of implicit
 * contract that breaks the first time somebody adds a link.
 */
export function NavSplit({left, right}: {left: ReactNode; right: ReactNode}) {
    return (
        <header className="border-b border-[color:var(--color-rule)] px-6">
            <div className="mx-auto flex min-h-[88px] w-full max-w-[1320px] flex-col items-center gap-y-3 py-3 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 md:justify-end md:pr-[clamp(14px,4vw,48px)]">
                    {left}
                </div>

                <Link to="/" aria-label="ARP, home" className="flex items-center justify-center">
                    <SourceMark size={56} />
                </Link>

                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 md:justify-start md:pl-[clamp(14px,4vw,48px)]">
                    {right}
                </div>
            </div>
        </header>
    );
}

export {NavLink};
