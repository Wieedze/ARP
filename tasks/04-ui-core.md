# Task 04 — UI Core

## Objective

Build the foundational UI: design system tokens, layout shell, wallet connection, and the module list page reading live data from Base Sepolia.

## Required skills for this task

- frontend-design
- intuition-protocol (for reading atom links)

Load both before starting. Also read `docs/05_UI_DESIGN.md` carefully — the prestige bar is specified there.

## Deliverables

- [ ] Design tokens (colors, typography, spacing) configured in Tailwind
- [ ] Layout shell with header, content area, footer
- [ ] Wallet connection component (custom, not stock RainbowKit)
- [ ] Contract read hooks for `ModuleRegistry`
- [ ] Module list page (`/`) showing all registered modules from Base Sepolia
- [ ] Domain filter UI working against the actual `getModulesByDomain` function
- [ ] Empty state, loading state, error state all handled gracefully
- [ ] Responsive from 375px to 1920px
- [ ] Typography and color reviewed against `docs/05_UI_DESIGN.md`

## Steps

### 1. Design tokens

In `app/tailwind.config.ts`, define the palette and typography per `docs/05_UI_DESIGN.md`:

- Single dark background color
- Monochrome grey ramp (9 steps)
- One accent color
- Border color (low-opacity white)
- Typography: display / body / mono font families, 3 body sizes, 1 display size, defined line heights

Do not include a light mode palette for MVP.

### 2. Layout shell

`app/src/components/Layout.tsx`:
- Header: ARP wordmark left, wallet connect right, minimal border below
- Main: content slot
- Footer: minimal, with links to contract on Basescan, GitHub repo, and Intuition

Keep the header no taller than 56px. Do not add a navigation menu — the app has three routes and they're accessed via links within the content.

### 3. Wallet connection

Build a minimal wallet connect component using Wagmi + Viem. Do not use the stock RainbowKit modal.

States:
- Disconnected: single button "Connect wallet"
- Connecting: button shows "Connecting..."
- Connected: shows either ENS (if resolved) or `0xABCD…1234`-style truncation, with a small avatar (the ENS avatar if available, else a deterministic gradient based on the address — but skip the gradient for MVP and just use a solid square)
- Click on the connected state shows a simple dropdown with "Disconnect"

No modal. No drawer. A dropdown.

### 4. Contract bindings

Generate typed bindings for `ModuleRegistry` using `wagmi cli` or by manually writing the ABI into `app/src/contracts/ModuleRegistry.ts`. Export:

```typescript
export const MODULE_REGISTRY_ADDRESS = '0x...' // from deployments/base-sepolia.json
export const moduleRegistryAbi = [...] as const
```

Write hooks:
- `useTotalModules()` → `bigint`
- `useModule(id: bigint)` → the Module struct
- `useAllModules()` → array of all modules (fetches totalModules then fetches each; React Query caches aggressively)
- `useModulesByDomain(domain: string)` → filtered list

### 5. Module list page

Route: `/`

Layout:
- Page title: "Modules" in display type, not huge — think editorial section header, not hero
- One line of body copy underneath: "Evaluation modules registered on ARP."
- Below: domain filter row (chip-style, but sharp-edged) — "All" + one chip per unique domain found
- Below: module list

Each module row shows:
- Module ID in mono, left
- Module name (body size, slightly heavier weight)
- Domain label (uppercase, tracking-wide, accent color if currently filtered-by)
- Creator address truncated in mono
- Registered timestamp, right-aligned, relative ("2 days ago") with tooltip showing full ISO

Rows are clickable (href to `/module/:id` — the detail page is Task 05, for now it can 404 gracefully).

### 6. States

**Loading**: skeleton rows, same height as real rows, subtle pulse. Not a spinner.

**Empty**: "No modules yet." one line, nothing more.

**Error**: "Couldn't load modules from Base Sepolia. Retry?" with a small retry button.

**Wallet not connected**: the list still loads (reads don't require a wallet). No intrusive "please connect" banner.

### 7. Responsive behavior

- Below 640px: module rows stack — ID + name on one line, domain + address + time on the next, slightly smaller
- 640px - 1024px: single column, generous side padding
- Above 1024px: constrained max-width (around 960-1080px), centered

### 8. Accessibility pass

- Tab through every interactive element, confirm focus is visible
- Run with a screen reader for at least one minute (macOS VoiceOver or NVDA)
- Test at 200% browser zoom
- Run the Lighthouse accessibility audit, target score > 95

## Do not do in this task

- Do not build the module detail page (that's Task 05)
- Do not build the register module form (Task 05)
- Do not use shadcn/ui components pasted-in — you can reference them but the final UI is custom
- Do not use RainbowKit's default modal
- Do not add dark mode toggle — dark is the only mode
- Do not add animations beyond subtle 200ms transitions on hover / focus
- Do not add emoji, gradients, blurred blobs, or sparkles
- Do not add a hero section with a tagline

## Acceptance criteria

- `pnpm --filter app dev` starts a server showing real modules from Base Sepolia
- Filtering by domain changes the list in under 100ms (client-side filter preferred for 3-10 modules; switch to contract calls if the count grows)
- Connecting a wallet works with at least MetaMask and WalletConnect
- Opening the site on a 375px-wide viewport looks intentional, not broken
- A senior designer would not wince at the typography or spacing

## Report format when complete

```
## Task 04 complete

**Shipped**
- UI foundation at commit: <sha>
- Dev URL: localhost:5173
- Module list reads live from: <ModuleRegistry address>
- Wallet connect tested with: <wallets>

**Decisions made**
- Chose typefaces: <fonts> because <reason>
- Chose accent color: <hex> because <reason>
- [Other non-obvious choices]

**Known deferred**
- Module detail page (Task 05)
- Register flow (Task 05)
- Production deploy (Task 05)

**Next**
- Ready for Task 05 (UI polish + deploy)
- Blocked on: <nothing, or list>
```
