# 0092 — ARP sponsors the publication of delegations, on testnet, from its treasury

**Status:** Accepted
**Date:** 2026-10-30
**Triggered by:** user decision on `docs/tasks/35-the-account-page.md` §4.1, after reading how
Hourglass finds a delegation:

- the sponsor: _« notre financeur ? même logique que le reste, c'est un genre de sponsoring ? »_;
- the limit: _« on peut sûrement créer une limite par jour par user »_;
- where it applies: _« c'est sur testnet c'est bon pour le moment, on fera la migration mainnet
  quand on aura validé le fonctionnement avec Intuition »_;
- ADR `0045`: _« pourquoi pas mais cette règle doit être adoucie »_;
- whose funds: _« la trésorerie d'ARP, avec ta clé ? oui »_.

Amends ADR `0045` and `.claude/rules/security.md`.

## Context

A signed delegation is an EIP-712 message, not a transaction. ARP keeps it in the signing browser's
`localStorage` (`apps/web/src/hooks/use-stored-delegations.ts`). Another browser cannot see it, and
the agent only gets it when the operator copies it into a `.env`.

Hourglass (`github.com/intuition-box/Hourglass`) solved this with Intuition as the register:

- the full signed delegation is pinned to IPFS;
- the graph indexes it as `(delegator) —delegate to→ (agent)` with
  `(ipfs document) —in context of→ (that triple)`;
- anyone finds it by the agent's CAIP-10 address (`src/lib/intuition/discover.ts`);
- revocation is read on chain from `disabledDelegations(hash)` (`src/lib/intuition/enabled.ts`).

A server pays for the atoms and triples. It holds a gas key only, verifies the signature before
pinning or writing anything, and cannot forge anything (Hourglass ADR `0005`).

Copying that design ran into two rules here:

- `security.md` only lets ARP's own funds be signed by a human in the panel, or by an agent session
  for one action the user asked for, "not a standing licence". A relay that pays for every operator
  is a standing licence.
- ADR `0045`'s test reads "Unplug ARP's hosted services. Does a declaration, a stake, and an
  agent-to-agent call still complete?" It was being read as "ARP hosts nothing".

## Decision

**ARP runs a sponsor relay on Intuition testnet 13579. It publishes an operator's signed delegation
to IPFS and indexes it on Intuition, paid from ARP's treasury key, within daily limits.**

1. **Testnet only.** Mainnet 1155 waits until the register is validated with Intuition. Moving it
   to mainnet is a new ADR, not an edit of this one.
2. **The relay verifies before it spends.**
   - It recovers the delegator from the EIP-712 signature (EIP-1271 for a smart account), and
     refuses anything that does not verify.
   - Nothing is pinned or written before that check, so the relay cannot be used as free pinning.
   - The relay holds a gas key and nothing else, with no private database. A compromised relay can
     waste its own balance. It cannot forge a delegation or spend an operator's funds.
3. **Two limits.**
   - Per delegator: a number of publications per day.
   - Overall: a daily budget for the relay.

   Both are configuration, read at start, and printed in the relay's info route. The relay's own
   balance is the hard limit behind both.

4. **Idempotent.** Intuition term ids are content-addressed, so publishing the same delegation twice
   writes nothing the second time.
5. **A sponsored write says so.** ADR `0021` rule 4: a reader can tell who paid. The relay's
   address is public, and the triples it writes are attributable to it.
6. **The relay is a convenience, never a dependency.** If it is unplugged, out of budget, or the
   limit is reached, the operator publishes the same atoms and triples from their own wallet, from
   the same page. That keeps ADR `0045`'s test passing.
7. **Same vocabulary as Hourglass.** ARP reuses the `delegate to` and `in context of` predicates
   (Hourglass ADR `0003`, testnet ids in its `src/lib/intuition/discover.ts`), so one reader finds
   both products' delegations. They are re-read from the graph before the first write, never copied
   blind (`portability.md`).
8. **Pinning.** Pinata, with the key on the relay, as Hourglass does. Intuition's own pin API
   (`INTUITION_PIN_API_KEY` in Hourglass's publisher) is checked first, because it would leave
   Intuition as ARP's only infrastructure. Choosing a pinning service by its standing on ARP's own
   graph is noted as a use case, not built here.

### The amendment to ADR `0045`

The invariant stays: **ARP is never in the path of a request.** What is softened is the reading
that ARP hosts nothing.

**ARP may host a service that pays or speeds things up, on one condition: unplugging it costs the
operator money or a click, never a capability.** The test is unchanged, and the relay passes it by
item 6.

### The amendment to `security.md`

One row is added to the table of who may sign with whose funds:

| Whose funds | Who signs                                               | Mainnet?                            |
| ----------- | ------------------------------------------------------- | ----------------------------------- |
| ARP's own   | **the sponsor relay**, automatically, within its limits | **testnet 13579 only** — ADR `0092` |

Row 1 is unchanged: no script or agent signs a **mainnet** transaction with ARP's own funds.

## Alternatives considered

- **The operator always pays.** Today's posture. Every delegation would cost them a separate fee
  before it could even be found, and the user chose sponsoring.
- **Keep delegations local, and paste them between browsers.** It has no cost and no relay, but the
  agent still depends on a `.env` copy and the account page sees one browser. It survives as the
  fallback for import.
- **MetaMask's hosted delegation storage.** It was not evaluated. It would make a third party the
  register, where Intuition is the graph ARP already reads.
- **Sponsor on mainnet from the start.** The user ruled it out: validate with Intuition first. Costs
  are also about 100× apart (`portability.md`).

## Consequences

**Positive:**

- `/account` lists an operator's delegations from any browser, and an agent finds its own by its
  address.
- ARP and Hourglass delegations share one register.

**Negative:**

- ARP runs a service with a funded key, and must watch its balance and budget.
- The relay is a target for spam. The limits bound the cost of spam; they do not prevent it.

**Neutral (worth knowing):**

- A published delegation is public. It already was once the agent redeemed it, and it never holds
  a key.
- Revoking does not delete the index. The graph records that the delegation existed, and the chain
  says whether it is disabled. Every reader checks both.

## References

- Related rules: `.claude/rules/security.md`, `.claude/rules/metamask-delegation.md` (the "Storage"
  section said the hackathon did not need on-chain publication; that is now superseded for testnet)
- Related ADRs: `0045` (amended), `0021` (sponsored writes are legible), `0036` (delegated staking,
  testnet first), `0037` (testnet signing)
- Related tasks: `docs/tasks/35-the-account-page.md`, `docs/tasks/37-the-delegation-register.md`
- Prior art: Hourglass ADRs `0003` and `0005`, and its `src/lib/intuition/{discover,publish,enabled}.ts`
