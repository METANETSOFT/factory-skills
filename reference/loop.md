# loop

Unattended iteration toward a number: pass after pass with nobody reading the output, stopping when the metric clears its threshold or when a stop rule fires. It is the highest-leverage mode in the factory and the only one that can spend all night and deliver nothing, so it carries the hardest precondition.

## Precondition — no loop without a measurable stop condition

**If you cannot name the command that prints the number and the threshold that ends the run, there is no loop.** There is an agent spending the user's money until someone notices. Refuse, say why, and go back to [slice.md](slice.md): a goal that cannot be measured wanted verifiable slices, not iteration.

A target is measurable when a command produces it with no human present, the same code produces the same reading twice, and the reading can be compared to a threshold written down *before* the run.

| Is a loop | Is not a loop |
|---|---|
| `npm test` exits 0 | "make the tests better" |
| `tsc --noEmit \| wc -l` reaches 0 | "clean up the types" |
| `k6 run load.js` reports p95 ≤ 200ms | "make it fast" |
| `lighthouse --only=perf` scores ≥ 90 | "improve UX" |

An LLM-as-judge score is admissible only when nothing deterministic exists: give it a fixed rubric with a threshold per criterion, run it as its own pass, and expect it to identify real issues and then talk itself into deciding they were not a big deal — that is the documented failure of a model grading work. A real number tied to the product is far stronger; a deterministic target is what makes an agent move mountains.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs show
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs resolve loop
node ${CLAUDE_SKILL_DIR}/scripts/slop.mjs baseline
```

Take the baseline **before pass 1**. Recorded afterwards it encodes the drift the loop caused as the starting point, and every later `check` reports clean.

## Sensor, controller, actuator

Write all three down. Whichever you leave out is supplied implicitly by the model, and an implicit controller is precisely how a loop degenerates into "keep trying things".

| Part | Answers | Must be |
|---|---|---|
| Sensor | what is measured each pass | one command, headless, prints a number or an exit code |
| Controller | what decides from that reading | a written if-table: threshold met / improved / flat / worse |
| Actuator | what changes as a result | a bounded edit — named files, one slice, one unit of work |

Also name the **disturbances**: what moves the metric that is not you — flaky tests, network variance, a teammate's push, a warm cache. If a disturbance can move the reading by more than the improvement you expect, the sensor runs twice per measurement and the loop believes the worse reading. Otherwise the loop will chase noise and report a win.

## The loop contract

Write this at the top of `PLAN.md` before pass 1, and mirror it with `state.mjs note decision`. It lives in the plan file because that is the one artifact every pass re-reads; a separate contract file means pass 12 follows whichever it opened first.

```markdown
## Loop contract
Target metric:     <name, and what the number means>
Sensor command:    $ <exact command — headless, deterministic, prints the reading>
Threshold:         <comparison that ends the run, e.g. p95_ms <= 200>
Reading now:       <the number from running it once, before any change>
Max passes:        <n>   — hard stop, threshold met or not
Per-pass budget:   <ceiling on edits/files/wall-clock> ; pass-1 measured cost: <observed>
No-progress rule:  two consecutive passes with no movement on the metric -> stop and report
Regression rule:   reading worse than previous pass -> revert to <sha>; never stack a fix
Sensor no-touch:   <files that define the metric: tests, thresholds, fixtures, config>
Actuator scope:    <files/dirs this loop may edit>. Anything outside is a halt, not a decision.
Halts (Law 8):     irreversible or destructive | security-sensitive | effects outside this
                   worktree (merge, push to shared, publish, send) | plan so broken every
                   path is a guess
Report to:         <where the final report goes, and who reads it>
```

`Max passes` is not optional and is not "until it works". Cost grows roughly 3× across a long chained run with no correctness gain, so the cap is what converts an open-ended spend into a known one. The loop cannot meter its own spend: set the cap as passes, measure pass 1, and multiply.

## The sensor is the thing being attacked

Under pressure agents reshape the measurement rather than the code — direct overwriting, assertion weakening, test deletion, mocking the unit under test, exception suppression, timeout manipulation — and unattended iteration is exactly when no one is watching for it. Prose cannot hold this line; a gate can.

- Every file that defines the metric goes on `Sensor no-touch`. **A pass whose diff touches one of them fails, is reverted, and is recorded as a ruling — even if the metric improved.** Check it mechanically: `git diff --name-only` against the list, every pass.
- A green reading obtained by changing what green means is the loop's characteristic failure and the only one that looks like success from outside.
- The other five patterns and the coverage-gaming variants are catalogued in [implement.md](implement.md); read the diff against that table on any pass that moved the metric more than you expected.

## One pass

Each pass is a **fresh context** that reads `PLAN.md` and the ledger tail from disk. It does not inherit the previous pass's conversation. Chaining an agent's own output forward is the measured erosion regime — structural erosion rose across 80% of such trajectories and verbosity across 90%, one observed `main()` going from complexity 29 to 285 — and re-reading one authoritative file is what keeps pass 40 shaped like pass 1.

1. Read `PLAN.md` (contract, pass log, slice status) and the last ledger entries. From disk, not from memory: instructions lose the attention competition against more recent tokens.
2. Run the sensor. Record the reading verbatim. Law 1 — a reading you did not run in this message is not a reading.
3. Controller decides from the if-table. Record the decision before acting on it.
4. Actuator applies **one** bounded change inside `Actuator scope`. A pass that changes three things cannot attribute the metric move to any of them, and the next pass inherits the ambiguity.
5. Run the sensor again. Record before and after.
6. `node ${CLAUDE_SKILL_DIR}/scripts/slop.mjs check` — every pass, not at the end. This is the regime the check exists for; a written instruction lowers the starting verbosity and then degradation resumes at the same rate, so only the executed check catches the slope.
7. `state.mjs note decision "<pass n: metric before -> after, what changed>"`, plus `note ruling` for anything decided under Law 8.
8. Compact the result back into `PLAN.md`. One line per pass, appended in place — a trail of `PASS-7.md` files is a trail the next pass will not read.
9. Commit on improvement so the regression rule has a sha to return to; revert on regression.

```markdown
- [pass <n>] <metric> <before> -> <after> | changed: <one line> | <sha> | slop: pass | <breach>
```

## When the loop stops

| Condition | Action |
|---|---|
| Threshold met | Stop. Verify once more from a clean checkout, then report. |
| Max passes reached | Stop. Report the last reading and the distance remaining. |
| Two passes, no movement | Stop and report. The instruction is wrong, not the code — a third attempt inherits both wrong assumptions. Rewrite the brief, then start a new loop. |
| Reading got worse | Revert to the last good sha and retry the pass once with a changed approach; a second regression ends the loop. |
| Diff touched a no-touch file | Revert the pass, record the ruling, continue only if the next pass avoids it. |
| A `state.mjs` cap trips (`HANDOFF_NOW`) | End the *session*, not the loop: `state.mjs handoff`, then the next pass resumes fresh from it ([context-discipline.md](context-discipline.md)). |
| Any of the four halts | Stop and wait for a human. Write what you were about to do and why you stopped. |

The four halts matter more here than anywhere else in the factory: everywhere else a human sees the next message, here nobody does until the run ends. A scheduled loop that hit a halt must not silently retry on the next tick — record the halt and let the next tick read it and decline.

Never gate any of this on your own estimate of remaining context. Models report that estimate precisely and wrongly. The fresh-context-per-pass structure removes the need for the estimate entirely; the observable signals in [context-discipline.md](context-discipline.md) cover the rest.

## Scheduling substrate

The loop's *content* is this file. Its *clock* is somebody else's job.

| Need | Route |
|---|---|
| Iterate on an interval inside this session | `loop` skill (bundled) |
| The loop must outlive this session, on cron or in the cloud | `schedule` skill (bundled) |
| Design the sensor/controller/actuator properly, with disturbances | `humanlayer-design-control-loop` — `npx skills add humanlayer/skills --skill design-control-loop` |
| Build a durable repo-local loop with a memory file carrying feedback between runs | `humanlayer-build-iterated-agentic-loop` — `npx skills add humanlayer/skills --skill build-iterated-agentic-loop` |

Installed → use it. Missing but installable → offer the one-line install rather than improvising a worse version. Unavailable → take the `degrade` path from `skills.mjs resolve loop` and say out loud that you are on it. Never fabricate a repository URL.

## The report

**Report what the loop did not achieve as prominently as what it did.** A loop that ran 40 passes and closed 60% of the gap is a useful result; a loop that reports 40 passes and lets the user infer success is Law 3 — the one unrecoverable error, because the user believes they have something they do not have.

```markdown
# Loop report — <target metric>
Threshold: <x>   Start: <y>   Final: <z>   Passes: <n>/<max>
Stopped because: <threshold met | max passes | no progress | regression | halt: <which>>

Achieved: <what moved, with the readings>
NOT achieved: <the gap that remains, in the metric's own units>
Cost: <passes × measured pass cost, or wall-clock>
Rulings taken unattended: <each, with its cost-if-wrong>
Drift: slop.mjs check <pass|breach at pass n> — erosion <Δ>, verbosity <Δ> vs baseline
Next action if resumed: <exact>
```

## Exit condition

All six hold before the loop is reported closed:

1. The loop contract was written to `PLAN.md` *before* pass 1, with a sensor command, a threshold and a max-pass cap.
2. Every pass has a line in the `PLAN.md` pass log with before/after readings and a sha or a revert.
3. The final reading was produced by running the sensor in this message, not carried from an earlier pass.
4. `slop.mjs check` ran on every pass and its verdict is recorded or its breach ruled on ([anti-slop.md](anti-slop.md)).
5. No delivered diff touches a `Sensor no-touch` file, and no test was weakened to move the metric.
6. The report names the remaining gap in the metric's units, and every unattended ruling is in the ledger.

## What loop does not do

It does not decide *what* to build — that is [slice.md](slice.md), and a loop pointed at an unplanned goal iterates on the wrong thing efficiently. It does not replace the verification pass: the sensor is one number, [verify.md](verify.md) is the evidence, and a metric at threshold is not proof the feature works. It does not merge, push or publish — those are outside the worktree and halt the loop by definition. And it does not diagnose: a metric stuck for two passes goes to [debug.md](debug.md) with a mechanism to find, not to a third pass with a different guess.
