# No-argument routing: the context-aware menu

Read this when the user types `/factory` with nothing after it. They are asking "what should I do next here?" Answer it from the state that is actually on disk, then show the full menu. **Never auto-run a command.** A phase you start uninvited spends the user's tokens on work they may not have wanted, and every phase writes an artifact that anchors everything downstream — a wrong `PRD.md` propagates into an architecture nobody asked for.

## What you already have

Setup ran `context.mjs --brief`. It gave you: root, `phase`, active work title, `slice done/total`, git branch and dirty count, and a list of directive codes. **Do not re-run it, and do not re-derive what it told you.**

One optional extra call, only if you need the *text* of open items or the session counters:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs show
```

That is the entire budget for this turn. Do not scan the codebase, do not read source files, do not run `slop.mjs scan` — a menu that costs a full repo scan is a phase in disguise.

## Reason over the signals, in this precedence order

Several will fire at once. Take the first that applies as pick 1, then the next two that still make sense. Stop at three.

| Rank | Signal | Lead with | Reason line names |
|---|---|---|---|
| 1 | `NOT_INITIALIZED` | `/factory init` | there is no charter or state here yet; **offer nothing else** — every other command reads state that does not exist |
| 2 | `RESUME` and `HANDOFF.md` exists in the work dir | `/factory resume` | the handoff file and the phase it stopped at |
| 3 | `OPEN_ITEMS` | closing them | the count and the first item's text — these are commitments (Law 3), and `state.mjs finish` refuses while they are open |
| 4 | `HANDOFF_NOW` in output, or a session counter at its cap | `/factory handoff` | which cap was hit; continuing past it trades quality for closure |
| 5 | phase + slice imply a continuation | the next pipeline command | the exact phase and slice numbers |
| 6 | `NO_ACTIVE_WORK` | `/factory research <topic>` | there is no unit of work, so nothing is being tracked |
| 7 | `DIRTY_DEFAULT_BRANCH` | branching before implementing | the branch name and the dirty file count |
| 8 | `NO_CHARTER` | `/factory init` | `FACTORY.md` is missing, so a fresh session will re-litigate settled decisions |
| 9 | `NO_TEST_COMMAND`, and phase is `plan` or later | agreeing a verify command with the user | verify has nothing to run without one |
| 10 | phase is `plan` or `implement` and `.factory/slop-baseline.json` is absent | `node ${CLAUDE_SKILL_DIR}/scripts/slop.mjs baseline` | drift is unmeasurable without a line to compare against |

For rank 10, check the baseline with a single Read of `.factory/slop-baseline.json`; a not-found error is the signal. Do not run `slop.mjs check` to find out — that is a full scan.

### Phase continuation (rank 5)

| Current phase | Recommend | Only if |
|---|---|---|
| `research` | `/factory product` | `RESEARCH.md` exists |
| `product` | `/factory architecture` | `PRD.md` exists |
| `architecture` | `/factory program-design` | `ARCHITECTURE.md` exists |
| `program-design` | `/factory plan` | `PROGRAM-DESIGN.md` exists |
| `plan` | `/factory implement` | `PLAN.md` exists and lists slices |
| `implement`, `done < total` | `/factory implement` | say "slice `<done+1>` of `<total>`" |
| `implement`, `done == total` | `/factory verify` | every slice is committed |
| `verify` | `/factory review` | `evidence/` has files in it |
| `review` | `node ${CLAUDE_SKILL_DIR}/scripts/state.mjs finish` | no open items |
| `done` | `/factory research <topic>` for the next unit | — |

**If the phase marker is set but its artifact is missing, recommend re-running that phase, not the next one.** A phase advanced without its artifact means the next phase would design against nothing, and that is how a plan gets built on an architecture that was never written down.

## The menu you print

One block. Fill every angle bracket from real state; never print a placeholder.

```
factory — <phase | not initialized> · <work title | no active work> · slice <done>/<total> · <branch><, N dirty>

Recommended
  1. <exact command text>          <one line: the observed fact that makes this the next move>
  2. <exact command text>          <one line>
  3. <exact command text>          <one line>

Pipeline   /factory research · product · architecture · program-design · plan · implement · verify · review
Jobs       /factory design <target> · marketing <target> · debug <symptom> · loop <goal>
Session    /factory status · handoff · resume · skills · init

Say a number or type a command.
```

Then stop and wait. The closing line is load-bearing: it makes clear the recommendation is a suggestion the user confirms, not a plan you are already executing.

## Rules for the recommendation lines

**Every reason cites something you observed.** "Research is a good first step" is unfalsifiable and teaches the user to skip the menu; "no `RESEARCH.md` and no active work — nothing is tracked yet" is checkable against the same output they can read. Numbers beat adjectives: name the slice count, the branch, the open-item count.

**Three picks maximum, ordered strongest first.** Eleven equal options is the same as no recommendation — the user then does the routing you were asked to do.

**Never recommend a phase whose input artifact does not exist.** Jumping to `implement` without `PROGRAM-DESIGN.md` violates Law 5, and re-steering two thousand written lines costs the session that a call-stack sketch would have cost a few hundred tokens.

**Do not recommend `research` when a `RESUME` directive is live.** Earlier phases already happened and their output is on disk; re-running them burns the user's money to rediscover what the files already say.

**Skipping is a user decision, not yours.** If they pick a command that skips a phase, say which phase is being skipped and why it is acceptable, record it with `state.mjs note decision "..."`, and continue. Do not argue twice.

## Command reference (the full menu, expanded)

| Command | Does | Playbook |
|---|---|---|
| `/factory init` | write `FACTORY.md`, the durable charter | [init.md](init.md) |
| `/factory research <topic>` | what is true about this codebase and problem now | [research.md](research.md) |
| `/factory product` | user problem and success measure → `PRD.md` | [product.md](product.md) |
| `/factory architecture` | services, flow, endpoints, tables → `ARCHITECTURE.md` | [architecture.md](architecture.md) |
| `/factory program-design` | call stack, file placement, signatures, tests | [program-design.md](program-design.md) |
| `/factory plan` | vertical slices in order → `PLAN.md` | [slice.md](slice.md) |
| `/factory implement [slice]` | one slice, fresh subagent, committed | [implement.md](implement.md) |
| `/factory verify` | evidence that it works → `evidence/` | [verify.md](verify.md) |
| `/factory review` | adversarial pass over the diff | [verify.md](verify.md) |
| `/factory design <target>` | interface, visual or motion work | [design.md](design.md) |
| `/factory marketing <target>` | positioning, copy, launch, docs | [marketing.md](marketing.md) |
| `/factory debug <symptom>` | mechanism before fix | [debug.md](debug.md) |
| `/factory loop <goal>` | unattended iteration toward a measurable target | [loop.md](loop.md) |
| `/factory status` | `state.mjs show`, reported plainly | — |
| `/factory handoff` | freeze the session into a resumable document | [context-discipline.md](context-discipline.md) |
| `/factory resume` | read the handoff and continue | [context-discipline.md](context-discipline.md) |
| `/factory skills` | `skills.mjs doctor` — what the tree reaches from here | [skill-map.md](skill-map.md) |

Instruments the user may want named directly, all pre-approved:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs show          # full JSON snapshot
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs finish        # close the current work
node ${CLAUDE_SKILL_DIR}/scripts/slop.mjs baseline       # record this project's structural line
node ${CLAUDE_SKILL_DIR}/scripts/slop.mjs check          # scan against it, exit 1 on drift
node ${CLAUDE_SKILL_DIR}/scripts/hooks.mjs status        # is the Stop-gate hook installed
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs resolve <job>
```

## Exit condition

Checkable before you hand the turn back: **at most three recommendations, each with an exact command string and a reason naming a fact from the brief; the full menu printed; and zero mutations this turn** — no phase advanced, no artifact written, no `state.mjs` command other than `show`, no subagent dispatched.

If the user's next message is a plain build request rather than a menu pick, do not reprint the menu — follow SKILL.md's Routing and enter the pipeline at the implied phase, saying which phase and why.
