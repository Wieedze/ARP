/**
 * WCAG contrast for every colour token, against every surface it can land on.
 *
 * `tasks/14` exists because a ratio was **computed** rather than judged: "it looks fine" is how a
 * 3.66:1 token survived review. This is that computation, committed, so the next reviewer re-runs
 * it instead of re-eyeballing it.
 *
 * This used to say "there is no browser in the build environment", which was **false** — Chromium
 * is in the image and `scripts/measure/landing-fit.ts` drives it. The argument does not need it and
 * is stronger without it: a ratio is arithmetic, and a browser would let you look at it rather than
 * compute it, which is the mistake. `tasks/28` item 35 has the other thirteen sites of that claim.
 *
 *   bun run scripts/measure/contrast.ts
 */
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../../app/src/index.css', import.meta.url), 'utf8');

/** `--color-foo: #aabbcc;` — the only form `@theme` uses for a literal colour. */
function tokens(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, name, hex] of CSS.matchAll(/--(color-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out.set(name, hex.toLowerCase());
  }
  return out;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  // All three channels linearised. The first draft of this function passed red and green
  // through `channel()` and left **blue raw**, which inflated every luminance by up to 18 and
  // produced a table where `--color-accent` read 2.38:1 against the page. Caught by hand-checking
  // one cell against the WCAG formula — which is the whole reason `tasks/14` says "measured, not
  // eyeballed": a wrong computation is as confident as a right one.
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const all = tokens();
/** Every colour a text token can sit on in this app. */
const SURFACES = ['color-ground', 'color-bg', 'color-raised'] as const;

/** Tokens that are not text and are not held to AA. Each one says why. */
const NOT_TEXT: Record<string, string> = {
  'color-ground': 'a surface',
  'color-bg': 'a surface',
  'color-raised': 'a surface',
  'color-raised-2': 'a surface',
  'color-rule': 'a 1px hairline, not text',
  'color-rule-strong': 'a control border, not text',
  'color-surface-hover': 'a hover background',
  'color-numeral': 'big ghost numerals — decoration behind content',
  'color-watermark': 'the footer wordmark at 200px+',
  'color-accent-ink': 'ink ON the accent, measured against it below',
  'color-accent-dim': 'a selection background',
  'color-alarm-dim': 'a tint behind text, not text',
};

const AA_BODY = 4.5;
const AA_LARGE = 3.0;

console.log('token                    on ground   on bg    on raised   verdict');
console.log('-'.repeat(78));

let failures = 0;
for (const [name, hex] of [...all].sort()) {
  const why = NOT_TEXT[name];
  const cells = SURFACES.map((surface) => ratio(hex, all.get(surface)!));
  const worst = Math.min(...cells);
  const row = cells.map((value) => value.toFixed(2).padStart(9)).join('');

  if (why !== undefined) {
    console.log(`${name.padEnd(24)}${row}   — ${why}`);
    continue;
  }
  const verdict =
    worst >= AA_BODY
      ? 'AA body'
      : worst >= AA_LARGE
        ? 'AA large text only (>=18.66px or 14px bold)'
        : 'FAILS AA';
  if (worst < AA_BODY) failures += 1;
  console.log(`${name.padEnd(24)}${row}   ${verdict}`);
}

console.log(`\n${failures} text token(s) below 4.5:1 on their worst surface.`);
console.log(
  `accent ink on accent: ${ratio(all.get('color-accent-ink')!, all.get('color-accent')!).toFixed(2)}`,
);
