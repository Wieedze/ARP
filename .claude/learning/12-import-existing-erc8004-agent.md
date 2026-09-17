# 12 — Import an existing ERC-8004 agent

**Task:** `tasks/11-import-existing-erc8004-agent.md`
**Completed:** 2026-09-16
**Commit:** `a39a914` (branch `feat/import-erc8004-agent`, 7 commits from `f72d4d0`)
**Verifier verdict:** PASS

## What shipped

- `app/src/services/agent-import.ts` — registry ownership proof, EIP-712 consent, canonical-atom preflight, link plan/simulate/submit.
- `app/src/services/__tests__/agent-import.test.ts` — 32 hermetic + 2 opt-in live (`ERC8004_LIVE=1`) against the real Base registry.
- `app/src/hooks/use-agent-import.ts` — callbacks only; nothing runs on mount or navigation.
- `app/src/pages/AgentImport.tsx` — `/agent/import`, three click-gated steps.
- `app/src/services/erc8004-connector.ts` — `erc8004RegistryClient()` / `erc8004GraphClient()`, single-source.
- `erc8004/src/index.ts` — exports `INTUITION_SAME_AS_TERM_ID`.
- `.claude/choices/0026-import-links-the-agent-to-its-operating-account.md`.

## Surprises

- **The combined `Erc8004Client` cannot answer either import question.** `resolveAgent` returns the first source that answers; that is the graph, whose `owner` is always `null`, so ownership would read as "cannot tell" for every Base agent. And `sourceHandle` is source-scoped — registry puts `8453:0x8004…:2340` there, graph puts the atom term id. Two single-source clients were required, not a convenience.
- **The CAIP-10 casing split inverts on the chain that matters.** Globally 4,833 of 5,003 `caip10:eip155:…` atoms checksum the address; narrowed to chain 1155, 34 of 45 are lowercase. The first answer was decided on the aggregate and was wrong (fixed in `ffc7796`). Measure on the chain you write to.
- **`createTriples` cannot be simulated before its object atom exists** — reverts `MultiVault_TermDoesNotExist(bytes32)` (`0x4762af7d`). Hence the `deferred` verdict and the second simulate inside `submitOperatorLink`.
- **The stake the link is meant to attribute is not on the link's chain.** `caip10Uri` in `delegation-redeem.ts` defaults to `intuitionTestnet.id` (13579); the link lands on 1155. See "Suggestions".

## Decisions made

- **`same as` against the operating account's CAIP-10** — the settled design question. ADR: `.claude/choices/0026-import-links-the-agent-to-its-operating-account.md`. `created by` was the closest competitor (all 98 indexed mainnet agents carry it) and was rejected twice over: its object needs a `pinThing` (server-side only, ADR 0016) and it names the registration owner, not the account that sends the stake.
- **EIP-712 domain with no `verifyingContract`** — a deliberate break from `security.md`'s "nonce + chainId + verifying contract". Recorded in the code at `agent-import.ts:importConsentDomain`, naming the rule. No contract consumes the signature, so the cross-contract replay surface the clause guards does not exist; the fields that matter (agent, operator, operatingAccount) are inside the signed struct.
- **Ownership is the registry read; the signature is consent** — kept distinct throughout, in the service docstring, the ADR and the page copy.

## Rules touched

- `.claude/rules/code.md` — sufficient. One `as Hex` cast, commented; no `any`, no dead code, no default exports.
- `.claude/rules/ui.md` — sufficient. Typography-driven, hairline rules, mono for hashes, no gradients / `rounded-*` / shadows / emoji. `--color-alarm` correctly withheld per ADR 0018 (`a39a914`).
- `.claude/rules/security.md` — sufficient with one recorded break (above). No secrets, no deployment, reads free.
- `.claude/rules/workflow.md` — sufficient. Conventional atomic commits, nothing pushed, no branch operations.

## Suggestions for future tasks

- **The chain seam is the next task, and `docs/12` already names it** — "the guard rail on the chain where the agents are: missing". The import's link is on 1155; `delegation-redeem.ts` stakes on 13579; `trust-stake.ts` deposits on 1155 but from the EOA, not the Smart Account the link names. Until the delegation flow redeems on 1155 as the Smart Account, the published edge points at an account that sends nothing on that chain. Task 11 could not close this — its Out of scope forbids the mainnet module surface — but nothing downstream should assume attribution works end to end yet.
- **Add the above to ADR 0026's Consequences.** The ADR is otherwise unusually candid and this is the one consequence it does not name; two sentences, no new decision.
- **Repo-root `bun run test` exits 1 for a pre-existing reason** — `sdk/package.json` declares `vitest run` and `sdk/` has no test files. Unrelated to this branch (`sdk/` last touched by `38dbbef`). Either add a test or drop the script; do not let it train anyone to ignore a red root suite.
- **`app/src/pages/AgentRegister.tsx` is not prettier-clean and was not before this task.** Reformatting it is a standalone chore, not a rider on the next feature. Same for the empty `<ul></ul>` at line 637.
- **Static source assertions earn their place for "we do not do X" invariants.** The `mints nothing` block greps `agent-import.ts` for forbidden imports — it catches the regression a runtime test would not, because the regression is an import someone adds later.
