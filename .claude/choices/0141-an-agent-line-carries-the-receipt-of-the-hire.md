# 0141 — An agent's line carries the receipt of the hire, and is read from the index first

**Status:** Accepted
**Date:** 2026-11-05
**Triggered by:** `docs/tasks/65`, the user's « oui vazy » and, after the first run, « 1- règle ce problème, 2- pareil, 3- oui »

## Context

The pulse of task 63 records what an agent says about a skill. A skill cannot answer back. A hired agent can: its node signs a receipt (ADR `0101`), and until now nothing put that receipt where a third party could find it from the line it supports.

The first run also showed that `ipfs.io` and `dweb.link` refuse scripts, so an address with a valid proof read `unproven`.

## Decision

1. **A receipt is attached with the shape a binding already uses:** `(receipt document, in context of, (hirer, uses, agent))`. No new predicate.
2. **A document counts by what it proves.** Anyone can attach anything to a line (ADR `0032`), so a reader checks the signature, the bound node, the line, the requester and the payment on chain, and returns each check. `holds` means all of them held.
3. **A reader takes the document from Intuition's index first**, in `value.json_object.data`, then from a public gateway. The index is not trusted for it: a binding stands on two signatures and the registry's owner, a receipt on its signature and the chain. The gateway order is Pinata, then `ipfs.io`.
4. **`arp_find_agents` takes a `domain`, and `arp_agent_endpoints` shows signed addresses, whether they answer now, and each line with its receipts.** It is a read, so it joins the tools served to `ARP_TOOLS=read`.
5. **Sybil is deferred, by the user's decision:** « on réglera le problème Sybil et fake plus tard, on se concentre sur le cœur de l'outil ». A receipt that holds shows that two keys dealt with each other, and the tool's description says that it does not show two people.
6. **An identity is resolved strictly, both ways.** `same as` is permissionless and most such edges on 13579 are not about agents, so an atom counts as an agent only when its edge parses as CAIP-19 and that identity resolves back to it through `resolveIdentityAtomStrict`. Several claimants give `ambiguous` and no address. A caller pays on this answer, so this is the divert ADR `0095` §7 closed, one step earlier. It is about diverting a payment and is not covered by deferring Sybil.
7. **Only the line's wallets and the bound nodes are read**, at most 5 per line, and the rest are counted as not read. A receipt's requester must have created the line or hold a position on it, because a triple has one creator and anyone can create it first.
8. **A receipt holds only if the wallet that paid controls the agent the line names**, its owner or declared wallet in the registry, read now. The user, 2026-11-05: « il faut régler ça tout de suite ». Without it a wallet paid a real node, wrote `(somebody else, uses, agent)` and attached a valid receipt. An identity counts only on a registry the reader knows, from its deployment record, because a registry is a contract anyone can deploy with an `ownerOf` that says what its author wants. And the atom's document has to be canonical for that identity, even when it is the only one named, because anyone can mint a token on a known registry and write `(somebody's atom, same as, my token)`. So an agent whose atom carries registration metadata reads `unknown` until that comparison includes its registration: `bun run scripts/measure/agent-identity-canonical.ts` says how many subjects on the registry are canonical. `arp_agent_endpoints` reads lines only on the canonical atom and for a known registry too, for the same reason, and still returns signed addresses, since a binding names its token. `arp_agent_endpoints` also returns `wallet_controls_declarer` per line, with or without a receipt. `wallets_worked` in `arp_find_agents` counts only such lines, by the user's « ok », and the others are shown as `lines_not_counted`.
9. **One stranger's `same as` no longer blanks an agent**, by the user's « règle », 2026-11-05. When several atoms claim an identity, the only atom claimed by the token's owner or declared wallet wins, then the atom whose document is canonical for that chain and token, and otherwise it stays ambiguous with no address. Owner first, because anyone can create the canonical atom: its bytes are public (ADR `0047`). Still open: a claim only Intuition's mirror wrote, on an atom carrying registration metadata, loses to a stranger's canonical atom, which shows the wrong lines and cannot divert a payment; 250 false claims can push the real one out of the read, which denies at 250 fees; and an agent on another chain's registry reads as no identity here until reads span chains.

## Alternatives considered

- **A new tool, `arp_agent_pulse`**: one door more for one more read, where `arp_agent_endpoints` is already the call an agent makes before contacting an agent.
- **Keeping one gateway and changing its name**: Pinata alone is one more single point, and it is only known to work on this day from this machine.
- **Trusting the index without checks**: nothing would stop a false document, and the checks cost a few reads.

## Consequences

**Positive:** an agent can go from a need to an address and to what backs it, through the plugin, with no key.

**Negative:** each `arp_agent_endpoints` on a declared agent now costs a few more reads and up to 3 outgoing probes to addresses somebody else wrote, through the same guard as every such URL. Ordering on wallets rewards whoever owns several, until Sybil is taken up. A quick tunnel leaves a dead signed address on chain at each restart.

**Open, from the `intuition-integrator` review:** A griefer who front-ran the line can also reach the 5-document window. A non-null but unusable document in the index is final, with no gateway fallback. A griefer who creates `(hirer, uses, agent)` first still takes the hirer's domain and outcome into `byOthers`, because `pulse-usage.ts` counts a qualifier for the creator and that rule is shared with skills. A griefer who deposits on the line can reach the 5-document window, at a deposit's cost. Ten junk `has endpoint` claims or `uses` lines push genuine ones out of their windows, and this denies rather than diverts. `holds` ignores `expiresAt` and `verifyingContract` on purpose: a reader asks what happened, and a verifier asks whether to spend. The index is still trusted for `creator_id` and for which term has which subject and object.

**Neutral (worth knowing):** `in context of` now reads both ways on this chain: `(line, in context of, word)` from ADR `0135` and `(document, in context of, line)`. The reads do not collide, since one keys on the subject and the other on the object. Categories still sit under `tool`, so `document` is a category written for tools. Whether agents need their own tree, and what depth means for them, is open. `apps/web/src/services/agent-endpoints.ts` still links to `ipfs.io`, in a browser, where the gateway's service worker may answer; not checked. Four measurement scripts keep `ipfs.io` and were not changed.
