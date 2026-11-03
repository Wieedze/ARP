# 0128 — A wallet is asked for by the action that signs, and nowhere else

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** `docs/tasks/62-one-door.md` §7, the user on 2026-11-03: _« je comprends pas pourquoi
i have a wallet ça me connecte, ça sert à quoi d'être connecté ? »_, then _« tu laisses juste
connect a wallet sur les actions qui en nécessitent, sinon non »_.

## Context

ADR `0114` made the onboarding panel the answer to every "connect": the nav's Connect button opened
it, every `ConnectPrompt` on an action opened it, and its last line was "I have a wallet". So a
visitor choosing a path was offered a wallet, and a visitor at a Support button was offered a
choice of path before they could connect the wallet the button needed.

A wallet does one thing in the web app: sign with the reader's own funds — supporting and
withdrawing, declaring from the site, the wallet mint and the wallet listing, `/account`. A Claude
user never needs one (task 45).

## Decision

**The panel asks which path to take and nothing else. A wallet is asked for by the action that
signs, and nowhere else.**

- The panel loses "I have a wallet".
- `ConnectPrompt` connects the wallet directly (MetaMask or the injected provider), and says "No
  wallet detected" when there is none. It no longer opens the panel.
- The nav shows nothing for the wallet while it is disconnected; connected, it keeps the address
  menu (Copy, Account, Disconnect). Get started is the nav's way in (ADR `0125`).
- `DeclareUse` and `AgentImport`, which said "Connect the wallet that owns the agent." and relied
  on the nav's Connect, show a `ConnectPrompt` with that label.

This supersedes ADR `0114` item 1's "the wallet is the panel's last line" and its "behind Connect".

## Alternatives considered

- **Keep the nav's Connect, opening the wallet directly** — a wallet button on every page, for an
  act most visitors never perform; the user asked for it only where an action needs it.
- **Keep the panel's wallet line, relabelled** — still offers a wallet to someone choosing a path.

## Consequences

**Positive:**

- A visitor who never signs never sees a wallet. A visitor at an action gets the wallet in one
  click, not a panel first.

**Negative:**

- A reader with a wallet and nothing to sign has no visible way to connect, so `/account` and
  Yours on `/activity` are reached by their own `ConnectPrompt`, not from the nav.

## References

- Related rule: `.claude/rules/ui.md`
- Related task: `docs/tasks/62-one-door.md`
- Related ADR: `0114` (superseded in part), `0125`
