/**
 * Give every word of a heading a `--word-delay` from the line it actually rendered on.
 *
 * ## Why it is measured and not computed from the index
 *
 * `--text-display` is a `clamp()`, so a headline wraps at a different word at every width. An
 * index-based delay staggers *across* a line break: word 7 is the last word of line 1 at 1440px and
 * the first word of line 2 at 1024px, and at the second width the second line starts mid-stagger —
 * which reads as a glitch at some widths and not others.
 *
 * So each word's `offsetTop` says which rendered line it is on, and the delay is
 * `line * --line-step + position * --word-step`. Re-run on resize, without re-splitting: the spans
 * are stable and only their `--word-delay` changes.
 *
 * ## Capped, because a stagger is a wait
 *
 * Past about 600ms of total stagger the reader is waiting rather than reading, so the whole set is
 * scaled to fit `--stagger-ceiling` when it would exceed it. A twelve-word headline on one line
 * compresses its own step rather than taking 400ms longer than a six-word one.
 *
 * Its own module, not `Words.tsx`: a file exporting both a component and a function breaks React
 * Fast Refresh, which eslint enforces here. Being a plain function is also what makes it testable
 * — the assertion worth making is that two words on one line are a `--word-step` apart and two
 * words on different lines are a `--line-step` apart, whatever their indices.
 */

/**
 * A `<time>` token off the document, in milliseconds, **whatever unit it is written in**.
 *
 * ## This was a shipped-only bug and every gate was green
 *
 * The first version was `Number.parseFloat(raw) || 0`, which is correct for the source — the tokens
 * are authored in `ms` — and wrong for the artifact. A CSS minifier rewrites a time to whichever
 * unit is shorter, and `lightningcss` did exactly that to six of the eight motion tokens.
 * Measured in `apps/web/dist/assets/*.css`:
 *
 * ```
 * --line-step:.11s          (source: 110ms)
 * --stagger-ceiling:.56s    (source: 560ms)
 * --word-step:34ms          (source: 34ms — survived, because `.034s` is longer)
 * ```
 *
 * So in production `lineStep` was 0.11 and `ceiling` was 0.56, the longest raw delay came out
 * around 68, and every `--word-delay` scaled to **0 or 1ms**: the headline arrived all at once and
 * the per-line step was off by 1000×. The mixed outcome is what made it invisible — the per-word
 * step kept its unit, so two of three numbers looked right.
 *
 * `tsc`, `eslint`, `check:tokens` and 435 tests were all green, and `bun run dev` serves
 * unminified CSS so it looked correct locally. `rules/claims.md` §4: confirm a gate's scope covers
 * the thing you changed. **No gate here reads the built bundle** — that is now in `FUTURE.md`.
 */
function tokenMs(name: string): number {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) return 0;
    // `ms` first: `endsWith("s")` is true of both, and testing it first makes every `ms` a second.
    if (raw.endsWith("ms")) return value;
    if (raw.endsWith("s")) return value * 1000;
    // A unitless or unknown value is taken as milliseconds, which is how they are authored.
    return value;
}

export function retimeWords(container: HTMLElement | null): void {
    if (container === null) return;
    const words = [...container.querySelectorAll<HTMLElement>(".arp-word")];
    if (words.length === 0) return;

    const lineStep = tokenMs("--line-step");
    const wordStep = tokenMs("--word-step");
    const ceiling = tokenMs("--stagger-ceiling");

    let line = -1;
    let lineTop: number | null = null;
    let positionInLine = 0;

    const raw = words.map((word) => {
        const top = word.offsetTop;
        // 4px of slack: the same rendered line can differ by a sub-pixel between inline boxes, and
        // a strict comparison then counts one line as two and doubles the stagger.
        if (lineTop === null || Math.abs(top - lineTop) > 4) {
            line += 1;
            lineTop = top;
            positionInLine = 0;
        } else {
            positionInLine += 1;
        }
        return line * lineStep + positionInLine * wordStep;
    });

    const longest = Math.max(...raw);
    const scale = longest > ceiling && longest > 0 ? ceiling / longest : 1;
    words.forEach((word, index) => {
        word.style.setProperty("--word-delay", `${Math.round((raw[index] ?? 0) * scale)}ms`);
    });
}
