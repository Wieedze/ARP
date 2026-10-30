import {RingLoader} from "./RingLoader";

/**
 * A whole page waiting: the mark, animated, in the middle of the space the content will take.
 *
 * ## Why it reserves height
 *
 * Every page-level wait used to be a 32px ring with a sentence beside it, pinned to the top left.
 * Two things went wrong with that and the user named both (2026-10-27): the mark was not in the
 * middle, and **the footer rode up to meet it** — a page three lines tall put the wordmark under
 * the fold's worth of empty space, then shoved it back down when the rows arrived. The page jumped
 * on every read.
 *
 * `min-h-[60vh]` is the fix, and it is a floor rather than a height: content taller than that still
 * grows, and the loader is never taller than the thing it stands in for. Paired with the shell's
 * `flex min-h-screen flex-col` and `flex-1` on `<main>` — which had been written and did nothing,
 * because `Layout` returned a fragment and there was no flex column for `flex-1` to divide.
 *
 * ## The label stays
 *
 * ADR `0057` §6: the ring says a read is still running, the sentence says **which** read. A spinner
 * alone drops the second half, and on this app "which read" is the difference between a slow
 * indexer and a wrong chain. It sits under the mark rather than beside it, because a centred mark
 * with text to one side is not centred.
 *
 * `RingLoader` stops animating under `prefers-reduced-motion`; the layout here does not change,
 * so nothing shifts for a reader who has it on.
 */
export function PageLoading({label, children}: {label: string; children?: React.ReactNode}) {
    return (
        <div
            aria-live="polite"
            aria-busy
            className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center"
        >
            <RingLoader size={96} label={label} />
            <p className="max-w-[48ch] font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                {children ?? label}
            </p>
        </div>
    );
}
