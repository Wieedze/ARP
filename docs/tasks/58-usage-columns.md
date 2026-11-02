# Task 58 — /tools' Usage column filled, and a repository's skills shown on its row

**Status:** **BUILT**, 2026-11-02, branch `feat/58-usage-columns`.
**Rules:** `code.md`, `ui.md`, `claims.md`, `workflow.md`.
**Reviewers:** `ui-reviewer`, `task-verifier`.

---

## 1. Why

The user asked why the Usage and Declared columns on `/tools` were empty for repositories
(2026-11-02). There were two causes:

1. **Usage was empty everywhere.** It counts deposits ARP's sponsoring service sent, and the app
   recognises them only by the sponsor's address, read from `VITE_ARP_SPONSOR_ADDRESS`
   (`apps/web/src/lib/sponsor.ts`). Nothing set it: there is no `apps/web/.env`, and
   `.env.example` ships it empty. The code's comment still said "no sponsoring service exists
   yet". So every sponsored deposit since task 50 read as Declared.
2. **A repository row is empty by construction.** A declaration names a skill, never its
   repository (ADR `0077`), so a repository's own Usage and Declared count deposits on the
   repository itself, and there were none. Its skills' use was visible only on its page.

The user said yes to both fixes.

## 2. What shipped

- **The sponsor's address is in the deployment record**, `data/deployments/13579.json`
  `arp.sponsor`, `0xE596096F4176b682E300d73963e7B04B383C1AA1`. That is what the running service's
  `GET /` answered on 2026-11-02. It is a public address, not a key. `useToolCatalog` uses it when
  `VITE_ARP_SPONSOR_ADDRESS` is unset or empty, and the variable still overrides it. On mainnet
  nothing changes: `sponsorAddressFor` returns `null` off 13579.
- **A repository row shows its skills' use** on its qualifier line, next to its stars: "N skills
  declared", and "M usage" when M is above zero. This comes from `skillUsageByRepo` over every row
  read, not the page, because a repository's skills are in the other index. The row's own columns
  are unchanged: the repository's vault and its skills' are two markets, never summed (`RepoPage`).

## 3. Measured

Testnet 13579, 2026-11-02, `listTools` with the sponsor's address, one read: 12 `uses` edges, and
two tools with a non-zero Usage:
- `101-skills/superpowers?skill=youtube-thumbnail-design`, 7;
- `Agent 13579:2`, 3.

## 4. Known limits

- **Usage counts what the sponsor sent, the creation of an edge included.** The 7 on
  `youtube-thumbnail-design` is 4 deposits backed by a content receipt (agents #9, #10 twice and
  #11, in the sponsor's ledger) plus 3 triple creations the sponsor paid for (ADR `0110`). A creation
  is not proof-gated in the same way, so the column overcounts proven uses by the number of edges
  the sponsor created. Separating them needs the deposit events to say which was a creation.
- A repository's figure counts declared skills and adds their Usage. It carries the limit above.

## 5. Do not do in this task

- Sum a repository's own deposits with its skills'.
- Compose a score from the two figures (ADR `0046`).

## 6. Evidence ladder

Tier 3 (staked): it makes the staked deposits that passed the proof gate visible where they were
being read as plain declarations. It does not move ARP up the ladder.
