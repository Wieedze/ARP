import {formatStakerCount, stakerLabel} from "../../services/trust-format";

/**
 * How many distinct accounts hold this side of a claim: a person mark and a
 * number.
 *
 * Never a bare market cap. Every vault on this surface holds one or two
 * positions, so a TRUST figure shown on its own would suggest a depth of
 * opinion that is not there — the count is the part that stops it reading as a
 * market. In the MultiVault an account holds at most one position per vault, so
 * the position count *is* the distinct-staker count, which is what the mark
 * means and what the accessible label says.
 *
 * The glyph is a hairline stroke sized in `em`, so it takes the size and the
 * colour of the type it sits in rather than becoming an icon in its own right.
 * It is `aria-hidden`, and `role="img"` makes this span a leaf in the
 * accessibility tree — so `stakerLabel` is the only thing announced, and the
 * count lives in it rather than in the visible digits alone.
 */
export function StakerCount({count}: {count: number}) {
    return (
        <span
            role="img"
            aria-label={stakerLabel(count)}
            className="inline-flex items-baseline gap-1.5 font-mono tabular-nums"
        >
            <svg
                viewBox="0 0 16 16"
                width="1em"
                height="1em"
                aria-hidden="true"
                focusable="false"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                className="shrink-0 self-center"
            >
                <circle cx="8" cy="5" r="2.6" />
                <path d="M2.75 14.25a5.25 5.25 0 0 1 10.5 0" />
            </svg>
            {formatStakerCount(count)}
        </span>
    );
}
