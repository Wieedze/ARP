import {useEffect, useMemo, useRef, useState} from "react";
import {Link} from "react-router-dom";

import {cssVars} from "../../lib/css-vars";
import {Hint} from "../brand/Hint";
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
    SIZE_BY_POSITIONS,
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
                // `predicate` says the triple; `heading` is what the card prints, the relation
                // read from this page's side when there is a word for it.
                group.rows.map((row) => ({
                    row,
                    predicate: group.label,
                    heading: group.inverse ?? group.label,
                })),
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
    // The loupe is driven by a dot's position in `dots`, the card by its claim index.
    const currentPosition = dots.findIndex((dot) => dot.index === reading.index);
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
            </div>

            {/* The card the loupe is tied to. Reserved height, so it never moves the layout.

                **A link to whatever it shows**, the user's ask (2026-10-29): what the card puts
                forward is one click away. Hovering it holds the loupe on that claim, or the tour
                would swap the target out from under the pointer on its way to click.

                `aria-hidden` and out of the tab order: the dot already is this same link, with
                the whole triple as its name, and a second tab stop whose target changes every
                four seconds would be a keyboard trap of a different kind. */}
            {current === undefined ? (
                <div aria-hidden="true" data-claim-sentence="none" className="arp-cf-card" />
            ) : (
                <Link
                    to={`/atom/${current.row.subjectAtomId}`}
                    aria-hidden="true"
                    tabIndex={-1}
                    data-claim-sentence="one"
                    className={`arp-cf-card ${reading.lit ? "is-lit" : ""}`}
                    onMouseEnter={() => point(currentPosition)}
                    onMouseLeave={() => release(currentPosition)}
                >
                    <div className="arp-cf-card-head">
                        <i />
                        <span>{current.heading}</span>
                    </div>
                    <CardBody row={current.row} />
                </Link>
            )}

            <div className="arp-cf-total">
                <span>
                    <b>{truncated ? `${edgeCount}+` : edgeCount}</b>{" "}
                    {edgeCount === 1 && !truncated ? "claim" : "claims"} about {subject}
                </span>
                {/* The key explains fill and the alarm ring and said nothing about SIZE, while a
                    dot grows from 10px to 17px with its position count. A reader seeing a bigger
                    dot beside a card reading an amount has every reason to read it as more money —
                    usually right by correlation, and inverted on a dust-heavy claim, which is the
                    reading ADR `0042` exists to prevent. `ui.md` forbids the explanatory sentence
                    and names the remedy. Outside the `aria-hidden` key, because a `Hint` inside it
                    would be off the keyboard path and so not a `Hint` at all. */}
                {SIZE_BY_POSITIONS ? (
                    <Hint label="What a dot's size means">
                        A dot&rsquo;s size is how many accounts hold a position, never how much they
                        put in.
                    </Hint>
                ) : null}
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

            <dl className="arp-cf-legend">
                {shown.map((ring, index) => {
                    const drawn = rings[index]!;
                    const isLast = index === shown.length - 1;
                    const plus = truncated && isLast ? "+" : "";
                    const head = ring.folded
                        ? {
                              label: `+${ring.members.length} other predicates`,
                              labelIsId: false,
                              backing: null,
                          }
                        : {
                              ...ring.members[0]!,
                              label: ring.members[0]!.inverse ?? ring.members[0]!.label,
                          };
                    const count =
                        drawn.total > drawn.drawn
                            ? `${drawn.total}${plus} · ${drawn.drawn} drawn, the rest as grain`
                            : `${drawn.total}${plus} ${drawn.total === 1 && plus === "" ? "claim" : "claims"}`;
                    return (
                        <div key={index} className="arp-cf-legend-group">
                            <div className="arp-cf-legend-row">
                                <span className="arp-cf-ringno">
                                    {String(index + 1).padStart(2, "0")}
                                </span>
                                <dt className={head.labelIsId ? "is-id" : ""}>{head.label}</dt>
                                <dd>
                                    {count}
                                    {head.backing === null ? null : ` · ${head.backing}`}
                                </dd>
                            </div>
                            {/* Never sum across groups: the folded ring lists each of its members
                                with its own count and its own backing. */}
                            {ring.folded
                                ? ring.members.map((member, k) => {
                                      const memberPlus =
                                          plus !== "" && k === ring.members.length - 1 ? "+" : "";
                                      const n = member.rows.length;
                                      return (
                                          <div
                                              key={member.predicateAtomId}
                                              className="arp-cf-legend-row is-member"
                                          >
                                              <span className="arp-cf-ringno" />
                                              <dt className={member.labelIsId ? "is-id" : ""}>
                                                  {member.inverse ?? member.label}
                                              </dt>
                                              <dd>
                                                  {n}
                                                  {memberPlus}{" "}
                                                  {n === 1 && memberPlus === ""
                                                      ? "claim"
                                                      : "claims"}
                                                  {member.backing === null
                                                      ? null
                                                      : ` · ${member.backing}`}
                                              </dd>
                                          </div>
                                      );
                                  })
                                : null}
                        </div>
                    );
                })}
            </dl>
        </div>
    );
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
