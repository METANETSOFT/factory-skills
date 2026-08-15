# Anti-slop

The measured structural checkpoint. Every other rule in the factory is prose you can rationalise away at 80% context; this one is `slop.mjs` exiting 1.

## Why this is a command and not a resolution

SlopCodeBench (arXiv:2603.24755) chained each agent's own output forward across 93 checkpoints instead of resetting to a gold patch. Structural erosion rose in **80%** of trajectories and verbosity in **89.8%**; high-complexity function counts climbed 4.1 → 37.0 on average, and one Opus 4.6 `main()` went from cyclomatic complexity 29 to **285** (84 → 1,099 lines) across eight checkpoints — 2.9× the cost, no correctness gain.

They then tried the obvious fix: an `anti_slop` prompt, a well-written instruction block much like this one. It lowered initial verbosity by ~34% and reduced erosion on all 20 problems. **Then degradation resumed at exactly the same per-bin rate** — for +47.9% spend, no significant pass-rate change, and one problem where the pass rate *fell* from 37.2% to 27.1%.

Instructions move the intercept, not the slope. So everything below is tied to a command that runs or a number with a threshold. Prose is reserved for the judgement calls that genuinely cannot be mechanised.

## The three runs

```bash
node ${CLAUDE_SKILL_DIR}/scripts/slop.mjs baseline        # record this project's line
node ${CLAUDE_SKILL_DIR}/scripts/slop.mjs check           # compare, verdict, exit 1 on breach
node ${CLAUDE_SKILL_DIR}/scripts/slop.mjs scan --top 20   # ranked callables, no verdict
```

| Run | When | Failure it prevents |
|---|---|---|
| `baseline` | once during [init.md](init.md), before the first slice — and again **only** after a refactor the user has accepted, or after merging a large body of foreign code | drift measured against a line that no longer describes the project, which silently makes every later `check` meaningless |
| `check` | before you call a slice done, and again over the whole diff at `review` | per-slice erosion that is invisible in any single diff and undeniable across eight of them |
| `scan --top N` | mid-slice, when you want the heaviest callables ranked without a pass/fail | guessing which function to consolidate, and consolidating the wrong one |

Three standing rules about the runs themselves:

- **Re-baselining to clear a breach is metric laundering.** If a breach is real and you intend to accept it, record a ruling (Law 8); do not move the line.
- **Do not pass path arguments** to narrow the scan away from what you touched. The score is only meaningful over the same set as the baseline.
- `check` reads `.factory/slop-baseline.json`. If it reports *no baseline recorded*, that itself is the breach — init was skipped, and nothing about this session's drift is knowable until you fix it.

If a session keeps landing on `CONSOLIDATE`, stop relying on memory: `node ${CLAUDE_SKILL_DIR}/scripts/hooks.mjs on` installs the Stop-gate so the harness enforces the check rather than you remembering it.

## Reading the numbers

`erosion` = share of total complexity mass sitting in functions with CC > 10. `verbosity` = (flagged lines ∪ duplicated lines) / LOC.

| | erosion | verbosity |
|---|---|---|
| maintained human repos | ~0.31 | ~0.11 |
| agent drift, measured | ~0.68 | ~0.32 |
| **session limit** (delta vs *your* baseline) | +0.05 | +0.03 |

Read the delta first and the absolute second. A legacy codebase can sit well above the human reference and still be entirely fine to work in; the question `check` answers is whether **this session made it worse**. The absolute figures only breach at the agent-drift line, because that is the point at which the code has been shaped by compounding rather than by anyone's intent.

Two hits are automatic breaches whatever the numbers say: a `placeholder` hit is Law 4 mechanised, a `rest-unchanged` hit is Law 2 mechanised.

## What a CONSOLIDATE verdict obliges

`check` prints `PASS` or `CONSOLIDATE` and exits 1 on the latter. `CONSOLIDATE` is not advice.

1. **Stop.** No new feature, no next slice, no "I'll clean it up at the end". The end is where this compounds.
2. Take **one** consolidation pass over the heaviest callables `check` named. One — an open-ended cleanup loop is its own failure mode and burns the slice budget.
3. Report **lines deleted**, not lines added. A pass that nets positive did not consolidate anything.
4. Re-run `check`.
5. If it still breaches and you judge the remainder acceptable, record a ruling with its cost-if-wrong and continue (Law 8). A parked session costs the user their day; a recorded wrong ruling costs rework they can see.

Write the pass into the ledger in this exact shape, then `state.mjs note decision "<the same, one line>"`:

```
CONSOLIDATION PASS — <slug>, slice <n>
  trigger:  <breach line copied verbatim from `slop.mjs check`>
  targets:  <fnName  file.ts:120  CC 34 → 9>
            <fnName  file.ts:288  CC 21 → 7>
  deleted:  <N> lines
  added:    <M> lines            # M < N, or this was not a consolidation
  recheck:  PASS | CONSOLIDATE (<remaining breach>) + ruling recorded
```

## The eye-only checklist

The detector under-flags on purpose — a false positive costs a pointless refactor. So it catches half of these and cannot see the other half. Run the whole column against your own diff *before* `check`, not after.

| Pattern | Detector | Do instead |
|---|---|---|
| try/catch that only rethrows | `rethrow-only` | delete it — the exception was already propagating; the block adds noise, not handling |
| swallowed exception (empty catch, `except: pass`) | `empty-catch` | handle it or let it propagate; a silent failure is worse than a loud one |
| cast that dodges the type checker (`as any`, `@ts-ignore`, `# type: ignore`, blanket `eslint-disable`) | `any-cast` | satisfy the type. A suppressed check is a bug with a lid on it, and it is a documented agent behaviour, not an accident |
| step-by-step narration comment (`// Step 1:`, `// Now we…`) | `narration-comment` | delete. Reviewers read these as a machine-authored tell and distrust the entire PR |
| emoji in a code comment | `emoji-comment` | delete. Reported verbatim by reviewers: "if the comment has an emoji it's a guarantee" |
| `TODO: implement`, stub returning a fake value | `placeholder` | Law 4 — out of scope is Law 3 (name it unfinished), never a stub |
| `// ...rest of the file unchanged` | `rest-unchanged` | Law 2 — a token limit means a handoff, not an abridged file |
| `sleep(2000)` over a race | `sleep-bandaid` | find the real ordering constraint; timing band-aids fail on someone else's machine |
| **single-use variable** | none | inline it, unless the name is the explanation |
| **trivial wrapper / pass-through module** | none | run the deletion test: delete it in your head. Complexity vanishes → it was a pass-through. Reappears at N callers → it earned its keep |
| **deep nesting** | none | invert the conditions and return early |
| **if/else ladder** | none | a map/table lookup, or polymorphism, when every branch varies on one value |
| **god function** | mass ranking only | split at the seams [program-design.md](program-design.md) already named — not at an arbitrary line count |
| **comment a human would not write** (`// increment i by 1`, a docstring restating the signature) | none | delete. Comments carry *why*; the code already states *what* |

## Numeric constraints, which replace the adjectives

"Simple", "clean" and "readable" are unmeasurable and get argued away under pressure. These do not.

| Constraint | Limit | Failure it prevents |
|---|---|---|
| function length | 50 lines | the 84 → 1,099 line `main()`, one accepted addition at a time |
| cyclomatic complexity | 10 per callable | above it the function starts contributing to the erosion score by definition |
| nesting depth | 3 | the branch nobody can hold in their head, therefore nobody reviews |
| new abstraction | ≥ 2 real call sites | one adapter is a hypothetical seam; two is a real one. Speculative seams are pure interface cost |
| error handling | top-level try/catch only, unless `PROGRAM-DESIGN.md` named the error mode | speculative catch blocks are the largest single source of complexity nobody requested |
| parameters | 4 per function | a fifth parameter is a struct the design failed to name |
| slice diff | ≤ 500 lines | teams decline review above it, and unreviewed is unverified |

If the design specified something that breaks one of these, the design wins — say so in the ledger. The failure is the silent violation, never the argued exception.

## The deletion budget

GitClear's 211M-line study: duplicated blocks grew 4–8×, while "moved lines" — the consolidation signal — fell from 25% of changes in 2021 to under 10% by 2025. Agents add and do not consolidate. So:

- Every slice reports `+added / -deleted`. `git diff --shortstat` is sufficient; state both numbers in the slice report.
- A slice that adds > 200 lines and deletes 0 gets checked by hand for the copy it made instead of the call it should have made. The duplicate detector matches 6-line shingles; a paraphrased copy passes straight through it.
- A bug fixed in duplicated logic is not fixed until every copy is repaired or deleted.

## Honest limits — state these whenever you report a score

- Complexity here is **keyword counting** over brace- and indent-delimited bodies, not a parser. It is a trend instrument. One absolute number is not a verdict; the comparison against the project's own baseline is the whole signal.
- Test files are excluded deliberately — their branchiness is legitimate and would mask erosion in shipping code. Test subversion is a separate failure with its own taxonomy and belongs to [verify.md](verify.md).
- Only source extensions are scanned. Templates, SQL, CSS, config and generated code are invisible to it.
- **A good score is never evidence that the code works.** Erosion measures shape, not behaviour. "PASS, so the feature works" is a Law 1 violation with a number attached to it, which makes it more persuasive and no more true.
- Do not write code to please the metric. These limits correlate with maintainability; 0.31 is not a virtue.

## Exit condition

Before a slice is closed in [implement.md](implement.md) or `review` reports:

- [ ] `slop.mjs check` run **in this message**, exit 0 — or exit 1 with a consolidation pass completed and its deleted-line count in the ledger, or a recorded ruling accepting the remaining breach.
- [ ] Every eye-only row above checked against this session's diff.
- [ ] Lines added **and** lines deleted both stated in the slice report.
- [ ] No cast-suppression, placeholder or truncation marker introduced by this session.
