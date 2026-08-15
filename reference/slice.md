# plan

Phase 5 writes `.factory/work/<slug>/PLAN.md`: the vertical slices and the order they ship in. It exists to overwrite the build order a model defaults to, and it is the last thing the user reads before code starts appearing.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs phase plan
```

There is no `plan` job in the skill tree — nothing to resolve. If the plan needs a fact it does not have, that is a [research.md](research.md) detour, not a slice written around the gap.

Read `PROGRAM-DESIGN.md`, `ARCHITECTURE.md` and the PRD's acceptance criteria table **in full, now**. Re-read rather than remember: instructions lose the attention competition against more recent tokens, and a plan written from a memory of the design invents signatures the design already settled — which the implementer then follows instead of the design.

If `PROGRAM-DESIGN.md` does not exist and the work is non-trivial, stop and run [program-design.md](program-design.md) (Law 5). Slicing an undesigned system produces slices that are file lists, and a file list cannot be verified.

## The failure this phase prevents

A model left to sequence its own work builds **horizontally**: all the schema, then all the services, then all the API, then all the UI. Every layer is plausible in isolation, nothing runs until the last layer lands, and the first real feedback arrives at the point in the session where re-steering is most expensive and the context window is most full. Horizontal order is not a style preference — it is a structural guarantee that all the risk is discovered last.

Humans build **vertically**: one thin path from edge to edge that actually executes, then thicken it.

| | Horizontal | Vertical |
|---|---|---|
| First thing that runs | after the last slice | after slice 1 |
| When a wrong assumption surfaces | at integration, against 2,000 lines | at slice 1, against 80 |
| What the user can review | a diff | a running thing |
| Cost of re-steering | the session | one slice |

No model has been observed choosing the vertical order unprompted. That is the entire job of this file.

## The canonical vertical order

Slice 1 is end-to-end even when every value in it is fake. Adapt the names to the work; keep the shape.

| # | Slice | Proves |
|---|---|---|
| 1 | Endpoint or entry point returns a hard-coded result, wired to the real caller | the route, the wiring, the build and the test command all work |
| 2 | The real surface renders that fake result (real component, real state, stub data) | the contract between the two halves is right |
| 3 | Wire the halves end to end — one real request, one real response, one path | the seam holds under a real call |
| 4 | Migrations and persistence replace the hard-coded value | the data model survives contact with the flow |
| 5 | Business logic — the actual rules, one at a time | the feature does what the PRD says |
| 6 | Error paths, empty state, first-run, limits | the acceptance criteria on failure modes pass |

Two ordering rules override the template. **Riskiest assumption first** — the slice most likely to invalidate the design goes early, while a rewrite is still cheap. And if `FACTORY.md` recorded no working test command, establishing one is slice 1 and nothing else is, because until then no slice below can be verified and the whole plan is prose.

## What counts as a slice

Three tests, all three required:

1. **It runs.** After this slice the system executes. Not compiles — executes.
2. **It is demonstrable.** You can name what a human sees, calls or reads that differs from before. "The repository layer now exists" is not a demonstration.
3. **It has its own verification command** — a specific command with a specific expected result, runnable the moment the slice is done.

If a slice's verification is "the tests still pass" or "it builds", it is not a slice; it is a checkpoint in a horizontal build wearing a slice's name. Split it differently or merge it into the slice that makes it observable.

**Every slice carries verification, not just the last one.** A plan that verifies only at the end means slices 1–7 ship unproven and slice 8 inherits all of their debt at once — and Law 1 has nothing to bite on in between, so seven "done"s get claimed on evidence nobody produced.

## Size

Keep each slice's diff **under 500 lines**. Reviewers treat 1–2k-line diffs as machine-authored and stop reading them; one team declines review above 500 outright, and an unreviewed slice is an unverified slice. If a slice cannot fit, it is two slices — find the intermediate state that runs. The structural budget and the added/deleted reporting live in [anti-slop.md](anti-slop.md); this file only decides where the cuts go.

Also size against the session: `state.mjs` caps a session at 3 slices. A 14-slice plan is a five-session plan, and it must survive handoff — which it does, because the plan file is the handoff's detail pointer ([context-discipline.md](context-discipline.md)).

## PLAN.md

```markdown
# PLAN — <feature>

<!-- factory-plan 1 · slug: <slug> -->

## Shape
| | |
|---|---|
| Slices | <n> |
| Slice 1 is first because | <one line — usually: thinnest path that actually executes> |
| Branch / worktree | <name> |
| Test command | <the command every Verify below extends> |
| Pass bar | <the PRD outcome and threshold this plan is aimed at> |

## Slice 1 — <imperative name a user could read>

| | |
|---|---|
| Proves | <the one thing true after this slice that was not true before> |
| Changes | <the behaviour that changes, in one sentence> |
| Files | `path/a.ts` (new) · `path/b.ts` (edit) · `test/c.test.ts` (new) |
| Verify | `<exact command>` → <exact expected output or exit condition> |
| Demo | <what a human runs or clicks to see it, when that differs from Verify> |
| Rollback | `git revert <commit>` — <what breaks on revert: "nothing" or name it> |
| Depends on | — / slice <n> |
| Status | not started |

## Slice 2 — <...>
<same block, repeated per slice>

## Not in any slice
[Deferred deliberately, each with one clause of why. A fence, not a backlog.
Anything here that the PRD's acceptance criteria require is a contradiction — resolve it now, not at verify.]

## Risks carried into implementation
| Risk | Slice it bites | Cost if it lands |
|---|---|---|
```

Rules the skeleton enforces, and the failure each one prevents:

- **Verify is a command, never a description.** "Check the import works" cannot be run, so it gets graded by the agent that wrote it — and agents grading their own work confidently praise it. `npm test -- import.test.ts` → `4 passing` can only be passed by running it.
- **Files are named before implementation, not discovered during it.** An unnamed file list is how a slice grows from 80 lines to 900 without anyone deciding it should.
- **Rollback is a real revert target, which means one commit per slice.** A slice spread over six commits cannot be undone cleanly, so a bad slice gets patched forward instead of reverted — and patching a bad base is the documented worse path.
- **Depends on is explicit.** An implicit dependency is what makes slice 4 mysteriously fail after slice 2 was reordered.

## Status compacts back into this file

After a slice verifies, rewrite that slice's `Status` row **in `PLAN.md` itself**:

```
| Status | verified 2026-08-15 — evidence/slice-3-import.txt · +140 / -22 |
```

Do not write `SLICE-3-SUMMARY.md`, `PROGRESS.md` or a changelog nobody asked for. A trail of summaries has no single authority: the next session reads whichever it finds first, and unprompted summary-writing is itself a documented context-anxiety tell. One artifact stays true; everything else is derived from it. Deviations discovered during implementation are edited into the slice they belong to, with the reason — a plan that no longer describes the build is worse than no plan, because it is still trusted.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs slice 0/<total>
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note decision "<slug>: <n> slices, slice 1 = <name>, verified by <command>"
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note risk "<risk> lands at slice <n>"
```

## Exit condition

All six true before [implement.md](implement.md) runs:

1. `PLAN.md` exists with every slice block filled and no bracketed placeholder text left.
2. Slice 1 runs end to end, even if every value in it is hard-coded.
3. Every slice has a `Verify` command that is a command, and a `Rollback` that is a revert target.
4. Every PRD acceptance criterion maps to at least one slice, or appears under "Not in any slice" with a reason.
5. `state.mjs slice 0/<total>` has been set.
6. **The user has approved the plan.**

Item 6 is the second and last mandatory human checkpoint — [research.md](research.md) was the first. The pipeline waits here on purpose: ~200 lines of plan is reviewable in minutes, the 2,000 lines it becomes are not, and one bad line here produces hundreds of bad code lines. This is not a Law 8 stall — it is the checkpoint the pipeline is built around, and approving on the user's behalf is the one ruling you may not make. Present the slice names, the order rationale and the risks in your reply; do not paste the file. Under [loop.md](loop.md) the approval already happened when the loop's target was agreed — say which approval you are running on.

After approval: `state.mjs phase implement`, and hand slice 1 to a fresh subagent per [implement.md](implement.md). Every slice not yet started is still open to change; every slice already verified is history.

## What plan does not do

It does not write code, re-open architecture, or restate signatures [program-design.md](program-design.md) already fixed. It does not decide the pass bar — [product.md](product.md) did, and this plan is aimed at it. It does not defer verification to [verify.md](verify.md): that phase grades the whole against the PRD, while every slice here proves itself on its own command as it lands.

Nothing in the pipeline after this point re-decides the build order. If the order is horizontal, it ships horizontal.
