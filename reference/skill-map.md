# The skill tree

The factory owns pipeline discipline and nothing else. Interface craft, motion, doc lookup, diagrams, review and debugging discipline belong to skills that already do those jobs better than improvised effort — this file is how you pull the right one for the job in front of you, and what to do when it is not on this machine.

## Resolve before you work

Run this before the first real action of a job, not after you have started and stalled:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs resolve <job>
```

Job kinds: `research product architecture program-design implement verify review debug design-ui design-visual motion marketing docs loop handoff`. There is no `plan` job — the plan phase runs off [slice.md](slice.md) and needs no extra skill; if it needs a fact, that is a `research` detour.

The output has four parts. Treat each literally:

| Section | What it means |
|---|---|
| `playbook:` | Read this file first. It is the procedure; the skills are the craft. |
| `load — owns this job` | The `prefer` set. Load unconditionally. This skill is the authority for the job. |
| `load when the trigger applies` | The `also` set, each printed with its trigger. Load one **only if its trigger is literally true** of the work in front of you. |
| `external (not a local skill)` | Not a skill on disk. Fetch or install as printed; see External below. |
| `NOT INSTALLED` | Gaps, each with `source`/`install` or `find`, plus a `degrade` note. |

One resolve per job kind, once. Do not re-resolve the same job later in the session because you forgot — the answer is in your context already, and a second call is one more tool round for nothing.

## The three tiers

| Status | What you do |
|---|---|
| `installed` / `builtin` | Load it and follow it. It is the authority for that job. Your own taste does not override a skill the user deliberately installed. |
| `missing` with an `install:` line | Offer that command verbatim in one line, then continue on the degraded path in the same turn. Do not stall waiting for an answer — Law 8. |
| `missing` with only a `find:` line | Print the search string exactly as given. Do not turn it into a URL. |
| `missing`, cannot be had here | Take the printed `degrade` note as your standard, and say out loud that you are on the degraded path and which skill you lack. |

The offer is one line, not a paragraph:

```
`impeccable` is not installed — `npx impeccable` gets it. Proceeding on its degraded craft floor for now.
```

Every degraded route is a ruling, so it goes in the ledger where a later session can see it (Law 7):

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note ruling "design-ui without impeccable; degraded craft floor per skill-map; cost-if-wrong: polish below the skill's bar, recoverable by re-running design after install"
```

Silence is the failure this prevents. A user who installed a design skill and receives design work made without it believes they got the skill's output; that belief is not correctable later, because the work looks finished.

## The map

`prefer` loads unconditionally; `also` loads only on its printed trigger.

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

Why each route exists, one clause each:

- **research** — nothing owns it, because the codebase is the source; the `also` set only covers facts that are *not* in this repo (library APIs, prior project memory, the open web).
- **product** — pure judgement about the user's problem; no skill improves it, and prior decisions may already be recorded in memory.
- **architecture** — `code-structure` when operational logic is duplicated across flows, `drawio-skill` when three or more components make prose worse than a picture.
- **program-design** — the same structural skill, because this is the layer where the shared-service call actually gets shaped; its vocabulary comes from the `humanlayer-codebase-design` external.
- **implement** — `full-output-enforcement` always, because truncation is the single most likely defect here (Law 4); `find-docs` any time a library API is called.
- **verify** — evidence comes from running the thing, so `run` for the live app, `code-review` for the diff, `security-review` when the change touches auth, secrets, input handling or a network boundary.
- **review** — `code-review` owns it, because a generator grading itself confidently praises its own work; `simplify` when the diff is correct but duplicated.
- **debug** — the discipline is root-cause-first and belongs to the playbook; skills only supply library behaviour and a way to reproduce the failure in the running app.
- **design-ui** — `impeccable` owns interface craft outright; the rest are situational lenses (templated marketing site, component-level polish, native-feeling gesture, library not yet chosen, existing site being upgraded).
- **design-visual** — no owner because the deliverable varies from a brand board to a generated ad; pick the one skill whose trigger matches and ignore the others.
- **motion** — split by verb: audit existing motion, find missing motion, review a motion diff, name an effect the user described but could not name.
- **marketing** — positioning needs real market evidence, not recall; the rest attach only when the deliverable is identity, a landing concept, campaign imagery or numbers.
- **docs** — a document a human will read and share is an interface, so it routes to the artifact skills rather than to a raw file dump.
- **loop** — `loop` when the iteration lives in this session, `schedule` when it must outlive it.
- **handoff** — the built-in `handoff` skill compacts the session; the fixed schema it must satisfy is in [context-discipline.md](context-discipline.md).

## External skills

`external` entries are not local skills. The `humanlayer-*` ids are plain files in public repos and install with:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs fetch <external-id>
```

`superpowers` and `humanlayer-rpi-research` are plugin installs; print their line and let the user run it. `humanlayer-codebase-design` is the highest-value one — without its vocabulary the program-design phase degenerates into restating the architecture.

`node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs doctor` reports coverage across every job at once. Run it when the user asks what the factory can reach here, not before each job.

## Two standing decisions

**1. Library and API facts come from Context7, never from memory.** Any research or implementation touching a named library, framework, SDK, CLI or cloud service resolves its facts there first. `find-docs` wraps it; the CLI needs no skill at all:

```bash
npx ctx7@latest library "<name>" "<what to look up>"
npx ctx7@latest docs <id> "<question>"
```

Training data lags releases, and one wrong signature costs a debugging cycle that dwarfs the lookup. WebSearch is the fallback only when the library is absent from Context7. Answering an API question from recall is a Law 1 violation dressed up as speed.

**2. Interface work is owned by `impeccable`.** The factory carries no design taste of its own. Its job at a visual boundary is to decide *that* design work is needed, hand over the product and architecture context the skill cannot infer, and verify the result. If `impeccable` is missing, follow the degraded craft floor its registry entry prints — do not substitute a general sense of what looks good.

## Anti-patterns

- **Do not vendor a skill into the factory.** Copying a skill's rules into `.factory/` forks it: the copy stops receiving the upstream's fixes and starts disagreeing with the installed original, and no one knows which one is authoritative.
- **Do not invent a repository URL.** Where the registry gives `find` instead of `source`, the upstream is genuinely unknown and the copies circulating are forks. A guessed URL sends the user somewhere that does not exist, or worse, somewhere that does.
- **Do not silently substitute your own judgement for an installed skill.** If you disagree with it, say so and say why; then follow it or get a ruling from the user.
- **Do not load five skills speculatively.** A skill loaded is context spent, and context spent early is the phase you cannot finish later. The documented dilution case ran 100+ skills and 26 MCP servers and got worse, not better: if a human engineer could not pick the right tool from your set, neither can you. Load `prefer` plus the `also` entries whose triggers you can state in one sentence about *this* task — usually zero to two.
- **Do not treat a `resolve` result as permission to skip the playbook.** The skills carry craft; the playbook carries the procedure and the exit condition. Read the playbook first.

## Exit condition

Before the job's first substantive edit, write or command, all four must be true:

1. `skills.mjs resolve <job>` has been run for this job kind and its playbook has been read.
2. Every `prefer` skill is loaded, or its absence is stated in the reply with its install line.
3. Every loaded `also` skill has a trigger you can point at in this task; anything else stayed unloaded.
4. Any degraded path is recorded via `state.mjs note ruling` and named out loud to the user.

If you cannot tick all four, you are guessing at craft the user already paid to have on disk.
