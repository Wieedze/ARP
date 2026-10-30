import {useEffect, useMemo, useRef, useState} from "react";
import {Link} from "react-router-dom";

import {cssVars} from "../../lib/css-vars";
import {LIST_CAP} from "../brand/row-motion";

import type {EdgeRow, GroupView} from "../../services/atom-standing-view";
import {
    claimField,
    claimGrain,
    dotDiameter,
    foldGroups,
    GRAIN_R,
    LOUPE,
    loupeLine,
    loupeRest,
    type ShownRing,
} from "./claim-field-geometry";
import {useClaimLoupe} from "./use-claim-loupe";

/**
 * Every claim about this atom, as a constellation around it, read through a loupe.
 *
 * v2, "hover first" (`CLAIM-FIELD-V2.md`). The reading head and its line to the card are the
 * original's; what changed is how they move and what the field draws when the data is awkward.
 *
 * ## Why circles are allowed here, and what they mean
 *
 * `rules/ui.md` reserves `rounded-full` for dots and agent sigils, so that **a circle on this
 * surface always means "an agent"**. Every dot is the subject of a claim, and a subject is an agent
 * or an account, so the rule is satisfied by what the data is.
 *
 * | | means |
 * | --- | --- |
 * | filled | a position stands behind the claim (`positions > 0`, never the amount: ADR `0042`) |
 * | hollow | declared, with nothing behind it |
 * | alarm ring | somebody took the other side. The one semantic exception to the one accent |
 * | larger | more **accounts** behind it, log scale, capped (`SIZE_BY_POSITIONS`) |
 * | grain | claims past the 36 drawn on a ring, decoration of a count the legend states |
 *
 * ## The loupe
 *
 * Rests at -60° on the outer ring, tied to the card by a line the whole time. Hover **and** focus
 * make it glide to a dot and ride it (ADR `0073`); with nobody pointing it tours, one claim every
 * 4 s. See `useClaimLoupe`.
 *
 * ## It is real links, not an SVG
 *
 * Absolutely positioned `<Link>`s: focus rings come from `index.css`'s unlayered `:focus-visible`,
 * each dot has a real accessible name, and keyboard order follows the DOM. Only the loupe, the line
 * and the grain are SVG, and all three are `aria-hidden`.
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
     * prefix. Printed as `250+`: a floor rendered as a total is `rules/claims.md`'s whole subject.
     */
    truncated: boolean;
}) {
    // Groups past `MAX_RINGS - 1` share the last ring. Each row keeps its own predicate, so a dot
    // on the folded ring still names its whole triple.
    const layout = useMemo(() => {
        const shown = foldGroups(groups);
        const entries = shown.flatMap((ring) =>
            ring.members.flatMap((group) =>
                group.rows.map((row) => ({row, predicate: group.label})),
            ),
        );
        const {rings, dots} = claimField(
            shown.map((ring) => ring.members.reduce((sum, group) => sum + group.rows.length, 0)),
        );
        return {shown, entries, rings, dots};
    }, [groups]);
    const {shown, entries, rings, dots} = layout;

    const outer = rings[rings.length - 1];
    const fieldRef = useRef<HTMLDivElement>(null);
    const headRef = useRef<SVGCircleElement>(null);
    const lineRef = useRef<SVGPolylineElement>(null);
    const {reading, point, release, dotRef} = useClaimLoupe({
        fieldRef,
        headRef,
        lineRef,
        dots,
        outerRadius: outer?.r ?? 0,
        outerRing: outer?.ring ?? 0,
    });

    /**
     * One frame of the entering state, then the dots settle. The class is on the container, so
     * one state change drives the whole field. Under reduced motion the CSS neutralises it.
     */
    const [entering, setEntering] = useState(true);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setEntering(false));
        return () => cancelAnimationFrame(frame);
    }, []);

    if (groups.length === 0 || outer === undefined) {
        return <ZeroField subject={subject} />;
    }

    const current = reading.index === null ? undefined : entries[reading.index];
    const rest = loupeRest(outer.r);
    const anyOpposition = groups.some((group) => group.rows.some((row) => row.opposition !== null));

    return (
        <div className="arp-cf">
            <div
                ref={fieldRef}
                className={`arp-cf-field ${entering ? "arp-claim-enter" : ""}`}
                role="group"
                aria-label={`Claims about ${subject}`}
            >
                {/* The loupe and its line to the card. Drawn from the first paint at the resting
                    place, then the hook writes them every frame without re-rendering. */}
                <svg
                    className={`arp-cf-link ${reading.lit ? "is-on" : ""}`}
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                >
                    <polyline ref={lineRef} points={loupeLine(rest)} />
                    <circle ref={headRef} cx={rest.x} cy={rest.y} r={LOUPE.radius} />
                </svg>

                {/* The atom itself. It does not turn: it is the thing every ring is about. The
                    one Saffron mark at rest (ADR `0067`). */}
                <span aria-hidden="true" className="arp-cf-core" />

                {rings.map((ring) => {
                    const grain = claimGrain(ring);
                    return (
                        <div
                            key={ring.ring}
                            className="arp-orbit arp-cf-ring"
                            style={cssVars({
                                "--orbit-for": `${110 + ring.ring * 40}s`,
                                "--orbit-to": ring.ring % 2 === 0 ? "360deg" : "-360deg",
                            })}
                        >
                            <span
                                aria-hidden="true"
                                className="arp-cf-track"
                                style={{
                                    left: `${(0.5 - ring.r) * 100}%`,
                                    top: `${(0.5 - ring.r) * 100}%`,
                                    width: `${ring.r * 200}%`,
                                    height: `${ring.r * 200}%`,
                                }}
                            />
                            {grain.length === 0 ? null : (
                                <svg className="arp-cf-grain" viewBox="0 0 1 1" aria-hidden="true">
                                    {grain.map((g, k) => (
                                        <circle key={k} cx={g.cx} cy={g.cy} r={GRAIN_R} />
                                    ))}
                                </svg>
                            )}
                            {dots.map((dot, position) => {
                                if (dot.ring !== ring.ring) return null;
                                const entry = entries[dot.index];
                                if (entry === undefined) return null;
                                const {row, predicate} = entry;
                                const lit = reading.lit && reading.index === dot.index;
                                return (
                                    <Link
                                        key={row.tripleId}
                                        ref={dotRef(position)}
                                        to={`/atom/${row.subjectAtomId}`}
                                        onMouseEnter={() => point(position)}
                                        onMouseLeave={() => release(position)}
                                        onFocus={() => point(position)}
                                        onBlur={() => release(position)}
                                        className={`arp-claim arp-cf-dot ${row.positions > 0 ? "is-filled" : ""} ${row.opposition === null ? "" : "is-opposed"} ${lit ? "is-lit" : ""}`}
                                        style={{
                                            left: `${dot.cx * 100}%`,
                                            top: `${dot.cy * 100}%`,
                                            ...cssVars({
                                                "--claim-dot": `${dotDiameter(row.positions).toFixed(1)}px`,
                                                "--row-index": Math.min(dot.index, LIST_CAP - 1),
                                            }),
                                        }}
                                    >
                                        <span aria-hidden="true" className="arp-cf-mark" />
                                        {/* The whole triple, on the link itself. Not the word
                                            "backed": `AtomPanel`'s dust test watches for it. */}
                                        <span className="sr-only">
                                            {claimSentence(row, predicate, subject)}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    );
                })}

                {/* **Each ring names itself where it sits**, at six o'clock, outside the turning
                    wrappers so the name holds still while the dots pass over it. It replaced a
                    legend grid under the field that the user found detached from the drawing. */}
                <div className="arp-cf-names" aria-hidden="true">
                    {shown.map((ring, index) => {
                        const r = rings[index]!;
                        const isId = !ring.folded && ring.members[0]!.labelIsId;
                        const plus = truncated && index === shown.length - 1 ? "+" : "";
                        return (
                            <span
                                key={index}
                                className={`arp-cf-name ${isId ? "is-id" : ""}`}
                                style={{top: `${(0.5 + r.r) * 100}%`}}
                                title={
                                    ring.folded
                                        ? ring.members
                                              .map((m) => `${m.label} ${m.rows.length}`)
                                              .join(", ")
                                        : undefined
                                }
                            >
                                {ringLabel(ring)} <b>{`${r.total}${plus}`}</b>
                            </span>
                        );
                    })}
                </div>
            </div>

            {/* The card the loupe is tied to. Reserved height, so it never moves the layout, and
                `aria-hidden`: the link already says the whole triple. */}
            <div
                aria-hidden="true"
                data-claim-sentence={current === undefined ? "none" : "one"}
                className={`arp-cf-card ${reading.lit ? "is-lit" : ""}`}
            >
                <div className="arp-cf-card-head">
                    <i />
                    <span>{current?.predicate ?? ""}</span>
                </div>
                {current === undefined ? null : <CardBody row={current.row} />}
            </div>

            <div className="arp-cf-total">
                <span>
                    <b>{truncated ? `${edgeCount}+` : edgeCount}</b>{" "}
                    {edgeCount === 1 && !truncated ? "claim" : "claims"} about {subject}
                </span>
                <span className="arp-cf-key" aria-hidden="true">
                    <span>
                        <i className="is-filled" />a position behind it
                    </span>
                    <span>
                        <i />
                        nothing behind it
                    </span>
                    {anyOpposition ? (
                        <span>
                            <i className="is-opposed" />
                            someone took the other side
                        </span>
                    ) : null}
                </span>
            </div>

            {/* The counts per ring, for a reader who cannot see the names on the field. */}
            <ul className="sr-only">
                {shown.map((ring, index) => (
                    <li key={index}>
                        {ringLabel(ring)}:{" "}
                        {ringCount(rings[index]!.total, truncated && index === shown.length - 1)}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** A ring's name: its predicate, or how many predicates the folded ring holds. */
function ringLabel(ring: ShownRing<GroupView>): string {
    return ring.folded ? `+${ring.members.length} other predicates` : ring.members[0]!.label;
}

function ringCount(total: number, floor: boolean): string {
    return `${total}${floor ? "+" : ""} ${total === 1 && !floor ? "claim" : "claims"}`;
}

/** The accessible name of a dot: the triple, then what stands behind it. */
function claimSentence(row: EdgeRow, predicate: string, subject: string): string {
    const behind =
        row.positions > 0 && row.backing !== null
            ? `${row.backing} behind it, ${row.positions} ${row.positions === 1 ? "position" : "positions"}`
            : "nothing behind it";
    const against = row.opposition === null ? "" : `, ${row.opposition} against`;
    return `${row.name} ${predicate} ${subject}, ${behind}${against}`;
}

/** The figure line of the card. Paper, not accent: it is somebody else's position. */
function CardBody({row}: {row: EdgeRow}) {
    const filled = row.positions > 0 && row.backing !== null;
    return (
        <>
            <div className={`arp-cf-subject ${row.nameIsId ? "is-id" : ""}`}>{row.name}</div>
            <div className={`arp-cf-figure ${filled ? "" : "is-none"}`} data-claim-figure>
                {filled ? (
                    <>
                        {row.backing}{" "}
                        <span>
                            · {row.positions} {row.positions === 1 ? "position" : "positions"}
                        </span>
                    </>
                ) : (
                    "nothing behind it"
                )}
            </div>
            {row.opposition === null ? null : (
                <div className="arp-cf-against">{row.opposition} against</div>
            )}
        </>
    );
}

/** Nothing points at the atom yet: a dashed ring around the core, and one line saying so. */
function ZeroField({subject}: {subject: string}) {
    const r = 0.42;
    return (
        <div className="arp-cf-zero">
            <div className="arp-cf-field is-small" aria-hidden="true">
                <span
                    className="arp-cf-track is-dashed"
                    style={{
                        left: `${(0.5 - r) * 100}%`,
                        top: `${(0.5 - r) * 100}%`,
                        width: `${r * 200}%`,
                        height: `${r * 200}%`,
                    }}
                />
                <span className="arp-cf-core" />
            </div>
            <p className="arp-cf-empty">
                Nothing points at {subject} yet. A claim made about it appears here as a dot.
            </p>
        </div>
    );
}
