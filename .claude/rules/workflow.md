# Workflow rules

Load at the start and end of **every** task.

## Scope discipline

The MVP scope is in `docs/03_MVP_SCOPE.md`. If a task seems to need something outside that scope, **stop and ask**.

Drift signals — when you catch yourself thinking any of these, stop:

- "while we're at it, let's also…"
- "it would be better if we also…"
- "this is a good opportunity to refactor…"
- "I noticed we could easily add…"
- "let me make this more flexible for the future…"

Every signal triggers a stop. Either the user authorizes the scope expansion explicitly, or the idea goes in a `FUTURE.md` for later.

## Git hygiene

- **Conventional commits.** `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. Scope prefix when useful: `feat(contract): …`.
- **Atomic commits.** One logical change per commit. Tests that go with a feature ship in the same commit as the feature.
- **No "fix typo" commits after the fact.** Either squash before the PR is up, or live with it.
- **No `--no-verify`.** If a hook fails, fix the underlying issue.
- **No force-push to `main`.** Force-push to feature branches is fine.

## Communication style (when reporting to the user)

End-of-task report has three parts and no more (four for hackathon tasks — see below):

```
**What shipped**
<one sentence, concrete: file paths, line counts, deployed address, etc.>

**What I decided**
<any non-obvious choice, with the one-sentence reason. If nothing non-obvious, write "nothing notable".>

**What's next or blocked**
<the next logical task, or what the user needs to unblock>
```

### Hackathon-task addendum (Tasks 02b, 03b, 04b, 05b only)

For tasks tied to the MetaMask Dev Cook-Off submission, add a fourth bullet:

```
**Does this preserve the hackathon submission narrative?**
<one sentence: yes/no, with reasoning. Reference the narrative in docs/00_HACKATHON_PIVOT.md.>
```

If the answer is "no", the implementation has drifted and must be reviewed before merging. The `task-verifier` agent checks this answer is present and substantive on hackathon-tagged tasks.

Do not:
- Write multi-paragraph narratives unless asked.
- Use emoji.
- Use excessive bold.
- Apologize for reasonable choices.
- Hedge ("I think maybe...").
- Restate the task back before doing it.
- Write filler ("I'll now proceed to...").

## Task verification protocol (mandatory)

A task is **not** complete until the `task-verifier` agent has returned a pass. The protocol:

1. Finish the implementation work.
2. Run any task-specific checks listed in the task file (tests, coverage, lint).
3. Invoke the `task-verifier` agent with the task file path and a summary of what was produced.
4. The agent reads the task spec, the rules, and the deliverables, then returns pass/fail + reasoning.
5. If fail → fix and re-run from step 3. Do not declare done.
6. If pass → write a post-mortem entry in `.claude/learning/` using the template.
7. Mark the task file with a completion note (date, commit SHA, post-mortem reference).

The `task-verifier` is in `.claude/agents/task-verifier.md`.

## Recording decisions

If during a task you make a non-obvious decision (a design tradeoff, a deviation from an obvious approach, an architectural choice not pre-specified), write an ADR in `.claude/choices/` using the template. Reference the ADR in the task's post-mortem.

Examples of "non-obvious" worth recording:
- Choosing one library over another that was also viable.
- Picking an algorithm with a particular tradeoff (e.g., O(n) write for O(1) read).
- Deciding the boundary between two layers.
- Deviating from a rule (with justification — rules can be broken with cause, but the break must be recorded).

Things **not** worth an ADR:
- Standard patterns from the rules or the docs.
- "I named this file X." Trivial.
- Bug fixes where the right answer was obvious.

## Asking for clarification

Stop and ask, do not guess, when:

- A task file contradicts an architecture doc.
- The user's instruction would expand scope.
- An Intuition atom schema or integration detail is ambiguous.
- The deployment target is ambiguous (default Base Sepolia, but confirm if mainnet is implied).
- A rule and a task spec disagree.

Ten minutes of clarification saves a day of rework. The cost of asking is near zero. The cost of guessing wrong is the cost of the rework plus the trust damage.
