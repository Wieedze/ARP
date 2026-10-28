/** Every Tailwind class a file uses has a rule in the built stylesheet.
 *
 *      cd app && bun run build
 *      bun run scripts/measure/emitted-utilities.ts [path ...]
 *
 *  ## The failure class it measures
 *
 *  `.claude/rules/ui.md` §Gates names two failure classes no static check sees, and the first is
 *  **a Tailwind utility that does not exist**: v4 emits nothing for it, silently, so a typo and a
 *  real utility both pass `tsc`, `eslint` and `check:tokens`. `app/check-css-tokens.ts` is explicit
 *  that it does not cover this — _"It reads `var()` references, not class names."_
 *
 *  Tailwind writes one rule per utility it recognises, so a utility that emitted nothing is simply
 *  absent from the output. Strip the CSS escaping and a selector reads exactly like the class it
 *  came from, which is the whole trick.
 *
 *  ## It is a measurement, not a gate, and three things are why
 *
 *  It needs `bun run build` first, so it is slow. **It over-reports**: Tailwind scans source files
 *  as text, so a class-shaped string in a *comment* emits a real rule — this repo ships a dead
 *  `.z-15{z-index:15}` generated from the word `z-15` inside a docstring. And a candidate extractor
 *  is the hard part: a first version reported 268 "missing" tokens, almost all of them utilities
 *  the app had shipped for weeks, because its regex stopped at the `:` inside
 *  `text-[color:var(--color-steel)]`. **A gate that cries wolf teaches people to silence it.**
 *
 *  So this prints a population and a verdict and exits non-zero only on a real miss. Making it a
 *  gate is in `FUTURE.md`.
 *
 *  ## Why the figure needs a script at all
 *
 *  `rules/claims.md`: commit the script, not the number. The same hand-check produced **119** and
 *  then **140** in one session, from two different extractors over different file lists, and a
 *  third reviewer got **165**. Three numbers for one check is worse than none, because the next
 *  reader cannot tell which defines the population. This file defines it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP = new URL('../../app/', import.meta.url).pathname;

/** Classes this project defines itself, in `index.css`, rather than through Tailwind. */
const OURS = /^(arp-|type-|ring-loader$|score-numeral$)/;

/** A token that could plausibly be a utility: lowercase-led, or variant-prefixed. */
const UTILITY = /^!?-?[a-z]/;

function builtStylesheet(): string {
  const dir = join(APP, 'dist/assets');
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.css'));
  } catch {
    throw new Error(`No ${dir}. Run \`cd app && bun run build\` first.`);
  }
  if (names.length === 0) throw new Error(`No stylesheet in ${dir}.`);
  // Escaping removed, so `.text-\[color\:var\(--x\)\]` reads as `.text-[color:var(--x)]`.
  return names
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n')
    .replace(/\\/g, '');
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

/**
 * Every class token in a `className`, including the literal chunks of a template literal.
 *
 * `${…}` is split out rather than parsed: an interpolated expression contributes no literal class,
 * and its *text* would otherwise arrive as candidates like `isActive` and `?`.
 */
function tokens(source: string): Set<string> {
  const found = new Set<string>();
  for (const match of source.matchAll(/className=\{?[`"']((?:[^`"'$]|\$\{[^}]*\})*)[`"']/g)) {
    for (const chunk of (match[1] ?? '').split(/\$\{[^}]*\}/)) {
      for (const token of chunk.split(/\s+/)) {
        if (token === '' || !UTILITY.test(token) || OURS.test(token)) continue;
        found.add(token);
      }
    }
  }
  return found;
}

const css = builtStylesheet();
const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : walk(join(APP, 'src'));

const missing: [string, string][] = [];
const population = new Set<string>();
for (const path of targets) {
  for (const token of tokens(readFileSync(path, 'utf8'))) {
    population.add(token);
    if (!css.includes(`.${token}`)) missing.push([token, path]);
  }
}

const where = process.argv.slice(2).length > 0 ? `${targets.length} named file(s)` : 'app/src';
console.log(`${population.size} utility tokens across ${where}`);
if (missing.length === 0) {
  console.log('every one has a rule in the built stylesheet.');
  process.exit(0);
}
console.error(`\n${missing.length} with no rule — Tailwind emitted nothing for them:\n`);
for (const [token, path] of missing) console.error(`  ${token}\n      ${path}`);
process.exit(1);
