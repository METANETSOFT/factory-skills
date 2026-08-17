# loop

Unattended iteration toward a number: pass after pass with nobody reading the output, stopping when the metric clears its threshold or a stop rule fires. It is the only factory mode that can spend all night and deliver nothing, so it carries the hardest precondition in the skill.

## Precondition — no loop without a measurable stop condition

**If you cannot name the command that prints the number and the threshold that ends the run, there is no loop.** There is an agent spending the user's money until someone notices. Refuse, say why, and go back to [slice.md](slice.md): a goal that cannot be measured wanted verifiable slices, not iteration.

A target is measurable when a command produces it with no human present, the same code produces the same reading twice, and the threshold was written down *before* the run.

| Is a loop | Is not a loop |
|---|---|
| `npm test` exits 0 | "make the tests better" |
| `tsc --noEmit \| wc -l` reaches 0 | "clean up the types" |
| `k6 run load.js` reports p95 ≤ 200ms | "make it fast" |
| `npx lighthouse <url> --only-categories=performance` scores ≥ 90 | "improve UX" |

An LLM-as-judge score is admissible only when nothing deterministic exists: fixed rubric, one numeric threshold per criterion, run as its own pass. Expect it to identify real issues and then talk itself into deciding they were not a big deal — that is the documented failure of a model grading its own work, and it is why you compare its numbers to thresholds rather than accept its verdict.

## Preflight

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts show
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts resolve loop
node ${CLAUDE_SKILL_DIR}/scripts/slop.ts baseline
```

Take the baseline **before pass 1**. Recorded afterwards, it encodes the drift the loop already caused as the starting floor, and every later `check` reports clean against a dirty one.

## Sensor, controller, actuator

Write all three down. Whichever you leave out is supplied implicitly by the model, and an implicit controller is precisely how a loop degenerates into "keep trying things".

| Part | Answers | Must be |
|---|---|---|
| Sensor | what is measured each pass | one command, headless, prints a number or an exit code |
| Controller | what decides from that reading | a written if-table: threshold met / moved / flat / worse |
| Actuator | what changes as a result | a bounded edit — named files, one slice, one unit of work |

### Calibrate the sensor before you trust it

Run the sensor **three times with no code change**. `noise band = max − min`; a reading counts as movement only when `|after − before| > band`. Anything inside the band is noise, not progress. Put the band in the contract: without it "no movement" is undefined, the no-progress rule — the one rule that ends a doomed run early — can never fire, and the loop reaches pass 40 chasing ±3ms.

If the band is wider than the improvement one pass can plausibly deliver, the sensor cannot see your work: fix it first — pin the seed, use a fixed fixture, warm the cache identically, or take the median of three runs per measurement — or refuse the loop. Name the disturbances too: flaky tests, network variance, a teammate's push, a cold cache. A disturbance you did not name is one the loop will attribute to itself and report as a win.

## The loop contract

Append this to `<workspace>/work/<slug>/PLAN.md` before pass 1 and mirror it with `state.ts note decision`. It goes in the plan file because that is the one artifact every pass re-reads; a separate contract file means pass 12 follows whichever it opened first. Append only — the slice blocks belong to [slice.md](slice.md) and their `Status` cells to [implement.md](implement.md).

```markdown
## Loop contract
Target metric:     <name, and what the number means>
Sensor command:    $ <exact command — headless, deterministic, prints the reading>
Threshold:         <comparison that ends the run, e.g. p95_ms <= 200>
Reading now:       <the number from running it once, before any change>
Noise band:        <max - min over 3 no-change runs> — movement must exceed this
Max passes:        <n>  — hard stop, threshold met or not
Per-pass budget:   <= <n> file edits, <= <n> min wall-clock; pass-1 measured cost: <observed>
No-progress rule:  two consecutive passes with movement inside the noise band -> stop and report
Regression rule:   reading worse than previous by more than the band -> revert to <sha>
Sensor no-touch:   <files that define the metric: tests, thresholds, fixtures, config>
Actuator scope:    <files/dirs this loop may edit>. Anything outside is a halt, not a decision.
Halts (Law 8):     irreversible or destructive | security-sensitive | effects outside this
                   worktree (merge, push to shared, publish, send) | plan so broken every
                   path is a guess
Report to:         <where the final report goes, and who reads it>
```

**A blank line in that block is a refusal, not a default.** `Max passes` in particular is never "until it works": measured cost grew 2.9× across one long chained run with no correctness gain, and the cap is what converts an open-ended spend into a known one. The loop cannot meter its own spend — set the cap in passes, measure pass 1, multiply. Then do the session arithmetic before pass 1, not at pass 6: `state.ts` returns `HANDOFF_NOW` at 60 edits, 3 slices or 12 subagents in one session, so passes-per-session is 60 ÷ your per-pass edit budget. A 20-pass loop at 10 edits a pass is a three-session loop, and discovering that mid-change costs the pass you were in. A loop is where an unrecorded worker costs the most, because the mistake repeats every pass: check `skills.ts worker` before pass 1, and where the pass body is inside that worker's envelope, dispatch it there with the announce line (Law 11, [worker.md](worker.md)). The sensor reading stays yours to run — a loop grading itself through the same hands that changed the code has no sensor at all.

## The sensor is what gets attacked

Under pressure agents reshape the measurement rather than the code — direct overwriting, assertion weakening, test deletion, mocking the unit under test, exception suppression, timeout manipulation — and unattended iteration is exactly the regime where nobody is watching for it. Prose cannot hold this line; a gate can.

- Every file that defines the metric goes on `Sensor no-touch`. Check it mechanically every pass: `git diff --name-only` against that list. **A pass whose diff touches one of them fails, is reverted, and is recorded as a ruling — even if the metric improved.**
- A green reading obtained by changing what green means is this mode's characteristic failure and the only one that looks like success from outside.
- On any pass that moved the metric more than you expected, read the diff against the full pattern table in [implement.md](implement.md) before committing.

## One pass

Each pass is a **fresh context** that reads the plan file and the ledger tail from disk. Chaining an agent's own output forward is the measured erosion regime — structural erosion rose across 80% of such trajectories, verbosity across 90%, one observed `main()` going from cyclomatic complexity 29 to 285 — and re-reading one authoritative file is what keeps pass 40 shaped like pass 1. Observable test: if you can state pass n−1's reading without having read `PLAN.md` in this context, the context is not fresh and you are running a chain, not a loop.

1. Read `<workspace>/work/<slug>/PLAN.md` (contract, pass log, slice status) and the last ledger entries. From disk, not from memory: instructions lose the attention competition against more recent tokens.
2. Run the sensor. Record the reading verbatim. Law 1 — a reading you did not run in this message is not a reading.
3. Controller decides from the if-table, comparing against the noise band. Record the decision before acting on it.
4. Actuator applies **one** bounded change inside `Actuator scope`. A pass that changes three things cannot attribute the metric move to any of them, and the next pass inherits the ambiguity.
5. Run the sensor again. Record before and after.
6. `node ${CLAUDE_SKILL_DIR}/scripts/slop.ts check` — every pass, not at the end. It exits 1 on breach: erosion up more than 0.05 or verbosity up more than 0.03 against your baseline, absolute erosion above 0.68 or verbosity above 0.32 (the measured agent-drift level; maintained human repos sit near 0.31 / 0.11), or any placeholder or `...rest unchanged` marker in delivered code. A written anti-slop instruction lowers starting verbosity and then degradation resumes at the same per-pass rate, so only the executed check catches the slope.
7. `state.ts note decision "<pass n: metric before -> after, what changed>"`, plus `note ruling` for anything decided under Law 8 and `note unfinished` for anything the pass gave up on.
8. Compact the result back into `PLAN.md`. One appended line per pass — a trail of `PASS-7.md` files is a trail the next pass will not read.
9. Commit on movement, so the regression rule has a sha to return to; revert on regression. A pass with no commit and no revert leaves the next pass unable to tell which state it inherited.

```markdown
- [pass <n>] <metric> <before> -> <after> | changed: <one line> | <sha> | slop: pass | <breach>
```

## When the loop stops

| Condition | Action |
|---|---|
| Threshold met | Stop. Re-run the sensor once from a clean checkout, then report. |
| Max passes reached | Stop. Report the last reading and the distance remaining. |
| Two passes inside the noise band | Stop and report. The instruction is wrong, not the code — a third attempt inherits both wrong assumptions. Rewrite the brief, start a new loop. |
| Reading worse by more than the band | Revert to the last good sha, retry the pass once with a changed approach; a second regression ends the loop. |
| Diff touched a no-touch file | Revert the pass, record the ruling, continue only if the next pass avoids it. |
| `HANDOFF_NOW` from a `state.ts` cap | End the *session*, not the loop: `state.ts handoff`, next pass resumes from it ([context-discipline.md](context-discipline.md)). |
| Any of the four halts | Stop and wait for a human, as below. |

The four halts bind harder here than anywhere else in the factory: everywhere else a human sees the next message, here nobody does until the run ends. So a halt must be written where the next tick will trip over it, not narrated into a transcript no one opens — write `HALTED: <what you were about to do, and why you stopped>` into the `PLAN.md` pass log and `state.ts note unfinished` the same text. Every pass reads the pass log at step 1; a pass that finds `HALTED` declines and re-reports rather than retrying. A scheduled loop that silently retries a halt is an unattended agent repeatedly attempting the exact operation a human was asked to authorise.

Never gate any of this on your own estimate of remaining context: models report that estimate precisely and wrongly. Fresh context per pass removes the need for the estimate; the observable signals in [context-discipline.md](context-discipline.md) cover the rest.

## Scheduling substrate

The loop's *content* is this file. Its *clock* is somebody else's job.

| Need | Route |
|---|---|
| Iterate on an interval inside this session | `loop` skill (bundled with Claude Code) |
| The loop must outlive this session, on cron or in the cloud | `schedule` skill (bundled with Claude Code) |
| Design the sensor/controller/actuator properly, with disturbances | `humanlayer-design-control-loop` — `npx skills add humanlayer/skills --skill design-control-loop` |
| Build a durable repo-local loop with a memory file carrying feedback between runs | `humanlayer-build-iterated-agentic-loop` — `npx skills add humanlayer/skills --skill build-iterated-agentic-loop` |

Installed → use it. Missing but installable → offer that one line rather than improvising a worse version. Unavailable → take the `degrade` path from `skills.ts resolve loop` and say out loud that you are on it. Never fabricate a repository URL.

## The report

**Report what the loop did not achieve as prominently as what it did.** A loop that ran 40 passes and closed 60% of the gap is a useful result; a loop that reports 40 passes and lets the user infer success is Law 3 — the unrecoverable error, because the user now believes they have something they do not have. The gap goes in the ledger as `state.ts note unfinished` too, so `state.ts finish` refuses until someone has looked at it.

```markdown
# Loop report — <target metric>
Threshold: <x>   Start: <y>   Final: <z>   Passes: <n>/<max>   Noise band: <b>
Stopped because: <threshold met | max passes | no progress | regression | halt: <which>>

Achieved: <what moved, with the readings>
NOT achieved: <the gap that remains, in the metric's own units>
Cost: <passes × measured pass cost, or wall-clock>
Rulings taken unattended: <each, with its cost-if-wrong>
Drift: slop.ts check <pass | breach at pass n> — erosion <Δ>, verbosity <Δ> vs baseline
Next action if resumed: <exact>
```

## What loop does not do

It does not decide *what* to build — that is [slice.md](slice.md), and a loop pointed at an unplanned goal iterates on the wrong thing efficiently. It does not replace verification: the sensor is one number, [verify.md](verify.md) is the evidence, and a metric at threshold is not proof the feature works. It does not merge, push or publish — those sit outside the worktree and halt the loop by definition. And it does not diagnose: a metric flat for two passes goes to [debug.md](debug.md) with a mechanism to find, not to a third pass with a different guess.

## Exit condition

The loop is closed when all six hold:

1. The contract block is in `PLAN.md` above the pass log, written before pass 1, with no blank field — sensor command, threshold, noise band, max passes all filled.
2. Every pass has one line in the pass log with before/after readings and a sha or a revert; the line count equals the reported pass count.
3. The final reading was produced by running the sensor in this message, not carried forward from an earlier pass.
4. `slop.ts check` ran on every pass; each verdict is recorded, and every breach has a ruling ([anti-slop.md](anti-slop.md)).
5. `git diff --name-only` over the delivered range intersects `Sensor no-touch` in zero files, and no test was weakened to move the metric.
6. The report names the remaining gap in the metric's own units, and every unattended ruling and unfinished item is in the ledger — confirmed by `state.ts show`, not by memory.
