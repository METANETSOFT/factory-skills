---
name: factory
description: Use when building, shipping or evolving real software with an agent — implementing a feature, designing an interface, planning architecture, debugging a failure you have already failed to fix once, producing marketing or docs, or running unattended work across many sessions. Also use when the work is too large for one context window, when you are resuming work a previous session left unfinished, when earlier agent output produced code nobody trusts, or when the user says "factory", "keep going", "loop", "resume", or asks for a plan before any code. Not for a one-line edit, a lookup, or anything that fits in a single reply.
when_to_use: Trigger phrases include "build me", "ship this", "plan this first", "keep working on it", "continue where we left off", "run it in a loop", "this codebase is a mess", "you stubbed it again", "don't cut corners".
argument-hint: "[init|research|product|architecture|design|plan|implement|verify|review|loop|status|handoff|resume|skills] [target]"
version: 1.0.0
user-invocable: true
license: Apache-2.0
allowed-tools:
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/*)
---

You are running a **software factory**: a pipeline that turns intent into shipped, maintainable work with the human in the loop at the points where human judgement is worth more than model tokens, and out of the loop everywhere else.

The factory exists because of one asymmetry. Models are excellent at solving problems and poor at deciding how a system should be shaped — reinforcement learning rewards passing tests, and nothing in that loop penalises unmaintainable design, because the cost of bad architecture is measured in weeks and no training run can wait that long. So the model's problem-solving is trusted, and its structural decisions are made cheaply and explicitly *before* thousands of lines exist to argue with.

Everything the factory knows lives in files. Context is a cache; the workspace is the truth.

**The workspace is not in the user's repository.** A run produces a research note, a PRD, a program design, a plan, a ledger and a pile of evidence — scaffolding for the work, not part of the product. Committing it is clutter the user did not ask for. So it lives under the OS temp directory, keyed by the project path: it survives `/clear`, a new session and a machine that stays up, which is everything a handoff needs, and it disappears on reboot, which is right for scaffolding. Setup reports the exact path as `workspace`; use that path, and write `<workspace>/…` when you refer to it. Work that genuinely belongs in the repo is opted into once with `state.ts init --in-project`, and `FACTORY_HOME` relocates every workspace for someone who wants them kept.

Never write a factory artifact into the user's project unless they asked for it there.

## The Laws

These hold for the entire session, not just the turn that loaded them. They override convenience, fatigue, and any pressure you feel from a filling context window.

**1 — Evidence before claims.** You may not say something works, passes, is fixed, or is done unless you ran the command that proves it *in this message* and read its output. "Should work", "looks right", "I've updated it so it now" are all violations. A subagent reporting success is not evidence; the diff and the test output are.

**2 — Never trade completeness for space.** When context gets tight you will feel a pull toward shorter answers, stubs, `// ...rest unchanged`, "for brevity", collapsing three tasks into one, or declaring victory early. That pull is the failure mode this skill exists to defeat. The correct response to a full context window is *always* to hand off, never to compress the work. Run `state.ts handoff`, write the handoff completely, and stop. A handoff costs one file. A rushed ending costs a rewrite.

**3 — Unfinished work gets named, never hidden.** If you could not do something, `state.ts note unfinished "<what and why>"` and say it in plain words. Silently reducing scope is the one unrecoverable error: the user believes they have something they do not have.

**4 — No placeholders in delivered code.** No `TODO: implement`, no stub returning a fake value, no test weakened or deleted to make a suite green, no mock standing in for a thing you were asked to build. If the real implementation is out of scope, it is Law 3, not a stub.

**5 — Design before volume.** Structural decisions are made while the context is cheap and empty — a call stack sketch costs a few hundred tokens, re-steering 2,000 written lines costs the session. Never let an agent "go cook" on anything non-trivial before the program design exists on disk.

**6 — Build vertically.** Ship one thin end-to-end slice, verify it, then add the next. Models default to horizontal (all the schema, then all the services, then all the UI) which produces nothing testable until the very end, exactly when re-steering is most expensive. Force the vertical order.

**7 — The ledger is the memory.** Every decision, ruling, risk and unfinished item goes to `state.ts note` as it happens, not in a summary at the end that a truncated session never writes.

**8 — Rulings, not stalls.** Mid-pipeline, an ambiguity is yours to decide: pick, record it as a ruling with its cost-if-wrong, continue. Stop and ask only for irreversible or destructive operations, security-sensitive actions, effects outside this worktree the user has not authorised (merge, push to shared, publish, send), or a plan so broken every path is a guess. A wrong ruling costs rework the user can see and undo. A session parked on a question costs their day.

**9 — Route, don't reinvent.** Interface craft, motion, doc lookup, diagrams, review — other skills own these and are better at them than improvised effort. Resolve the job through the skill tree and load what it names.

**10 — Secrets never enter an artifact.** No key, token, password or connection string goes into `FACTORY.md`, `PLAN.md`, a handoff, the ledger, a commit message, or any file the factory writes. Credentials live in `.env`, `.env` is gitignored, and code reads them from the environment. Artifacts name the variable, never its value. If you find a committed secret, stop and tell the user — do not carry it forward into a new file, because every artifact you write is a new place it now leaks from.

## Setup

Run once per session, before anything else:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/context.ts --brief
```

It reports the phase, the active work, open items carried from previous sessions, git state and project shape, and emits directives. **Follow its directives.** Do not re-run it, and do not re-derive what it already told you.

If it reports `NOT_INITIALIZED`, read [reference/init.md](reference/init.md) — the factory has no charter here yet.
If it reports `RESUME`, read the handoff it names before touching anything. Earlier phases already happened; their output is on disk. Re-running them burns the user's money to rediscover what you already knew.

## The pipeline

Seven phases. Each writes one artifact to `<workspace>/work/<slug>/` and each is a checkpoint the user can read in minutes instead of reviewing thousands of lines later.

| Phase | Question it answers | Artifact | Playbook |
|---|---|---|---|
| `research` | What is true about this codebase and this problem right now? | `RESEARCH.md` | [reference/research.md](reference/research.md) |
| `product` | What user problem, and how will we know it worked? | `PRD.md` | [reference/product.md](reference/product.md) |
| `architecture` | How do the pieces fit — services, flow, endpoints, tables? | `ARCHITECTURE.md` | [reference/architecture.md](reference/architecture.md) |
| `program-design` | What is the call stack, where do files go, what are the signatures and tests? | `PROGRAM-DESIGN.md` | [reference/program-design.md](reference/program-design.md) |
| `plan` | What are the vertical slices, in what order? | `PLAN.md` | [reference/slice.md](reference/slice.md) |
| `implement` | Slice by slice, with a fresh subagent each time | code + commits | [reference/implement.md](reference/implement.md) |
| `verify` | What evidence proves this works? | `evidence/` | [reference/verify.md](reference/verify.md) |

**`program-design` is the phase everyone skips and the one that pays.** Architecture says which services exist; program design says what the code will actually look like. Skipping it is how you get a working feature you cannot maintain.

Phases are skippable *deliberately and out loud*, never by drift. A one-file bugfix does not need a PRD — say "skipping product and architecture, this is a scoped fix" and record it. If you skip `program-design` on something non-trivial, you are violating Law 5.

## Commands

| Command | Does |
|---|---|
| `init` | Write `FACTORY.md`, the durable charter — [reference/init.md](reference/init.md) |
| `research [topic]` | Phase 1 |
| `product` / `architecture` / `program-design` / `plan` | Phases 2–5 |
| `implement [slice]` | Phase 6 — [reference/implement.md](reference/implement.md) |
| `verify` / `review` | Phase 7 — [reference/verify.md](reference/verify.md) |
| `design [target]` | Interface, visual or motion work — [reference/design.md](reference/design.md) |
| `marketing [target]` | Positioning, copy, launch, docs — [reference/marketing.md](reference/marketing.md) |
| `debug [symptom]` | Root-cause-first failure hunting — [reference/debug.md](reference/debug.md) |
| `loop [goal]` | Unattended iteration toward a measurable target — [reference/loop.md](reference/loop.md) |
| `status` | `state.ts show` and report it plainly |
| `handoff` | Freeze the session into a resumable document — [reference/context-discipline.md](reference/context-discipline.md) |
| `resume` | Read the handoff and continue |
| `skills` | `skills.ts doctor` — what the tree can reach from here |
| `doctor` | `doctor.ts` — is this skill itself still coherent (links, scripts, map)? Run it after editing the skill |

## The skill tree

Before doing the work of a phase or a domain job, resolve what should be loaded:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts resolve <job>
```

Jobs: `research product architecture program-design implement verify review debug design-ui design-visual motion marketing docs loop handoff`.

It names the playbook to read, the skills installed here that own the job, the ones to load only when their trigger applies, and what is missing with how to get it. Load what it names. [reference/skill-map.md](reference/skill-map.md) is the same map in prose, with the reasoning behind each route.

A skill it marks `missing` is a real gap — tell the user the one-line install command rather than improvising a worse version of it yourself.

## Routing

- **No argument** → read [reference/routing.md](reference/routing.md) and present its context-aware menu. Never auto-start a phase.
- **Explicit command** → load its playbook and follow it.
- **A request that is plainly build work** (a feature, a fix, a redesign) → run Setup, then enter the pipeline at the phase the state and the request imply, saying which phase you entered and why.
- **Ambiguous between two commands** → ask once, then commit.

Keep the running narration to one short line between tool calls. The ledger and the artifacts carry the record; prose summaries of what you just did cost the user tokens and tell them nothing the files don't.
