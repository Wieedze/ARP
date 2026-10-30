# 20 — ARP serves the content and signs the access

**Task:** `tasks/31-arp-serves-the-content-and-signs-the-access.md`
**Completed:** 2026-10-29 (built, reviewed and closed the same day)
**Commit:** `0bc29d8`..`280fd4c` on `feat/agent-panel-tabs`
**Verifier verdict:** PASS — fourth pass. Three FAILs first, nine blockers across them, and
**not one was a crash.** See "Surprises", which is the finding of this task.

## What shipped

- `packages/protocol/src/receipt.ts` — EIP-712 content receipts. `signContentReceipt`,
  `verifyContentReceipt`, `receiptMatchesContent`, `corroborationOf`, `recoverContentRequester`.
  Takes a signer as an argument, so the module cannot sign without being handed the ability
  (ADR `0038` unamended). 40 tests.
- `packages/protocol/src/content-path.ts` (21 tests) and `content-serve.ts` (21 tests, every piece
  of IO injected) — which file inside a repository an atom refers to, and the eight refusals.
- `scripts/arp-content.ts` — the transport: the key, the listing cache, the two fetches, the HTTP.
  `scripts/arp-mcp-server.ts` gained `GET /content/:atomId` and `arp_declare_session`.
- `scripts/arp-fetch-skill.ts` + `refForInvocation` in `session.ts` — the hook fills `ref` from the
  fetch, which turns six candidates into one for `product-photography`.
- `scripts/verify-content-route.ts` — walks it end to end: the digest a receipt carries is what
  `sha256sum` prints on the downloaded file.
- `scripts/measure/skill-layouts.ts` + `data/measurements/skill-layouts-2026-10-29T2200.json` — 19
  layouts over 31 repositories, 8 using more than one, **521 of 662 skills servable**.
  `data/measurements/skill-layouts-2026-10-29.json` is kept as the record of a wrong first run
  (ADR `0064`).
- `scripts/measure/catalogue-atom-ids.ts`, `scripts/measure/node-outbound.ts` and their
  measurements.
- ADR `0080`, `docs/14`'s amendment (four limits, two ladder rows), `docs/22_RUNNING_THE_NODE.md`.
- Security, found while writing `docs/22` rather than while writing code: the node bound every
  interface (`Bun.serve` with no hostname) and two routes fetched a caller-steerable URL.
  `127.0.0.1` by default, and `fetchableDocumentUrl` + `nextDocumentHop` in
  `packages/protocol/src/verify/probe.ts` — 24 tests for the two new guards, 53 in that file.

Gates at verification: `check:scripts` 0, protocol lint 0, **642 passed / 4 skipped**. Nothing in
this task touches `app/`. Nothing was signed or sent on any chain; the receipt key signs EIP-712
structs and the only struct it is handed is a receipt.

## Surprises

**Nine blockers across four review rounds, and not one was a crash.** Every single one was a claim
that could not be wrong, a label that reported the strongest verdict for the weakest case, or a
sentence corrected in five places out of six. Four rounds of care were applied by a careful author
and the class kept reproducing — including twice **inside the fix for the same class**: a paragraph
reading "that is the fourth limit below" placed above a list that said "Three limits", and a
replacement for one falsifiable security claim that was itself a second falsifiable security claim.

**The contrast that explains it, and it is the lesson.** Every figure re-derived from a committed
measurement was exact on the first try, in both verification rounds that checked it — 475/48/46/139
and 19/8/95 out of `skill-layouts-2026-10-29T2200.json`, the 40/21/21 test counts, 6 literals and 6
outbound sites out of `node-outbound-2026-10-29.json`. Every hand-maintained figure was wrong in
both rounds — four fixed hosts, six URL literals, three drift signals, two additions, three limits,
25 tests, 0 of 601, "in progress". **The variable is not care. It is whether a number has a script
behind it.**

**What changed the outcome was structural, not more discipline.** Round four turned the claim into
`scripts/measure/node-outbound.ts`, and writing it found two of its own defects before it found
anything else: the first version listed the node's own inbound handler as an outbound connection,
and missed the probe's real fetch because that goes through `doFetch`. Adding `kind` labels caught a
third immediately — the classifier called the stdio loop's self-dispatch `outbound`.

**Writing the install-facing document is what found the security defects.** Not a review, not a
scan: enumerating "every outbound connection" for a stranger. `Bun.serve` binding every interface,
`ipfs.io` as an undisclosed fifth host, a second caller-steerable fetch with no guard at all, and
then `file:///etc/passwd` reading the disk through it (measured: 200, contents returned). The
document was not a deliverable. It produced four code changes.

**`corroborationOf` reported two parties where one hand held three keys.** The node an operator
installs generates its own key, so its address differs from that operator's agent key while the same
hand holds both. Comparing keys cannot settle a question about hands, and no better comparison can:
the first version labelled every locally-served receipt `second-party`, and `self-signed` was
unreachable except by deliberately pointing `ARP_RECEIPT_KEY` at the declaring key. The fix was to
make the reader's acceptance a parameter — `ARP_ACCEPTED_SIGNERS`, empty by default, so the honest
answer is `unknown-signer`.

**A guard on hop one is not a guard.** `fetch` follows redirects itself, so a caller-controlled
**public** host answering `302 Location: http://169.254.169.254/latest/meta-data/` returned the
private body — no DNS control needed, so the documented "resolves to a private address" caveat did
not cover it. `arp_agent_endpoints` now follows redirects by hand, every hop through the same check.
`arp_probe_endpoint` has the same exposure and is **a known open hole**, disclosed as one in
`docs/22` and scoped as a task in `FUTURE.md`, because a refused redirect has to mean something in
its `live`/`dead`/`inconclusive` vocabulary and that needs an ADR.

**The resolver could not be a formula, and the measurement that proved it produced a better signal
than the resolver.** 139 of 662 catalogued skills have no file at HEAD, and 95 of those sit in a
repository with no uncatalogued directory the name could have been renamed to. That is a per-skill
liveness signal one listing request re-derives, which is sharper than `archived` — per skill rather
than per repository, and not the owner's own word. Whether it goes on chain is not decided here.

## Decisions made

- **The node may hold a key, and that key signs receipts and nothing else.** Six constraints.
  ADR `.claude/choices/0080-the-node-signs-for-what-it-served-and-for-nothing-else.md`.
- **EIP-712, not the EIP-191 the task sketched.** An atom id is a pure function of its URL
  (ADR `0054`), so the same tool has the same id on 13579 and 1155; only a signed domain separates
  them. There is a test for that replay. ADR `0080`.
- **Both kinds of node sign, and the reader decides which signers it accepts.** The user's
  decision, asked as a choice of three. The ADR's own headline — "the receipt says which" — is
  amended in place as wrong, because it cannot.
- **`ARP_TARGET` stays mainnet-first.** Pre-existing (`be5bf85`, 2026-10-19) and not this task's to
  change; a mainnet node holds zero catalogued skills and refuses with the reason, so no receipt can
  carry `chainId: 1155`. Argued in the commit messages.
- **The registration route's redirect fix was taken here; the probe's was not.** The scope argument
  was about `probeEndpoint`'s verdict vocabulary, and the registration route has none — it fetches a
  document, and a document that redirects to a private address is not one anybody published. The
  split was the verifier's recommendation corrected by the author, and the correction was right.
- **Recording the 61 missing atom ids is a new task**, in `FUTURE.md`: it is a write, and the
  blocking question is classification.

## Rules touched

- `.claude/rules/claims.md` — **sufficient and insufficient at once.** Its five checks caught or
  described eight of the nine blockers after the fact, and §5's last line ("re-check a retraction
  the way you would check the claim") named the two failures committed inside fixes. What no check
  covers is a claim that is **right and unverifiable by the reader it was written for**. Proposal
  below; **no rule file was edited** — that needs an ADR and the user's decision.
- `.claude/rules/portability.md` — sufficient, and rules 1 and 3 were both broken by one line
  (`data/catalogue/skills-13579.json` imported at module scope in a process whose chain is configurable,
  on a chain where a create pair costs 0.22 TRUST against 0.004). The rule said exactly what was
  wrong; nobody read it at that line.
- `.claude/rules/code.md` — sufficient. "A function shipped without tests is not done" is what
  rejected a guard added inline at a call site the harness cannot stub, and the fix was to extract
  it into the package where it could be tested.
- `.claude/rules/security.md` — its signature-replay bullet asks for nonce + chainId + verifying
  contract; the third is absent with cause and the ADR records why. No change needed.
- `.claude/rules/workflow.md` — sufficient. Step 8 is what caught `STATE.md`'s row saying "in
  progress" and "all seven done" in one cell.

### Proposed sixth check for `claims.md` — for the user, not applied

> **A claim offered to a stranger as checkable ships with the command that checks it, and the
> command's scope is verified against the claim's scope before the claim is written down.**

The existing five checks all catch a claim that is *wrong*. This one catches a claim that is *right
and unverifiable by the reader it was written for*, which is the failure that reproduced three
rounds running in `docs/22` and which none of the five names.

**The scope clause is the load-bearing half.** Round three's claim — "the node's own modules carry
six URL literals" — was **true**, and measurable: exactly six in the three node scripts. The grep it
shipped to prove it, `grep -rn "https\?://" scripts/`, returns **116 lines across 31 hosts**,
because the command's scope was a directory and the claim's scope was three files. A reader who ran
it concluded the document was wrong. The claim and its check must have the same scope, and the check
is what gets read.

It is satisfied by committing a script plus a `data/measurements/` file and citing them — the habit
`claims.md` already recommends as "commit the script, not the number". This would make it a
**requirement** for the subclass where a stranger is being asked to trust us, which is exactly where
this repo's own argument says an assertion is worth least.

## Suggestions for future tasks

- **Write the operator-facing document before the code is called done, not after.** It produced four
  code changes here and two of them were live defects. A document that enumerates something for a
  stranger is a test with prose for an oracle.
- **A count has more copies than it looks like.** A title, a gate, a status line, a table row and a
  forward reference are five sites for one number. `STATE.md`'s task-table cell had accreted through
  three rounds and disagreed with itself in the same sentence; rewriting it whole was the fix, and
  appending a fourth time was the defect.
- **A verdict that cannot be wrong is a defect, not a feature.** Three blockers were this shape:
  `corroborationOf` returning `second-party` for every receipt, `arp_declare_session` comparing
  against `receipt.to` so `served === declarer` held by construction, and a guard on hop one. The
  test that catches it asserts the **absence** of the strongest verdict in the weakest case.
- **When a guard's docstring assigns work to its callers, check every caller took it up.**
  `privateProbeTarget` said "the caller's own URL check is what refuses it" and one of two callers
  did not, which is how `file://` reached `fetch`.
- **Run the domain reviewer before the verifier, never alongside.** `intuition-integrator` returned
  FAIL with three blockers that the verifier would otherwise have spent a whole pass on — the same
  lesson `tasks/15` recorded and `workflow.md` already states.

## Evidence ladder

`docs/09` §3 — asserted, rated, staked, proven. A declaration today is **staked**: somebody paid to
say it. This makes a rung above it **available** for the population that comes through a node, and
does not reach it: what becomes provable is the **access**, not the use. And in the shipped
configuration nothing has climbed even that — `ARP_ACCEPTED_SIGNERS` is empty by default, so every
receipt reads as `unknown-signer` and lands where a self-report lands. `docs/14`'s ladder now carries
both rows, non-adjacent, with the unrecognised-signer one below "only the tool declares", because by
that document's own principle a third party's word outranks the agent's word in a second place.
