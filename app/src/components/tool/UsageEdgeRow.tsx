import {useChainChoice} from "../../lib/chain-choice";
import {formatTrust, truncateMiddle} from "../../services/trust-format";
import type {ToolUsageEdgeView} from "../../services/tool-usage-view";
import {StakerCount} from "../agent/StakerCount";
import {
    OFF_CURVE_CAPTION,
    OFF_CURVE_LABEL,
    OFF_CURVE_TONE_CLASS,
    TIER_CAPTION,
    TIER_LABEL,
    TIER_TONE_CLASS,
} from "./tier-scale";

/**
 * One agent's declared use of this tool, and what the market says about it.
 *
 * Three things, in the order they should be read: **who** said it, **what rung** that puts the claim
 * on, and **what is behind it**. The rung sits above the amount on purpose — the amount is
 * meaningless until you know whether anyone is standing behind the claim at all, which is the
 * mistake `docs/14` says this surface must not invite.
 *
 * No amount appears without its position count (ADR `0023`, and the `StakerCount` precedent): these
 * vaults hold one or two positions, and on mainnet one of GitHub's six holds 22.44 of its 22.59
 * TRUST — the figure alone reads as a market when it is one account's conviction.
 *
 * **And no amount appears at all when nobody has staked.** Creating a triple seeds its vault with
 * `minShare`, so a free edge still reports assets — 1000000 wei, measured on every unbacked IPFS
 * edge. Rendering that as `<0.00000001 TRUST` invented a tiny market where there is none, which is
 * worse than the bare figure the rule above is about: it is a figure for capital that does not
 * exist. ADR `0042`.
 */
export function UsageEdgeRow({
    edge,
    isFirstOfTier,
}: {
    edge: ToolUsageEdgeView;
    isFirstOfTier: boolean;
}) {
    const chain = useChainChoice();
    return (
        <li className="border-t border-[color:var(--color-rule)] py-4 first:border-t-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <div className="min-w-0">
                    {/* An agent with no label is addressed by its atom and nothing else, so the id
                        is the name — printing it twice said nothing twice. */}
                    {/* An `h3`, not a `p`: the page's headings are `h1` and `h2`, so a `p` left
                        the rows outside the outline entirely. Tailwind's preflight resets heading
                        size and weight, so the tag changes the outline and not the type. */}
                    {edge.agent.label === null ? (
                        <h3 className="truncate font-mono">{truncateMiddle(edge.agent.atomId)}</h3>
                    ) : (
                        <>
                            <h3 className="truncate">{edge.agent.label}</h3>
                            <p className="mt-1 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                                {truncateMiddle(edge.agent.atomId)}
                            </p>
                        </>
                    )}
                </div>
                <div className="text-right">
                    <p
                        className={`text-[length:var(--text-body-sm)] ${
                            edge.isOffCurve ? OFF_CURVE_TONE_CLASS : TIER_TONE_CLASS[edge.tier]
                        }`}
                    >
                        {edge.isOffCurve ? OFF_CURVE_LABEL : TIER_LABEL[edge.tier]}
                    </p>
                    {/* Only on the first row of a run of the same tier. The caption is the device
                        that stops the weight being decoration, but repeating it four times down
                        IPFS's free edges is noise in a list `ui.md` wants dense. */}
                    {isFirstOfTier ? (
                        <p className="mt-1 max-w-[42ch] text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                            {edge.isOffCurve ? OFF_CURVE_CAPTION : TIER_CAPTION[edge.tier]}
                        </p>
                    ) : null}
                </div>
            </div>

            <dl className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2 font-mono text-[length:var(--text-body-sm)]">
                {edge.supportPositions > 0 ? (
                    <div className="flex items-baseline gap-2">
                        <dt className="text-[color:var(--color-steel)] font-sans text-[length:var(--text-label)] uppercase tracking-wider">
                            For
                        </dt>
                        <dd className="flex items-baseline gap-2 tabular-nums">
                            {formatTrust(edge.supportAssets)} {chain.symbol}
                            <StakerCount count={edge.supportPositions} />
                        </dd>
                    </div>
                ) : (
                    <div className="flex items-baseline gap-2">
                        <dt className="text-[color:var(--color-steel)] font-sans text-[length:var(--text-label)] uppercase tracking-wider">
                            For
                        </dt>
                        {/* Scoped to the CLAIM, not to the tool. A deposit can sit on the tool's
                            own atom instead, and 74 of the 185 mainnet edges are in that state —
                            so "nothing staked" full stop would be a claim about the tool that this
                            page has not read. */}
                        <dd className="font-sans text-[color:var(--color-steel)]">
                            {edge.isOffCurve
                                ? "Staked on a curve this page does not read."
                                : "Nothing staked on this claim."}
                        </dd>
                    </div>
                )}
                {edge.isContested ? (
                    <div className="flex items-baseline gap-2">
                        <dt className="text-[color:var(--color-steel)] font-sans text-[length:var(--text-label)] uppercase tracking-wider">
                            Against
                        </dt>
                        <dd className="flex items-baseline gap-2 tabular-nums">
                            {formatTrust(edge.opposeAssets)} {chain.symbol}
                            <StakerCount count={edge.opposePositions} />
                        </dd>
                    </div>
                ) : null}
            </dl>
        </li>
    );
}
