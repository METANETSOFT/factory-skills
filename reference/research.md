# research

Phase 1 answers one question: **what is actually true about this codebase and this problem right now?** It produces `<workspace>/work/<slug>/RESEARCH.md`: confirmed facts with citations only — it proposes no solution, picks no architecture, writes no code, and edits nothing outside the workspace.

This is the cheapest place in the pipeline to be wrong and the most expensive place to be sloppy. One bad line of code is one bad line. One bad line in a plan produces hundreds of bad code lines. **One bad line of research — a misunderstanding of how the system works — produces thousands**, because every later phase builds on it and none of them re-checks it. That asymmetry is why human attention is spent here and at [slice.md](slice.md), and not on the diff.

Research runs on `main`. Do not create a worktree: worktrees isolate the filesystem for implementation, and this phase has no code to isolate.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts start <slug> --title "..."   # if this work has no slug yet
node ${CLAUDE_SKILL_DIR}/scripts/state.ts phase research
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts resolve research
```

`resolve` names the doc-lookup skill and the optional out-of-repo sources with their triggers (Law 9). Installed → use it. Missing but installable → give the user the one-line install it prints. Unavailable → take the `degrade` path it names and say out loud that you are on it. Never substitute your own judgement for a skill the user deliberately installed, and never invent a repository URL for one that is missing.

## Step 1 — Frame the question before anything is read

Write the question into the artifact first, in one or two sentences. An agent that starts grepping without a written question tours the repository: it reads widely, retains nothing load-bearing, and fills the window with files that turn out to be irrelevant.

- **Mechanism, not intent.** "How does an uploaded file get from the request to storage, and what validates it on the way?" is research. "Should we add virus scanning?" is product — [product.md](product.md).
- **Checkable test:** if you cannot name the file, route or symbol you would open first, the question is too vague. Narrow it before dispatching a single subagent.
- **One question per research run.** A second question is a second run. Two questions in one run produce two half-answers, and the half nobody notices is the one architecture gets built on.

## Step 2 — Delegate the reading; the parent decides what it means

**Search, read and summarise is the single largest context sink in the pipeline.** If you grep and read forty files yourself, the parent session reaches the writing step already degraded — exactly when judgement about what matters is most needed. Subagents read; you decide what the findings mean.

**Split by context boundary, not by role.** One subagent per area understandable without the others: "the upload path", "the auth middleware", "how migrations run here". Never planner → reader → summariser: role-splitting is an Anthropic-cited anti-pattern that produces a telephone game losing fidelity at each handoff. Multi-agent runs cost **3–10× the tokens** of a single agent for the same work, so delegate for context isolation and nothing else — two subagents on one area is theatre.

A subagent starts with **zero context** and receives only what you write. An unbriefed subagent returns a competent-sounding tour with no citations, and you cannot tell whether it read the code or guessed. Check the executor before the first dispatch — `node ${CLAUDE_SKILL_DIR}/scripts/skills.ts worker`: if reading and searching this codebase is inside the recorded worker's envelope, recon goes to it read-only, with its announce line verbatim at the top (Law 11, [worker.md](worker.md)). Recon is the labor most worth moving off your own context and the most expensive to do yourself.

```
<the recorded worker's announce line, verbatim, when recon is inside its envelope>
Goal: <the one question this subagent answers, verbatim from the artifact>
Why: <what decision downstream depends on this — it prioritises differently when it knows>
Scope: <paths, entry points or symbols to start from. What is out of scope.>
Report back exactly these fields:
  - <fact name>: value + `path/to/file.ts:LINE`   (one line per fact named above)
  - Anything you looked for and could NOT find, named as not-found
  - Files you read that turned out irrelevant, one line each
Rules: read only, no edits. Cite file:line for every claim. Write "INFERRED" and say from
what if you are reasoning rather than reading. Do not propose solutions.
Write findings to <workspace>/work/<slug>/research-<area>.md, then return 10 lines or fewer.
```

Subagents write to a file, not only to prose (Law 7): prose returned into a context that later resets is memory that evaporates. Run `state.ts tick subagent` after each dispatch; the cap is 12 and crossing it returns `HANDOFF_NOW`. **A subagent reporting "I confirmed X" is not evidence (Law 1) — its citation is.** Open at least one `file:line` from every subagent yourself and check the line says what the report says. If one is wrong, discard that subagent's entire report and read the area yourself: fabricated evidence is documented behaviour, including an invented `git bisect` result and a Playwright repro video of a bug that was never reproduced. One fabricated citation means the rest are unverified, not that the rest are fine.

## Step 3 — Library and API facts come from Context7, never from memory

Every named library, framework, SDK, CLI or cloud service in scope gets resolved before its facts enter the artifact:

```bash
npx ctx7@latest library "<Library Name>" "<what to look up>"
npx ctx7@latest docs <id> "<the specific question>"
```

Training data lags releases. A wrong signature or a renamed config key costs a debugging cycle that dwarfs the lookup, and — worse here — it enters `RESEARCH.md` as a confirmed fact and propagates into architecture unchallenged. Read the installed version from the **lockfile**, not from `package.json`'s range, and cite the lockfile line. If `find-docs` is installed, use it; if not, the CLI above needs no skill wrapper. Fall back to WebSearch only when the library is absent from Context7, and record in the artifact that you did. Environment facts in neither the repo nor library docs — quotas, staging URLs, deploy constraints — go to `docs/external/<topic>.md` and are cited from there, so the next session greps instead of re-asking a human.

## Step 4 — Go down the dependency tree

The documented failure of this method is **shallow research**: on parquet-java the research "didn't go deep enough through the dependency tree", made worse because nobody involved knew the codebase. Guard it with rules that can be checked, not with intent:

| Trigger | Required action |
|---|---|
| A finding names a function you have not opened | Open it, or list it under *What was NOT investigated*. "Presumably it validates the input" is neither. |
| The call chain continues | Follow it until a cited boundary — network, DB, third-party, framework entry — or until the next hop cannot change the answer to the Question. Write down where you stopped and why. |
| The area has tests | Read them. They state the behaviour someone actually relied on, which the implementation often does not. |
| Code in scope looks accidental | `git log -p` on that one file before calling it a mistake. A pattern that looks careless is usually a fix, and re-introducing the bug costs more than the read. |

**Depth floor:** every hop named in *How information flows* is a file you or a subagent opened and cited. A hop you assumed is not a hop — delete it, or move that line to *What was NOT investigated*. This is the difference between a flow diagram and a guess, and the guess is what becomes an architecture several PRs later.

## Step 5 — Write RESEARCH.md

A claim counts as cited only with a `path/to/file:LINE`, a lockfile line, or a Context7 doc id — nothing else is a citation, and the README restated is not a finding. An uncited claim is indistinguishable from a guess three phases later, when nobody remembers which was which.

```markdown
# Research: <slug>

## Question
[One or two sentences. What we needed to be true-or-false about, and for whom.]

## What is true now
[Numbered findings, each cited. Versions from the lockfile, library behaviour from
Context7 with its doc id. Mark anything reasoned rather than read as INFERRED, from what.]

1. <fact> — `src/upload/handler.ts:41-68`
2. <fact> — `package-lock.json` → multer 2.0.1; Context7 `/expressjs/multer`

## How information flows
[End to end, the real function and file at every hop, every hop opened. Diagram only if
it carries more than the list does.]

Request → `routes/api.ts:22` → `middleware/auth.ts:14` → `upload/handler.ts:41` → `storage/s3.ts:80`

## What varies and what is fixed
| Thing | Fixed / Varies | Evidence |
|---|---|---|
| <storage backend> | fixed — one adapter, S3 | `storage/` has a single implementation |
| <auth provider> | varies — two live impls | `auth/clerk.ts`, `auth/local.ts` |

[One adapter is a hypothetical seam; two is a real one — this table is what stops the next
phase inventing an abstraction that nothing varies behind.]

## Words this code already uses
| Term | Where it appears | The user's word for it |
|---|---|---|
| `<Order>` | `src/orders/model.ts:12`, table `orders` | "job" |

[Harvest, do not invent. Types, tables, routes, events and directory names on the left; the
words the user actually said on the right. Every row where the two columns disagree is a
decision someone has to make — see language.md. Leave the right column blank rather than
guessing at it.]

## Prior art in this repo
[Where a similar problem was already solved, cited. The house pattern beats a better one.]

## Constraints discovered
[What narrows the solution space — an unchangeable schema, at-most-once delivery, a rate
limit, a test pinning behaviour. Each cited.]

## Open unknowns
[Each: the question, why it stayed open, what it would cost to close. A design idea that
surfaced belongs here or in the ledger, never as a decision made now. Empty is valid.]

## What was NOT investigated
[Areas left unread, and the risk each carries if the assumption about it is wrong.]

## Confidence
[High / Medium / Low + reason. State plainly whether anyone involved knows this codebase.]
```

Three rules on this artifact, each blocking the next phase:

1. **"What was NOT investigated" is non-empty**, unless you opened every source file in the repo and state how many. Omitting it converts unread code into implied confirmation — the exact path by which a misread early fact becomes an architecture.
2. **Confidence caps at Medium when nobody involved has worked in this codebase before.** A clean set of subagent reports is not familiarity; parquet-java's shallow research came back looking complete.
3. **Keep it under ~200 lines** (`wc -l`). Longer means the question was too broad — split it and run again. 200 lines is reviewable in minutes; 2,000 is not, and an unreviewable research doc pushes human review down to the diff, which is where it costs the most and catches the least.

## Step 5b — Hand the words forward

Research is the only phase that reads the codebase with no plan to defend, which makes it the cheapest place to notice that the code and the humans use different words for the same thing. That table is the seed of the project's vocabulary; carrying it forward is [language.md](language.md)'s job, and a collision found here costs a sentence, while the same collision found in review costs a rename across a diff.

Do not resolve them here. Naming which word wins is a decision, and decisions in this phase get made by whoever writes the next artifact — record the disagreement, not a verdict.

## Step 6 — State confidence, then get confirmation

Report to the user in **10 lines or fewer**, in this order: the question; the two or three findings that will most shape the design; what was not investigated; your confidence with its reason; and the one assumption you most want them to check. Then ask them to confirm the research before planning starts.

This is a named checkpoint the pipeline is designed around, not a stall (Law 8) — and not a lock either. If the user does not answer, record it and proceed at the stated confidence rather than parking the session.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note decision "research confirmed by user"
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note risk "research unconfirmed — proceeding at <confidence>, <what could be wrong>"
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note unfinished "<area> not investigated — <risk if the assumption is wrong>"
```

## Context pressure during this phase

Research burns more context than any other phase, so the stop signal matters here most. **Never decide this from your own estimate of remaining space** — models report those estimates precisely and wrongly. Use observable behaviour instead. Any one of these means hand off now via [context-discipline.md](context-discipline.md), and hand off rather than compress (Law 2):

- your parallel tool calls have become sequential
- you have started writing a summary file nobody asked for
- you have corrected the same misreading twice in this session
- you are forming claims after reading fewer than 3 files

## Exit condition

All five true before [product.md](product.md) or [architecture.md](architecture.md) begins:

1. `<workspace>/work/<slug>/RESEARCH.md` exists with all nine sections present and no bracketed placeholder text left in it.
2. Every claim under *What is true now* carries a `file:line`, a lockfile line, or a Context7 doc id — and you personally opened at least one citation from each subagent and confirmed it matched.
3. Every hop in *How information flows* is a file that was opened.
4. *What was NOT investigated* is non-empty, or you state the number of source files in the repo and that you read them all.
5. The user confirmed the research, **or** the ledger records that they declined or did not respond, with the confidence level you are proceeding at.
