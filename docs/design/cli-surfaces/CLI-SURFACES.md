# The v0 surfaces: terminal, session line, badges

**For:** Claude Code. **Reference:** `cli-surfaces.html`. **Spec:** "Spec : hook d'usage et arp status" (Claude Docs). Tool names are real MCP servers; every figure is a sample.

## 1. Terminal (`packages/cli`, `src/status.ts`)

The current `renderStatus` prints a plain table. Bring it to the reference:

- **Alerts first**, before the table, one line each: `!` for broken everywhere and only you, `~` for a change. Each line states the fact with its numbers (`fails for 41 of 43 operators since Tue 14:02 UTC`).
- **Columns**: tool, calls, you, network (`98 % of 120`), median, verdict. A private tool shows `private` after its name and `never shared` in the network column.
- **Colour only for state**, and only when stdout is a TTY and `NO_COLOR` is unset:

| verdict | style |
|---|---|
| `broken everywhere`, `only you: …` | red, bold; the failing `you` or `network` figure red |
| `changed <date>` | bold |
| `slow for you`, `ok` | plain |
| `not enough data`, headers, footnotes | dim |

- **Footer**: the window and the date of the network reading (`Network: 1,284 weekly reports, read today 06:00 UTC`), then a hint to the detail command.
- **`arp status <tool>`**: name and source, the verdict, **one line explaining it** (`Most of your failures are auth: the server answers, it refuses you.`), the days with `you` and `network`, failures by category with counts, changes, and "others moved to".
- **`arp init`**: the Saffron core `●` (ANSI 256 colour 214) and `ARP` on the first line, then one row per step with its outcome (`added`, `created`, `granted`), the consent question with the one line about what never leaves, then the next command.

## 2. The session line (`src/hook.ts`, `SessionStart`)

Prefix `ARP`, then the fact and, for a broken tool, the advice in one sentence: `weather-x402 is failing for 41 of 43 operators since Tue 14:02 UTC. Prefer another weather tool.` Once per tool and per change.

## 3. Badges: later, at the production release (see `../badges/`)

- Two segments, 20 px high, radius 4, 11 px Geist Mono with a monospace fallback.
- Left: `#121314`, the Saffron core `#ffb020` (r 3.6), `ARP` in `#e6e8e6`.
- Right: the fact. Light README `#eaeef2` on `#1f2328`; dark README `#21262d` on `#e6edf3`. Serve one SVG that reads well on both, or switch on `?theme=`.
- Texts: agent `uses N working tools`; tool `used by N operators`; nothing yet `no declared use yet` in muted text.
- **Never a colour for good or bad**: a badge that turns red is a score (ADR 0046).
- Computed from public data only (`uses` triples, weekly reports), cached, and linked to the tool page.
- `arp badge` prints the Markdown line.
