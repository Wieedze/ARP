/** Every `var(--token)` in the app resolves to a token `index.css` defines.
 *
 *      bun run check:tokens
 *
 *  This exists because neither gate the app has can see the failure it catches. A new page was
 *  written against five custom properties that do not exist — `--color-text`, `--color-text-dim`,
 *  `--color-focus`, `--color-surface-hover`, `--text-micro` — and `tsc -b` and `eslint` were both
 *  green while fourteen styling sites were inert in the browser: an undefined custom property is
 *  invalid at computed-value time, so dim text rendered at full white and row hover did nothing.
 *
 *  **What it does not cover**, so nobody trusts it further than it goes. It reads `var()`
 *  references, not class names, and two other failure classes from the same review stay uncovered:
 *  a Tailwind utility that **does not exist** (v4 emits nothing, silently, so a typo and a real
 *  utility both pass), and a utility **defeated by an unlayered rule** in `index.css` — the same
 *  review found `button { border: 1px }` making a selected state invisible, and no static check
 *  sees that. A comment at the call site is its only defence.
 *
 *  Exits non-zero with the offending files, so it can gate.
 */
import {readFileSync, readdirSync, statSync} from "node:fs";
import {join} from "node:path";

const CSS = "src/index.css";
const ROOT = "src";

/**
 * `.css` is in here on purpose: `index.css` holds 17 `var()` references of its own — `body`'s
 * colour and type, the `button` border, `a:hover`, `::selection`, the focus ring — and without this
 * the file would not check itself. Demonstrated: a broken token in the base layer passed the first
 * version of this script, and the base layer is where this project's hardest-won rules live.
 */
function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return walk(path);
        return /\.(ts|tsx|css)$/.test(path) ? [path] : [];
    });
}

/**
 * Definitions are taken from the `@theme` block only.
 *
 * A pattern over the whole file counts a property defined inside a single class as defined
 * everywhere, so the check would bless a token that resolves in one rule and nowhere else.
 */
function themeBlock(css: string): string {
    const start = css.indexOf("@theme");
    if (start === -1) throw new Error(`${CSS} has no @theme block`);
    const open = css.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
        if (css[i] === "{") depth += 1;
        else if (css[i] === "}") {
            depth -= 1;
            if (depth === 0) return css.slice(open, i);
        }
    }
    throw new Error(`${CSS}'s @theme block is unterminated`);
}

const defined = new Set(
    [...themeBlock(readFileSync(CSS, "utf8")).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map(
        (m) => m[1],
    ),
);

const missing = new Map<string, Set<string>>();
for (const file of walk(ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/var\((--[a-z0-9-]+)/g)) {
        const token = match[1];
        if (token === undefined || defined.has(token)) continue;
        const sites = missing.get(token) ?? new Set<string>();
        sites.add(file);
        missing.set(token, sites);
    }
}

if (missing.size === 0) {
    console.log(`${defined.size} tokens defined in ${CSS}; every var() in ${ROOT} resolves.`);
    process.exit(0);
}

console.error(`${missing.size} undefined custom propert${missing.size === 1 ? "y" : "ies"}:\n`);
for (const [token, sites] of [...missing].sort()) {
    console.error(`  ${token}`);
    for (const site of [...sites].sort()) console.error(`      ${site}`);
}
console.error(`\nAdd it to ${CSS}'s @theme, or use a token that exists.`);
process.exit(1);
