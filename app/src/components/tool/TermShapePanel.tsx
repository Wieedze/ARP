import {Sparkline} from "../Sparkline";
import {useChainChoice} from "../../lib/chain-choice";
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
                        label="Backers arrived"
                        value={shape.span}
                        note={
                            shape.arrivedTogether
                                ? "every backer opened on the same day"
                                : undefined
                        }
                    />
                )}
                {shape.breadth === null ? null : (
                    <Reading
                        label="Its backers"
                        value={shape.breadth}
                        note={
                            shape.breadthSampled
                                ? "over the largest hundred, not all of them"
                                : undefined
                        }
                    />
                )}
            </dl>

            {curve.length < 2 ? null : (
                <div className="mt-6">
                    {/* "Activity", not "deposits": a bucket counts **signals**, which are deposits
                        and redemptions both, and a redemption's delta is positive — so this is
                        TRUST moved in either direction. Probed on mainnet 2026-10-21; the package's
                        own docstring had it as shares and this label had it as deposits, and both
                        were wrong in different ways. */}
                    <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]">
                        Weekly activity · {curveLabel} · {symbol} moved, in or out
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
