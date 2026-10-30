/**
 * Every use of a sub-AA colour token sits on display type, or this fails.
 *
 * `docs/tasks/14` found `--color-fg-40` at 3.66:1 carrying meaning at 11px. ADR `0057` replaced that
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
 *
 * ## It walks `.css` too, since 2026-10-29
 *
 * It did not, and a reviewer found `--color-grey` on 10px mono text in a plain-CSS component while
 * this gate reported clean. The component used `.arp-cf-*` classes rather than Tailwind utilities
 * on purpose and for good reasons — and that moved every one of its styling sites out of this
 * check's scope. `claims.md` §4 is about exactly that: a gate is green over what it reads.
 *
 * In CSS the markers above do not exist, so the rule is narrower and reads the stylesheet's own
 * terms: a **`color:` declaration** using the token fails unless a `font-size` at or above the
 * large-text floor appears in the same window. Only `color:` is checked — `stroke`, `background`
 * and `border-color` are not text, and flagging them would teach people to silence this.
 *
 * A class whose size lives at the call site rather than in the rule carries `display-only` in a
 * comment beside it, with the size it is applied at. `.arp-lit` is the one such case: it is used on
 * one element, at a clamp whose floor is 36px. The escape hatch is deliberate and narrow — the
 * alternative is a false positive on a correct use, which teaches the same silencing habit this
 * file's own docstring warns about, and faster.
 */
import {readdirSync, readFileSync, statSync} from "node:fs";
import {join} from "node:path";

/** Tokens measured below 4.5:1 on their worst surface. Re-run the measurement before editing. */
const SUB_AA = ["--color-grey"];

/**
 * What a CSS rule writes in a comment when its size lives at the call site.
 *
 * It states the size there. A marker without one is a silenced check, and the next reader cannot
 * tell the two apart.
 */
const CSS_DISPLAY_ONLY = "display-only";

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
        const checked = [".tsx", ".ts", ".css"];
        return checked.some((suffix) => path.endsWith(suffix)) ? [path] : [];
    });
}

/**
 * A `font-size` in the window at or above the large-text floor.
 *
 * `rem` is resolved at 16px, which is this app's root size and the browser default. A `clamp` is
 * read on its floor, the same way `largeEnough` reads a Tailwind clamp: the smallest it can render
 * is the only size that matters to a contrast floor.
 */
function cssLargeEnough(text: string): boolean {
    for (const [, clampFloor] of text.matchAll(/font-size:\s*clamp\(\s*([\d.]+)px/g)) {
        if (Number(clampFloor) >= LARGE_PX) return true;
    }
    for (const [, px] of text.matchAll(/font-size:\s*([\d.]+)px/g)) {
        if (Number(px) >= LARGE_PX) return true;
    }
    for (const [, rem] of text.matchAll(/font-size:\s*([\d.]+)rem/g)) {
        if (Number(rem) * 16 >= LARGE_PX) return true;
    }
    return false;
}

const offences: string[] = [];
for (const path of walk("src")) {
    const lines = readFileSync(path, "utf8").split("\n");
    if (path.endsWith(".css")) {
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
            // A text colour is the only declaration a text-contrast floor applies to. A token
            // DEFINITION is not a use of it, which is why this looks for `var(--token)`.
            if (!/^color\s*:/.test(trimmed)) return;
            if (!SUB_AA.some((token) => trimmed.includes(`var(${token})`))) return;
            const near = lines.slice(Math.max(0, index - WINDOW), index + WINDOW + 1).join("\n");
            if (near.includes(CSS_DISPLAY_ONLY)) return;
            if (cssLargeEnough(near)) return;
            offences.push(`${path}:${index + 1}  ${trimmed.slice(0, 96)}`);
        });
        continue;
    }
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
            `display-type class, or mark it aria-hidden. In CSS only a font-size counts.\n`,
    );
    for (const offence of offences) console.error(`  ${offence}`);
    process.exit(1);
}
console.log(`No sub-AA token on body text. Checked ${SUB_AA.join(", ")}.`);
