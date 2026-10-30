# 13 — Tabs on the agent panel, one per provider

**Task:** `docs/tasks/12-agent-panel-tabs.md`
**Completed:** 2026-09-17
**Commit:** `7146d8d` (branch `feat/agent-panel-tabs`, 5 commits from `de8ea64`)
**Verifier verdict:** PASS (second pass; first pass held on an open `ui-reviewer` gate, not on code)

## What shipped

**Service (pure, tested)**

- `app/src/services/agent-trust.ts` — `shouldUseTabs`, `buildPanelTabs`, `selectPanelTab`,
  `TabSummary`, `PanelTab`, `AGENT_TAB_SLUG`, `ARP_TAB_SLUG`. Appended only; zero removed lines, so
  nothing about what a verdict means or how a score is computed moved.
- `app/src/services/__tests__/agent-trust.test.ts` — 11 new cases across three describes.

**UI**

- `app/src/components/agent/TrustPanelTabs.tsx` — the strip. Pure presentation over props, owns no
  state.
- `app/src/components/agent/tab-ids.ts` — `tabDomId` / `panelDomId`. Exists so the strip and the page
  cannot drift on the `aria-controls` / `aria-labelledby` pairing, which they render separately.
- `app/src/components/agent/UnreadSources.tsx` — extracted so the tabbed and stacked paths share one
  list.
- `app/src/components/agent/evidence-scale.ts` — `EVIDENCE_TONE_CLASS`, the evidence scale at label
  size: three tiers, tone and weight, no size.
- `app/src/pages/AgentTrustPanel.tsx` — split into `TabbedClaims` / `StackedClaims`.
- `app/src/components/agent/StakeControl.tsx` — heading names the provider and spells out the claim.

## Surprises

- **Grepping for a CSS declaration does not tell you whether it applies.** Two defects on this task
  came from the same blind spot, in opposite directions. A plain `border-0` on a tab was inert
  because `index.css` styles every `button` in an *unlayered* rule and an unlayered normal
  declaration beats every layered utility regardless of specificity — fixed with `border-0!`, since
  an important layered declaration does win. The same cascade fact rescued the focus ring: the build
  does emit a `.focus\:outline-none`, but it sits in `@layer utilities` and loses to the unlayered
  `button:focus-visible` / `[tabindex]:focus-visible` outline. The Task 08 repair note in the task
  spec ("check it is still fixed") is satisfied, but not for the reason a grep would suggest. Verify
  cascade questions against the emitted stylesheet, by layer, not by grep.
- **A tab switch can carry live money state across.** Without `key={row.id}` on `AssessmentRow`,
  React reuses the instance and `StakeControl` keeps the quote it built for the previous provider's
  claim. Caught during implementation, but it is the kind of defect a tabbed rewrite invites and
  nothing in the test suite would have found it.
- **ADR numbers collide across concurrent branches.** The tab-strip ADR was written as 0027 and had
  to be renumbered to 0028 mid-task because another branch had already taken 0027 that day. The
  renumber had to reach the cross-reference inside `TrustPanelTabs.tsx`, not just the filename.

## Decisions made

All five in `.claude/choices/0028-tab-strip-carries-the-comparison.md`:

- **The summary lives in the tab labels, and carries no score** — name, signature verdict, reviewer
  count. A strip of scores would rank providers by exactly the variable ADR 0018 argues is not the
  measure, in the one component visible from every tab.
- **ARP gets a tab** — its abstention only reads as a position if it sits where a position sits.
- **The strip appears at two or more providers** — below that there is no comparison to preserve, and
  one provider covers 99.99% of the cohort, so almost every agent keeps the stacked layout.
- **Default tab is the largest published reviewer count**, `Agent` when none publishes one.
  Deliberately not the highest score.
- **The alarm colour extends to a mismatched provider's tab** — an application of ADR 0018's "the
  left rule on the row carrying it" to the control that now hides that row, not a new use.

## Rules touched

- `.claude/rules/ui.md` — sufficient. Anti-templates, hairline borders, mono-for-data, AA contrast
  and focus visibility all bit on this task and all gave the right answer.
- `.claude/rules/code.md` — **wrong about one thing in practice.** It requires "Hooks and components:
  tested behaviorally, not by checking implementation details. React Testing Library or equivalent."
  The repo has no component test infrastructure at all — `app/vitest.config.ts` is
  `environment: "node"` with `include: ["src/**/*.test.ts"]`, and there is no testing-library, jsdom
  or happy-dom in the dependency tree. So the rule is currently unsatisfiable and was silently not
  applied. Not a Task 12 defect (the task explicitly directed the logic into the service layer, and
  it went there), but the rule and the repo disagree and one of them has to move.
- `.claude/rules/workflow.md` — sufficient.

## Suggestions for future tasks

- **Specify a task for component test infrastructure, and write the ADR that goes with it.** The
  arrow-key handler is index arithmetic with wraparound across two axes plus Home/End, and nothing
  exercises it. The acceptance criterion "arrow-key navigation works, focus is visible" currently
  rests on a manual keyboard pass that no one in this environment can perform. Either add jsdom +
  testing-library, or amend `code.md` to say component behaviour is verified by review — but stop
  carrying a rule the repo cannot honour.
- **Specify a task for `--color-fg-40`.** It computes to 3.66:1 over `--color-bg`, under the AA floor
  of 4.5:1, and is paired with `--text-label` in roughly twenty pre-existing places including the
  `Layout.tsx` footer. Task 12 correctly introduced no new instance and correctly left the rest
  alone.
- **On any cascade question, read the built stylesheet and resolve the layer.** Cheap, decisive, and
  it would have prevented both of this task's review findings.
- **Check `.claude/choices/` for the next free number at commit time, not at drafting time**, when
  more than one branch is live.
- **Reconcile the identity-registry ABI.** Unrelated to Task 12, but commit `502a010` rode this
  branch and records that `totalAgents()` reverts on the canonical implementation because the ABI was
  written against the ChaosChain reference. It is a live defect with no task against it.
