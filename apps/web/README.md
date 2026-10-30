# `app` — the ARP interface

Vite + React 19 + TypeScript + Tailwind v4. Read [`../README.md`](../README.md) for what ARP is and
[`../docs/12_THE_IDEA.md`](../docs/12_THE_IDEA.md) for the mechanism.

```bash
bun run dev      # http://localhost:5173
bun run build
bun run test     # Vitest, two projects: node for services, happy-dom for components
```

## Four gates, and the fourth exists because the other three cannot see it

```bash
bunx tsc -b
bun run lint
bun run test
bun run check:tokens     # every var(--…) in src resolves to a token index.css defines
bun run check:contrast   # no sub-AA colour token on body text
```

`check:tokens` exists because a page once shipped against five custom properties that did not
exist: `tsc` and `eslint` were both green while fourteen styling sites were inert in the browser,
because an undefined custom property is invalid at computed-value time (ADR `0050`). A string in a
class name is a string to every other tool here.

Two failure classes remain uncovered, and no static check sees them: a **Tailwind utility that does
not exist** (v4 emits nothing, silently, so a typo passes), and a utility **defeated by an unlayered
rule** in `index.css` — `button { border: … }` beats every Tailwind `border-*` utility regardless of
specificity. When you write against a base-layer rule, say so in a comment at the call site.

## Layout

| directory        | what lives there                                                           |
| ---------------- | -------------------------------------------------------------------------- |
| `src/pages`      | one file per route                                                         |
| `src/components` | presentation. No chain call, no business logic                             |
| `src/hooks`      | the only place allowed to bridge components and services                   |
| `src/services`   | off-chain logic that talks to a chain, Intuition or IPFS. Imports no React |
| `src/lib`        | chain config, ABIs, deployment addresses, class helpers                    |

New protocol logic goes in [`../packages/protocol`](../packages/protocol), not here:
`src/lib/deployments.ts` binds this whole app to testnet at module load, deliberately, so anything
built here inherits that and has to be ported later. See `.claude/rules/portability.md`.

## The design language

`.claude/rules/ui.md` is the contract and `docs/05_UI_DESIGN.md` is the visual spec. In short: dark
first, typography-driven, hairlines rather than shadows, one warm accent spent only on the primary
action and the viewer's own position, mono for every address, id, amount and label. No explanatory
sentence inside a card — a figure that needs a caveat gets a `Hint`.
