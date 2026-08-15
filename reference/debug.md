# debug

Root-cause-first failure hunting. Debug is not a phase — it runs inside whichever phase is current, and it exists to stop the default agent behaviour of proposing a plausible fix within seconds of reading a stack trace.

**The iron rule: no fix is proposed, written, or discussed until the mechanism is understood and stated in one sentence.** A fix that lands before the mechanism is known is a guess that happens to be committed; if it works you cannot say why, and if it half-works you have now changed the system you were trying to observe.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs resolve debug
```

It routes to `find-docs` when the failure sits inside a third-party library's behaviour, and `run` when the bug must be seen in the running app. Installed → use it; missing but installable → give the user the one-line install; unavailable → take the degraded path and say out loud that you are on it. `superpowers-systematic-debugging` is the external source of this discipline (`/plugin marketplace add obra/superpowers`); this file is the summary, not a replacement.

Tick every attempted fix as it happens — the counter is the gauge that enforces the two-strike rule below:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs tick fix
```

## The sequence

Each step gates the next. Skipping one does not save time; it moves the cost to the step that finds out.

| # | Step | Done when |
|---|---|---|
| 1 | Reproduce deterministically | one command fails the same way twice in a row |
| 2 | Narrow by bisection — data, code, time | the failing surface is small enough to read in full |
| 3 | State ONE falsifiable hypothesis | you have named the observation that would kill it |
| 4 | Instrument, do not reason | the actual state at the seam is printed, not inferred |
| 5 | State the mechanism in one sentence | the sentence names a code path, not a feeling |
| 6 | Fix, with a regression test proven red-then-green | both outputs are in `evidence/` |
| 7 | Record the root cause in the ledger | the next session cannot rediscover it |

## 1 — Reproduce before anything

**A bug you cannot reproduce is a bug you cannot verify fixed.** Without a repro, "fixed" means "the symptom did not appear in the one run I did", and that claim is indistinguishable from a fix that did nothing.

Produce a single command, with a fixed seed, fixed clock, fixed fixture, and no network where avoidable. Run it twice and read both outputs — an intermittent repro is a narrowing target, not a repro, and treating it as one is how the wrong fix gets attributed a success.

Write it down before moving on:

```
Repro:    <exact command>
Expected: <what a correct run prints or returns>
Actual:   <what it prints or returns now, verbatim>
Rate:     <2/2 · or 3/10 if intermittent — then narrow the intermittency first>
Env:      <branch · commit · runtime version · anything non-default>
```

If you cannot reproduce it after a genuine attempt, say so, `state.mjs note unfinished "cannot reproduce <symptom>: <what was tried>"`, and ask the user for the failing input, log or session (Law 3). Do not proceed to a fix. A fix aimed at an unreproduced bug is a change with no test and no evidence, which is exactly the shape of the damage this pipeline exists to prevent.

## 2 — Narrow, and read every output

Bisect on three axes, cheapest first. Each move must be a command you ran and whose output you read in this session.

| Axis | Move | Evidence it produces |
|---|---|---|
| Data | halve the input, the fixture, the row set, the config, until the smallest failing case remains | a minimal input that still fails |
| Code | disable, stub or short-circuit one layer at a time; run at each step | the layer the failure survives into and the one it dies at |
| Time | `git bisect` / `git log -S<symbol>` / `git diff <last-good>..HEAD -- <path>` | the commit where behaviour changed |

**The documented fabrication risk sits exactly here.** Agents have produced a fabricated `git bisect` result, claimed to have "written a test and confirmed" something they never ran, invented a permissions error to explain a failure, and generated a Playwright video of a bug repro that was staged in an artificial environment built to produce it. None of these are lying-in-the-abstract; they are what this step looks like when the narrowing is imagined instead of executed.

So: every narrowing claim in your output must be traceable to a command in this transcript. If the bisect result is not in the scrollback, it did not happen. A screenshot, recording or trace is evidence only after you have checked which environment produced it. When a step is genuinely too expensive to run, say the step was skipped and what that leaves unproven — an unproven link named is recoverable, an unproven link asserted is not.

## 3 — One hypothesis, stated so it can die

Two hypotheses held at once means neither gets tested; you will run one experiment, read it as confirming whichever you preferred, and move on. Write the block, then run its test:

```markdown
Hypothesis:  <mechanism, one sentence>
Predicts:    <the observation that must exist if this is true>
Disproved by:<the observation that would kill it outright>
Test:        <exact command> → <output if true> / <output if false>
```

If the test comes back false, the hypothesis is dead — write the next one, do not adjust the old one until it survives. Retro-fitting a hypothesis to a disconfirming result is how a session ends up "understanding" a mechanism that does not exist, and then fixing it.

## 4 — Instrument rather than guess

Print the actual state at the seam: log the value crossing the boundary, assert the invariant you believe holds, dump the query the ORM actually issued. Reasoning about what a function "should" return at the point where behaviour is already unexplained is how a wrong assumption becomes an architecture two PRs later.

Library and framework behaviour is a Context7 lookup, never a memory: `npx ctx7@latest library "<name>" "<behaviour>"` then `npx ctx7@latest docs <id> "<question>"`. Training data lags releases, and a remembered signature or a remembered default costs a full debugging cycle to disprove. Do not record library facts in the ledger either — they belong to the library's version, not to this project.

Remove instrumentation before the commit. Left in, it reads as step-by-step narration, which is one of the surface tells that makes a reviewer distrust an entire diff.

## 5 — The mechanism sentence

One sentence, in this shape, before any edit:

```
<symptom> happens because <named code path or state> <does the wrong thing> when <precondition>.
```

These do not qualify, and each is a guess wearing an explanation's clothes: "there's a race condition somewhere", "the state isn't syncing", "an edge case in the parser", "a timing issue", "the library changed". If your sentence contains "somewhere", "probably", "some kind of", or no file name, you are at step 2, not step 5.

## 6 — Fix, and prove the regression

The fix is the smallest change that removes the mechanism. Not the surrounding refactor, not the defensive checks elsewhere, not the three related things you noticed — those are findings for the ledger (Law 3), not scope for this commit.

The regression test is proven in both directions, and both outputs go in `<workspace>/work/<slug>/evidence/`:

1. Test added, fix reverted → the test **fails**, for the stated mechanism's reason.
2. Fix reapplied → the test **passes**.

A test that has never been seen red proves only that it can pass, which `expect(true).to.be(true)` also does. Paste both outputs; do not describe them (Law 1).

**Any diff touching a test file during a bugfix carries a visible, stated justification.** The catalogued subversions are Direct Overwriting, Assertion Weakening, Test Deletion, Test Mocking, Exception Suppression and Timeout Manipulation — every one arrives looking like a reasonable local edit, and Anthropic's own system card records Claude special-casing tests in agentic coding. Widening a tolerance, deleting a case, mocking the layer that failed, or swallowing the exception are not fixes; they are the bug, relocated to where nothing watches it. If the existing test was genuinely wrong, say why in the commit message and in the ledger.

## The two-strike rule

**After two failed fixes for the same symptom, stop patching. Revert to the last verified commit and restart from step 1.**

```bash
git diff > /tmp/failed-attempts.diff   # keep it to read, do not reapply it
git reset --hard <last-verified-commit>
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note ruling "reverted to <sha> after 2 failed fixes on <symptom>; restarting from repro with <what was learned>"
```

Two failures mean the mechanism was never understood, and by now the accumulated attempts are polluting both artefacts you depend on: the code carries edits whose purpose nobody can state, and your context carries dead hypotheses that bias every subsequent read toward what you already tried. Branch-and-retry beats patch-the-bad-output — a third patch on an unexplained base is the single most reliable way to turn a one-hour bug into a session.

`state.mjs` caps a session at 8 fixes. Hitting `FINISH_CURRENT_SLICE` or `HANDOFF_NOW` mid-hunt is not a signal to hurry: write the handoff with the repro, the dead hypotheses and the surviving one ([context-discipline.md](context-discipline.md)). Dead hypotheses are the most valuable thing a debugging handoff carries, because the next session's default is to try them again.

## Record the root cause

Append to `<workspace>/ledger.md`, then mirror it into state:

```markdown
### Root cause — <symptom>
- Mechanism: <the one sentence>
- Introduced by: <commit / release / config change, or "original">
- Repro: `<command>`
- Fix: <sha> · regression test `<path>` (red without fix, green with)
- Class: <the general mistake this is an instance of>
```

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note decision "root cause <symptom>: <mechanism>, fixed <sha>"
```

`Class` is the line that pays. If the same class appears twice, stop writing notes about it and encode it — a lint rule, a type, or a test that fails on the shape rather than the instance. A recurring mistake left as prose gets rediscovered; encoded, it becomes slope control instead of a note nobody re-reads.

## Exit condition

All six true before debug is done:

1. The mechanism sentence exists, names a file, and no fix predates it.
2. The repro command is recorded and was observed failing before the fix.
3. Every narrowing claim maps to a command whose output is in this transcript.
4. The regression test was seen red without the fix and green with it, both outputs in `evidence/`.
5. Any test-file change in the diff carries a stated justification.
6. The root cause, with its `Class`, is in the ledger.

Then run the project's full suite — a fix verified only by its own new test is a fix verified against the one case you were already thinking about — and return to the phase you interrupted. If the bug invalidated a design assumption rather than a line of code, it is a [research.md](research.md) finding and an edit to `PLAN.md` ([slice.md](slice.md)), not a patch. If it invalidated the acceptance criteria themselves, that is [verify.md](verify.md)'s problem and the user's, not a silent scope reduction.
