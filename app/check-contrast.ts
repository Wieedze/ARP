/**
 * Every use of a sub-AA colour token sits on display type, or this fails.
 *
 * `tasks/14` found `--color-fg-40` at 3.66:1 carrying meaning at 11px. ADR `0057` replaced that
 * palette, and `scripts/measure/contrast.ts` re-measured the new one: **one** text token is below
 * AA body, `--color-grey` at 3.84:1 — which `rules/ui.md` already restricts to "dim display text
 * only — never body copy."
 *
 * A rule nothing checks is a rule that comes back as a finding. This is the check: a use of the
 * token must sit **within a few lines of** a display-type class, or name itself as decoration with
 * `aria-hidden`.
 *
 * The window is why it is lines and not one line. Both legitimate uses in this app put the class
 * and the token on different lines — a `className` template split by the formatter, and a `<span>`
 * inside an `h2` whose class is on the parent. A one-line check flagged both, which is a check
 * that teaches people to silence it.
 *
 * 3.84:1 clears AA for **large** text (3.0), which is 18.66px or 14px bold. `type-display`,
 * `type-title` and `type-section` are all clamps whose floor is 28px, so a line carrying one of
 * them is above the bar by construction.
 */
import {readdirSync, readFileSync, statSync} from "node:fs";
import {join} from "node:path";

/** Tokens measured below 4.5:1 on their worst surface. Re-run the measurement before editing. */
const SUB_AA = ["--color-grey"];

/** A line carrying any of these is display type, or is not text at all. */
const ALLOWED = ["type-display", "type-title", "type-section", "aria-hidden"];

/** WCAG's large-text floor: 18.66px, or 14px bold. Rounded up, because 18.66 is not a CSS value. */
const LARGE_PX = 19;

/**
 * An explicit size at or above the large-text floor.
 *
 * `type-face` carries the display look and **no size**, so it is not on `ALLOWED` — a grey
 * `type-face` could be 11px. What makes it safe is the size beside it, so this reads that size:
 * `text-[26px]` and `text-[clamp(30px,4.4vw,56px)]` both qualify, the clamp on its **floor**,
 * which is the smallest it will ever render.
 */
function largeEnough(text: string): boolean {
    for (const [, clampFloor] of text.matchAll(/text-\[clamp\((\d+)px/g)) {
        if (Number(clampFloor) >= LARGE_PX) return true;
    }
    for (const [, fixed] of text.matchAll(/text-\[(\d+)px\]/g)) {
        if (Number(fixed) >= LARGE_PX) return true;
    }
    return false;
}

/** How far either side to look for the display class. Four covers a formatter-split className. */
const WINDOW = 4;

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return entry === "__tests__" ? [] : walk(path);
        return path.endsWith(".tsx") || path.endsWith(".ts") ? [path] : [];
    });
}

const offences: string[] = [];
for (const path of walk("src")) {
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
        const trimmed = line.trim();
        // A comment naming the token is not a use of it.
        if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
        if (!SUB_AA.some((token) => line.includes(token))) return;
        const near = lines.slice(Math.max(0, index - WINDOW), index + WINDOW + 1).join("\n");
        if (ALLOWED.some((marker) => near.includes(marker))) return;
        if (largeEnough(near)) return;
        offences.push(`${path}:${index + 1}  ${trimmed.slice(0, 96)}`);
    });
}

if (offences.length > 0) {
    console.error(
        `${offences.length} use(s) of a sub-AA token on non-display text.\n` +
            `--color-grey is 3.84:1 — it clears AA for 18.66px+ only (rules/ui.md).\n` +
            `Use --color-steel (5.95:1), or set a size of ${LARGE_PX}px or more, or add a\n` +
            `display-type class, or mark it aria-hidden.\n`,
    );
    for (const offence of offences) console.error(`  ${offence}`);
    process.exit(1);
}
console.log(`No sub-AA token on body text. Checked ${SUB_AA.join(", ")}.`);
