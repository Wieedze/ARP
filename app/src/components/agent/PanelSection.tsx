import {type ReactNode} from "react";

/**
 * One section of the agent page: a numbered rail on the left, the content on the right.
 *
 * ## The grammar, and why the page needed one
 *
 * From `arp-design-handoff/arp-design-handoff 2/reference/agent-page.html` — `.sec`, a
 * `200px minmax(0,1fr)` grid with a hairline across the top, and a rail carrying a number and a
 * name. The user's verdict on what was here: _« on peut mieux organiser cette page, j'en suis
 * sûr »_, and he was right about the cause: every section was an `h2` at body weight stacked in one
 * column, so a reader scrolling could not tell where one answer ended and the next began.
 *
 * A number and a rule do that work without a single extra word. They also make the page's
 * **order** visible, which is the argument: identity, then the market on the agent, then who used
 * it, then what others say about it. Each one costs more to produce than the one above it.
 *
 * ## What the reference has and this does not
 *
 * A `.cost` pill per section — PAID, FACT, FREE, YOU. The user cut that vocabulary on sight
 * (2026-10-27): _« paid to say / said for free, ça rime à rien, c'est vraiment pas clair et je
 * pense que c'est inutile »_. The rail keeps the number and the name, which are structure; the
 * taxonomy is gone, and the ordering already says what it was there to say.
 *
 * The rail collapses above the body below `lg`, where a 200px column would leave the content a
 * strip. It stays a rail, not a heading, so the hierarchy survives the collapse.
 */
export function PanelSection({
    number,
    title,
    note,
    children,
}: {
    /** `01`, `02` — zero-padded by the caller so the sequence is visible in the source too. */
    number: string;
    title: string;
    /** One mono line under the title. For a fact about the section, never an explanation of it. */
    note?: string;
    children: ReactNode;
}) {
    return (
        <section className="grid gap-x-10 gap-y-5 border-t border-[color:var(--color-rule)] py-9 lg:grid-cols-[200px_minmax(0,1fr)]">
            <div className="flex flex-col gap-2.5 font-mono text-[11px] uppercase tracking-[0.06em]">
                <span className="text-[color:var(--color-grey)]">{number}</span>
                <h2 className="tracking-[0.08em] text-[color:var(--color-fg)]">{title}</h2>
                {note === undefined ? null : (
                    <p className="normal-case tracking-normal text-[color:var(--color-steel)]">
                        {note}
                    </p>
                )}
            </div>
            <div className="flex min-w-0 flex-col gap-5">{children}</div>
        </section>
    );
}
