# implement

Phase 6 is where `PLAN.md` becomes code that a stranger can check. It writes no document of its own: the deliverable is commits plus one `evidence/slice-<n>.md` per slice, and the orchestrator's job is not to write code but to dispatch, read diffs, and refuse.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts phase implement
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts resolve implement
```

`skills.ts` names `full-output-enforcement` (always — the anti-truncation contract behind Law 2) and `find-docs` when a library API is involved. Installed → use it. Missing but installable → offer the one-line install. Unavailable → take the map's `degrade` path and say out loud that you are on it; never fabricate a repository URL.

**Every named library, SDK, CLI or cloud service gets its facts from Context7 before it is called** — `npx ctx7@latest library "<name>" "<what to look up>"`, then `npx ctx7@latest docs <id> "<question>"`. Training data lags releases, and a subagent writing a call has no way to know the signature it remembers was retired two versions ago.

## The worktree

Read `PLAN.md` §Shape first: it names the **branch** implementation cuts from and the **test command** every slice's Verify extends. Cutting from the wrong base is how slice 1 fails on code that was never merged.

```bash
git worktree add ../<repo>-<slug> -b factory/<slug> <base-branch-from-PLAN.md>
```

Implementation is the only phase that gets a worktree; research and planning ran on main and cost nothing to redo. Worktrees isolate the filesystem, subagents isolate context, and neither substitutes for the other: two subagents in one worktree still stamp on each other's files, and two worktrees do not stop an agent inheriting poisoned session history.

## The slice loop

For every slice in `PLAN.md`, in plan order, one at a time, never batched:

1. **Re-read `PLAN.md` from disk — every slice, not from memory.** Instructions lose the attention competition against more recent tokens; this is the same mechanism that makes CLAUDE.md stop working late in a session. A remembered plan drifts toward whatever the last slice happened to build.
2. Dispatch one fresh subagent with the brief below, then `node ${CLAUDE_SKILL_DIR}/scripts/state.ts tick subagent`.
3. **Read the diff yourself** — `git diff --stat <base>..HEAD`, then the full `git diff`. See *Checking the work*.
4. Re-run the slice's `Verify` command from `PLAN.md` and read its output and exit code. Law 1: if you did not run it in this message, it does not pass.
5. `node ${CLAUDE_SKILL_DIR}/scripts/state.ts slice <n>/<total>`.
6. Apply the five-step gate in [verify.md](verify.md) to the sentence "slice n ships X", then `node ${CLAUDE_SKILL_DIR}/scripts/slop.ts check` — before closing the slice, and mandatorily on any slice adding **>300 lines**. Structural erosion rises across ~80% of chained agent trajectories; prose slows that down, only the measured check catches it. A breach you intend to accept is a ruling, never a re-baseline.
7. Edit the slice's `Status` cell in `PLAN.md` in place — format owned by [slice.md](slice.md). Do not append a second record and do not write `SLICE-3-SUMMARY.md`.
8. `state.ts note decision "<slice n: what shipped, what was ruled>"`. Law 7 — the ledger is written as it happens, not in a summary a truncated session never reaches.

## Dispatching the slice subagent

A subagent starts with **zero context**: it cannot see this conversation, the earlier slices, the Laws, or the reason any of it exists. Hand-construct the brief; never assume inherited history. Split by context boundary, never by role — a planner → implementer → tester chain is a documented anti-pattern that degrades into a telephone game, and multi-agent runs already burn 3–10× the tokens, so delegate for isolation, not for theatre.

**Who gets the brief is decided first.** `node ${CLAUDE_SKILL_DIR}/scripts/skills.ts worker` names the executor and the envelope it covers. If writing this slice is inside that envelope, the slice goes to the worker (Law 11, [worker.md](worker.md)) and the brief opens with the verbatim announce line — without it the agent you dispatched does the labor itself and the delegation bought nothing. If the slice needs something the worker cannot do, it stays with a harness subagent and you say which capability was missing. Either way `state.ts tick subagent` counts it, and you still read the diff.

```markdown
<the recorded worker's announce line, verbatim, when the slice is inside its envelope — omit otherwise>

GOAL (why this exists): <the user-visible outcome this slice serves, in one sentence>
SLICE <n> of <total>: <the slice block from PLAN.md, verbatim>

You have no prior context. Everything you need is below or in the files named.

READ FIRST: <workspace>/work/<slug>/PROGRAM-DESIGN.md — §Interfaces, §Call stack, §Tests
             <workspace>/work/<slug>/PLAN.md — slice <n> only

BUILD: <the one behaviour, end to end — route to storage to response, thin>
FILES YOU MAY TOUCH: <the Files list from the slice, verbatim>. Outside it, stop and report
  instead of creating — an unbounded file list is how a slice grows from 80 lines to 900.
INTERFACES: implement the signatures in PROGRAM-DESIGN.md exactly. If one is wrong, report it
  — do not redesign here. Resolve any third-party API through `npx ctx7@latest` before calling it.
CONSTRAINTS (PROGRAM-DESIGN.md §Constraints wins where it names a different number):
  function ≤ 50 lines · cyclomatic complexity ≤ 10 · nesting ≤ 3 · parameters ≤ 4
  · no new abstraction with fewer than 2 real call sites · no error handling beyond top-level
  try/catch unless the error mode is named in PROGRAM-DESIGN.md · whole slice diff ≤ 500 lines.
  No TODOs, no stubs, no placeholder returns, no `// ...unchanged`, no emoji or narration
  comments. No secret, key, token or connection string in code or output — read from env.

TDD: write the failing test first; run it; show it fail. Then write only enough code to pass
  that one test. Run it; show it pass. Commit. Repeat per test.
PROVE IT: <the exact command from the slice's Verify cell> → <the exit code or literal string
  expected>

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
Diff: +<added> / -<deleted> across <k> files   (from `git diff --shortstat`)
Tests added: <path::name>  — asserts through <interface from PROGRAM-DESIGN.md>
Verification run:
  $ <command>
  <verbatim output, not a paraphrase>
  exit <code>
Test files touched outside the new tests: <none | path + why, in one sentence>
Unfinished: <what and why — never omitted>
Interfaces that did not survive contact: <name + what was actually needed>
```

## TDD ordering inside the slice

Test first. Watch it fail. Write only enough code to pass that one test. Watch it pass. Commit on green, then take the next test. Not: all the tests, then all the code — a test written after the code encodes what the code does rather than what was wanted, and passes on its first run, which proves nothing.

- **A regression fix is only proven by reverting the fix and watching the test fail.** Do that, and paste both outputs.
- Commit on each green so a failed later step reverts to a working base rather than rubble — this is what makes *branch and retry* cheap.
- **Squash to one commit before closing the slice.** `PLAN.md` records `Rollback: git revert <sha>`, and a slice spread over six commits cannot be reverted cleanly, so a bad slice gets patched forward instead — the documented worse path.

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

**A subagent reporting success is not evidence.** It is a listed failure, not a judgement call: agents have fabricated `git bisect` output, claimed to have written and run tests that never existed, and produced a Playwright recording of a bug repro staged entirely inside an artificial page. A worker's report is the same claim from different hands: judge what it returns, and treat "done" with an empty changed-file list as not done. Before accepting any slice:

1. Read `git diff <base>..HEAD` in full. Not the summary — the diff.
2. Confirm every changed file is on the brief's `FILES YOU MAY TOUCH` list, and every new abstraction has ≥ 2 real call sites. One adapter is a hypothetical seam; two is a real one.
3. Re-run the `Verify` command yourself and read its output and exit code in this message. `42 passing` with exit 1 is a failing suite.
4. Check the tests against the six patterns above.
5. Confirm **both** `+added` and `-deleted` were reported. A slice adding >200 lines and deleting 0 gets read by hand for the copy it made instead of the call it should have made — duplicated blocks in real repositories grew 4–8× while the consolidation signal halved, one honest slice at a time.
6. Confirm the slice diff is ≤ 500 lines, or record a ruling saying why it is not. One team declines review above that, and unreviewed is unverified.

Anything you cannot confirm is unfinished work: `state.ts note unfinished "<what and why>"`, said plainly (Law 3).

## When a slice fails twice — branch and retry

Two failed attempts means the instruction is wrong, not the code. A third fix stacked on a bad base inherits every wrong assumption in it and buries the original mistake under repairs. Reset to the last green sha (`git reset --hard <sha>`, or delete the branch and re-cut from the base named in `PLAN.md` §Shape), rewrite the brief — the ambiguity that produced both failures is in it — and dispatch a fresh subagent. Record it: `state.ts note ruling "<slice n retried from <sha>: brief ambiguous about <x>; cost if wrong: <y>>"`. Law 8 — decide and continue, do not park the session on it. `state.ts tick fix` caps fixes at **8** per session; tripping that cap means this slice needs a fresh window, not a ninth attempt.

If the same correction is needed a third time across slices, encode it as a lint rule or a test rather than a note — a one-time correction becomes slope control only when the harness enforces it ([hooks.md](hooks.md)).

## When to stop mid-phase

Never estimate your own remaining context — models report this precisely and wrongly. Stop on observable signals instead: parallel tool calls turning sequential, the same correction made twice, fewer than 3 files read before an edit, or an urge to write an unrequested summary file. `state.ts` caps slices at **3** and subagents at **12** per session and returns `HANDOFF_NOW` when a cap trips. On any of these, finish the current slice or record it partial, then `state.ts handoff` and stop. Law 2: the answer to a full window is a handoff, never a compressed slice.

## Exit condition

All seven must hold before [verify.md](verify.md) runs its final gate:

1. Every slice in `PLAN.md` carries `[x]` with a commit sha, or is recorded unfinished in the ledger — none silently dropped.
2. `evidence/slice-<n>.md` exists per slice, with verbatim command output and an exit code, not a paraphrase.
3. You personally read each slice's diff and re-ran each `Verify` command in-session.
4. No `TODO`, stub, placeholder return, or mock standing in for delivered behaviour anywhere in `git diff <base>..HEAD` (Law 4), and no secret in any file the slice added (Law 10).
5. Every test-file change outside newly added tests carries a written justification in its slice result file.
6. `slop.ts check` has been run over the phase and its verdict recorded, or its breach ruled on ([anti-slop.md](anti-slop.md)).
7. `PLAN.md` and `PROGRAM-DESIGN.md` agree with the code as built — any interface that changed under contact was amended in `PROGRAM-DESIGN.md`, not left contradicted. Two artifacts that disagree are worse than either alone: the next slice follows whichever it read last.

## What implement does not do

It does not redesign: an interface that did not survive contact goes back to [program-design.md](program-design.md) as an amendment, not patched inline by whichever subagent hit it first. It does not decide visual interface — anything the user sees routes through `skills.ts resolve design-ui`, owned by `impeccable`. It does not merge, push to a shared branch, or publish; those are effects outside the worktree and Law 8 stops for them. And it does not declare the feature done — that is [verify.md](verify.md), a deliberately separate pass, because an agent grading its own work reliably praises it.
