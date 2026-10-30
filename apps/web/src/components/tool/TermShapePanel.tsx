import {Sparkline} from "../Sparkline";
import {useChainChoice} from "../../lib/chain-choice";
import {formatDay} from "../../lib/atom-page";
import {formatTrust} from "../../services/trust-format";
import type {TermShapeView} from "../../services/term-shape-view";
import type {TermActivityBucket} from "@arp-protocol/core";

/**
 * What a claim's market looks like, in four readings and a line.
 *
 * **Nothing here is a verdict.** No badge, no colour-coding into good and bad, no composite. The
 * readings are facts about the distribution and the reader decides what they mean — which is the
 * only position that survives a sybil costing $0.00005 an address (ADR `0046`, and
 * `services/term-shape-view.ts` for the reasoning).
 *
 * Two of them carry a flag — `isDominated`, `arrivedTogether` — and those are set in the same type
 * as everything else rather than in a warning colour. "One account holds 70%" is worth noticing on
 * a tool you were about to trust and completely normal on one you run yourself.
 */
export function TermShapePanel({
    shape,
    curve,
    curveLabel,
}: {
    shape: TermShapeView;
    curve: readonly TermActivityBucket[];
    /**
     * Which bonding curve every figure here was read at.
     *
     * Named on the panel because **every** figure it shows is curve-scoped, and this was the one
     * surface that dropped it while `ToolCatalogView` and `ProfileView` both carry a `curveId`
     * specifically so the figure can name it. `rules/claims.md` §2: one number, one context.
     */
    curveLabel: string;
}) {
    const {symbol} = useChainChoice();
    if (shape.positionCount === 0) return null;

    return (
        <div>
            <dl className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-y-2 gap-x-6 text-[length:var(--text-body-sm)]">
                <Reading label="Positions" value={shape.positionCount.toLocaleString("en-US")} />
                {shape.concentration === null ? null : (
                    <Reading
                        label="Concentration"
                        value={shape.concentration}
                        note={
                            shape.isDominated ? "one account can move this on its own" : undefined
                        }
                    />
                )}
                {shape.span === null ? null : (
                    <Reading
                        label="Support arrived"
                        value={shape.span}
                        note={
                            shape.arrivedTogether
                                ? "every supporter opened on the same day"
                                : undefined
                        }
                    />
                )}
                {shape.breadth === null ? null : (
                    <Reading
                        label="Its supporters"
                        value={shape.breadth}
                        note={
                            shape.breadthSampled
                                ? "over the largest hundred, not all of them"
                                : undefined
                        }
                    />
                )}
            </dl>

            {/* **From one bucket, not two.** The volume line needs two points, so a market
                whose every signal landed in one week showed a position and no chart at all (user,
                2026-10-29: _« 1 support mais 0 curve affichée ? »_). The signal bars read at
                one bucket; the line joins them from two. */}
            <div className="mt-6">
                <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]">
                    {/* Said in words: "Weekly activity · Linear" over a bare `2026-10-26` read as a
                        code and a date nobody chose (user, 2026-10-29). The curve stays named, since
                        every figure here is read on one (`rules/claims.md` §2). */}
                    Deposits and redemptions, per week · {curveLabel} curve
                </p>
                {curve.length === 0 ? (
                    <p className="mt-2 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        Nothing has moved on this market yet.
                    </p>
                ) : (
                    <>
                        <SignalBars curve={curve} />
                        {curve.length < 2 ? null : (
                            <div className="mt-4">
                                {/* "Activity", not "deposits": a bucket counts **signals**, which
                                    are deposits and redemptions both, and a redemption's delta is
                                    positive — so this is TRUST moved in either direction. Probed
                                    on mainnet 2026-10-21. */}
                                <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]">
                                    {symbol} moved, in or out
                                </p>
                                <div className="mt-2">
                                    <Sparkline
                                        points={curve.map((bucket) => ({
                                            label: bucket.bucket.slice(0, 10),
                                            value: bucket.volume,
                                        }))}
                                        describe={(value) => `${formatTrust(value)} ${symbol}`}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

/**
 * Signals per bucket, as bars: deposits and redemptions counted, the newest bucket in paper.
 *
 * Divs, not SVG: a bar is a box with a height, and the summary for a screen reader is one
 * sentence on the group. The tallest bucket fills the box; the rest scale to it.
 */
function SignalBars({curve}: {curve: readonly TermActivityBucket[]}) {
    const max = curve.reduce((top, bucket) => Math.max(top, bucket.signals), 0);
    const first = curve[0];
    const last = curve[curve.length - 1];
    const total = curve.reduce((sum, bucket) => sum + bucket.signals, 0);
    return (
        <div className="mt-2">
            <div
                role="img"
                aria-label={`${total} ${total === 1 ? "move" : "moves"} over ${curve.length} ${curve.length === 1 ? "week" : "weeks"}`}
                className="flex h-12 items-end gap-1"
            >
                {curve.map((bucket, index) => (
                    <span
                        key={bucket.bucket}
                        title={`${bucket.bucket.slice(0, 10)} · ${bucket.signals}`}
                        className={`block w-full max-w-6 ${
                            index === curve.length - 1
                                ? "bg-[color:var(--color-fg)]"
                                : "bg-[color:var(--color-steel)]"
                        }`}
                        style={{
                            height: `${max === 0 ? 0 : Math.max(4, (bucket.signals / max) * 100)}%`,
                        }}
                    />
                ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                <span>
                    {first === undefined ? null : `week of ${formatDay(first.bucket.slice(0, 10))}`}
                </span>
                <span>
                    {total} {total === 1 ? "move" : "moves"}
                    {curve.length > 1 && last !== undefined
                        ? ` · to week of ${formatDay(last.bucket.slice(0, 10))}`
                        : ""}
                </span>
            </div>
        </div>
    );
}

function Reading({label, value, note}: {label: string; value: string; note?: string}) {
    return (
        <>
            <dt className="text-[color:var(--color-steel)]">{label}</dt>
            <dd className="font-mono tabular-nums">
                {value}
                {note === undefined ? null : (
                    <span className="block font-sans text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                        {note}
                    </span>
                )}
            </dd>
        </>
    );
}
