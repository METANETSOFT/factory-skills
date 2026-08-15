# No-argument routing: the context-aware menu

`/factory` with nothing after it is the user asking "what should I do next here?". You answer it from state already on disk, and you hand the turn back. **Never run a command the user did not name.** Every pipeline command writes an artifact that anchors everything downstream, so a `PRD.md` you started uninvited becomes an architecture nobody asked for — and the user cannot tell a menu that mutated state from a menu that lied.

Law 8 (rulings, not stalls) does not licence starting one. It governs ambiguity *inside* a running pipeline; an empty invocation is not ambiguity, it is a request for options, and answering it by picking is the failure it looks like a cure for.

## Your budget for this turn

Setup already ran `context.ts --brief`. It printed root, `phase`, work title, `slice done/total`, branch with dirty count, and one `[CODE] text` line per directive. **Do not re-run it and do not re-derive what it said.** If it has not run in this session, run it once now — everything below keys off its codes.

The complete directive set is `NOT_INITIALIZED` `NO_CHARTER` `RESUME` `NO_ACTIVE_WORK` `OPEN_ITEMS` `DIRTY_DEFAULT_BRANCH` `NO_TEST_COMMAND`. There are no others. Do not invent a code to justify a recommendation.

One optional second call, and it is the only one that earns its cost:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts show
```

It writes nothing and returns exactly what the tables below need: `artifacts` (present/bytes for `RESEARCH.md` `PRD.md` `ARCHITECTURE.md` `PROGRAM-DESIGN.md` `PLAN.md` `HANDOFF.md`), `openItems` with their text, `nextPhase`, and `pressure`. Without it the "only if the artifact exists" gates below are guesses, and a recommendation to advance a phase whose input was never written is how a plan gets built on an architecture that does not exist.

**Ceiling: two Bash calls, one optional Read of `<workspace>/slop-baseline.json`, zero source files, zero subagents.** Do not run `slop.ts check`, do not grep the codebase, do not open `PLAN.md` "to see where we got to". A menu that costs a repo scan is a phase in disguise; the user asked what to do, not for it to be done.

## Precedence

Several signals fire at once. Take the first that applies as pick 1, then the next two that still make sense, and stop at three.

| Rank | Checkable signal | Lead with | Reason line must name |
|---|---|---|---|
| 1 | `NOT_INITIALIZED` | `/factory init` | there is no state file here — and **offer nothing else**, every other command reads state that does not exist |
| 2 | `RESUME` and `artifacts["HANDOFF.md"].present` | `/factory resume` | the handoff path and the phase it froze at |
| 3 | `OPEN_ITEMS` | the command that closes item 1 | the count and item 1's text — these are commitments (Law 3) and `state.ts finish` exits 1 while any is open |
| 4 | phase + slice imply a continuation | the next pipeline command | the exact phase name and slice numbers |
| 5 | `NO_ACTIVE_WORK` | `/factory research <topic>` | nothing is tracked yet, so no artifact has a home |
| 6 | `DIRTY_DEFAULT_BRANCH` | branching before any implement command | the branch name and the dirty file count |
| 7 | `NO_CHARTER` with state present | `/factory init` | `FACTORY.md` is missing, so the next fresh session re-litigates settled decisions |
| 8 | `NO_TEST_COMMAND` and phase is `plan` or later | agreeing a verify command with the user | verify has nothing to run, so its evidence would be prose |
| 9 | phase is `plan` or `implement` and `<workspace>/slop-baseline.json` is absent | `node ${CLAUDE_SKILL_DIR}/scripts/slop.ts baseline` | drift is unmeasurable without a line to compare against |

Rank 5 recommends `/factory research <topic>`; **do not run `state.ts start` yourself** — [research.md](research.md) opens with it, and running it here is a mutation this turn is not allowed to make. Rank 9's check is a single Read of `<workspace>/slop-baseline.json`; a not-found error *is* the signal. See [anti-slop.md](anti-slop.md).

### Session pressure is carried spend, not yours

`show` may report `pressure.level: "handoff"` (`HANDOFF_NOW`) or `"warn"` (`FINISH_CURRENT_SLICE`). Those counters are per unit of work and reset only on `state.ts start` and `state.ts handoff`, so at menu time they measure the session that ended, not this one — which has read nothing and edited nothing.

- `handoff` **and** `HANDOFF.md` present → rank 2 already covers it.
- `handoff` **and** `HANDOFF.md` absent → the previous session died without handing off. **Do not recommend `/factory handoff`.** You did not do that work, so the document you wrote would be invented — Law 1 with a filename attached. Lead with the phase continuation and say in one line that the counters are carried, and that the record of that session is the ledger plus the artifacts on disk.
- `warn` → print the number in the status line. It demotes nothing.

### Phase continuation (rank 4)

| Current phase | Recommend | Only if `show` reports |
|---|---|---|
| `research` | `/factory product` | `RESEARCH.md` present |
| `product` | `/factory architecture` | `PRD.md` present |
| `architecture` | `/factory program-design` | `ARCHITECTURE.md` present |
| `program-design` | `/factory plan` | `PROGRAM-DESIGN.md` present |
| `plan` | `/factory implement` | `PLAN.md` present and `slice.total > 0` |
| `implement`, `done < total` | `/factory implement` | say "slice `<done+1>` of `<total>`" |
| `implement`, `done == total` | `/factory verify` | every slice committed |
| `verify` | `/factory review` | `evidence/` is non-empty |
| `review` | `node ${CLAUDE_SKILL_DIR}/scripts/state.ts finish` | `openCount == 0` |
| `done` | `/factory research <topic>` for the next unit | — |

**If the phase marker is set but its artifact is absent, recommend re-running that phase, never the next one.** A phase advanced without its artifact means the next phase designs against nothing.

**Never recommend a command whose input artifact is missing.** Jumping to `implement` without `PROGRAM-DESIGN.md` violates Law 5: a call-stack sketch costs a few hundred tokens, re-steering two thousand written lines costs the session.

## The menu you print

One block. Fill every angle bracket from real state; never print a bracket you could not fill.

```
factory — <phase | not initialized> · <work title | no active work> · slice <done>/<total> · <branch><, N dirty> · <N open>

Recommended
  1. <exact command text>          <one line: the observed fact that makes this the next move>
  2. <exact command text>          <one line>
  3. <exact command text>          <one line>

Pipeline   /factory research · product · architecture · program-design · plan · implement · verify · review
Jobs       /factory design <target> · marketing <target> · debug <symptom> · loop <goal>
Session    /factory status · handoff · resume · skills · init

Say a number or type a command.
```

Then stop and wait. The closing line is load-bearing: it is what makes the three picks a suggestion the user confirms rather than a plan already running.

## Rules for the three recommendation lines

**Every reason cites something you observed in this turn's output.** "Research is a good first step" is unfalsifiable and teaches the user to skip the menu. "No `RESEARCH.md` and no active work — nothing is tracked yet" is checkable against text they can read. Prefer numbers: the slice count, the branch, the open-item count.

**Three maximum, strongest first.** Nine equal options is the same as no recommendation — the user then does the routing they asked you to do.

**Do not recommend `research` while `RESUME` is live.** Earlier phases already ran and their output is on disk; re-running them spends the user's money to rediscover what the files say.

**Skipping a phase is the user's call, not yours.** If their pick skips one, name the phase being skipped and why it is acceptable, record it with `state.ts note decision "..."` *in that command's turn, not this one*, and continue. Do not argue twice.

## The full command set

| Group | Command | Does | Playbook |
|---|---|---|---|
| Pipeline | `/factory research <topic>` | what is true about this codebase and problem now | [research.md](research.md) |
| Pipeline | `/factory product` | user problem and success measure → `PRD.md` | [product.md](product.md) |
| Pipeline | `/factory architecture` | services, flow, endpoints, tables → `ARCHITECTURE.md` | [architecture.md](architecture.md) |
| Pipeline | `/factory program-design` | call stack, file placement, signatures, tests | [program-design.md](program-design.md) |
| Pipeline | `/factory plan` | vertical slices in order → `PLAN.md` | [slice.md](slice.md) |
| Pipeline | `/factory implement [slice]` | one slice, fresh subagent, committed | [implement.md](implement.md) |
| Pipeline | `/factory verify` | evidence that it works → `evidence/` | [verify.md](verify.md) |
| Pipeline | `/factory review` | adversarial pass over the diff | [verify.md](verify.md) |
| Jobs | `/factory design <target>` | interface, visual or motion work | [design.md](design.md) |
| Jobs | `/factory marketing <target>` | positioning, copy, launch, docs | [marketing.md](marketing.md) |
| Jobs | `/factory debug <symptom>` | mechanism before fix | [debug.md](debug.md) |
| Jobs | `/factory loop <goal>` | unattended iteration toward a measurable target | [loop.md](loop.md) |
| Session | `/factory init` | write `FACTORY.md`, the durable charter | [init.md](init.md) |
| Session | `/factory status` | `state.ts show`, reported plainly | — |
| Session | `/factory handoff` | freeze the session into a resumable document | [context-discipline.md](context-discipline.md) |
| Session | `/factory resume` | read the handoff and continue | [context-discipline.md](context-discipline.md) |
| Session | `/factory skills` | `skills.ts doctor` — what the tree reaches from here | [skill-map.md](skill-map.md) |

Instruments the user may name directly; all are pre-approved by `allowed-tools`:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts show          # JSON snapshot, writes nothing
node ${CLAUDE_SKILL_DIR}/scripts/state.ts finish        # close the work; exits 1 if items are open
node ${CLAUDE_SKILL_DIR}/scripts/slop.ts baseline       # record this project's structural line
node ${CLAUDE_SKILL_DIR}/scripts/slop.ts check          # scan against it, exit 1 on drift
node ${CLAUDE_SKILL_DIR}/scripts/hooks.ts status        # is the Stop-gate hook installed  → hooks.md
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts resolve <job>  # which skills own a job (Law 9)
```

## Exit condition

Before handing the turn back, all five must hold: **at most three recommendations**; **each carries an exact command string** the user can copy; **each reason names a value you read this turn** (a directive code, an artifact flag, a count, a branch); **the full menu block is printed with no unfilled brackets**; and **nothing mutated** — no phase advanced, no artifact written, no `state.ts` subcommand other than `show`, no subagent dispatched, no git operation.

If the user's next message is a plain build request rather than a menu pick, do not reprint this menu — follow SKILL.md's Routing, enter the pipeline at the phase the request implies, and say which phase and why.
