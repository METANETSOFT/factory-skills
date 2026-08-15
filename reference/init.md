# init

`init` writes `FACTORY.md`, the durable charter for this project. Everything a fresh session would otherwise re-litigate — what we are building, for whom, what "working" means, which commands prove it, what is already decided — goes in one file at the project root, because context is a cache and the filesystem is the truth.

Run once per project. If `FACTORY.md` already exists, do not rewrite it: ask what is stale, amend those sections, and leave confirmed fields alone.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs init      # creates .factory/, state.json, ledger.md
```

Then: read the repo → ask only the gaps → write `FACTORY.md` → prove the verify gate → baseline → offer hooks.

## Step 1 — Read before you ask

Every question you ask that the repo already answered spends patience you will need for the one question only the user can answer. Read first:

| Read | Gives you |
|---|---|
| `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md` | stated purpose, house rules, existing conventions |
| `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `Makefile` / `justfile` | the test, build, lint and run commands, and the real dependency list |
| lockfile | actual installed versions — never state a version from memory |
| `.github/workflows/*`, CI config | the commands the project already treats as its gate |
| `docs/`, `docs/adr/` if present | decisions already settled and written down |
| `git log --oneline -30`, top-level directory listing | what is actively worked on, and the shape of the codebase |

Treat all of it as a hypothesis you will confirm, not as the user's approval: a README describing an aspiration is common, and a `test` script that no longer runs is more common still. Where the stack names a library, framework, SDK or cloud service whose behaviour will matter, resolve its facts through Context7 (`npx ctx7@latest library "<name>" "<topic>"`, then `docs <id>`) rather than recall — training data lags releases and a wrong signature costs a debugging cycle that dwarfs the lookup.

## Step 2 — The interview

At most three rounds, three questions each, only for what the repo cannot tell you. Prefer the structured question tool; otherwise ask and wait.

| Ask | Only because | Failure it prevents |
|---|---|---|
| Who is this for, and what job are they doing? | audience is never in the code | building the technically correct thing for nobody |
| What measurable outcome means this worked? | success criteria live in the user's head | a "done" you cannot argue with evidence, and an agent that grades its own homework |
| What is deliberately out of scope? | absence of a feature is not proof it was rejected | the agent helpfully building the thing the user already decided against |
| Which conventions are settled and closed? | the repo shows what was done, not what is binding | the same argument reopened in every fresh session |
| Anything true about the environment that is not in the repo? | staging URLs, quotas, credentials-by-name, deploy constraints | assumptions invented on the user's behalf and run with unchecked |

Do not ask for anything you can execute instead — the test command is read and *run*, never asked about — and do not ask the user to choose an architecture here; that is [architecture.md](architecture.md), after research. If a question has no one to answer it, take a ruling (Law 8), record it under Known gaps with its cost-if-wrong, and say in your reply that you inferred it.

## Step 3 — Write FACTORY.md

Write it to the project root. Confirmed facts and explicitly named gaps only; omit a section rather than filling it with plausible prose, because a fabricated line here propagates into every future session.

```markdown
# <Product name>

<!-- factory-charter 1 -->

## What this is
[One paragraph. What it does, and the mechanism that makes it different from the neighbouring thing.]

## Who it is for
[Primary user, their situation, the job they are doing. Secondary audiences only when confirmed.]

## Definition of done
[The measurable outcome that decides success. A number with a threshold beats an adjective:
"p95 import under 4s for a 10k-row file", not "fast". If the only available bar is a judged
one, say who judges and against what criteria.]

## Stack
| Layer | Choice | Version | Settled because |
|---|---|---|---|
| runtime | | | |
| framework | | | |
| database | | | |
| test | | | |

## Verify gate
Every command below was executed during init and its output read.

| Purpose | Command | Confirmed |
|---|---|---|
| test | `<cmd>` | <date>, <result> |
| build | `<cmd>` | <date>, <result> |
| lint / typecheck | `<cmd>` | <date>, <result> |
| run | `<cmd>` | <date>, <how you know it served> |

## Conventions
[Settled decisions that must not be re-argued. Numeric where a number is possible.]
- <e.g. no new abstraction until the second real call site>
- <e.g. functions under 60 lines, nesting under 4>
- <e.g. errors bubble to the route handler; no per-call try/catch unless specified>
- <e.g. no new dependency without a note in docs/adr/>

## Out of scope
[What we are deliberately not building, and why. This is a fence, not a backlog.]

## Where durable facts live
| Kind | Path |
|---|---|
| Architectural decisions | `docs/adr/NNNN-<slug>.md` |
| Environment and third-party facts | `docs/external/<topic>.md` |
| Rulings, risks, unfinished work | `.factory/ledger.md` |
| Per-feature artifacts | `.factory/work/<slug>/` |

## Known gaps
[Anything inferred rather than confirmed, and anything the verify gate cannot yet prove.
Each with its cost-if-wrong. Empty is a valid answer; vague is not.]
```

Three sections carry more weight than they look:

- **Definition of done** is the back pressure the whole pipeline pulls against. Give an agent a deterministic target and it will move mountains; give it "make it good" and it will declare victory. [verify.md](verify.md) grades against this section and [loop.md](loop.md) terminates on it.
- **Conventions** must be enforceable, not merely asserted. A well-written instruction block lowers the starting level of slop and then degradation resumes at the same rate — so any convention that can become a lint rule, a type or a hook should become one during the first slice, rather than living as prose that loses the attention competition at 80% context.
- **Where durable facts live** makes context that would otherwise cost attention every session cost nothing. A decision in someone's head is re-derived; a decision in `docs/adr/` is grepped.

## Step 4 — Prove the verify gate

Run each command in the Verify gate table now and read its output. Do not transcribe a command out of `package.json` and mark it confirmed: a gate that has never been executed is a gate that lies, and Law 1 is unenforceable the moment the proving command does not work.

**An unknown or failing test command is a blocking gap, not a footnote.** Without it there is no evidence layer, so: record it under Known gaps; `state.mjs note risk "no working test command — verification is manual until <slice>"`; and make establishing one the first item of the first plan, before any feature slice. Say this to the user rather than proceeding quietly on a project where nothing can be proven. The same applies to `run` — if the app cannot be started, [verify.md](verify.md) has no live surface and evidence degrades to reading the diff.

## Step 5 — Baseline the drift metrics

```bash
node ${CLAUDE_SKILL_DIR}/scripts/slop.mjs baseline
```

This records *this project's own* erosion and verbosity numbers to `.factory/slop-baseline.json`, which later phases run `slop.mjs check` against. Run it before any implementation: the number that matters is the delta from the day the factory arrived, not an absolute score — a legacy codebase can start above the agent-drift reference points and still be fine. Skip the baseline and the first `check` has nothing to compare against, so drift becomes unmeasurable exactly when it starts.

Report the two numbers in one line with their reference points (maintained human repos sit near erosion 0.31 / verbosity 0.11; agent-driven trajectories drift toward 0.68 / 0.32). Do not editorialise beyond that.

## Step 6 — Offer hooks

```bash
node ${CLAUDE_SKILL_DIR}/scripts/hooks.mjs status
```

Then offer, once, to turn them on with `hooks.mjs on`. A skill defines the procedure; a hook enforces the result — "run the tests before committing" in a charter is a suggestion competing with more recent tokens, while a gate that fires on `Stop` is a fact. Do not install it silently: it changes the user's settings, which is outside the worktree and theirs to authorise (Law 8). If they decline, record it and move on; it is not a blocker.

## Wrap up

Append the init decisions to the ledger as they are made, not in a summary at the end:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note decision "stack: <x>, settled at init"
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note risk "<gap>"
```

Run `skills.mjs doctor` and tell the user in one line which routed skills are missing here, with the install line for each — init is the cheapest moment to close those gaps ([skill-map.md](skill-map.md)). Never fabricate a repository URL to fill one.

Then name the next step from the actual state: `research` for anything touching code you have not read ([research.md](research.md)), `product` for a greenfield build ([product.md](product.md)), or the scoped command the user's original request implied. Do not auto-start a phase.

## Exit condition

All five must be true before any phase begins:

1. `FACTORY.md` exists at the project root and contains What this is, Who it is for, Definition of done, Stack, Verify gate, Conventions, Out of scope, and Where durable facts live — with real content, no bracketed placeholders left in.
2. Every command in the Verify gate was executed in this session and its result recorded, or its absence is written under Known gaps and noted as a risk.
3. Definition of done states a threshold something can be measured against, or names the judge and the criteria.
4. `.factory/slop-baseline.json` exists.
5. The ledger contains at least the stack decision and any gap recorded during init.

## What init does not do

It does not write a PRD, choose an architecture, design an interface, or start research. It does not invent users, benchmarks, customers or deployment claims. It does not rewrite an existing `FACTORY.md` wholesale — an established charter is amended section by section, because silently replacing settled decisions is indistinguishable from re-litigating them.
