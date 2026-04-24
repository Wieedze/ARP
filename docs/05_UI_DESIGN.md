# 05 — UI Design Principles

The UI is the part of this MVP that Billy will see first, before reading a single line of Solidity. It must signal **prestige in 10 seconds**. This document captures design direction to prevent the default "ship-it React template" outcome.

## Design thesis

The interface should look like it was made by a protocol team that respects its users' intelligence, not by a startup trying to look legitimate with stock UI components.

References to study (do not copy — internalize the aesthetic principles):
- **Paragraph.xyz** — typographic discipline, monochrome restraint
- **Farcaster Warpcast** — data density without visual noise
- **Lens Protocol docs** — semantic hierarchy through type, not color
- **Rainbow** — warm, considered dark mode
- **Uniswap v4 docs** — technical authority through typography
- **Zora** — editorial confidence, sharp corners, opinionated

References to **avoid**:
- Generic SaaS dashboards with 5 pastel gradient cards
- AI-generated landing pages with "sparkle" emojis
- shadcn/ui defaults pasted in without modification
- Hero sections with a blurred blob in the background
- Anything that looks like it could be a Figma template

## Core principles

### 1. Typography is the design system

Pick one or two excellent typefaces and use them with discipline. Suggested:
- **Display / Headings**: a serif or editorial sans (e.g., GT Sectra, Söhne, Fraunces, or a similar high-quality pairing)
- **Body**: a well-designed sans (e.g., Inter, Söhne, GT America)
- **Mono**: for addresses, hashes, technical data (e.g., JetBrains Mono, Berkeley Mono, IBM Plex Mono)

Limit to 3 font sizes for body content, plus a display size for hero moments. Use weight and leading (line-height) for hierarchy more than size.

### 2. Dark mode, single surface

One dark background (near-black, not pure black — e.g., `#0A0A0A` or `#0E0E10`). No light mode for MVP.

Use one, maybe two levels of surface elevation — do not create a Figma-tier of 6 nested card shadows. A thin border (`rgba(255,255,255,0.06)`) does more work than a shadow.

### 3. Monochrome first, one accent

Greys carry the entire UI. One single accent color, used sparingly for:
- Primary action state
- The currently selected domain filter
- Signals that demand attention (live status, new data)

Accent suggestions (pick one, not multiple):
- Electric green (`#00FF88`) — classic crypto protocol energy
- Amber (`#FFB800`) — editorial, warm
- Cyan (`#00E5FF`) — modern infrastructure feel

Do not use red/green gradients, do not use multiple accent colors, do not use rainbow anything.

### 4. Data density is a feature, not a bug

Don't over-pad. The target user is technical. Show more per screen. Prioritize:
- Addresses in full mono, truncated only when space forces it
- Timestamps in ISO format with relative time as secondary
- Numbers right-aligned in tabular contexts
- Hashes clickable to block explorer, always

### 5. Sharp edges

No rounded corners above 4px on most components. Avoid `rounded-full` on anything that isn't an avatar or a tag.

### 6. Motion is restraint

One single transition curve, applied sparingly. `cubic-bezier(0.16, 1, 0.3, 1)` at 200-300ms for most UI interactions. No bounces, no springs, no parallax.

### 7. No emoji, no gradients, no illustrations

Unless specifically requested by the user. Icons are fine — use a single set (Phosphor, Lucide at thin weight, or Heroicons outline). Keep them at one consistent size.

## Component-level guidance

### Module card
- Full width on mobile, grid on desktop
- Monospace for the module ID
- Domain as a small uppercase label
- Creator address truncated with full on hover
- Timestamp bottom-right, subtle

### Empty states
- Single line of copy, left-aligned
- No illustration
- One primary CTA if applicable

### Forms (module registration)
- Inline validation, no modal dialogs
- Clear focus states (border color shift, not a glow)
- Submit button becomes the transaction status during pending state
- Error messages below the field, not in a toast

### Wallet connection
- Do not use RainbowKit default UI as-is. Customize or build a minimal replacement.
- Connected state shows ENS if available, else short address + avatar
- Disconnect is accessible in a dropdown, not hidden

## What "prestige" actually means for this MVP

When a user opens the URL on their phone:
- First 3 seconds: they notice the typography and understand this is serious
- Next 5 seconds: they read the one-line positioning and understand what ARP does
- Next 10 seconds: they see 3 registered modules with clear domains, and one is linked to their field of interest
- Next 20 seconds: they click a module and see the schema, the creator, the Intuition atom link, the contract transaction

At no point should they think "this looks like a hackathon project" or "this looks like a template."

## Accessibility baseline

- WCAG AA contrast ratios (4.5:1 for body, 3:1 for large text)
- Keyboard navigable (tab order makes sense, focus visible)
- Motion-reduce preference respected
- Semantic HTML (not a div salad)

## Final rule

When in doubt: remove something. The most common failure mode for prestige UI is adding one more element "to fill the space." Leave the space.
