# init

`init` writes `FACTORY.md`, the durable charter at the project root: what we are building, for whom, what "working" means, which commands prove it, and what is already settled. It exists so a fresh session cannot re-litigate a decision the user already made — context is a cache, the filesystem is the truth.

Which case you are in decides the work:

| `context.mjs` said | State | Do |
|---|---|---|
| `NOT_INITIALIZED` | no `.factory/`, no charter | run `state.mjs init`, then all six steps below |
| `NO_CHARTER` | `.factory/` exists, `FACTORY.md` missing | steps 1–6, skipping `state.mjs init` |
| neither | charter exists | **amend only** — see the last section |

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs init      # creates .factory/, state.json, ledger.md
```

`{"already": true}` is success, not a failure — a second `init` never overwrites state.

## Step 1 — Read before you ask

Every question the repo already answered spends patience you will need for the one question only the user can answer. `context.mjs --brief` has already handed you the project markers, the `scripts` list, and any `testCommand` / `buildCommand` / `lintCommand` it could infer. Start from that, do not re-derive it, and fill the rest:

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

Project root. Confirmed facts and named gaps only — omit a section rather than fill it with plausible prose, because a fabricated line here is copied forward by every future session and nothing in the pipeline re-checks it.

**Law 10 binds hardest in this file.** Name the variable, never the value: `DATABASE_URL (see .env)`, never the connection string. A charter is read by every session and committed to git.

```markdown
# <Product name>

## What this is
[One paragraph: what it does, and the mechanism that makes it different from the neighbouring thing.]

## Who it is for
[Primary user, their situation, the job they are doing. Secondary audiences only when confirmed.]

## Definition of done
[The measurable outcome that decides success. A threshold beats an adjective: "p95 import under
4s for a 10k-row file", not "fast". If the only bar available is judged, name the judge and the
criteria it grades against.]

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

## Out of scope
[What we are deliberately not building, and why. A fence, not a backlog.]

## Where durable facts live
| Kind | Path |
|---|---|
| Architectural decisions | `docs/adr/NNNN-<slug>.md` |
| Environment and third-party facts | `docs/external/<topic>.md` |
| Rulings, risks, unfinished work | `.factory/ledger.md` |
| Per-feature artifacts | `.factory/work/<slug>/` |

## Known gaps
[Everything inferred rather than confirmed, and anything the verify gate cannot yet prove, each
with its cost-if-wrong. Empty is a valid answer; vague is not.]
```

Adjust those numbers to the repo's existing style where it has one — a limit half the codebase already violates is ignored on day one. Keep **Enforced by** filled: a written convention lowers the *starting* level of slop by roughly a third and then drift resumes at the same rate, so anything that can become a lint rule, a type or a hook becomes one in slice 1. The deletion clause exists because agents add and never consolidate — across 211M measured lines duplicated blocks grew 4–8× while consolidating "moved lines" fell from 25% of changes to under 10%.

Definition of done is the back pressure the whole pipeline pulls against: [verify.md](verify.md) grades against it and [loop.md](loop.md) terminates on it. A deterministic target moves mountains; "make it good" gets you a victory declaration.

## Step 4 — Prove the verify gate

Run every command in that table now, read the whole output, and record the exit code — not just the last line. A suite printing `42 passing` and exiting 1 is a failing suite. Transcribing a command out of `package.json` and marking it confirmed is the defect that makes Law 1 unenforceable later, because the proving command was itself never proven.

**A missing or failing test command is a blocking gap, not a footnote** — without it there is no evidence layer at all. Do not start repairing the suite here: init is not a repair phase and a fix begun now runs unplanned and unverified. Instead:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note risk "no working test command — verification is manual until slice 1"
```

record it under Known gaps, tell the user plainly, and carry it into planning: with no test command, establishing one is slice 1 and nothing else is ([slice.md](slice.md)). The same holds for `run` — if the app cannot be started, [verify.md](verify.md) has no live surface and evidence degrades to reading the diff.

## Step 5 — Baseline the drift metrics

```bash
node ${CLAUDE_SKILL_DIR}/scripts/slop.mjs baseline
```

Writes this project's own erosion and verbosity numbers to `.factory/slop-baseline.json`. The delta from the day the factory arrived is what matters, not the absolute score — a legacy codebase can start above the agent-drift reference points and be perfectly healthy. Skip this and the first `slop.mjs check` has nothing to compare against, so drift becomes unmeasurable exactly when it starts.

Report both numbers in one line against their reference points — maintained human repos sit near erosion 0.31 / verbosity 0.11, agent trajectories drift to 0.68 / 0.32 — plus the limits later phases enforce: erosion +0.05 or verbosity +0.03 above this baseline is a breach ([anti-slop.md](anti-slop.md)). Do not editorialise beyond that.

## Step 6 — Offer hooks

```bash
node ${CLAUDE_SKILL_DIR}/scripts/hooks.mjs status
```

Offer once to turn the Stop-gate on, wired to the test command you just proved:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/hooks.mjs on --verify "<the confirmed test command>"
```

A skill defines the procedure; a hook enforces the result. "Run the tests before committing" in a charter is a suggestion competing against more recent tokens; a gate that fires on `Stop` is a fact. Do not install it silently — it edits the user's `settings.json`, which is theirs to authorise (Law 8). A decline is recorded and is not a blocker. Detail lives in [hooks.md](hooks.md).

## Wrap up

Append decisions to the ledger as they are made, never as a closing summary a truncated session never writes (Law 7):

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note decision "stack: <x>, settled at init"
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note risk "<gap>"
```

Run `node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs doctor` and give the user one line naming the routed skills missing here with the install line for each — init is the cheapest moment to close those gaps ([skill-map.md](skill-map.md)). Never invent a repository URL to fill one.

Then name the next step from the actual state: `research` for anything touching code you have not read ([research.md](research.md)), `product` for a greenfield build ([product.md](product.md)), or the scoped command the user's original request implied. Do not auto-start it — the user chose `init`, and a phase they did not ask for spends their tokens on your guess.

## Exit condition

All six true before any phase begins:

1. `FACTORY.md` exists at the project root with real content under What this is, Who it is for, Definition of done, Stack, Verify gate, Conventions, Out of scope and Where durable facts live — no `<...>` or `[...]` template text surviving.
2. Every command in the Verify gate ran in this session with its exit code recorded, or its absence is written under Known gaps and noted as a risk.
3. Definition of done states a threshold something can be measured against, or names the judge and its criteria.
4. Every Conventions row has an entry in **Enforced by**.
5. `.factory/slop-baseline.json` exists, and both numbers were reported to the user.
6. `FACTORY.md` contains no secret value — grep it for keys, tokens and connection strings before you finish.

## Amending an existing charter

Never rewrite a live `FACTORY.md` wholesale: replacing settled decisions is indistinguishable from re-litigating them, which is the failure this file exists to prevent. Ask which sections are stale, edit only those, and leave every confirmed field byte-identical. Two exceptions you may amend without asking, because they are records rather than decisions: re-confirming a Verify gate row you just executed, and closing a Known gap that is now resolved. Note the amendment with `state.mjs note decision "charter: <section> updated — <why>"`.

## What init does not do

It does not write a PRD, choose an architecture, design an interface, start research, or fix a broken build. It does not invent users, benchmarks, customers or deployment claims — an unconfirmed audience written here becomes the target of every later phase.
