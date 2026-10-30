import {describe, expect, it, beforeEach} from "vitest";

import {retimeWords} from "../words-timing";

/**
 * The thing `docs/18` §4 says is hard, asserted.
 *
 * **A `.tsx` file for a function that renders nothing**, because that is what picks the DOM project
 * in `vitest.config.ts` — `*.test.ts` runs in `node` and this needs `getComputedStyle` and
 * `offsetTop`.
 *
 * `happy-dom` reports **zero for every measurement**, `offsetTop` included, so a real wrap cannot
 * be produced here: left alone, every word reports line 0 and the line step would never be
 * exercised. `offsetTop` is therefore defined per word, which is the only way to test the branch
 * that actually shipped the bug — an index-based delay staggering across a `clamp()` line break.
 */

/** The tokens the function reads. happy-dom resolves `var()` against nothing, so they are set. */
const LINE_STEP = 110;
const WORD_STEP = 34;
const CEILING = 560;

/**
 * The two shapes these tokens really take, both of which have to give the same answer.
 *
 * `source` is how `index.css` authors them. `built` is what the minifier emits — it rewrites a time
 * to whichever unit is shorter, so `110ms` becomes `.11s` and `34ms` survives because `.034s` is
 * longer. Measured in `apps/web/dist/assets/*.css`.
 *
 * **The suite only had the source shape, and that is how the bug shipped**: `parseFloat(".11s")` is
 * 0.11, so in production the ceiling was 0.56 and every delay scaled to 0 or 1ms. Both shapes are
 * now parameters of every test below.
 */
const SHAPES = {
    source: (ms: number) => `${ms}ms`,
    built: (ms: number) => (ms >= 100 ? `${(ms / 1000).toString().replace(/^0/, "")}s` : `${ms}ms`),
} as const;

let shape: (ms: number) => string = SHAPES.source;

beforeEach(() => {
    document.documentElement.style.setProperty("--line-step", shape(LINE_STEP));
    document.documentElement.style.setProperty("--word-step", shape(WORD_STEP));
    document.documentElement.style.setProperty("--stagger-ceiling", shape(CEILING));
});

/** A container of `.arp-word` spans, each reporting the `offsetTop` it is given. */
function words(tops: readonly number[]): HTMLElement {
    const container = document.createElement("div");
    for (const top of tops) {
        const span = document.createElement("span");
        span.className = "arp-word";
        Object.defineProperty(span, "offsetTop", {value: top, configurable: true});
        container.append(span);
    }
    document.body.append(container);
    return container;
}

function delays(container: HTMLElement): number[] {
    return [...container.querySelectorAll<HTMLElement>(".arp-word")].map((word) =>
        Number.parseFloat(word.style.getPropertyValue("--word-delay")),
    );
}

describe.each(Object.entries(SHAPES))("retimeWords, tokens written as %s", (name, writer) => {
    shape = writer;
    beforeEach(() => {
        shape = writer;
        document.documentElement.style.setProperty("--line-step", writer(LINE_STEP));
        document.documentElement.style.setProperty("--word-step", writer(WORD_STEP));
        document.documentElement.style.setProperty("--stagger-ceiling", writer(CEILING));
    });

    it("reads the unit, so the built shape and the source shape agree", () => {
        // The assertion the bug would have failed: `.11s` and `110ms` are the same duration, and
        // `parseFloat` alone makes them differ by 1000x.
        const container = words([0, 56]);
        retimeWords(container);
        expect(delays(container)).toEqual([0, LINE_STEP]);
        expect(name === "source" || name === "built").toBe(true);
    });

    it("steps by --word-step along a line", () => {
        const container = words([0, 0, 0, 0]);
        retimeWords(container);
        expect(delays(container)).toEqual([0, WORD_STEP, WORD_STEP * 2, WORD_STEP * 3]);
    });

    it("steps by --line-step at a wrap, and restarts the word count", () => {
        // The defect this is the fix for: with an index-based delay, word 3 here would be the
        // third step of one stagger instead of the first word of a new line, so the second line
        // would start mid-sequence — visible at some widths and not others.
        const container = words([0, 0, 0, 56, 56]);
        retimeWords(container);
        expect(delays(container)).toEqual([
            0,
            WORD_STEP,
            WORD_STEP * 2,
            LINE_STEP,
            LINE_STEP + WORD_STEP,
        ]);
    });

    it("treats a sub-pixel difference as the same line", () => {
        // Inline boxes on one rendered line can differ by a fraction of a pixel. A strict
        // comparison counts that as a wrap and doubles the stagger.
        const container = words([0, 2, 3.5]);
        retimeWords(container);
        expect(delays(container)).toEqual([0, WORD_STEP, WORD_STEP * 2]);
    });

    it("compresses a long heading to fit the ceiling instead of making the reader wait", () => {
        // Twenty words on one line is 19 * 34 = 646ms, past the 560ms ceiling. The shape is kept
        // and the step is scaled, so the last word still lands at the ceiling exactly.
        const container = words(Array.from({length: 20}, () => 0));
        retimeWords(container);
        const scaled = delays(container);
        expect(Math.max(...scaled)).toBe(CEILING);
        // Still monotonic: a compressed stagger is still a stagger.
        for (const [index, delay] of scaled.entries()) {
            if (index === 0) continue;
            expect(delay).toBeGreaterThan(scaled[index - 1] ?? Infinity);
        }
    });

    it("leaves a heading that already fits alone", () => {
        const container = words([0, 0, 0]);
        retimeWords(container);
        expect(Math.max(...delays(container))).toBeLessThan(CEILING);
    });

    it("does nothing rather than throwing when there is nothing to time", () => {
        // Motion never gates content: a failed measurement has to leave every delay at its token
        // default of 0ms, which shows the whole headline at once — a worse animation, a correct
        // page.
        expect(() => retimeWords(null)).not.toThrow();
        expect(() => retimeWords(document.createElement("div"))).not.toThrow();
    });
});
