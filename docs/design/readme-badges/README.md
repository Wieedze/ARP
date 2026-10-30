# Badges: to do later, at the production release

**Status: not shipped.** Marked in the spec (Claude Docs) as moved to the production release. The design and the SVG generator are done and tested, so the work left is the data and the route.

## What was tested (2026-10-30)

`badge.ts` renders one badge as an SVG string. `test-badges.mjs` renders 7 messages the way GitHub shows them, inside an `<img>`, on a light and a dark README, and checks each one: size, the Saffron core, the message fitting its segment, and the dark rule switching the segment colour. **14 of 14 pass.** Screenshots in `sample-output/`.

```bash
npx tsc badge.ts --target es2022 --module es2022 --outDir dist
python3 -m http.server 8765 &   # the canvas check needs http, not file://
node test-badges.mjs
```

## What the test settled

- **Fonts**: an SVG inside `<img>` cannot load Geist Mono. The text uses the platform monospace and is pinned with `textLength`, so it never overflows whatever face the viewer has.
- **Theme**: one file serves both READMEs through `prefers-color-scheme` inside the SVG. In dark, a hairline outlines the badge, because graphite on GitHub's dark ground nearly disappears. Caveat: this follows the viewer's **system** theme. A GitHub user whose GitHub theme differs from their system sees the other variant. If that matters, offer two URLs with GitHub's `#gh-dark-mode-only` and `#gh-light-mode-only`.
- **Escaping**: `<`, `&` and quotes in a message are escaped.

## Left for production

1. The route: `/badge/tool/<atom>.svg` and `/badge/agent/<chain>/<token>.svg`, served `image/svg+xml`, cached a few minutes.
2. The figures, from public data only: `used by N operators` needs operator grouping (week 3 reports); `N working tools` needs the network success rates. Until then a tool can only honestly say `declared by N agents` (from `getToolUsage`).
3. `arp badge` in the CLI, printing the Markdown line.
4. The domain.
