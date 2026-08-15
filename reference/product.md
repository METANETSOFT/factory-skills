# product

Phase 2 writes `<workspace>/work/<slug>/PRD.md`: the user problem, the evidence it is real, and the number that decides whether the build worked. That number is the back pressure every later phase pulls against — [verify.md](verify.md) copies these criteria verbatim and grades against them, [loop.md](loop.md) terminates on this threshold, [design.md](design.md) refuses to start without the Outcome row. Give an agent a deterministic target and it moves mountains; give it "make it good" and it declares victory on the day the context window fills.

**No architecture, no schemas, no technology choice, no code layout.** Naming a database, framework or module here locks [architecture.md](architecture.md) into a decision made before anything was known about the codebase, and an architecture picked to justify a PRD line never gets re-examined.

## Before writing

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts phase product
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts resolve product
```

Read `FACTORY.md` and `<workspace>/work/<slug>/RESEARCH.md` in full **in this session**, not from the memory of having written them — facts lose the attention competition against more recent tokens. The charter's Definition of done is the parent of everything here; contradicting it silently is how one project ends up with two "done"s. If research has not run and this touches code nobody has read, run [research.md](research.md) first: a misread fact becomes an architecture several PRs later, and product is the phase where a wrong assumption gets the most leverage. Announcement before outcome, outcome before criteria — reversed, you get the metric that was easiest to measure with a problem statement written afterwards to justify it.

## Step 1 — The announcement, before the thing

Write the paragraph you would publish the day this ships — a changelog entry for an existing product, a launch note for a new one. Past tense, names the user and what changed for them, **under 120 words**, no feature list, no roadmap.

- Banned words: *improved, enhanced, streamlined, better, seamless, powerful, robust*. If one survives a rewrite, the problem is not understood yet; return to the problem statement rather than proceeding with a vaguer one.
- Pass condition: a reader who has never seen this codebase can state what a user can now do that they could not before. If it can only be described as its own implementation, you are about to ship something working that changes nothing anyone can name.
- Post it in your reply. If the user corrects it, rewrite before Step 2 — this is the cheapest correction point in the pipeline, one paragraph against a session. **Do not block waiting for a reply** (Law 8): continue and record what you assumed. It is a comprehension check, not launch copy; [marketing.md](marketing.md) owns the published version and may rewrite it entirely.

## Step 2 — One measurable outcome

Exactly one primary outcome. Two primaries means neither breaks the tie when they conflict, and something always conflicts.

| Tier | Form | Use when | Why it ranks here |
|---|---|---|---|
| 1 — business number | `p95 import < 4s for 10k rows`, `import tickets <= 5/week` | the quantity exists or can be measured today | deterministic; the agent runs it and knows without asking anyone |
| 1b — machine-checked proxy | a command, exit code or metric standing in for a tier-1 number that needs weeks of production data | the real number is real but slow | honest only while *declared* a proxy; a proxy quietly promoted to the goal is how "tests pass" becomes "it works" |
| 2 — judged rubric | N written criteria, each scored against its own threshold by a separate evaluator | the quality resists counting — copy, layout, tone | admissible, but the judge is never the builder: a model grading its own work confidently praises it |
| 3 — vibe | "feels fast", "looks good", "users will love it" | never | unmeasurable, so unfalsifiable, so it grades as passed under pressure |

Every outcome carries all of these, written into the PRD's Outcome table:

1. **What is measured** — a quantity with units.
2. **Measured by** — the exact command, query or rubric, runnable verbatim by [verify.md](verify.md) with no human present.
3. **Baseline** — run that command *now* and write its raw output to `<workspace>/work/<slug>/evidence/baseline-<metric>.txt`, the only file product writes into `evidence/`. A threshold with no baseline is a guess dressed as a target, and a baseline taken after implementation measures a number the implementation already moved (Law 1: a number you remember is not a number you measured).
4. **Threshold** — a comparison an operator can evaluate: `<=`, `>=`, `<`, `>`, `==`, with units. "Fast" is not a threshold.
5. **Observation point** — where the number is read from: a log line, an endpoint, a query, a test. [architecture.md](architecture.md) rejects a metric with nowhere to be read from, and rejecting it there costs a redesign instead of a sentence.
6. **Tier 2 only** — write the rubric now, one threshold per criterion, judged by a **fresh subagent with no implementation context** reporting a verdict per criterion and no aggregate. Split by context boundary, not by role; the failure it guards against is a model identifying legitimate issues and then talking itself into deciding they were not a big deal.

## Step 3 — Negotiate "done" before any code exists

- **Write the criteria now**, before a line exists. Criteria written after code are written by someone with a diff to defend.
- **Every criterion thresholded, and any single criterion below threshold fails the phase.** No aggregate, no "8 of 10 is fine" — an average lets one real failure be absorbed by nine easy passes.
- **State the failing case, not only the passing one.** "A 10k-row CSV imports" is not checkable. "A 10k-row CSV imports in under 4s, and a malformed row 5,000 rejects the whole file naming that row, importing nothing" is.
- **Mandatory rows: at least one error path, at least one empty / first-run state, and one per surface state listed in *What the user sees*.** Partial implementation, edge-case omission and error-path skipping are the documented shape of agent coverage gaming; naming those paths before tests exist is what stops the tests being written only against the happy one.
- **Floor: fewer than five rows on anything with a surface means "done" is not defined yet.** Anthropic's harness routinely carries dozens — one sprint carried 27. A three-row PRD is a preference, not a contract.
- **Anything the user asked for that has no criterion goes under Out of scope with a reason.** Dropping it silently is the one unrecoverable error: the user believes they have something they do not have (Law 3).
- Criteria are the contract; they are not tests. [program-design.md](program-design.md) turns them into test signatures; [verify.md](verify.md) copies them verbatim into its evidence table.

## Step 4 — Mock every surface

- **Anything with a surface gets HTML mockups before the PRD is final** — one self-contained file per screen per state, at `<workspace>/work/<slug>/mockup-<screen>-<state>.html`. No framework, no build step, no CDN link, inline CSS, opens over `file://`.
- **Mandatory states**: default, empty / first-run, error — plus loading wherever a wait can exceed 400ms.
- **Grey-box means checkable**: system font stack, greyscale fills, one accent used only on the interactive element, no brand colours, no imagery, no icon set. A mockup that looks finished gets approved as a design, and then the real design work arrives as an argument. Visual craft is owned by `impeccable` through [design.md](design.md); these are scope artifacts and are handed over as "this is the screen", never "this is the direction".
- **Real-shaped data**: the longest realistic string, the true row count from `RESEARCH.md`, the actual error text. Lorem hides exactly the layout problem you are mocking to find.
- Show them and ask one question: *is this the screen?* Do not block on the answer (Law 8) — proceed and note the ruling. Keep the files; implementation builds against them.
- **Headless change with no surface**: say so explicitly in the PRD and give the command, request or log line that changes, before and after. Scope agreed in prose is discovered wrong during implementation, at the point where re-steering costs the most.

## Step 5 — Write PRD.md

```markdown
# PRD — <feature>

## Problem
[One paragraph in the user's terms: what they cannot do, or what it costs them to do it now.
No solution. If the sentence only parses once you name the implementation, it is not the problem.]

## Who has it
[The specific user and the situation they are in when they hit it. "Users" is not an answer.]

## Evidence it is real
| Claim | Source | Strength |
|---|---|---|
| <the problem occurs> | <ticket #, log line, metric, RESEARCH.md §, or "the user said so on <date>"> | observed / reported / inferred |

[Cite the source, do not paste it: a pasted log or query string carries credentials into a file the
factory writes (Law 10). Every `inferred` row is a risk, not a fact; if every row is inferred, say so
in one line before continuing — you are about to build on an assumption nobody has checked.]

## Outcome
| | |
|---|---|
| What is measured | <quantity with units> |
| Measured by | <the exact command, query or rubric> |
| Baseline today | <value, with the date, raw output at evidence/baseline-<metric>.txt> |
| Threshold to pass | <comparison, e.g. p95_ms <= 4000> |
| Observation point | <log line / endpoint / query / test the number is read from> |
| Tier | business number / machine-checked proxy / judged rubric |

[Proxy or rubric: name the business number it stands in for, and name the judge. Never the builder.]

## Announcement
[Past tense, names the user and what changed for them, under 120 words, no feature list.]

## What the user sees
| Surface | State | Mockup |
|---|---|---|
| <screen> | default / empty / error / loading | `mockup-<screen>-<state>.html` |

[Headless change: the command, request or log line that changes, before and after.]

## Out of scope
[What this deliberately does not do, each with one clause of why — including anything the user asked
for that has no acceptance criterion. A fence, not a backlog; empty claims everything adjacent is in.]

## Acceptance criteria
| # | Criterion (observable, user-facing) | How checked | Threshold | Checked by |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |

[Every row thresholded; any single row below threshold fails the phase, there is no average. At
least one error path, at least one empty / first-run state, one per surface state above.]

## Open questions
[Anything decided by ruling, with its cost-if-wrong. Empty is valid; vague is not.]
```

Record the bar as it is settled, not in a summary at the end that a truncated session never writes (Law 7):

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note decision "<slug>: pass bar is <metric> <op> <threshold>, measured by <command>"
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note risk "<claim> is inferred, not observed"
```

## When to skip this phase

Two cases, and only these:

| Case | Test that it qualifies | What replaces the PRD |
|---|---|---|
| A scoped bugfix | You can cite where the correct behaviour is already specified — a test, a doc, a prior PRD. If you cannot name that location, it is not a scoped bugfix. | Nothing; the spec exists. Go to [debug.md](debug.md) or straight to the slice. |
| A pre-PMF throwaway experiment | Its only output is a learning, and you can name the date it gets deleted. Anything you intend to keep is not throwaway. | One ledger line: the hypothesis, the signal that confirms or kills it, the deletion date. |

Skipping is a ruling, never a default:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note ruling "skipping product: scoped fix to <behaviour>, spec lives at <where>"
```

Say it out loud in your reply as well: a silent skip is indistinguishable from forgetting, and the artifact that would have caught the missing success measure is the one nobody notices is absent. **"I cannot write a measurable outcome" is not a skip condition** — it is one question to the user, and if nobody can answer it, a ruling under Law 8 recording the proxy you gated on and its cost-if-wrong.

## Exit condition

All six true before [architecture.md](architecture.md) starts; anything you could not establish is named under Open questions and noted (Law 3), not smoothed over.

1. `<workspace>/work/<slug>/PRD.md` exists with every section filled, and `grep -n '^\[' <workspace>/work/<slug>/PRD.md` returns nothing — no template prose left in.
2. Outcome names a quantity with units, the command or rubric measuring it, a threshold as a comparison, and an observation point — at tier 1, 1b or 2, never a vibe.
3. The baseline command was run this session and its raw output is at `<workspace>/work/<slug>/evidence/baseline-<metric>.txt`.
4. Acceptance criteria: every row thresholded, at least one error path, at least one empty / first-run state, and none of the user's stated asks missing from both the criteria and Out of scope.
5. Every surface in *What the user sees* has its mockup files on disk for each listed state, or the PRD states the change is headless and names the before/after.
6. The announcement is written, under 120 words, carrying no claim you could not back with the outcome number or a mockup.

## What product does not do

It does not choose a database, framework, library, host or file layout — [architecture.md](architecture.md) does, afterwards. It does not write schemas, signatures or tests — [program-design.md](program-design.md) does. It does not do visual design; the mockups are grey-box scope questions. It does not invent a user, a customer, a metric or a benchmark: a fabricated number is worse than no number, because every phase downstream then optimises honestly against a lie.
