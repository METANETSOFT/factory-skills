# implement

Phase 6 turns `PLAN.md` into merged, tested code — one vertical slice at a time, each built by a fresh subagent, each verified before the next begins. It writes no document of its own: the deliverable is commits plus one evidence file per slice.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs phase implement
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs resolve implement
```

`skills.mjs` names `full-output-enforcement` (always — the anti-truncation contract behind Law 2) and `find-docs` whenever a library API is involved. Installed → use it. Missing but installable → offer the one-line install. Unavailable → follow the map's `degrade` note and say out loud that you are on the degraded path. **Every named library, SDK, CLI or cloud service gets its facts from Context7 before it is called** — `npx ctx7@latest library "<name>" "<what to look up>"`, then `npx ctx7@latest docs <id> "<question>"` — because training data lags releases and the subagent writing the call has no way to know its signature was stale.

## The worktree

Implementation is the only phase that gets one; research and planning ran on main and cost nothing to redo. Implementation writes files, and a half-finished slice sitting on main blocks the user's own work.

```bash
git worktree add ../<repo>-<slug> -b factory/<slug>
```

Worktrees isolate the filesystem, subagents isolate context, and neither substitutes for the other: two subagents in one worktree still stamp on each other's files, and two worktrees do not stop an agent inheriting poisoned session history.

## The slice loop

For every slice in `PLAN.md`, in plan order, one at a time, never batched:

1. **Re-read `PLAN.md` — every slice, from disk, not from memory.** Instructions lose the attention competition against more recent tokens; this is the same mechanism that makes CLAUDE.md stop working late in a session. A remembered plan drifts toward whatever the last slice happened to build.
2. Dispatch one fresh subagent using the brief below. `state.mjs tick subagent`.
3. Read the diff yourself before believing anything (see *Checking the work*).
4. Run the slice's verification command and read its output. Law 1: if you did not run it in this message, it does not pass.
5. `node ${CLAUDE_SKILL_DIR}/scripts/state.mjs slice <n>/<total>`, then the gate in [verify.md](verify.md).
6. Compact the status back into `PLAN.md` (skeleton below).
7. `state.mjs note decision "<slice n: what shipped, what was ruled>"`. Law 7 — the ledger is written as it happens, not in a summary a truncated session never reaches.

Run the checkpoint in [anti-slop.md](anti-slop.md) at the end of the phase, and mid-phase after any slice that added more than a few hundred lines. Structural erosion rises across ~80% of chained agent trajectories and verbosity across ~90%; the prose rules in this file slow that down, only the measured check catches it.

## Dispatching the slice subagent

A subagent starts with **zero context**: it cannot see this conversation, the earlier slices, or the reason any of it exists. Hand-construct the brief, and never assume inherited history. Split by context boundary, never by role — a planner → implementer → tester chain is a documented anti-pattern that degrades into a telephone game, and multi-agent runs already burn 3–10× the tokens, so delegate for isolation, not for theatre.

```markdown
GOAL (why this exists): <the user-visible outcome this slice serves, in one sentence>
SLICE <n> of <total>: <the slice line from PLAN.md, verbatim>

You have no prior context. Everything you need is below or in the files named.

READ FIRST: <workspace>/work/<slug>/PROGRAM-DESIGN.md — §Interfaces, §Call stack, §Tests
             <workspace>/work/<slug>/PLAN.md — slice <n> only

BUILD: <the one behaviour, end to end — route to storage to response, thin>
FILES YOU MAY TOUCH: <explicit list>. Outside it, stop and report instead of creating.
INTERFACES: implement the signatures in PROGRAM-DESIGN.md exactly. If one is wrong, report it
  — do not redesign here. Resolve any third-party API through `npx ctx7@latest` before calling it.
CONSTRAINTS: <copy the numeric ones from PROGRAM-DESIGN.md §Constraints: max function length,
  max nesting, no abstraction under 2 real call sites, no error handling beyond the named
  variants>. No TODOs, no stubs, no placeholder returns, no `// ...unchanged`.

TDD: write the failing test first; run it; show it fail. Then write only enough code to pass
  that one test. Run it; show it pass. Commit. Repeat per test.
PROVE IT: <the exact command, e.g. `npm test -- thing.spec.ts` and `curl -s localhost:3000/things`>

WRITE YOUR RESULT to <workspace>/work/<slug>/evidence/slice-<n>.md using the skeleton in the
factory's implement playbook, then report back exactly these fields:
  files changed | lines added | lines deleted | tests added | commands run + verbatim output
  | anything you could not do and why | any interface that did not survive contact

Do not summarise instead of implementing. Do not stop early because the context feels tight —
if you cannot finish, write what is done and what is not into the result file and say so.
```

The closing two lines are load-bearing: anti-anxiety reinforcement is measurably weaker when it appears only at the top of an instruction block.

## The slice result file

The subagent writes `<workspace>/work/<slug>/evidence/slice-<n>.md`. Prose in a return value is discarded when the subagent ends; a file survives into the next session, into [verify.md](verify.md), and into the handoff.

```markdown
# Slice <n>: <title>
Status: complete | partial | blocked
Commits: <sha> <subject>  (one line each)
Diff: +<added> / -<deleted> across <k> files
Tests added: <path::name>  — asserts through <interface from PROGRAM-DESIGN.md>
Verification run:
  $ <command>
  <verbatim output, not a paraphrase>
Test files touched outside the new tests: <none | path + why, in one sentence>
Unfinished: <what and why — never omitted>
Interfaces that did not survive contact: <name + what was actually needed>
```

## TDD ordering inside the slice

Test first. Watch it fail. Write only enough code to pass that one test. Watch it pass. Commit on green, then take the next test. Not: all the tests, then all the code — a test written after the code encodes what the code does rather than what was wanted, and passes on its first run, which proves nothing.

- **A regression fix is only proven by reverting the fix and watching the test fail.** Do that, out loud, and paste both outputs.
- Commit on each green so a failed later step reverts to a working base rather than rubble — this is what makes *branch and retry* cheap.
- No emoji, no narration comments. Reviewers read both as proof nothing in the diff was authored deliberately, and one tell discredits the whole PR.

## Guarding the tests

**Any diff that touches an existing test during a bugfix needs a stated, visible justification in the slice result file.** Silence is a failing condition, not a neutral one. Under test pressure agents reshape the test rather than the code, and the resulting suite is green and worthless — a documented case ended with the authorisation layer bypassed in middleware and mocked out in tests so the suite passed. Recognise these six by name when you read the diff:

| Pattern | What it looks like in the diff |
|---|---|
| Direct overwriting | expected values edited to match observed output |
| Assertion weakening | `toEqual` → `toBeTruthy`, a dropped field, a loosened matcher, `expect(true)` |
| Test deletion | a test or a whole file removed, or renamed to something the runner skips |
| Test mocking | the unit under test — or a service the agent invented — replaced by a stub |
| Exception suppression | new `try/catch` swallowing, `pytest.raises` widened, cast to `any`, `@ts-ignore` |
| Timeout manipulation | a timeout raised, a `sleep` added, a flaky test retried instead of fixed |

Refuse the coverage-gaming variants too: happy path implemented and error path skipped, a planned edge case quietly dropped, a method deleted rather than repaired. Each is Law 4, and Law 3 as well if it is a scope reduction you did not name.

## Checking the work

**A subagent reporting success is not evidence.** It is the single most reliable way to ship nothing while believing you shipped something, and it is a listed failure, not a judgement call. Agents have fabricated `git bisect` results, claimed to have written and run tests that never existed, and produced a Playwright recording of a bug repro staged entirely inside an artificial page. Before accepting any slice:

1. `git diff` the slice's commits and read them. Not the summary — the diff.
2. Confirm every file changed is on the brief's allowed list, and every new abstraction has two real call sites.
3. Re-run the verification command yourself and read its output in this message.
4. Check the tests against the six patterns above.
5. Confirm deleted lines were reported, not only added ones. Agents add and never consolidate — duplicated blocks in real repositories grew several-fold while the consolidation signal halved — and that happens one honest slice at a time.

Anything you cannot confirm is unfinished work: `state.mjs note unfinished "<what and why>"`, said plainly (Law 3).

## Compacting status back into PLAN.md

After each verified slice, edit `PLAN.md` in place. One artifact stays authoritative; a trail of `SLICE-3-SUMMARY.md` files means the next session reads whichever it finds first.

```markdown
- [x] Slice <n>: <title> — shipped <sha>. Evidence: evidence/slice-<n>.md.
      Changed from plan: <what the slice actually needed, or "none">
```

If the slice changed the design, amend `PROGRAM-DESIGN.md` too. Two artifacts that disagree are worse than either alone, because the next slice follows whichever it read last, and a misread early fact becomes an architecture several slices later.

## When a slice fails twice — branch and retry

Two failed attempts means the instruction is wrong, not the code. A third fix stacked on a bad base inherits every wrong assumption in it and buries the original mistake under repairs. Reset to the last green sha (`git reset --hard <sha>`, or delete the branch and re-cut from the clean base), rewrite the brief — the ambiguity that produced both failures is in it — and dispatch a fresh subagent. Record it: `state.mjs note ruling "<slice n retried from <sha>: brief ambiguous about <x>; cost if wrong: <y>>"`. Law 8 — decide and continue, do not park the session on it. `state.mjs tick fix` caps fixes at 8 per session; tripping that cap means this slice needs a fresh window, not more attempts.

## When to stop mid-phase

Never estimate your own remaining context — models report this precisely and wrongly. Stop on observable signals instead: parallel tool calls turning sequential, the same correction made twice, fewer than about three files read before an edit, or an urge to write an unrequested summary file. `state.mjs` caps slices at 3 per session and returns `HANDOFF_NOW` when a cap trips. On any of these, finish the current slice or record it partial, then `state.mjs handoff` and stop. Law 2: the answer to a full window is a handoff, never a compressed slice.

## Exit condition

All six must hold before [verify.md](verify.md) runs its final gate:

1. Every slice in `PLAN.md` is `[x]` with a commit sha, or explicitly recorded unfinished in the ledger — none silently dropped.
2. `evidence/slice-<n>.md` exists per slice, with verbatim command output, not a paraphrase.
3. You personally read each slice's diff and re-ran each verification command in-session.
4. No `TODO`, stub, placeholder return, or mock standing in for delivered behaviour anywhere in the diff (Law 4).
5. Every test-file change outside newly added tests carries a written justification.
6. The [anti-slop.md](anti-slop.md) checkpoint has been run and its verdict recorded or its breach ruled on.

## What implement does not do

It does not redesign: an interface that does not survive contact goes back to [program-design.md](program-design.md) as an amendment, not patched inline by whichever subagent hit it first. It does not decide visual interface — anything the user sees routes to `design-ui`, owned by `impeccable`. It does not merge, push to a shared branch, or publish; those are effects outside the worktree and Law 8 stops for them. And it does not declare the feature done — that is [verify.md](verify.md), a deliberately separate pass, because an agent grading its own work reliably praises it.
