# init

`init` writes `FACTORY.md`, the durable charter at the project root: what we are building, for whom, what "working" means, which commands prove it, and what is already settled. It exists so a fresh session cannot re-litigate a decision the user already made — context is a cache, the filesystem is the truth.

| `context.ts` said | State | Do |
|---|---|---|
| `NOT_INITIALIZED` | no the workspace, no charter | run `state.ts init`, then all six steps below |
| `NO_CHARTER` | the workspace exists, `FACTORY.md` missing | steps 1–6, skipping `state.ts init` |
| neither | charter exists | **amend only** — see the last section |

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts init   # creates <workspace>/, state.json, ledger.md; {"already":true} is success
```

## Step 1 — Read before you ask

Every question the repo already answered spends patience you will need for the one question only the user can answer. `context.ts --brief` has already handed you the project markers, the `scripts` list, and any `testCommand` / `buildCommand` / `lintCommand` it could infer. Start from that, do not re-derive it, and fill the rest:

| Read | Gives you |
|---|---|
| `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md` | stated purpose, house rules, conventions already in force |
| `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `Makefile` / `justfile`, plus the lockfile | the real test, build, lint and run commands; dependencies; installed versions — never write a version from memory |
| `.github/workflows/*` or other CI config | the commands the project already treats as its gate |
| `docs/`, `docs/adr/` | decisions already settled in writing |
| `git log --oneline -30` and a top-level listing | what is actively worked on, and the shape of the tree |

All of it is a hypothesis, not the user's approval: a README describing an aspiration is common and a `test` script that no longer runs is more common. Where the stack names a library, framework, SDK or cloud service whose behaviour will matter, resolve its facts through Context7 — `npx ctx7@latest library "<name>" "<topic>"` then `docs <id> "<question>"`, or the `find-docs` skill — because training data lags releases and one wrong signature costs a debugging cycle that dwarfs the lookup.

## Step 2 — The interview

Maximum three rounds of at most three questions. Ask each round as one numbered message **with your inferred answer beside each question**, so the user's cheapest reply is "1 yes, 2 yes, 3 actually X" — an open question costs them a paragraph and buys you the same fact.

| Ask | Only because | Failure it prevents |
|---|---|---|
| Who is this for, and what job are they doing? | audience is never in the code | building the technically correct thing for nobody |
| What measurable outcome means this worked? | the bar lives in the user's head | a "done" no evidence can contest, and an agent grading its own homework |
| What is deliberately out of scope? | absence of a feature is not proof it was rejected | the agent helpfully building the thing the user already rejected |
| Which conventions are settled and closed? | the repo shows what was done, not what is binding | the same argument reopened in every fresh session |
| What is true about the environment but not in the repo? | staging URLs, quotas, deploy constraints, credential *names* | assumptions invented on the user's behalf and run with unchecked |

Never ask for anything you can execute instead — the test command is read and *run*, never asked about. Do not ask the user to choose an architecture here; that is [architecture.md](architecture.md), after research. If nobody answers, take a ruling (Law 8), record it under Known gaps with its cost-if-wrong, and say in your reply which fields you inferred.

## Step 3 — Write FACTORY.md

Project root. Confirmed facts and named gaps only — omit a section rather than fill it with plausible prose, because a fabricated line here is copied forward by every future session and nothing in the pipeline re-checks it. **Law 10 binds hardest in this file:** name the variable, never the value — `DATABASE_URL (see .env)`, never the connection string. A charter is committed to git and read by every session.

```markdown
# <Product name>

## What this is
[One paragraph: what it does, and the mechanism that makes it different from the neighbouring thing.]

## Who it is for
[Primary user, their situation, the job they are doing. Secondary audiences only when confirmed.]

## Definition of done
[The measurable outcome that decides success. A threshold beats an adjective: "p95 import under 4s
for a 10k-row file", not "fast". If the only bar available is judged, name the judge and its criteria.]

## Stack
| Layer | Choice | Version (from lockfile) | Settled because |
|---|---|---|---|
| runtime | | | |
| framework | | | |
| database | | | |
| test | | | |

## Verify gate
Every command below was executed during init and its output read.

| Purpose | Command | Exit | Confirmed |
|---|---|---|---|
| test | `<cmd>` | 0 | <date> — <the line carrying the verdict> |
| build | `<cmd>` | 0 | <date> — <line> |
| lint / typecheck | `<cmd>` | 0 | <date> — <line> |
| run | `<cmd>` | — | <date> — <the URL and the status code you got back> |

## Conventions
Settled. Not to be re-argued. Each one names what enforces it.

| Convention | Enforced by |
|---|---|
| functions ≤ 60 lines, nesting depth ≤ 4 | lint rule, added in slice 1 |
| no new abstraction until the second real call site | review |
| no new dependency without an ADR in `docs/adr/` | review |
| every change reports lines added *and* lines deleted | commit body |

## How to work with me
Standing preferences. Each one is something the user said once and should not be asked twice.

| Preference | Setting |
|---|---|
| Interview before a plan | yes / no — "no" means open branches become recorded rulings instead of questions |
| Depth of interview | every branch / only decisions that are expensive to reverse |
| Review depth | boundary only where safe / read every implementation |
| Language | the language the user writes in, when it is not the language of the code |

## Out of scope
[What we are deliberately not building, and why. A fence, not a backlog.]

## Where durable facts live
| Kind | Path |
|---|---|
| The project's vocabulary and module map | `<the glossary's one location>` |
| Architectural decisions | `docs/adr/NNNN-<slug>.md` |
| Environment and third-party facts | `docs/external/<topic>.md` |
| Rulings, risks, unfinished work | `<workspace>/ledger.md` |
| Per-feature artifacts | `<workspace>/work/<slug>/` |

## Known gaps
[Everything inferred rather than confirmed, and anything the verify gate cannot prove, each with
its cost-if-wrong. Empty is a valid answer; vague is not.]
```

**How to work with me is the charter's cheapest section and the one that saves the most.** A user who has said "stop asking me questions" has said it to one session; written here, they have said it to every future one, and the alternative is being asked the same thing weekly by something that cannot remember. Fill a row only from something the user actually said — an invented preference is worse than an absent one, because nobody will think to contradict it. Where the row says "no interview", Law 12's fallback applies instead: the decisions still get made, as rulings with their cost-if-wrong, printed once ([grill.md](grill.md)).

The vocabulary row in *Where durable facts live* points at one file, wherever it ended up ([language.md](language.md)). One pointer is the whole value: a project with two glossaries has none.

Adjust those numbers to the repo's existing style where it has one — a limit half the codebase already violates is ignored on day one. Keep **Enforced by** filled: a written convention lowers the *starting* level of slop by roughly a third and then drift resumes at the same rate, so anything that can become a lint rule, a type or a hook becomes one in slice 1. The deletion clause exists because agents add and never consolidate — across 211M measured lines duplicated blocks grew 4–8× while consolidating "moved lines" fell from 25% of changes to under 10%. Definition of done is the back pressure the rest of the pipeline pulls against: [verify.md](verify.md) grades against it and [loop.md](loop.md) terminates on it. A deterministic target moves mountains; "make it good" earns you a victory declaration.

## Step 4 — Prove the verify gate

Run every command in that table now, read the whole output, and record the exit code — not just the last line. A suite printing `42 passing` and exiting 1 is a failing suite. Transcribing a command out of `package.json` and marking it confirmed is the defect that makes Law 1 unenforceable later, because the proving command was itself never proven.

**A missing or failing test command is a blocking gap, not a footnote** — without it there is no evidence layer at all. Do not start repairing the suite here: init is not a repair phase and a fix begun now runs unplanned and unverified. Instead:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note risk "no working test command — verification is manual until slice 1"
```

record it under Known gaps, tell the user plainly, and carry it into planning: with no test command, establishing one is slice 1 and nothing else is ([slice.md](slice.md)). Same for `run` — if the app cannot be started, [verify.md](verify.md) has no live surface and evidence degrades to reading the diff.

## Step 5 — Baseline the drift metrics

```bash
node ${CLAUDE_SKILL_DIR}/scripts/slop.ts baseline
```

Writes this project's own erosion and verbosity numbers to `<workspace>/slop-baseline.json`. The delta from the day the factory arrived is what matters, not the absolute score — a legacy codebase can start above the agent-drift reference points and be perfectly healthy. Skip this and the first `slop.ts check` has nothing to compare against, so drift becomes unmeasurable exactly when it starts. Report both numbers in one line against their reference points — maintained human repos sit near erosion 0.31 / verbosity 0.11, agent trajectories drift to 0.68 / 0.32 — plus the limits later phases enforce: erosion +0.05 or verbosity +0.03 above this baseline is a breach ([anti-slop.md](anti-slop.md)). Do not editorialise beyond that.

## Step 6 — Offer hooks

```bash
node ${CLAUDE_SKILL_DIR}/scripts/hooks.ts status
node ${CLAUDE_SKILL_DIR}/scripts/hooks.ts on --verify "<the confirmed test command>"   # only after the user agrees
```

Offer the Stop-gate once, wired to the test command you just proved. A skill defines the procedure; a hook enforces the result — "run the tests before committing" in a charter is a suggestion competing against more recent tokens, while a gate firing on `Stop` is a fact. Do not install it silently: it edits the user's `settings.json`, which is theirs to authorise (Law 8). A decline is recorded and is not a blocker. Detail lives in [hooks.md](hooks.md).

## Wrap up

Append decisions to the ledger as they are made, never as a closing summary a truncated session never writes (Law 7):

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note decision "stack: <x>, settled at init"
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note risk "<gap>"
```

Run `node ${CLAUDE_SKILL_DIR}/scripts/skills.ts doctor` and give the user one line naming the routed skills missing here with the install line for each — init is the cheapest moment to close those gaps ([skill-map.md](skill-map.md)). Never invent a repository URL to fill one. Then name the next step from the actual state: `research` for anything touching code you have not read ([research.md](research.md)), `product` for a greenfield build ([product.md](product.md)), or the scoped command the original request implied. Do not auto-start it — the user chose `init`, and a phase they did not ask for spends their tokens on your guess.

## Exit condition — all six true before any phase begins

1. `FACTORY.md` exists at the project root with real content under What this is, Who it is for, Definition of done, Stack, Verify gate, Conventions, Out of scope and Where durable facts live — no `<...>` or `[...]` template text surviving.
2. Every command in the Verify gate ran in this session with its exit code recorded, or its absence is written under Known gaps and noted as a risk.
3. Definition of done states a threshold something can be measured against, or names the judge and its criteria.
4. Every Conventions row has an entry in **Enforced by**.
5. `<workspace>/slop-baseline.json` exists, and both numbers were reported to the user.
6. `FACTORY.md` contains no secret value — grep it for keys, tokens and connection strings before you finish.

## Amending an existing charter, and what init never does

Never rewrite a live `FACTORY.md` wholesale: replacing settled decisions is indistinguishable from re-litigating them, the exact failure this file exists to prevent. Ask which sections are stale, edit only those, leave every confirmed field byte-identical, and note it with `state.ts note decision "charter: <section> updated — <why>"`. Two things you may amend unasked because they are records rather than decisions: re-confirming a Verify gate row you just executed, and closing a resolved Known gap.

Init does not write a PRD, choose an architecture, design an interface, start research, or repair a broken build. It does not invent users, benchmarks, customers or deployment claims — an unconfirmed audience written here becomes the target every later phase optimises for.
