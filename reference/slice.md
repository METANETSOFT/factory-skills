# plan

Phase 5 writes `<workspace>/work/<slug>/PLAN.md`: the vertical slices and the order they ship in. It overwrites the build order a model defaults to, and it is the last artifact the user reads before code starts appearing.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts phase plan
```

There is no `plan` job in `skills.ts resolve` — nothing to load. If the plan needs a fact it does not have, that is a [research.md](research.md) detour, not a slice written around the gap.

Read `PROGRAM-DESIGN.md`, `ARCHITECTURE.md`, and `PRD.md` §Acceptance criteria **in full, from disk, now**. Re-read rather than remember: instructions lose the attention competition against more recent tokens, and a plan written from a memory of the design invents signatures the design already settled — which the implementer then follows *instead of* the design.

If `PROGRAM-DESIGN.md` does not exist and the work is non-trivial, stop and run [program-design.md](program-design.md) (Law 5). Slicing an undesigned system produces slices that are file lists, and a file list has nothing to verify. Plan on the main branch — the worktree belongs to [implement.md](implement.md), and nothing here writes code.

## The failure this phase prevents

A model left to sequence its own work builds **horizontally**: all the schema, then all the services, then all the API, then all the UI. Every layer is plausible in isolation, nothing runs until the last layer lands, and the first real feedback arrives at the point in the session where re-steering is most expensive and the context window is fullest. Horizontal order is not a style preference — it is a structural guarantee that all the risk is discovered last.

Humans build **vertically**: one thin path from edge to edge that actually executes, then thicken it. No model has been observed choosing that order unprompted.

| | Horizontal | Vertical |
|---|---|---|
| First thing that runs | after the last slice | after slice 1 |
| A wrong assumption surfaces | at integration, against ~2,000 lines | at slice 1, against ~80 |
| What the user can review | a diff | a running thing |
| Cost of re-steering | the session | one slice |

## The canonical vertical order

Slice 1 is end to end even when every value in it is fake. Adapt the names to the work; keep the shape.

| # | Slice | Proves |
|---|---|---|
| 1 | Endpoint or entry point returns a hard-coded result, wired to its real caller | the route, the wiring, the build and the test command all work |
| 2 | The real surface renders that fake result (real component, real state, stub data) | the contract between the two halves is right |
| 3 | Wire the halves — one real request, one real response, one path | the seam holds under a real call |
| 4 | Migrations and persistence replace the hard-coded value | the data model survives contact with the flow |
| 5 | Business logic — the actual rules, one rule per slice | the feature does what the PRD says |
| 6 | Error paths, empty state, first run, limits | the acceptance criteria on failure modes pass |

Two rules override the template:

- **Riskiest assumption first.** Riskiest is not a feeling: it is an assumption that appears in `RESEARCH.md` §Open unknowns or §What was NOT investigated, or one whose failure invalidates two or more later slices. Promote that slice while a rewrite is still 80 lines.
- **No runnable test command means slice 1 is establishing one**, and nothing else is. Check `FACTORY.md` §Verify gate for a `test` row with exit 0 and a confirmation date. Without it every `Verify` below is prose, and Law 1 has nothing to bite on.

## What counts as a slice

Three tests, all three required:

1. **It runs.** After this slice the system executes. Not compiles — executes.
2. **It is demonstrable.** Name what a human sees, calls or reads that differs from before. "The repository layer now exists" is not a demonstration.
3. **It has its own verification command** — one command, with a machine-checkable expectation (an exit code, a count, a literal string in stdout, an HTTP status), runnable the moment the slice is done.

Mechanical check on the name: if a slice is named for a layer or an artifact ("add the schema", "the service layer", "wire up types") rather than a capability a user could read, it is a horizontal step wearing a slice's name. Re-cut it, or merge it into the slice that makes it observable.

**Every slice carries verification, not just the last one.** A plan that verifies only at the end ships slices 1–7 unproven and hands slice 8 all of their debt at once — and with nothing to run in between, seven "done"s get claimed on evidence nobody produced.

## Size

| Threshold | Governs | Why that number |
|---|---|---|
| 500 added+deleted lines | hard cut — above this, split the slice | reviewers treat 1–2k-line diffs as machine-authored and stop reading; one team declines review above 500, and an unreviewed slice is an unverified slice |
| 300 added lines | run `slop.ts check` mid-slice per [anti-slop.md](anti-slop.md) | per-slice erosion is invisible in one diff and undeniable across eight |
| ~200 lines of `PLAN.md` | the whole plan file | the human checkpoint below only works if the plan is readable in minutes; the 2,000 lines it becomes are not |

If a slice cannot fit under 500, it is two slices — find the intermediate state that still runs. Structural budgets and added/deleted reporting are owned by [anti-slop.md](anti-slop.md); this file only decides where the cuts go. Size against the session too: `state.ts` returns `HANDOFF_NOW` at 3 slice ticks, and setting the total below spends one of them, so a session that plans can implement at most two slices before handing off. A 14-slice plan is a five-session plan, and it survives handoff because `PLAN.md` is the handoff's detail pointer ([context-discipline.md](context-discipline.md)).

## PLAN.md

```markdown
# PLAN — <feature>

<!-- factory-plan 1 · slug: <slug> -->

## Shape
| | |
|---|---|
| Slices | <n> |
| Slice 1 is first because | <one line — thinnest executing path, or the riskiest assumption and where RESEARCH.md flags it> |
| Branch | <name implement.md cuts the worktree from> |
| Test command | `<the command from FACTORY.md §Verify gate that every Verify below extends>` |
| Pass bar | <the PRD outcome and its threshold this plan is aimed at> |

## Slice 1 — <imperative name a user could read>

| | |
|---|---|
| Proves | <the one thing true after this slice that was not true before> |
| Changes | <the behaviour that changes, in one sentence> |
| Files | `path/a.ts` (new) · `path/b.ts` (edit) · `test/c.test.ts` (new) |
| Interface | <the module boundary this slice changes, and whether it is new, widened or untouched — `—` when the slice stays inside one module> |
| Verify | `<exact command>` → <exit code, count, or literal string expected> |
| Demo | <what a human runs or clicks to see it, when that differs from Verify> |
| Rollback | `git revert <commit>` — <what breaks on revert: "nothing", or name it> |
| Depends on | — / slice <n> |
| Status | `[ ]` not started |

## Slice 2 — <...>          <- same block, once per slice

**The `Interface` row is what makes a slice reviewable in one line.** "Refactor the import code" cannot be checked by reading it; "the importer's interface takes a stream instead of a path" can, and it is the row that tells you whether this slice is a boundary change — yours to design — or work inside a boundary that already holds (Law 15, [program-design.md](program-design.md)). Use the module names from the project's vocabulary, not new ones invented here ([language.md](language.md)).

## Criteria coverage
| PRD acceptance criterion | Slice |
|---|---|
| <criterion, verbatim from PRD> | <n> / deferred — see below |

## Not in any slice
[Deferred deliberately, each with one clause of why — a fence, not a backlog. A PRD acceptance criterion appearing here is a contradiction: resolve it now, not at verify.]

## Risks carried into implementation
| Risk | Slice it bites | Cost if it lands |
|---|---|---|
```

Rules the skeleton enforces, and the failure each prevents:

- **Verify is a command, never a description.** "Check the import works" cannot be run, so it gets graded by the agent that wrote it — and agents grading their own work confidently praise it. `npm test -- import.test.ts` → `4 passing` can only be passed by running it.
- **Files are named before implementation, not discovered during it.** An unnamed file list is how a slice grows from 80 lines to 900 without anyone deciding it should.
- **Rollback is a real revert target, which means one commit per slice.** A slice spread over six commits cannot be undone cleanly, so a bad slice gets patched forward instead — and stacking fixes on a bad base is the documented worse path.
- **Depends on is explicit.** An implicit dependency is what makes slice 4 fail mysteriously after slice 2 was reordered.
- **Criteria coverage is a table, not a claim.** Without the mapping, "every criterion is covered" is unfalsifiable at plan time and becomes a gap discovered at [verify.md](verify.md), after the code exists.

## Status compacts back into this file

After a slice verifies, [implement.md](implement.md) rewrites that slice's `Status` cell **in `PLAN.md` itself**:

```
| Status | `[x]` shipped <sha> · evidence/slice-<n>.md · changed from plan: <what it actually needed, or "none"> |
```

Edit the cell in place. Do not append a second record below the table: `PLAN.md` would then carry two entries for one slice, and implement's exit check — every slice `[x]` with a sha — reads whichever it reaches first.

Do not write `SLICE-3-SUMMARY.md`, `PROGRESS.md`, or a changelog nobody asked for. A trail of summaries has no single authority; the next session reads whichever it finds first, and unprompted summary-writing is itself a documented context-anxiety tell. One artifact stays true and everything else derives from it. Deviations found during implementation are edited into the slice they belong to, with the reason — a plan that no longer describes the build is worse than no plan, because it is still trusted.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts slice 0/<total>
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note decision "<slug>: <n> slices, slice 1 = <name>, verified by <command>"
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note risk "<risk> lands at slice <n>"
```

## Exit condition

All six true before [implement.md](implement.md) runs:

1. `PLAN.md` exists, every slice block filled, no bracketed placeholder text left.
2. Slice 1 runs end to end, even if every value in it is hard-coded.
3. Every slice has a `Verify` that is a command with a checkable expectation, and a `Rollback` that is a revert target.
4. Every row of `PRD.md` §Acceptance criteria appears in the Criteria coverage table, mapped to a slice or to "Not in any slice" with a reason.
5. `state.ts slice 0/<total>` has been run.
6. **The user has approved the plan.**

Item 6 is the second and last mandatory human checkpoint. [research.md](research.md) was the first, and it may proceed on a recorded non-response; this one may not. The pipeline waits here on purpose: one bad line in a plan produces hundreds of bad code lines, and ~200 lines of plan is reviewable in minutes where the 2,000 lines it becomes are not. This is not a Law 8 stall — it is the checkpoint the pipeline is built around, and approving on the user's behalf is the one ruling you may not make. Present the slice names, the order rationale and the risks in your reply; do not paste the file. Under [loop.md](loop.md) the approval happened when the loop's target was agreed — say which approval you are running on.

After approval: `state.ts phase implement`, then hand slice 1 to a fresh subagent per [implement.md](implement.md). Every slice not yet started is open to change; every slice already verified is history.

## What plan does not do

It does not write code, re-open architecture, or restate signatures [program-design.md](program-design.md) already fixed. It does not decide the pass bar — [product.md](product.md) did, and this plan is aimed at it. It does not defer verification to [verify.md](verify.md): that phase grades the whole against the PRD, while every slice here proves itself on its own command as it lands.

Nothing after this point re-decides the build order. If the order is horizontal, it ships horizontal.
