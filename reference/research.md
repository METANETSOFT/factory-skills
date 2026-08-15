# research

Phase 1 answers one question: **what is actually true about this codebase and this problem right now?** It produces `.factory/work/<slug>/RESEARCH.md`, a document of confirmed facts with citations — not a proposal, not a plan, not a design.

This is the cheapest place in the pipeline to be wrong and the most expensive place to be sloppy. One bad line of code is one bad line. One bad line in a plan produces hundreds of bad code lines. **One bad line of research — a misunderstanding of how the system works — produces thousands**, because every later phase is built on top of it and none of them re-checks it. That asymmetry is why the human's attention is spent here and at [slice.md](slice.md), and not on the diff.

Research runs on `main`. Do not create a worktree — worktrees isolate the filesystem for implementation; nothing here writes code.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs start <slug> --title "..."   # if this work has no slug yet
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs phase research
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs resolve research
```

Then: frame the question (Step 1) → delegate the reading (Step 2) → resolve external facts (Step 3) → write `RESEARCH.md` (Step 4) → state confidence and get confirmation (Step 5).

## Step 1 — Frame the question before anything is read

Write the question down first, in one or two sentences, in the artifact. Unframed research becomes a tour of the repository: an agent that starts grepping without a question reads widely, retains nothing load-bearing, and fills its window with files that turn out to be irrelevant.

The question is about mechanism, not intent. "How does an uploaded file get from the request to storage, and what validates it on the way?" is a research question. "Should we add virus scanning?" is a product question and belongs in [product.md](product.md).

## Step 2 — Delegate the searching, keep the parent clean

**Search, read and summarise is the single largest context sink in the pipeline.** If you grep and read forty files yourself, the parent session arrives at the writing step already degraded — exactly when judgement about what matters is most needed. Dispatch subagents to read; you stay the one who decides what the findings mean.

**Split by context boundary, not by role.** One subagent per area of the codebase that can be understood without the others: "the upload path", "the auth middleware", "how migrations are run here". Never split planner → reader → summariser: role-splitting is an Anthropic-cited anti-pattern that produces a telephone game where each handoff loses fidelity. Multi-agent runs cost 3–10× the tokens of a single agent for the same work, so delegate for context isolation and for nothing else — two subagents on the same area is theatre.

A subagent starts with **zero context** and receives only what you write. Every delegation carries the why and names the exact fields to report back, because an unbriefed subagent returns a competent-sounding tour with no citations and you cannot tell whether it read the code or guessed:

```
Goal: <the one question this subagent answers, verbatim from the artifact>
Why: <what decision downstream depends on this — the subagent prioritises differently when it knows>
Scope: <paths, entry points, or symbols to start from. What is out of scope.>
Report back exactly these fields:
  - <fact 1 name>: value + `path/to/file.ts:LINE`
  - <fact 2 name>: value + citation
  - Anything you looked for and could NOT find, named as not-found
  - Files you read but that turned out irrelevant, one line each
Rules: read only, no edits. Cite file:line for every claim. If you are inferring
rather than reading, say "inferred" and say from what. Do not propose solutions.
Write your findings to .factory/work/<slug>/research/<area>.md and return a 10-line summary.
```

Have subagents write to a file rather than only returning prose — Law 7: prose returned into a context that later gets reset is memory that evaporates. `state.mjs tick subagent` after each dispatch; the cap is 12.

A subagent reporting "I confirmed X" is not evidence (Law 1). Its citation is. Spot-check at least one `file:line` from each subagent yourself; a fabricated citation is cheap to produce and instantly disqualifying if found.

## Step 3 — External facts come from Context7, never from memory

Any named library, framework, SDK, CLI or cloud service in scope gets its facts resolved before they enter the artifact:

```bash
npx ctx7@latest library "<Library Name>" "<what to look up>"
npx ctx7@latest docs <id> "<the specific question>"
```

Training data lags releases; a wrong signature or a renamed config key costs a debugging cycle that dwarfs the lookup, and — worse here — it enters `RESEARCH.md` as a confirmed fact and propagates unchallenged into architecture. Read the installed version from the lockfile, not from `package.json`'s range, and cite it. If `find-docs` is installed, use it; if not, the CLI needs no skill wrapper. Only fall back to WebSearch when the library is absent from Context7, and say in the artifact that you did.

Facts about the environment that are neither in the repo nor in library docs — quotas, staging URLs, deploy constraints — get written to `docs/external/<topic>.md` and cited from there, so the next session greps instead of re-asking.

## Step 4 — Write RESEARCH.md

Confirmed facts with citations only. An uncited claim in this file is indistinguishable from a guess three phases later, when nobody remembers which was which.

```markdown
# Research: <slug>

## Question
[One or two sentences. What we needed to be true-or-false about, and for whom.]

## What is true now
[Numbered findings. Every one carries `path/to/file.ts:LINE`. No prose without a citation
behind it. Version numbers come from the lockfile; library behaviour from Context7 with the
doc id. Mark anything inferred as INFERRED and say from what.]

1. <fact> — `src/upload/handler.ts:41-68`
2. <fact> — `package-lock.json` → multer 2.0.1; Context7 `/expressjs/multer`

## How information flows
[The path through the system this work touches, end to end: entry point → each hop → where
it lands. Name the actual functions and files at each hop. A diagram only if it carries more
than the list does.]

Request → `routes/api.ts:22` → `middleware/auth.ts:14` → `upload/handler.ts:41` → `storage/s3.ts:80`

## What varies and what is fixed
| Thing | Fixed / Varies | Evidence |
|---|---|---|
| <e.g. storage backend> | one adapter only, S3 | `storage/` has a single implementation |
| <e.g. auth provider> | varies, two live impls | `auth/clerk.ts`, `auth/local.ts` |

[One adapter is a hypothetical seam; two is a real one. This table is what stops the next
phase inventing an abstraction nothing varies behind.]

## Prior art in this repo
[Where a similar problem was already solved, and how. Cite it. The house pattern beats a
better pattern that nothing else here follows.]

## Constraints discovered
[Anything that narrows the solution space: schema shapes that cannot change, a queue with
at-most-once delivery, a rate limit, a test that pins current behaviour.]

## Open unknowns
[Questions this research could not close, each with why it stayed open and what it would
cost to close it. Empty is a valid answer; vague is not.]

## What was NOT investigated
[Explicit. Areas deliberately or accidentally left unread, and the risk each carries if the
assumption about it is wrong. This section is the one that gets skipped and the one that
makes the artifact honest.]

## Confidence
[High / Medium / Low, with the reason. Say plainly whether anyone involved actually knows
this codebase.]
```

**"What was NOT investigated" is mandatory and non-empty except in a trivially small repo.** Omitting it converts unread code into implied confirmation, and that is precisely how a misread early fact becomes an architecture several PRs later.

## Depth: follow the dependency tree, do not stop at the first file

The documented failure of this method is **shallow research** — on parquet-java, research that "didn't go deep enough through the dependency tree", made worse because nobody involved knew the codebase. It is the failure mode of this phase, so guard it explicitly:

- When a finding names a function you have not opened, open it or record it under **What was NOT investigated**. Those are the only two options; "presumably it validates the input" is neither.
- Follow the call chain until you reach either a boundary you have cited (network, DB, third-party) or a fact that no longer changes the answer.
- Read the tests around the area. They state the behaviour someone actually relied on, which the implementation often does not.
- Read the git history for the files in scope. A pattern that looks accidental is often a fix; `git log -p` on one file is cheaper than reintroducing the bug it removed.

## Step 5 — State confidence, then get confirmation

Report to the user in a few lines: the question, the two or three findings that will most shape the design, what was not investigated, and your confidence with its reason. Then ask them to confirm the research before planning starts.

This is one of the two points in the pipeline where human review pays, and it is cheap: ~200 lines of research is reviewable in minutes, while 2,000 lines of resulting code is not. A user who spots one wrong assumption here saves the phases that would have been built on it.

This ask is not a stall (Law 8) — it is a named checkpoint the pipeline is designed around. But it is also not a lock: if the user does not answer, record that and proceed with the confidence level stated, rather than parking the session.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note decision "research confirmed by user"
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note risk "research unconfirmed — proceeding at <confidence>, <what could be wrong>"
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note unfinished "<area> not investigated — <risk if the assumption is wrong>"
```

## Exit condition

All four must be true before [product.md](product.md) or [architecture.md](architecture.md) begins:

1. `.factory/work/<slug>/RESEARCH.md` exists and contains Question, What is true now, How information flows, What varies and what is fixed, Prior art, Open unknowns, What was NOT investigated, and Confidence — with no bracketed placeholders left in.
2. Every claim under "What is true now" carries a `file:line` citation, a lockfile reference, or a Context7 doc id — and you have personally opened at least one citation from each subagent.
3. "What was NOT investigated" is non-empty, or the repo is small enough that you read all of it and said so.
4. The user has confirmed the research, **or** the ledger records that they declined or did not respond, with the confidence level you are proceeding at.

## What research does not do

It does not propose a solution, choose an architecture, write code, or edit a single file outside `.factory/`. It does not restate the README as a finding. It does not answer a library question from memory. If it surfaces a design idea worth keeping, that is a line in Open unknowns or a ruling in the ledger — not a decision made here, where nobody has yet agreed what the product is.
