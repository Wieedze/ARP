# Task 05 — UI Polish and Deploy

## Objective

Complete the UI with the module detail page and registration flow, polish all interactions, and deploy to Vercel under a custom domain.

## Required skills for this task

- frontend-design
- intuition-protocol

## Deliverables

- [ ] Module detail page (`/module/:id`) with full data and Intuition atom link
- [ ] Module registration flow (`/register`) with wallet signing and atom creation
- [ ] Loading, pending, and confirmation states for write transactions
- [ ] Error boundaries at the route level
- [ ] Page titles and meta tags (OG image optional but nice)
- [ ] Vercel deployment with a custom domain
- [ ] Final design pass against `docs/05_UI_DESIGN.md`

## Steps

### 1. Module detail page

Route: `/module/:id`

Data shown:
- Module name as page heading
- Module ID in mono
- Domain as labeled chip, same style as list page
- Creator address (full, mono) with Basescan link and ENS resolved if available
- Registered timestamp (ISO + relative)
- Schema URI with IPFS gateway link, clickable
- Description in a readable block, max-width constrained for readability
- Registration transaction hash with Basescan link
- **Intuition atom link** — prominent, labeled clearly as "View on Intuition"

Layout is single-column, content-centric. No sidebar.

Error states:
- 404 if the module ID does not exist — "Module #{id} not found." with link back to list
- Loading: skeleton matching the real layout
- Partial failure: if the module is on-chain but the atom link can't be resolved, show the on-chain data and a gentle "Atom not yet available" note — do not block the page

### 2. Registration flow

Route: `/register`

Gated by wallet connection — if disconnected, show "Connect wallet to register a module" with the connect button inline.

Form fields:
- Name (text, 64 char limit, live count)
- Domain (text, with inline validation matching the on-chain regex — show green check when valid, red hint when not)
- Schema URI (text, validated to start with `ipfs://`, with a helper link "How to pin a schema to IPFS" pointing to a short docs page or an external guide — for MVP, a link to Pinata's docs is acceptable)
- Description (textarea, 512 char limit, live count, optional marker)

Submit button states:
- Enabled: "Register module"
- Pending (wallet): "Confirm in wallet…"
- Pending (tx): "Registering… (tx 0x1234…)"  with Basescan link
- Confirmed: "Registered ✓ Module #{id}" — then redirect to `/module/{id}` after a 1 second pause, or let the user click to navigate

After the on-chain confirmation, trigger the Intuition atom creation (client-side, via the Intuition SDK per the intuition-protocol skill). If atom creation fails, the on-chain registration is still valid — show a "Module registered, atom creation retrying…" state and offer a manual retry button. Record the failure in an `errors` local state, do not throw.

No emoji on the confirmation check — use an SVG or a typographic mark.

### 3. Global polish pass

Walk through every screen with `docs/05_UI_DESIGN.md` open. Check:

- Typography: all sizes deliberate, no Tailwind default `text-base` leaking through where display type belongs
- Colors: one accent used consistently, no color drift
- Spacing: consistent rhythm, not a mix of 12px / 14px / 16px gaps on different pages
- Borders: one border color used everywhere, no shadow/border mixing
- Focus states: every interactive element has a clear focus ring (not `outline-none`)
- Motion: every transition uses the same timing function and duration
- Copy: every label and message is deliberate. No "Click here" or "Submit". Every string reviewed.

Fix anything that doesn't meet the bar. Remove anything that isn't earning its place.

### 4. Error boundaries

Wrap each route in a route-level error boundary. If a page errors, show:

- "Something broke on this page." in display type
- Short technical detail below, monospace, in muted color
- "Return to modules" link back to `/`

Do not show a full stack trace in production.

### 5. Meta tags and SEO basics

- `<title>` per route: "ARP — Modules", "ARP — Module #{id}", "ARP — Register Module"
- `<meta name="description">` at root level, describing ARP in one sentence
- OG image: optional for MVP. If included, it should be a typographically strong image showing the ARP name and the one-liner — no abstract visuals.

### 6. Vercel deployment

- Create a Vercel project from the GitHub repo
- Configure build: `pnpm --filter app build`, output directory `app/dist`
- Set all required environment variables (public env vars only — `VITE_PUBLIC_RPC_URL`, `VITE_CONTRACT_ADDRESS`, etc. — never private keys in the UI)
- Deploy and verify the live URL
- Set a custom domain if one is available, otherwise document the Vercel-provided URL in `deployments/base-sepolia.json`

### 7. Final smoke test

On the deployed URL, from a clean browser:
- Open `/` — module list loads in under 2 seconds
- Click a module — detail page loads and shows all data
- Click the Intuition atom link — opens the correct atom
- Click the Basescan tx link — opens the right transaction
- Go to `/register`, connect wallet, fill form with valid data, submit — complete flow works
- Go to `/register` with invalid domain — inline error shows, submit disabled
- Open on a phone — responsive, no horizontal scroll, wallet connect works

Any failure here blocks the task.

## Do not do in this task

- Do not add analytics beyond basic (Vercel Analytics is acceptable; no third-party tracking)
- Do not add feature flags
- Do not add a blog or docs site
- Do not add i18n
- Do not add dark/light toggle
- Do not add user profiles
- Do not add module editing or deletion
- Do not publish an npm package

## Acceptance criteria

- Live URL accessible publicly
- A new module can be registered end-to-end in under 60 seconds (wallet signing excluded)
- Loading all data on first visit completes in under 3 seconds on a decent connection
- Lighthouse scores: Performance > 85, Accessibility > 95, Best Practices > 95
- No console errors or warnings in production build
- Mobile experience is deliberate, not an afterthought

## Definition of done for the entire MVP

With this task complete:

- [ ] Contract deployed and verified on Base Sepolia
- [ ] Three seed modules registered on-chain with pinned schemas
- [ ] Three Intuition atoms created
- [ ] UI live at a public URL
- [ ] All UI states and flows working
- [ ] Documentation in `docs/` reflects reality
- [ ] `deployments/base-sepolia.json` complete
- [ ] Repo is ready to be shared with Billy

## Report format when complete

```
## Task 05 complete — MVP shipped

**Live at**: <URL>
**Contract**: <address> (<basescan url>)
**Modules**: 1, 2, 3
**Atoms**: <atom ids>

**Lighthouse scores**
- Performance: <n>
- Accessibility: <n>
- Best Practices: <n>
- SEO: <n>

**Decisions made in polish phase**
- [Any non-obvious choices]

**Known polish deferred (post-demo backlog)**
- [Small items that don't block the demo but should be tracked]

**Ready for**: the conversation with the Intuition team.
```
