import {useEffect, useState} from "react";
import {Link} from "react-router-dom";

import {cssVars} from "../../lib/css-vars";
import {LIST_CAP} from "../brand/row-motion";

import type {GroupView} from "../../services/atom-standing-view";
import {claimField, MAX_DOTS_PER_RING} from "./claim-field-geometry";

/**
 * Every claim about this atom, as a constellation around it.
 *
 * It replaces a sentence — _"250+ claims across one predicate"_ — which the user rejected as the
 * whole of what the page said about its own subject. The ask: _« soit avec des blocks soit avec des
 * cercles qui constellent comme le logo autour de l'atom du tool »_.
 *
 * ## Why circles are allowed here, and what they mean
 *
 * `rules/ui.md` reserves `rounded-full` for dots and agent sigils, so that **a circle on this
 * surface always means "an agent"**. Every dot here is the subject of a claim, and a subject is an
 * agent or an account — so the rule is satisfied by what the data is, not worked around.
 *
 * Three states, each read straight off the data and none invented:
 *
 * | | means |
 * | --- | --- |
 * | filled | a position stands behind the claim |
 * | hollow | declared, with nothing behind it |
 * | ringed | somebody took the other side |
 *
 * **Filled is `positionCount`, never the amount.** ADR `0042`: creating a term seeds its vaults
 * with `minShare`, so `assets > 0` means "this term exists" and three "has stake?" checks in this
 * repo were wrong for exactly that reason. There is deliberately **no size scale** — a dot sized by
 * TRUST would invent a ladder the data does not carry, and `docs/14` is explicit that the thing an
 * interface must never do is render rungs at a weight it chose.
 *
 * ## It is real links, not an SVG
 *
 * Absolutely positioned `<Link>`s rather than `<circle>`s inside one `<svg>`: focus rings come from
 * `index.css`'s unlayered `:focus-visible` and work for free, each dot has a real accessible name,
 * and keyboard order follows the DOM. An SVG would have needed every one of those rebuilt.
 *
 * ## The cap is stated, not hidden
 *
 * One mainnet tag carries 250+ edges on a single predicate, and a ring of 250 dots is a solid line.
 * `MAX_DOTS_PER_RING` draws 36 and the ring's label says how many it has — a field quietly showing
 * 36 of 250 is the kind of claim `rules/claims.md` exists to stop.
 */
export function ClaimField({
    groups,
    subject,
    edgeCount,
    truncated,
}: {
    groups: readonly GroupView[];
    subject: string;
    /** Across every group. What a caller may print as "N things point at this". */
    edgeCount: number;
    /**
     * The read hit the indexer's cap, so {@link edgeCount} is a **floor** and the groups are a
     * prefix.
     *
     * Carried here because the sentence this field replaced carried it — `describePointers`
     * printed `250+`. Dropping it was a real regression and a test caught it: a count rendered as
     * a total when the reader knows it is a floor is `rules/claims.md`'s whole subject.
     */
    truncated: boolean;
}) {
    // The rows flattened **with their predicate**, because a dot has to be able to say the whole
    // triple — subject, predicate, object — and the object is this page.
    const entries = groups.flatMap((group) =>
        group.rows.map((row) => ({row, predicate: group.label})),
    );
    const {rings, dots} = claimField(groups.map((group) => group.rows.length));

    /**
     * Which claim the pointer or the keyboard is on.
     *
     * **Hover *and* focus**, which is the condition under which `rules/ui.md`'s "no mouse-reactive
     * effects" is not being broken but read correctly. That rule rejects parallax, repulsion, hover
     * tilt and cursor trails — the pointer *moving* things. This reveals a fact that is already on
     * the page, the way `Hint` does, and `Hint` is the precedent: it opens on hover **and keyboard
     * focus** for exactly this reason. A reveal that only a mouse can reach is the thing to avoid.
     * ADR `0073`.
     */
    const [active, setActive] = useState<number | null>(null);

    /**
     * One frame of the entering state, then the dots settle.
     *
     * The class is on the container, not on each dot, so one state change drives the whole field
     * and React does not re-render 36 links. Under `prefers-reduced-motion` the CSS neutralises
     * both halves and the dots are simply there.
     */
    const [entering, setEntering] = useState(true);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setEntering(false));
        return () => cancelAnimationFrame(frame);
    }, []);

    const current = active === null ? undefined : entries[active];

    return (
        <div className="flex flex-wrap items-center gap-x-12 gap-y-8">
            <div
                className={`relative aspect-square w-full max-w-[22rem] shrink-0 ${entering ? "arp-claim-enter" : ""}`}
                role="group"
                aria-label={`Claims about ${subject}`}
            >
                {/* **One wrapper per ring, and it turns.** The dots live inside it rather than
                    beside it, so the ring and its claims rotate together — the alternative was
                    recomputing every angle per frame, which is what the landing's field does
                    because its points also breathe and dive. Nothing here moves but the angle.

                    Slower further out and alternating direction, so it reads as a constellation
                    rather than one wheel. Neutralised under `prefers-reduced-motion` by the rule
                    that neutralises every other arrival in the app. */}
                {/* The atom itself, at the centre, and it does **not** turn: it is the thing
                    every ring is about. The one Saffron mark on the field — `ui.md` allows the
                    accent on the mark, and ADR `0067` on the mark's core specifically.

                    It was lost once: a replacement that spanned from the rings to the dots took
                    everything between them, and the core sat in that gap. A screenshot caught it,
                    which is the only thing that could have. */}
                <span
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--color-accent)]"
                />

                {rings.map((ring) => (
                    <div
                        key={ring.ring}
                        className="arp-orbit pointer-events-none absolute inset-0"
                        style={cssVars({
                            "--orbit-for": `${110 + ring.ring * 40}s`,
                            "--orbit-to": ring.ring % 2 === 0 ? "360deg" : "-360deg",
                        })}
                    >
                        <span
                            aria-hidden="true"
                            className="absolute rounded-full border border-[color:var(--color-rule)]"
                            style={{
                                left: `${(0.5 - ring.r) * 100}%`,
                                top: `${(0.5 - ring.r) * 100}%`,
                                width: `${ring.r * 200}%`,
                                height: `${ring.r * 200}%`,
                            }}
                        />
                        {dots
                            .filter((dot) => dot.ring === ring.ring)
                            .map((dot) => {
                                const entry = entries[dot.index];
                                if (entry === undefined) return null;
                                const {row} = entry;
                                const backed = row.positions > 0;
                                return (
                                    <Link
                                        key={row.tripleId}
                                        to={`/atom/${row.subjectAtomId}`}
                                        title={`${row.name} — ${backed ? `${row.backing} behind it` : "nothing behind it"}`}
                                        onMouseEnter={() => setActive(dot.index)}
                                        onMouseLeave={() => setActive(null)}
                                        onFocus={() => setActive(dot.index)}
                                        onBlur={() => setActive(null)}
                                        // **Saffron is the light.** `ui.md` forbids `box-shadow`,
                                        // glow and gradients outright, and reserves the accent for
                                        // the primary action, the selected state and the viewer's
                                        // own position. A dot under the pointer or the keyboard
                                        // **is** a selected state, so the brightest colour in the
                                        // palette arriving on it is the design system's own idea of
                                        // luminous — and it needs no shadow to say it.
                                        //
                                        // The scale is on `transform`, which the arrival already
                                        // animates, so the two compose instead of fighting.
                                        className={`arp-claim pointer-events-auto absolute h-[10px] w-[10px] rounded-full border transition-[transform,background-color,border-color] duration-150 ${
                                            active === dot.index
                                                ? "-translate-x-1/2 -translate-y-1/2 scale-[1.8] border-[color:var(--color-accent)] bg-[color:var(--color-accent)]"
                                                : backed
                                                  ? "-translate-x-1/2 -translate-y-1/2 border-[color:var(--color-fg)] bg-[color:var(--color-fg)]"
                                                  : "-translate-x-1/2 -translate-y-1/2 border-[color:var(--color-steel)]"
                                        } ${row.opposition === null ? "" : "ring-2 ring-[color:var(--color-steel)] ring-offset-2 ring-offset-[color:var(--color-ground)]"}`}
                                        style={{
                                            left: `${dot.cx * 100}%`,
                                            top: `${dot.cy * 100}%`,
                                            // The stagger `rowMotion` would give, inline because the dot also
                                            // carries its own position and a second style object would fight it.
                                            ...cssVars({
                                                "--row-index": Math.min(dot.index, LIST_CAP - 1),
                                            }),
                                        }}
                                    >
                                        {/* **The whole triple, on the link itself.** A visible sentence plus a
                                    live region would announce twice, and a live region firing on
                                    *hover* says nothing to a reader who navigates by focus. One name,
                                    complete, announced when the dot is reached.

                                    **Not the word "backed".** `AtomPanel`'s dust-rule test watches for
                                    it anywhere on the page, because ADR `0042` is that a figure must
                                    never appear where no position stands behind it — and a row's
                                    legitimate figure tripping that guard is the guard working. "behind
                                    it" says the same thing and is the phrasing this field already uses
                                    elsewhere. */}
                                        <span className="sr-only">
                                            {row.name} {entry.predicate} {subject} —{" "}
                                            {backed
                                                ? `${row.backing} behind it`
                                                : "nothing behind it"}
                                        </span>
                                    </Link>
                                );
                            })}
                    </div>
                ))}
            </div>

            {/* The claim the active dot composes, as the sentence a triple is. The slot is always
                in the DOM with a reserved height, so revealing it moves nothing — a field that
                reflowed on hover would be the mouse-reactive effect `ui.md` actually forbids. */}
            <p
                aria-hidden="true"
                data-claim-sentence={current === undefined ? "none" : "one"}
                className="mt-4 min-h-[1.5rem] basis-full text-[length:var(--text-body-sm)]"
            >
                {current === undefined ? null : (
                    <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{current.row.name}</span>
                        <span className="text-[color:var(--color-steel)]">{current.predicate}</span>
                        <span className="min-w-0 truncate text-[color:var(--color-steel)]">
                            {subject}
                        </span>
                    </span>
                )}
            </p>

            {/* The legend. It names each ring and says what the ring does not: the total, when the
                cap bit, and the group's own backing. */}
            <dl className="min-w-0 text-[length:var(--text-body-sm)]">
                <div className="mb-5 border-b border-[color:var(--color-rule)] pb-3">
                    <dt className="sr-only">Claims in total</dt>
                    <dd className="font-mono tabular-nums">
                        {truncated ? `${edgeCount}+` : edgeCount}{" "}
                        <span className="text-[color:var(--color-steel)]">
                            {edgeCount === 1 && !truncated ? "claim" : "claims"}
                        </span>
                    </dd>
                </div>
                {groups.map((group, index) => (
                    <div key={group.predicateAtomId} className="mt-4 first:mt-0">
                        <dt
                            className={`font-medium ${group.labelIsId ? "font-mono text-[length:var(--text-body-sm)]" : ""}`}
                        >
                            <span
                                aria-hidden="true"
                                className="mr-3 inline-block h-[8px] w-[8px] rounded-full border border-[color:var(--color-rule-strong)] align-middle"
                                style={{opacity: 1 - index * 0.18}}
                            />
                            {group.label}
                        </dt>
                        <dd className="mt-1 ml-5 font-mono tabular-nums text-[color:var(--color-steel)]">
                            {group.rows.length > MAX_DOTS_PER_RING
                                ? `${group.rows.length} claims, ${MAX_DOTS_PER_RING} drawn`
                                : `${group.rows.length} ${group.rows.length === 1 ? "claim" : "claims"}`}
                            {group.backing === null ? null : ` · ${group.backing}`}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}
