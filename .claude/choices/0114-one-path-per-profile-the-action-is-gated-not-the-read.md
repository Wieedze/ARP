# 0114 — One path per profile; onboarding gates the action, not the read; you connect your agent

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** `docs/tasks/53`, user decisions 2026-11-02: three profiles at launch, scene 4 of
`/` replaced, and on onboarding _« ok ça me paraît bien »_ to the recommendation recorded below.

## Context

Scene 4 of `/` offered four jobs and three said "Needs wallet". The person task 52 measured the
gain for, a Claude user, was offered no way in, and task 45 promises them nothing web3 on screen.

The user then asked for an onboarding like Privy's: you cannot go further until you have onboarded
or connected once. Taken literally, that walls the index. `docs/01` and the MCP server's own
instructions say reading needs nothing, and the argument that anyone can recount every figure
does not survive a login in front of the figures. ADR `0069` had already settled that a page which
asks for a commitment before showing anything loses its reader.

## Decision

1. **One panel asks "What brings you here?"** and offers three paths: I use Claude, I'm building
   an agent, I published a tool or a skill. Each opens `/start/<profile>`, a short list of steps
   that tick themselves when ARP sees the result. The choice is kept in `localStorage`, as a
   convenience. **Amended the same evening (user, 2026-11-02):** the panel opens from the nav's
   Connect button and from Get started on the landing's first screen, rather than sitting as scene
   4, which is gone. The wallet is the panel's last line, "I have a wallet".
   The hero's button reads "Get started": my wording, not the user's, chosen over the copy rule's
   "Get started today!" example because it names the act and makes no promise. `rules/ui.md`'s
   scroll bullet now says the deck has five scenes.
2. **The action is gated, not the read.** Every index page stays open. Declaring, supporting,
   adding a tool and the personal pages open the onboarding first, until the visitor has done it
   once.
3. **You connect your agent, not an account.** For a Claude user the identity is the agent: the
   extension holds its key locally (ADR `0110`) and the sponsor pays on testnet. On the web,
   "connected" means the activity bar sees that agent (task 36). MetaMask stays for whoever wants
   to sign. **No Privy for now.**

## Alternatives considered

- **A wall in front of the whole site, as Privy does:** rejected. It closes the index that the
  claim of recountable figures rests on, and contradicts ADR `0069`.
- **Privy, with an e-mail login and an embedded wallet:** deferred, not rejected. It suits a
  visitor who arrives by the web without Claude. It is a new dependency and a second way to hold
  an agent's key beside ADR `0110`, for a demo that runs on the user's machine. It comes back if
  such visitors appear.

## Consequences

**Positive:**
- A Claude user meets no wallet word before their first result.
- The index stays checkable by anyone, which is the product's argument.

**Negative:**
- The landing no longer prints the declaration's floor. The fee is still on the page, in scene 3.
- `/account` opens on Your agent, which needs no wallet; the delegations sit behind a "Delegation ·
  later" tab (user, 2026-11-02).
- The gate on actions is not built yet; until it is, the actions behave as before.

**Neutral (worth knowing):**
- The agent operator and the team or registry profiles wait until they have something to offer.

## References

- Task: `docs/tasks/53-one-path-per-profile.md`
- Related ADR: `0069` (the landing's scenes), `0110` (the extension holds a local agent key),
  `0046` (no score)
- Related rule: `.claude/rules/ui.md` (no sentence in a card, Saffron on the primary action)
