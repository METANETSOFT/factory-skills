# debug

Root-cause-first failure hunting. Debug is not a phase — it runs inside whichever phase is current, and it exists to stop the default behaviour of proposing a plausible fix within seconds of reading a stack trace.

**The iron rule: no fix is proposed, written or discussed until the mechanism is understood and stated in one sentence.** A fix that lands before the mechanism is known is a guess that happens to be committed: if it works you cannot say why, and if it half-works you have changed the system you were trying to observe.

Six steps below, in order, each gating the next. There is deliberately no summary table of them — a step list read as a checklist gets executed without the fabrication check inside step 2 and the red-then-green proof inside step 6, which are the two steps that make the other four worth anything.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts resolve debug
```

It routes to `find-docs` when the failure sits inside a third-party library's behaviour, and `run` when the bug must be seen in the running app. Installed → use it; missing but installable → give the user the one-line install; unavailable → take the degraded path and say out loud that you are on it. `superpowers-systematic-debugging` is the external source of this discipline (`/plugin marketplace add obra/superpowers`); this file is the summary, not a replacement.

Tick every attempted fix at the moment you attempt it. That counter is the only thing enforcing the two-strike rule, and an attempt you did not tick is an attempt you will not count:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts tick fix
```

## 1 — Reproduce before anything

**A bug you cannot reproduce is a bug you cannot verify fixed.** Without a repro, "fixed" means "the symptom did not appear in the one run I did", and that claim is indistinguishable from a fix that did nothing.

Produce one command with a fixed seed, a fixed clock, a fixed fixture and no network where avoidable. Run it five times. **5/5 is a repro; anything below is an intermittency, and the intermittency is what you narrow first** — seed, test ordering, wall clock, concurrency, cache state. Crediting a fix on a 3/10 bug takes ten clean runs to mean anything, and nobody runs ten.

Record this before moving on:

```
Repro:    <exact command>
Expected: <what a correct run prints or returns>
Actual:   <verbatim output, including exit code>
Rate:     <n/5>
Env:      <branch · commit sha · runtime version · anything non-default>
```

After three distinct attempts — different input, different environment, isolated seed — with no repro, stop. `state.ts note unfinished "cannot reproduce <symptom>: <the three attempts>"` and ask the user for the failing input, log or session (Law 3). Do not proceed to a fix: a fix aimed at an unreproduced bug is a change with no test and no evidence, which is the exact shape of damage this pipeline exists to prevent.

## 2 — Narrow, and read every output

Bisect on three axes, cheapest first. Every move is a command you ran in this session and whose output you read.

| Axis | Move | Evidence it produces |
|---|---|---|
| Data | halve the input, fixture, row set or config until the smallest failing case remains | a minimal input that still fails |
| Code | disable, stub or short-circuit one layer at a time, running at each step | the layer the failure survives into, and the one it dies at |
| Time | `git bisect run <cmd>` · `git log -S<symbol>` · `git diff <last-good>..HEAD -- <path>` | the commit where behaviour changed |

Stop narrowing when the failing surface is **one function, or under ~50 lines you have read end to end**. "Small enough to read" is not a criterion; a line count is.

**The documented fabrication risk sits exactly here.** Agents have produced a fabricated `git bisect` result, claimed to have "written a test and confirmed" something they never ran, invented a permissions error to explain a failure, and generated a Playwright video of a repro staged in an artificial environment built to produce it. None of these is lying in the abstract — each is what this step looks like when the narrowing is imagined instead of executed.

So: every narrowing claim maps to a command in this transcript. If the bisect output is not in the scrollback, it did not happen. Before a screenshot, recording or trace counts as evidence, name the environment that produced it — host or URL, commit sha, timestamp — because a staged artifact fails precisely that check and passes every other one. When a step is genuinely too expensive to run, say it was skipped and what that leaves unproven: an unproven link named is recoverable, an unproven link asserted is not.

## 3 — One hypothesis, stated so it can die

Two hypotheses held at once means neither gets tested. You will run one experiment, read it as confirming whichever you preferred, and move on. Write the block, then run its test:

```markdown
Hypothesis:   <mechanism, one sentence>
Predicts:     <the observation that must exist if this is true>
Disproved by: <the observation that would kill it outright>
Test:         <exact command> → <output if true> / <output if false>
```

An empty `Disproved by:` means the hypothesis is unfalsifiable and no experiment can settle it — rewrite it before running anything. If the test comes back false the hypothesis is dead: write the next one, do not adjust the old one until it survives. Retro-fitting a hypothesis to a disconfirming result is how a session ends up "understanding" a mechanism that does not exist, and then fixing it.

## 4 — Instrument rather than guess

Print the actual state at the seam: log the value crossing the boundary, assert the invariant you believe holds, dump the query the ORM actually issued. Reasoning about what a function *should* return, at the point where behaviour is already unexplained, is how a wrong assumption becomes an architecture two PRs later.

Tag every probe with one marker, so removal is checked rather than remembered:

```bash
# every debug print carries the string FACTORY-PROBE
git diff | grep -c FACTORY-PROBE     # must print 0 before you commit
```

Left in, probes read as step-by-step narration — one of the surface tells that makes a reviewer distrust an entire diff on sight.

**Library and framework behaviour is a Context7 lookup, never a memory:** `npx ctx7@latest library "<name>" "<behaviour>"` then `npx ctx7@latest docs <id> "<question>"`. Training data lags releases, and a remembered default or signature costs a full debugging cycle to disprove. Do not record library facts in the ledger either — they belong to that library's version, not to this project, and a stale fact in the workspace outlives the release that made it wrong.

## 5 — The mechanism sentence

One sentence, in this shape, before any edit:

```
<symptom> happens because <named file:function or state> <does the wrong thing> when <precondition>.
```

Each of these is a guess wearing an explanation's clothes: "there's a race condition somewhere", "the state isn't syncing", "an edge case in the parser", "a timing issue", "the library changed". If your sentence contains "somewhere", "probably", "some kind of", or no file name, you are still at step 2.

If the mechanism is clear but the correct fix is ambiguous, that is a ruling, not a question (Law 8): pick, record the cost-if-wrong, continue.

## 6 — Fix, and prove the regression

The fix is the smallest change that removes the mechanism. **If it exceeds ~50 changed lines, or touches any file beyond the mechanism's own and its test, it is a refactor, not a fix** — the surrounding cleanup and the three related things you noticed go to `state.ts note risk` and to [slice.md](slice.md), not into this commit.

The regression test is proven in both directions, and both outputs go to `<workspace>/work/<slug>/evidence/`:

1. Test added, fix reverted → the test **fails**, with the stated mechanism's error and not a different one.
2. Fix reapplied → the test **passes**.

A test that has never been seen red proves only that it can pass, which `expect(true).to.be(true)` also does. Paste both outputs; do not describe them (Law 1 — [verify.md](verify.md) owns the full evidence gate).

**Any diff touching a test file during a bugfix carries a visible, stated justification.** The catalogued subversions are Direct Overwriting, Assertion Weakening, Test Deletion, Test Mocking, Exception Suppression and Timeout Manipulation; every one arrives looking like a reasonable local edit, and Anthropic's own system card records Claude special-casing tests in agentic coding. Widening a tolerance, deleting a case, mocking the layer that failed or swallowing the exception are not fixes — they are the bug, relocated to where nothing watches it. If the existing test was genuinely wrong, say why in the commit message and in the ledger.

## The two-strike rule

**After two ticked fixes for the same symptom, stop patching and restart from step 1 on a clean base.** Two failures mean the mechanism was never understood, and by now the attempts pollute both artifacts you depend on: the code carries edits whose purpose nobody can state, and your context carries dead hypotheses that bias every subsequent read toward what you already tried.

Preserve before you clean:

```bash
git diff > <workspace>/work/<slug>/evidence/failed-attempts.diff   # to read, never to reapply
git stash push -u -m "factory: 2 failed fixes for <symptom>"       # reversible; nothing is lost
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note ruling "stashed 2 failed fixes on <symptom>; restarting from repro with <what was learned>"
```

If the failed attempts are already committed, `git branch factory/failed-<symptom>` before moving HEAD. [implement.md](implement.md) resets hard to the last green sha because it runs on the factory's own branch inside its own worktree; **debug usually runs on the branch the user is working on, where the same command destroys work the factory did not create — so ask before any `git reset --hard` that would discard anything the two lines above did not save.** Law 8 stops for irreversible operations, and the two-strike rule is not an exemption from it.

A third patch on an unexplained base is the most reliable way to turn a one-hour bug into a session. If the clean restart also stalls, hand the repro and the dead hypotheses to one fresh subagent with a written brief and have it re-run the narrowing independently — independent re-checking by a separate agent is the countermeasure with the best measured effect on false positives, and it costs 3–10× the tokens, so do it once rather than as a habit.

`state.ts` caps a session at 8 fixes. `FINISH_CURRENT_SLICE` or `HANDOFF_NOW` mid-hunt is not a signal to hurry: write the handoff carrying the repro, the dead hypotheses and the surviving one ([context-discipline.md](context-discipline.md)).

## Record the root cause

Append to `<workspace>/ledger.md`, then mirror it into state:

```markdown
### Root cause — <symptom>
- Mechanism: <the one sentence>
- Introduced by: <commit / release / config change, or "original">
- Repro: `<command>` (<n>/5)
- Fix: <sha> · regression test `<path>` (red without fix, green with)
- Class: <the general mistake this is an instance of>
```

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note decision "root cause <symptom>: <mechanism>, fixed <sha>"
```

`Class` is the line that pays. **The second time a Class appears in the ledger, stop writing notes about it and encode it** — a lint rule, a type, or a test that fails on the shape rather than on this instance. A recurring mistake left as prose gets rediscovered by the next session; encoded, the same correction becomes slope control instead of a note nobody re-reads.

## Exit condition

Debug is done when all eight are true, each checkable by someone who was not here:

1. The mechanism sentence exists, names a file, and no fix predates it.
2. The repro command and its rate are recorded, and it was observed failing before the fix.
3. Every narrowing claim maps to a command whose output is in this transcript.
4. The regression test was seen red without the fix and green with it; both outputs are in `evidence/`.
5. Any test-file change in the diff carries a stated justification.
6. `git diff | grep -c FACTORY-PROBE` prints 0.
7. The project's full suite ran green after the fix — a fix verified only by its own new test is verified against the one case you were already thinking about.
8. The root cause, with its `Class`, is in `<workspace>/ledger.md`.

Then return to the phase you interrupted. If the bug invalidated a design assumption rather than a line of code, it is a [research.md](research.md) finding and an edit to `PLAN.md` ([slice.md](slice.md)), not a patch. If it invalidated the acceptance criteria themselves, that is [verify.md](verify.md)'s problem and the user's, not a silent scope reduction.
