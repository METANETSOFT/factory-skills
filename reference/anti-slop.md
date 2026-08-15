# Anti-slop

Slope control for structural decay. Half of this file is a command with an exit code; the other half is a column you check by eye, because the detector under-flags on purpose — a false positive costs a pointless refactor, so it catches roughly half of what matters and is blind to the rest. Running `check` and skipping the eye column is the documented way to pass this gate with slop in the diff.

## Why the guarantee is a command and not a resolution

SlopCodeBench (arXiv:2603.24755) chained each agent's own output forward across 93 checkpoints instead of resetting to a gold patch. Structural erosion rose in **80%** of trajectories, verbosity in **89.8%**; high-complexity function counts climbed 4.1 → 37.0 on average, and one Opus 4.6 `main()` went from cyclomatic complexity 29 to **285** (84 → 1,099 lines) across eight checkpoints — 2.9× the cost, no correctness gain.

They then tried the obvious fix: an `anti_slop` **prompt**, a well-written instruction block much like this one. It lowered initial verbosity ~34% and reduced erosion on all 20 problems, **and degradation then resumed at exactly the same per-bin rate** — for +47.9% spend, no significant pass-rate change, and one problem where the pass rate *fell* from 37.2% to 27.1%. Instructions move the intercept, not the slope. So every guarantee below is tied to a run, a threshold, or a count you must state; prose is reserved for judgement that cannot be mechanised.

## The three runs

```bash
node ${CLAUDE_SKILL_DIR}/scripts/slop.mjs baseline        # record this project's line
node ${CLAUDE_SKILL_DIR}/scripts/slop.mjs check           # compare, verdict, exit 1 on breach
node ${CLAUDE_SKILL_DIR}/scripts/slop.mjs scan --top 20   # ranked callables, no verdict, exit 0
```

| Run | When exactly | Failure it prevents |
|---|---|---|
| `baseline` | once during [init.md](init.md), before the first slice; again **only** after the user accepts a refactor, or after an import that moves the `LOC` line by more than 20% | drift measured against a line that no longer describes the project, which silently makes every later `check` meaningless |
| `check` | before you close a slice, mid-phase after any slice adding >300 lines ([implement.md](implement.md)), over the whole diff at `verify`/`review` ([verify.md](verify.md)), and **every pass** inside a `loop` ([loop.md](loop.md)) | per-slice erosion that is invisible in any single diff and undeniable across eight of them |
| `scan --top N` | mid-slice, to rank the heaviest callables without a pass/fail | consolidating the wrong function because you guessed which one was heavy |

Three standing rules about the runs themselves:

- **Re-baselining to clear a breach is metric laundering.** If a breach is real and you intend to accept it, record a ruling (Law 8); do not move the line.
- **Pass no path arguments.** `baseline` scanned the whole root, so a narrowed `check` compares two different populations and the delta is arithmetic on unrelated numbers.
- `check` reads `<workspace>/slop-baseline.json`. *No baseline recorded* is itself a breach — init was skipped, and nothing about this session's drift is knowable until you run `baseline`.

If a session keeps landing on `CONSOLIDATE`, stop relying on memory: the Stop-gate hook in [hooks.md](hooks.md) makes the harness run the check instead of you remembering to.

## Reading the numbers

`erosion` = share of total complexity mass in functions with CC > 10. `verbosity` = (flagged lines ∪ duplicated lines) / LOC. Output shape, so you can quote a breach instead of paraphrasing it:

```
erosion   0.412   (human repos ~0.31, agent drift ~0.68)
verbosity 0.180   (human repos ~0.11, agent drift ~0.32)
vs baseline (2026-08-15T09:12:44Z):
  erosion   +0.061      verbosity +0.012      LOC +430
CONSOLIDATE
  - erosion rose 0.061 since baseline (limit 0.05)
heaviest callables (complexity mass):
  CC  41   214 sloc  handleRequest  src/api/router.ts:120
flagged patterns: any-cast×3  narration-comment×2
```

| | erosion | verbosity |
|---|---|---|
| maintained human repos | ~0.31 | ~0.11 |
| agent drift, measured | ~0.68 | ~0.32 |
| **session limit** (delta vs *your* baseline) | +0.05 | +0.03 |

**Read the delta first, the absolute second.** A legacy codebase can sit far above the human reference and be entirely fine to work in; the question `check` answers is whether *this session* made it worse. The absolutes only breach at the agent-drift line — the point at which shape was set by compounding rather than by anyone's intent.

The six breach conditions, all of which exit 1:

| Breach | Meaning |
|---|---|
| erosion delta > +0.05 | this session concentrated complexity |
| verbosity delta > +0.03 | this session added noise or duplication |
| erosion > 0.68 absolute | at the measured agent-drift level |
| verbosity > 0.32 absolute | at the measured agent-drift level |
| any `placeholder` hit | Law 4, mechanised |
| any `rest-unchanged` hit | Law 2, mechanised |

If the output carries the `small sample` note (under 20 files or under 30 functions), erosion is dominated by two or three callables — report the trend and the named callables, never the absolute number, and do not open a consolidation pass on a swing that one function caused.

## What a CONSOLIDATE verdict obliges

`check` prints `PASS` or `CONSOLIDATE` and exits 1 on the latter. `CONSOLIDATE` is not advice.

1. **Stop.** No new feature, no next slice, no "I'll clean it up at the end". The end is where this compounds.
2. Take **one** consolidation pass over the callables the `heaviest callables` block named. One — an open-ended cleanup loop is its own failure mode and burns the slice budget.
3. Report **lines deleted**, not lines added. `git diff --shortstat`. A pass that nets positive did not consolidate anything.
4. Re-run `check`.
5. Still breaching and you judge the remainder acceptable: record a ruling with its cost-if-wrong and continue (Law 8). A parked session costs the user their day; a recorded wrong ruling costs rework they can see.

Record it with `state.mjs note decision "<one line>"` — the ledger is written through the script, not by hand (Law 7) — and put the full block in that slice's `evidence/slice-<n>.md`:

```
CONSOLIDATION PASS — <slug>, slice <n>
  trigger:  <breach line copied verbatim from `slop.mjs check`>
  targets:  <fnName  file.ts:120  CC 41 → 9>
            <fnName  file.ts:288  CC 21 → 7>
  deleted:  <N> lines
  added:    <M> lines            # M < N, or this was not a consolidation
  recheck:  PASS | CONSOLIDATE (<remaining breach>) + ruling recorded
```

## The eye-only checklist

Run every row against your own diff **before** `check`, not after. The detector column names the rule id you will see in `flagged patterns:`; rows marked *none* are invisible to it and exist only here.

| Pattern | Detector id | Do instead |
|---|---|---|
| try/catch that only rethrows | `rethrow-only` | delete it — the exception was already propagating; the block adds noise, not handling |
| swallowed exception (empty catch, `except: pass`) | `empty-catch` | handle it or let it propagate; a silent failure is worse than a loud one |
| defensive branch nobody calls (`// just in case`) | `defensive-noise` | delete unless a real caller passes that value; speculative guards are untested branches |
| cast that dodges the type checker (`as any`, `@ts-ignore`, `# type: ignore`, blanket `eslint-disable`) | `any-cast` | satisfy the type. A suppressed check is a bug with a lid on it, and it is documented agent behaviour, not an accident |
| step-by-step narration comment (`// Step 1:`, `// Now we…`) | `narration-comment` | delete. Reviewers read these as a machine-authored tell and distrust the whole PR |
| emoji in a code comment | `emoji-comment` | delete. Reported verbatim by reviewers: "if the comment has an emoji it's a guarantee" |
| `TODO`/`FIXME`, stub returning a fake value | `placeholder` | Law 4 — out of scope is Law 3 (name it unfinished), never a stub |
| `// ...rest of the file unchanged` | `rest-unchanged` | Law 2 — a token limit means a handoff, not an abridged file |
| `sleep(2000)` over a race | `sleep-bandaid` | find the real ordering constraint; timing band-aids fail on someone else's machine |
| single-use variable | none | inline it, unless its name adds a word the expression does not contain |
| trivial wrapper / pass-through module | none | run the deletion test: delete it in your head. Complexity vanishes → pass-through. Reappears at 2+ callers → it earned its keep |
| deep nesting | none | invert the conditions and return early, to depth 3 (table below) |
| if/else ladder on one value | none | a map/table lookup, or polymorphism |
| god function | mass ranking only | split at the seams [program-design.md](program-design.md) already named — not at an arbitrary line count |
| comment a human would not write | none | delete any comment you could regenerate from the line beneath it. Comments carry *why*; the code states *what* |

## Numeric constraints, which replace the adjectives

"Simple", "clean" and "readable" are unmeasurable and get argued away under pressure. These are the defaults `PROGRAM-DESIGN.md` §Constraints instantiates; where that file names a different number, **that number wins** — say so in the ledger. The failure is the silent violation, never the argued exception.

| Constraint | Limit | Failure it prevents |
|---|---|---|
| function length | 50 lines | the 84 → 1,099 line `main()`, one accepted addition at a time |
| cyclomatic complexity | 10 per callable | this is the exact threshold feeding the erosion numerator — above it, the function *is* the score |
| nesting depth | 3 | the branch nobody can hold in their head, therefore nobody reviews |
| new abstraction | ≥ 2 real call sites | one adapter is a hypothetical seam; two is a real one. Speculative seams are pure interface cost |
| error handling | top-level try/catch only, unless `PROGRAM-DESIGN.md` named the error mode | speculative catch blocks are the largest single source of complexity nobody requested |
| parameters | 4 per function | a fifth parameter is a struct the design failed to name |
| slice diff | ≤ 500 lines | one team declines review above it, and unreviewed is unverified. Where the cut goes is [slice.md](slice.md) |

## The deletion budget

GitClear's 211M-line study: duplicated blocks grew 4–8×, while "moved lines" — the consolidation signal — fell from 25% of changes in 2021 to under 10% by 2025. Agents add and do not consolidate.

- Every slice states `+added / -deleted` from `git diff --shortstat`. Both numbers, in the slice report.
- A slice adding >200 lines and deleting 0 gets read by hand for the copy it made instead of the call it should have made. The duplicate detector matches 6-line shingles; a paraphrased copy walks straight through it.
- A bug fixed in duplicated logic is not fixed until every copy is repaired or deleted.

## Honest limits — state these whenever you report a score

- Complexity here is **keyword counting** over brace- and indent-delimited bodies, not a parser. It is a trend instrument; the comparison against this project's own baseline is the whole signal, and one absolute number is not a verdict.
- Test files are excluded deliberately — their branchiness is legitimate and would mask erosion in shipping code. Test subversion is a separate failure with its own taxonomy and belongs to [verify.md](verify.md).
- Only source extensions are scanned, and build output, `node_modules`, `vendor` and `.factory` are skipped. Templates, SQL, CSS, config and generated code are invisible to it — a clean score says nothing about them.
- **A good score is never evidence that the code works.** Erosion measures shape, not behaviour. "PASS, so the feature works" is a Law 1 violation with a number attached, which makes it more persuasive and no more true.
- Do not write code to please the metric. These limits correlate with maintainability; 0.31 is not a virtue.

## Exit condition

Before a slice closes in [implement.md](implement.md), before `verify`/`review` reports, and on every `loop` pass — all five, checkable:

- [ ] `slop.mjs check` run **in this message**, with no path arguments, exit 0 — or exit 1 with a consolidation pass completed and its deleted-line count in `evidence/slice-<n>.md`, or a ruling recorded accepting the remaining breach.
- [ ] Every row of the eye-only checklist checked against this session's diff, including the *none*-detector rows.
- [ ] Lines added **and** lines deleted both stated in the slice report.
- [ ] No `placeholder`, `rest-unchanged` or `any-cast` hit introduced by this session.
- [ ] Any number reported alongside its limits: trend not verdict, and shape not behaviour.
