# The skill tree

The factory owns pipeline discipline and nothing else. Interface craft, motion, doc lookup, diagrams, review and debugging discipline belong to skills that already do those jobs better than improvised effort — Law 9 makes routing to them mandatory. This file is how you pick the right one for the job in front of you, and what to do when it is not on this machine.

## Resolve before you work

Before the first substantive read, edit or command of a job — not after you have started and stalled:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs resolve <job>
```

Job kinds, exactly these fifteen: `research product architecture program-design implement verify review debug design-ui design-visual motion marketing docs loop handoff`. There is no `plan` job — the plan phase runs off [slice.md](slice.md) and needs no craft skill; if it needs a fact, that is a `research` detour. An unknown name returns the list instead of a route, so pick from these rather than guessing one.

The output prints in this order. Treat each line literally:

| Line the script prints | What to do with it |
|---|---|
| `playbook: <path>  (read this first)` | Read that file before any skill. It carries the procedure, the artifact shape and the exit condition. |
| `load — owns this job:` | The `prefer` set. Load every entry, unconditionally. It is the authority for that job. |
| `load when the trigger applies:` | The `also` set, each printed with its trigger. Load one **only if its trigger is literally true** of the work in front of you. |
| `external (not a local skill):` | Not a skill on disk — see External below. It never counts as loaded craft. |
| `NOT INSTALLED — offer the install line...` | Gaps, each with `source`/`install` or `find`, plus a `without it:` degrade note. |
| `[installed]` `[builtin]` `[missing]` | The status prefix on every skill line. It selects the tier below. |

One resolve per job kind per session. Re-resolving because you have forgotten the answer spends a tool round to return what is already in your context; if you have genuinely lost it, that is a context signal — hand off (Law 2), do not re-derive.

## The three tiers

| Tier | Status printed | What you do |
|---|---|---|
| 1 | `installed` or `builtin` | Load it and follow it. Your own taste does not override a skill the user deliberately installed. |
| 2 | `missing` with an `install:` line | Offer that command verbatim in one line, then continue on the degraded path **in the same turn**. Do not stall for an answer (Law 8). |
| 3 | `missing` with only a `find:` line, or unobtainable here | Print the `find:` string exactly as given, never converted to a URL; take its `without it:` note as your standard; say out loud which skill you lack. |

The offer is one line, not a paragraph:

```
`impeccable` is not installed — `npx impeccable` gets it. Proceeding on its degraded craft floor for now.
```

Every tier-2 or tier-3 route is a ruling, so it goes in the ledger where a later session can see it (Law 7):

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note ruling "design-ui without impeccable; degraded craft floor per skill-map; cost-if-wrong: polish below the skill's bar, recoverable by re-running design after install"
```

Silence is the failure this prevents. A user who installed a design skill and receives design work made without it believes they got the skill's output, and that belief is not correctable later, because the work looks finished either way.

## The map

`prefer` loads unconditionally; `also` loads only on its printed trigger. A `—` in the `prefer` column means the playbook alone owns the job, and loading a skill anyway is speculative.

| Job | Playbook | Owns it (`prefer`) | On trigger (`also`) |
|---|---|---|---|
| `research` | [research.md](research.md) | — | find-docs, obsidian-memory, searxng-search-internet |
| `product` | [product.md](product.md) | — | obsidian-memory |
| `architecture` | [architecture.md](architecture.md) | — | code-structure, drawio-skill |
| `program-design` | [program-design.md](program-design.md) | — | code-structure |
| `implement` | [implement.md](implement.md) | full-output-enforcement | find-docs, kole-kimi, omniroute-router |
| `verify` | [verify.md](verify.md) | — | run, code-review, security-review |
| `review` | [verify.md](verify.md) | code-review | simplify, security-review |
| `debug` | [debug.md](debug.md) | — | find-docs, run |
| `design-ui` | [design.md](design.md) | impeccable | design-taste-frontend, emil-design-eng, apple-design, pick-ui-library, redesign-existing-projects |
| `design-visual` | [design.md](design.md) | — | imagegen-frontend-web, imagegen-frontend-mobile, image-to-code, brandkit, fal-design, high-end-visual-design |
| `motion` | [design.md](design.md) | — | improve-animations, find-animation-opportunities, review-animations, animation-vocabulary, apple-design, scroll-world |
| `marketing` | [marketing.md](marketing.md) | — | searxng-search-internet, brandkit, imagegen-frontend-web, fal-design, dataviz |
| `docs` | [marketing.md](marketing.md) | — | artifact-design, artifact-diagramming, drawio-skill, dataviz |
| `loop` | [loop.md](loop.md) | — | loop, schedule |
| `handoff` | [context-discipline.md](context-discipline.md) | handoff | obsidian-memory |

Six jobs also print an `external`. These are the only ones: `research` → humanlayer-rpi-research; `architecture` → humanlayer-codebase-design; `program-design` → humanlayer-codebase-design, humanlayer-improve-codebase-architecture; `debug` → superpowers-systematic-debugging; `design-ui` → humanlayer-show-me; `loop` → humanlayer-design-control-loop, humanlayer-build-iterated-agentic-loop.

Why each route exists, and the failure it prevents:

- **research** — no owner, because the codebase is the source of truth; the `also` set covers only facts that are *not* in this repo, so a library API is never answered from recall (Law 1).
- **product** — pure judgement about the user's problem, which no skill improves; memory attaches only where a prior decision would otherwise be re-litigated.
- **architecture** — `code-structure` when operational logic is duplicated across flows, because the duplicate is invisible from inside any one flow; `drawio-skill` at 3+ components, where prose hides the topology.
- **program-design** — the same structural skill, because this is the layer where the shared-service call actually gets shaped; its vocabulary comes from the `humanlayer-codebase-design` external, without which this phase degenerates into restating the architecture.
- **implement** — `full-output-enforcement` always: truncation is the most likely defect here, and one `// ...rest unchanged` ships as a hole (Laws 2 and 4). `find-docs` whenever a library API is called.
- **verify** — evidence comes from running the thing: `run` for the live app, `code-review` for the diff, `security-review` when auth, secrets, input handling or a network boundary moved.
- **review** — `code-review` owns it because a generator grading its own work confidently praises it; a separate sceptical pass is the only thing that catches that. `simplify` when the diff is correct but duplicated.
- **debug** — root-cause-first discipline lives in the playbook; the skills only supply third-party behaviour and a way to reproduce the failure in the running app, which is what stops a fix being proposed before the mechanism is understood.
- **design-ui** — `impeccable` owns interface craft outright (standing decision 2); the rest are situational lenses, and loading more than one blurs the single direction the user is supposed to receive.
- **design-visual** — no owner, because the deliverable ranges from a brand board to a generated ad; pick the one skill whose trigger matches and ignore the others.
- **motion** — split by verb: audit existing motion, find missing motion, review a motion diff, name an effect the user described but could not name. Loading all four yields four opinions on one animation.
- **marketing** — positioning needs real market evidence rather than recall; the rest attach only when the deliverable is identity, a landing concept, campaign imagery or numbers.
- **docs** — a document a human will read and share is an interface, so it routes to the artifact skills rather than to a raw file dump.
- **loop** — `loop` when the iteration lives in this session, `schedule` when it must outlive it; choosing wrong produces a loop that silently stops at session end.
- **handoff** — the built-in `handoff` skill compacts the session; the fixed schema it must satisfy is in [context-discipline.md](context-discipline.md), because a freeform summary omits what the model did not know it did not know.

## External skills

Exactly six external ids are plain files in public repos and land on disk with:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs fetch <external-id>
```

Fetchable: `humanlayer-codebase-design`, `humanlayer-improve-codebase-architecture`, `humanlayer-show-me`, `humanlayer-design-control-loop`, `humanlayer-build-iterated-agentic-loop`, `humanlayer-improve-claude-md`. Everything else — including `humanlayer-rpi-research`, `superpowers` and `superpowers-systematic-debugging` — is a plugin-marketplace install; `fetch` exits 1 on it, so print the `install:` line the script gave you and let the user run it rather than reporting an install that did not happen.

`node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs doctor` reports coverage across all fifteen jobs at once, including whether each playbook file exists. Run it when the user asks what the factory can reach here — at most once per session, never before each job.

## Two standing decisions

**1. Library and API facts come from Context7, never from memory.** Any research or implementation touching a named library, framework, SDK, CLI or cloud service resolves its facts there first. `find-docs` wraps it; the CLI needs no skill at all:

```bash
npx ctx7@latest library "<name>" "<what to look up>"
npx ctx7@latest docs <id> "<question>"
```

Training data lags releases, and one wrong signature costs a debugging cycle that dwarfs the lookup. WebSearch is the fallback only when the library is absent from Context7. Answering an API question from recall is a Law 1 violation dressed up as speed.

**2. Interface work is owned by `impeccable`.** The factory carries no design taste of its own. Its job at a visual boundary is to decide *that* design work is needed, hand over the product and architecture context the skill cannot infer, and verify the result against the PRD. If `impeccable` is missing, follow the degraded craft floor its registry entry prints — do not substitute a general sense of what looks good, which is precisely what the user installed a skill to avoid.

## Anti-patterns

- **Do not vendor a skill into the factory.** Copying a skill's rules into `.factory/` forks it: the copy stops receiving upstream fixes and starts disagreeing with the installed original, and nobody can then say which is authoritative. Reference it; never copy it.
- **Do not invent a repository URL.** Where the registry gives `find` instead of `source`, the upstream is genuinely unknown and what circulates is mirrors and forks. Print the search string. A guessed URL sends the user somewhere that does not exist — or somewhere that does and should not be run. Never run an install command from a repo you have not opened.
- **Do not silently substitute your own judgement for an installed skill.** Disagree out loud, with the reason, then either follow it or take a ruling from the user. Silent substitution is indistinguishable, in the delivered work, from the skill having been used.
- **Do not load five skills speculatively.** A skill loaded is context spent, and context spent early is the phase you cannot finish later. Budget: every `prefer` entry (0 or 1 in this map) plus **at most two** `also` entries whose triggers you can state in one sentence about *this* task. If three triggers genuinely apply, the job is scoped too broadly — split it into two resolves. The documented dilution case ran 100+ skills, 26 MCP servers and 90+ memory files and got worse, not better: if a human engineer could not pick the right tool out of your loaded set, neither can you.
- **Do not treat a `resolve` result as permission to skip the playbook.** The skills carry craft; the playbook carries the procedure and the exit condition. Playbook first, every time.

## Exit condition

Before the job's first substantive edit, write or command, all four must hold:

1. `skills.mjs resolve <job>` has run for this job kind this session, and the file named on its `playbook:` line has been read.
2. Every `prefer` entry is loaded, or its absence is stated in your reply with the exact `install:` or `find:` string the script printed.
3. Every loaded `also` entry has a trigger you can quote against this task, and the total loaded is no more than `prefer` + 2.
4. Any tier-2 or tier-3 route is recorded with `state.mjs note ruling` and named out loud to the user.

Miss any one and you are guessing at craft the user already paid to have on disk — which reads, from their side, exactly like the skill having been used.
