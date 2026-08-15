# product

Phase 2 writes `.factory/work/<slug>/PRD.md`: the user problem, the evidence it is real, and the number that decides whether the build worked. That number is the back pressure every later phase pulls against — [verify.md](verify.md) grades against the acceptance criteria written here, and [loop.md](loop.md) terminates on this threshold. Give an agent a deterministic target and it moves mountains; give it "make it good" and it declares victory.

**No architecture, no schemas, no technology.** Naming a database, a framework or a file layout here locks [architecture.md](architecture.md) into a choice made before anything was known about the codebase, and an architecture picked to justify a PRD line never gets re-examined.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs phase product
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs resolve product
```

Read `FACTORY.md` and `.factory/work/<slug>/RESEARCH.md` in full first — the charter's Definition of done is the parent of everything you write here, and contradicting it silently is how two "done"s end up in one project. If research has not run and this touches code nobody has read, run [research.md](research.md) first: a misread fact becomes an architecture several PRs later, and product is the phase where a wrong assumption gets the most leverage.

Then: announcement (1) → outcome (2) → criteria (3) → mockups (4) → write the PRD (5).

## Step 1 — Write the announcement before the thing

Write the paragraph you would publish the day this ships: a changelog entry for an existing product, a launch note for a new one. Past tense, names the user and what changed for them, under 120 words, no feature list.

If you cannot write it without "improved", "enhanced", "streamlined" or "better", the problem is not understood yet — go back to the problem statement, do not proceed. Show it to the user before continuing when there is a user to show: this is the cheapest correction point in the pipeline, since a wrong announcement costs one paragraph and a wrong build costs the session. The failure it prevents is the feature describable only as its own implementation — shipped, working, and producing no change any user can name.

## Step 2 — The measurable outcome

Exactly one primary outcome. Two primaries means neither breaks the tie when they conflict, and something always conflicts.

| Tier | Form | Use when | Why it ranks here |
|---|---|---|---|
| 1 — business number | `p95 import under 4s for 10k rows`, `import support tickets under 5/week` | the quantity already exists or can be measured today | deterministic, and the agent can run it and know without asking anyone |
| 1b — machine-checked proxy | a script, exit code or metric standing in for a tier-1 number that needs weeks of production data | the real number is real but slow | honest only while it is *declared* a proxy; a proxy quietly promoted to the goal is how "tests pass" becomes "it works" |
| 2 — judged rubric | N written criteria, each scored against a threshold by a separate evaluator | the quality resists counting — copy, layout, tone | acceptable, but the judge is never the builder: agents grading their own work confidently praise it |
| 3 — vibe | "feels fast", "looks good", "users will love it" | never | unmeasurable, so unfalsifiable, so it grades as passed on the day the context window fills |

Every outcome carries four things: what is measured, the exact command or rubric that measures it, **the baseline measured in this session**, and the threshold. A threshold with no baseline is a guess dressed as a target. Measuring the baseline now costs one command; measuring it after implementation means measuring a number the implementation already moved (Law 1 — a baseline you remember is not a baseline you measured).

## Step 3 — Negotiate "done" before any code exists

Write the acceptance criteria now. Criteria written after code are written by someone with a diff to defend; Anthropic's own harness has the builder and the evaluator agree what done means *before* coding, and a sprint carrying 27 criteria is normal rather than excessive.

- **Every criterion thresholded, and any single criterion below threshold fails the phase.** No aggregate, no "8 of 10 is fine" — an average lets one real failure be absorbed by nine easy passes, which is precisely the move a model makes when it identifies a legitimate issue and then talks itself into deciding it was not a big deal.
- **State the failing case, not only the passing one.** "A 10k-row CSV imports" is not checkable. "A 10k-row CSV imports in under 4s, and a malformed row 5,000 rejects the whole file naming that row, importing nothing" is.
- **At least one criterion on the error path and one on the empty / first-run state.** Partial implementation, edge-case omission and error-path skipping are the documented shape of agent coverage gaming, so the criteria have to name those paths before the tests are written against them.
- Criteria are the contract; they are not tests. [program-design.md](program-design.md) turns them into test signatures.

## Step 4 — Mock the surface

Anything with a surface gets HTML mockups before the PRD is final.

- One self-contained file per screen **and per material state**, at `.factory/work/<slug>/mockup-<screen>.html`. No framework, no build step, inline CSS.
- Real copy and real-shaped data: the longest realistic string, the actual row count, the empty state, the error state. Lorem hides exactly the layout problem you are mocking to find.
- **Grey-box fidelity.** This is a scope question, not a design deliverable — visual craft is owned by `impeccable` through [design.md](design.md). A mockup that looks finished gets approved as a design, and then the real design work arrives as an argument.
- Show them and ask one question: *is this the screen?* Keep the files; implementation builds against them.
- Headless change with no surface: say so explicitly in the PRD and give the command, request or log line that changes, before and after.

The failure this prevents is scope agreed in prose and discovered wrong during implementation, at the exact point where re-steering costs the most.

## Step 5 — Write PRD.md

```markdown
# PRD — <feature>

<!-- factory-prd 1 · slug: <slug> -->

## Problem
[One paragraph in the user's terms: what they cannot do, or what it costs them to do it now.
No solution. If the sentence only parses once you name the implementation, it is not the problem.]

## Who has it
[The specific user and the situation they are in when they hit it. "Users" is not an answer.
Secondary audiences only where they change the outcome.]

## Evidence it is real
| Claim | Source | Strength |
|---|---|---|
| <the problem occurs> | <ticket #, log line, metric, RESEARCH.md §, or "the user said so on <date>"> | observed / reported / inferred |

[Every `inferred` row is a risk, not a fact. If every row is inferred, say so to the user in one
line before continuing — you are about to build on an assumption nobody has checked.]

## Outcome
| | |
|---|---|
| What is measured | <the quantity> |
| Measured by | <the exact command, query or rubric> |
| Baseline today | <value, measured this session, with the date> |
| Threshold to pass | <value> |
| Tier | business number / machine-checked proxy / judged rubric |

[Proxy or rubric: name the business number it stands in for, and name the judge. Never the builder.]

## Announcement
[The paragraph shipped the day this lands. Past tense, names the user and what changed for them,
under 120 words, no feature list. It is the acceptance test for whether the problem was understood.]

## What the user sees
| Surface | State | Mockup |
|---|---|---|
| <screen> | default / empty / error / loading | `mockup-<screen>.html` |

[Headless change: the command, request or log line that changes, before and after.]

## Out of scope
[What this deliberately does not do, each with one clause of why. A fence, not a backlog.
An empty list claims everything adjacent is in scope — write it only if you mean it.]

## Acceptance criteria
| # | Criterion (observable, user-facing) | How checked | Threshold | Checked by |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |

[Every criterion thresholded. Any single one below threshold fails the phase; there is no average.
At least one covers the error path and one the empty / first-run state.]

## Open questions
[Anything decided by ruling, with its cost-if-wrong. Empty is valid; vague is not.]
```

Record the bar as it is settled, not in a summary at the end (Law 7):

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note decision "<slug>: pass bar is <metric> >= <threshold>, measured by <command>"
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note risk "<claim> is inferred, not observed"
```

## When to skip this phase

Two cases, and only these:

| Case | What replaces the PRD |
|---|---|
| A scoped bugfix — a defect against behaviour that is already specified | Nothing. The spec exists; a PRD would restate it. Go to [debug.md](debug.md) or straight to the slice. |
| A pre-product-market-fit throwaway experiment whose only output is a learning | One ledger line: the hypothesis, the signal that confirms or kills it, and the date it gets deleted. |

Skipping is a ruling, never a default:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note ruling "skipping product: scoped fix to <behaviour>, spec lives at <where>"
```

Say it out loud in your reply as well. A silent skip is indistinguishable from forgetting, and the artifact that would have caught the missing success measure is the one nobody notices is absent. An experiment you intend to keep is not a throwaway experiment — write the PRD.

**"I cannot write a measurable outcome" is not a skip condition.** It is one question to the user; and if nobody can answer it, a ruling under Law 8 that records the proxy you gated on and its cost-if-wrong.

## Exit condition

All five true before [architecture.md](architecture.md) starts:

1. `.factory/work/<slug>/PRD.md` exists, every section filled, no bracketed placeholder text left in.
2. Outcome names a quantity, the command or rubric measuring it, a baseline measured this session, and a threshold — at tier 1, 1b or 2, never a vibe.
3. Acceptance criteria: every row thresholded, at least one on the error path, at least one on empty / first-run.
4. Every surface in "What the user sees" has a mockup file on disk, or the PRD states the change is headless.
5. The announcement is written and contains no claim you could not back with the outcome number or a mockup.

Anything you could not establish is named under Open questions and noted (Law 3), not smoothed over.

## What product does not do

It does not choose a database, framework, library, host or file layout — [architecture.md](architecture.md) does, afterwards. It does not write schemas, signatures or tests — [program-design.md](program-design.md) does. It does not do visual design; the mockups are grey-box scope questions. It does not invent a user, a customer, a metric or a benchmark: a fabricated number is worse than no number, because every phase downstream then optimises honestly against a lie.
