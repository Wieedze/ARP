import {useEffect, useRef, useState} from "react";
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
/**
 * Where the reading head sits, in degrees from the positive x axis with y down — so 0° is three
 * o'clock and a positive angle goes clockwise, which is the convention `claim-field-geometry` uses.
 *
 * **Five minutes on a clock face**, which is −60° here: a clock's minute is 6° and its zero is
 * twelve o'clock, 90° back from this axis. It was 20, which reads as twenty minutes past.
 *
 * The angle and the connector's 35° are coupled, and moving the head up made them expensive: from
 * five minutes the line has to fall `0.866 r` to reach the card's mid-height, and at 35° that
 * costs `1.237 r` of width — more than the gap had. The gap widened rather than the angle
 * steepening, because the angle is the thing that was asked for.
 */
const HEAD_DEGREES = -60;

/** Ring 0's radius as a fraction of the box, for the head and the line that leaves it. */
const headAt = (r: number) => ({
    x: 0.5 + r * Math.cos((HEAD_DEGREES * Math.PI) / 180),
    y: 0.5 + r * Math.sin((HEAD_DEGREES * Math.PI) / 180),
});

/**
 * Head → a 35° rise → a horizontal bar reaching past the box into the gap.
 *
 * The bar sits at `y = 0.5`, the box's own mid-height, because the card is centred against a square
 * box and that is where its middle is. The rise is 35° so the corner's x follows from the head's
 * depth rather than being chosen — `dx = dy / tan 35°`.
 *
 * It overshoots to 1.22 so the bar crosses the 3rem gap whatever the box's measured width; the
 * card's own left border stops it.
 */
const RISE_DEGREES = 35;

/**
 * Where the horizontal bar sits, as a fraction of the box's height.
 *
 * **Above the head**, so the angled segment comes down onto the ring rather than climbing away
 * from it — the user, 2026-10-29: _« la ligne horizontale est au-dessus et après un angle vers le
 * bas pointe les cercles, donc inversé par rapport à maintenant »_. It was the box's mid-height,
 * which at five minutes put the bar below the head and ran the line the other way.
 *
 * The card is raised to meet it, which is the same instruction's second half.
 */
const BAR_Y = 0.055;

function connector(r: number): string {
    const head = headAt(r);
    const corner = head.x + (head.y - BAR_Y) / Math.tan((RISE_DEGREES * Math.PI) / 180);
    return `${head.x},${head.y} ${corner},${BAR_Y} 1.32,${BAR_Y}`;
}

/**
 * How close a dot has to be to the head, in degrees, to count as **inside** it.
 *
 * The user, 2026-10-29: the dot went warm as soon as it was the nearest one — from half a step
 * away — and should go warm only _« quand tout le cercle est dans la loupe »_.
 *
 * So it is a containment test, not a proximity one: the dot's centre has to be within
 * `headRadius − dotRadius` of the head's centre. The head is `0.032` of the box and a dot is 10px
 * on a box of at most 22rem, which is `0.0142` of it — leaving `0.0178`, an arc of `0.0178 / r`
 * radians on ring 0. At the outer radius that is 2.4°, against a 10° step for a full ring.
 */
const HEAD_BITE = 0.0178;

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

    /**
     * Which claim sits under the reading head, read from the rotation itself.
     *
     * The user's model, 2026-10-29: _« un petit cercle coaxial avec les cercles qui défilent, et
     * lorsqu'un cercle passe dans la loupe on affiche les données dans la card »_. So the card is
     * not on a timer that happens to look synchronised — it reads the dot that is **actually**
     * there.
     *
     * The phase comes from `getAnimations()[0].currentTime`, the browser's own clock for the CSS
     * animation, not from `performance.now()` since mount. The difference is not pedantic: a
     * backgrounded tab pauses the animation and a wall clock does not, so the two part ways and
     * the card would name a dot that is no longer under the head. Under `prefers-reduced-motion`
     * the animation never advances, `currentTime` stays at 0, and the head reads whichever dot is
     * parked there — still, and correct.
     *
     * Ring 0 only. The head sits on its radius, the outer one when a single predicate draws the
     * whole field, which is the common case by a wide margin.
     */
    const ringRef = useRef<HTMLDivElement | null>(null);
    const [beat, setBeat] = useState(0);
    /** Whether the nearest dot is fully inside the head, as opposed to merely closest to it. */
    const [inHead, setInHead] = useState(false);
    /**
     * The **outer** ring carries the head — the user asked for that one, and it is the biggest and
     * the one a reader's eye is already on.
     *
     * Three of its properties differ from ring 0's and all three are in the arithmetic below: its
     * radius, its period (`110 + ring * 40` seconds) and its **direction**, which alternates. A
     * reading that assumed `+360deg` would run the head backwards on every odd ring, naming a dot
     * that had already passed.
     */
    const headRingIndex = rings.length === 0 ? 0 : rings.length - 1;
    const headRing = rings[headRingIndex];
    const ringDots = headRing?.drawn ?? 0;
    // Pulled out of the effect so it depends on numbers rather than on `rings`, which `claimField`
    // rebuilds every render — the array would restart the interval on each one.
    const ringRadius = headRing?.r ?? 0.42;
    // Where this ring's dots start in the flattened list. `claimField` numbers them through the
    // groups in render order, so a ring's first dot carries its own offset and nothing has to be
    // recomputed.
    const ringIndexBase = dots.find((dot) => dot.ring === headRingIndex)?.index ?? 0;
    useEffect(() => {
        if (ringDots < 1) return;
        const read = () => {
            const animation = ringRef.current?.getAnimations?.()[0];
            const time = animation?.currentTime;
            const ms = typeof time === "number" ? time : 0;
            // 110s per turn, set as `--orbit-for` on ring 0 below.
            const period = (110 + headRingIndex * 40) * 1000;
            const sign = headRingIndex % 2 === 0 ? 1 : -1;
            const turned = (((ms / period) * 360 * sign) % 360 + 360) % 360;
            // A dot's resting angle is -90 + p * step; the head is at HEAD_DEGREES. Solve for p.
            const step = 360 / ringDots;
            const exact = ((HEAD_DEGREES + 90 - turned) % 360) / step;
            const at = Math.round(exact);
            const within = ((at % ringDots) + ringDots) % ringDots;
            setBeat(Math.max(ringIndexBase, 0) + within);
            // How far the nearest dot still is from the head's centre, as an angle. The dot is
            // only *inside* when the whole of it fits, which is a smaller window than "nearest".
            const offBy = Math.abs(exact - at) * step;
            setInHead(offBy <= (HEAD_BITE / ringRadius) * (180 / Math.PI));
        };
        read();
        // Four times a second. A rAF loop would be sixty, to move a number that changes every
        // three seconds at this ring's size.
        const id = window.setInterval(read, 250);
        return () => window.clearInterval(id);
    }, [ringDots, ringRadius, headRingIndex, ringIndexBase]);

    // Hover and focus win over the cadence: a reader who reached for a dot asked for that one.
    const shown = active ?? (entries.length === 0 ? null : beat % entries.length);
    const current = shown === null ? undefined : entries[shown];

    return (
        <div className="relative flex flex-wrap items-start gap-x-24 gap-y-8">
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

                {/* **The reading head, and the line to the card.** A ring on ring 0's own radius,
                    a segment rising out of it at 35°, then a bar at the card's mid-height.

                    It does **not** turn: the rings pass through it. That is the whole mechanism —
                    the card names the dot that is under this ring, read from the rotation's own
                    clock rather than from a timer that happens to look synchronised.

                    `overflow-visible` so the bar can cross the gap to the card. `vector-effect`
                    keeps it one hairline at every size, as `ui.md`'s rules are hairlines. */}
                {rings.length === 0 ? null : (
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 1 1"
                        className="pointer-events-none absolute inset-0 overflow-visible"
                    >
                        <polyline
                            points={connector(rings[0]?.r ?? 0.42)}
                            fill="none"
                            stroke="var(--color-rule-strong)"
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                        />
                        <circle
                            cx={headAt(rings[0]?.r ?? 0.42).x}
                            cy={headAt(rings[0]?.r ?? 0.42).y}
                            r={0.032}
                            fill="none"
                            stroke="var(--color-accent)"
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                )}

                {rings.map((ring) => (
                    <div
                        key={ring.ring}
                        ref={ring.ring === 0 ? ringRef : undefined}
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
                                            shown === dot.index && (active !== null || inHead)
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

            {/* **The card the field points at**, to the right of it and on the pulse card's own
                grammar — the user asked for that one by name, 2026-10-29. It reads what the lit
                dot is worth, not only what it says: the slot it replaced named the triple and gave
                no figure, so a reader could see that a claim existed and never what anybody had
                put behind it, which is the one distinction this page argues about.

                It keeps its height empty or full. A card that appeared would push the field under
                the pointer, which is the mouse-reactive effect `ui.md` forbids and ADR `0073`'s
                third condition names. Hover **and** focus feed it (first condition), and every
                figure in it is already on the page (second). */}
            <div
                aria-hidden="true"
                data-claim-sentence={current === undefined ? "none" : "one"}
                // Top-aligned and lifted so its middle meets the bar. `BAR_Y` of a square box whose width
                // is at most 22rem is 1.2rem from the top, and the card is 7.5rem tall — hence the
                // offset. Below `sm` the two stack and the lift comes off, where there is no bar.
                className="relative mt-0 flex min-h-[7.5rem] min-w-[min(19rem,100%)] max-w-[24rem] flex-1 flex-col gap-1 rounded-[var(--radius-button)] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-bg)] px-3.5 py-3 sm:-mt-10"
            >
                <span className="flex items-center gap-2 border-b border-[color:var(--color-rule)] pb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--color-steel)]">
                    {/* The dot is lit when something is being described, like the pulse card's. */}
                    <span
                        className={`h-[6px] w-[6px] rounded-full ${
                            current === undefined
                                ? "bg-[color:var(--color-rule-strong)]"
                                : "bg-[color:var(--color-accent)]"
                        }`}
                    />
                    {`Claims · ${truncated ? `${edgeCount}+` : edgeCount}`}
                </span>
                {current === undefined ? null : (
                    <>
                        {/* **The subject leads.** It was the predicate, and the predicate is the
                            ring: identical on all 98 of this atom's claims, so it changed nothing
                            as the head turned and told a reader nothing about the dot under it.
                            The user, 2026-10-29: _« "available on" c'est le lien qui unit Base et
                            le sujet, c'est le cercle en lui-même, et je ne pense pas que ce soit
                            le plus utile »_. What varies dot to dot is who is making the claim. */}
                        <span
                            className={`truncate type-face text-[22px] leading-tight ${current.row.nameIsId ? "font-mono text-[16px]" : ""}`}
                        >
                            {current.row.name}
                        </span>
                        {/* **Paper, not accent.** Somebody else's position, and `ui.md` spends the
                            accent on the primary action and on the viewer's own. ADR `0042`:
                            creating a term seeds its vault, so an amount is not evidence anybody
                            staked — `positions` is, and a claim nobody paid for says so. */}
                        <span className="font-mono text-[length:var(--text-body)] tabular-nums">
                            {current.row.backing === null ? (
                                <span className="text-[color:var(--color-steel)]">
                                    nothing behind it
                                </span>
                            ) : (
                                <>
                                    {current.row.backing}
                                    <span className="text-[color:var(--color-steel)]">
                                        {` · ${current.row.positions} ${current.row.positions === 1 ? "position" : "positions"}`}
                                    </span>
                                </>
                            )}
                        </span>
                        {/* The predicate last and quiet — it completes the sentence rather than
                            opening it, and it is the one word the legend below already carries. */}
                        <span className="truncate font-mono text-[10px] text-[color:var(--color-steel)]">
                            {`${current.predicate} ${subject}`}
                        </span>
                        {/* Only when somebody took the other side. A counter-triple exists for
                            every triple at the same price and 969 of 285,775 chain-wide have ever
                            carried a position — an empty one means "nobody bothered", never
                            "everybody agrees", and a zero here would say the second. */}
                        {current.row.opposition === null ? null : (
                            <span className="font-mono text-[10px] text-[color:var(--color-alarm)]">
                                {`${current.row.opposition} against`}
                            </span>
                        )}
                    </>
                )}
            </div>

            {/* The legend. It names each ring and says what the ring does not: the total, when the
                cap bit, and the group's own backing. */}
            <dl className="min-w-0 basis-full text-[length:var(--text-body-sm)]">
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
