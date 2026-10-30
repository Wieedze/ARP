import {describe, expect, it} from "vitest";

import {LIST_CAP, rowMotion} from "../row-motion";

/**
 * The one behaviour this module has, and the reason it is not `index` passed straight through.
 *
 * `--list-step` is 30ms, tuned on the three rows a testnet query returns. `/agents` and `/tools`
 * return two hundred, and uncapped that is a **six-second** wait before the last row appears. The
 * clamp is the whole module; without a test it is one `Math.min` nobody would notice losing.
 *
 * Asserted on the custom property, because that is what the stylesheet multiplies by `--list-step`
 * — a test that read the className would pass with the clamp deleted.
 */
describe("rowMotion", () => {
    const indexOf = (row: number) =>
        Number((rowMotion(row).style as Record<string, unknown>)["--row-index"]);

    it("staggers the rows above the cap one by one", () => {
        for (let row = 0; row < LIST_CAP; row += 1) {
            expect(indexOf(row)).toBe(row);
        }
    });

    it("gives every row past the cap the same step, so a long list does not crawl", () => {
        // Row 8 onward arrives with row 7. At 30ms a step that is 210ms, where index 199 would be
        // 5.97s — the defect the cap exists for, stated as the number it prevents.
        expect(indexOf(LIST_CAP)).toBe(LIST_CAP - 1);
        expect(indexOf(199)).toBe(LIST_CAP - 1);
        expect(indexOf(10_000)).toBe(LIST_CAP - 1);
    });

    it("carries the caller's delay through untouched, and defaults it to none", () => {
        // The delay is the list's own offset — when the rows follow a heading that is itself
        // revealing. It is not capped and must not be: it applies once, not per row.
        const style = rowMotion(3, 450).style as Record<string, unknown>;
        expect(style["--reveal-after"]).toBe("450ms");
        expect((rowMotion(3).style as Record<string, unknown>)["--reveal-after"]).toBe("0ms");
    });

    it("animates the row element itself", () => {
        // `rules/code.md` and the module's own docstring: a wrapper `<div>` between `<ul>` and
        // `<li>` is invalid and drops the list out of the accessibility tree, so these are props to
        // spread rather than a component to nest. If this ever becomes a component, that is the
        // regression.
        expect(rowMotion(0).className).toBe("arp-row");
    });
});
