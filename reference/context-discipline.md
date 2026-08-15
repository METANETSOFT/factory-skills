# Context discipline and handoff

This file owns when to stop, how to stop, and the resume that follows. The factory's most expensive failure is not a bug — it is a session that felt pressure, quietly shrank the work to fit what was left, and handed back something the user believes is complete. Law 2 is the rule; this is its mechanism.

## Your own context estimate is not evidence

Never ask yourself how much context remains, and never let a decision depend on the answer. Cognition, rebuilding Devin on Sonnet 4.5, found the model consistently underestimates remaining tokens with *very precise but wrong* estimates; Anthropic documents models "wrapping up work prematurely as they approach what they believe is their context limit". An introspected number is the most dangerous input available to you, because it arrives feeling like a measurement.

These sentences are banned in any phrasing. Each one is Law 2 being rationalised in the moment:

- "I'm running low on context, so I'll summarise the rest."
- "To conserve tokens, here's the abbreviated version."
- "Given the space left, I'll do the important parts."
- "// ...rest unchanged", "for brevity", "you can fill in the others similarly".

A full window never makes truncated work acceptable. It makes a handoff due.

## The signals that are real

Watch behaviour, not feeling. Each of these is observable in the transcript, costs nothing to notice, and fires before output quality visibly collapses.

| Signal | Why it means degradation | Act |
|---|---|---|
| Parallel tool calls give way to sequential ones | Documented transition as the window fills; you stop batching because the planning depth that batched them is gone | Finish the call in flight, then hand off |
| You write `SUMMARY.md` / `CHANGELOG.md` unprompted | Offloading to disk unasked — the reflex that precedes wrapping up early | `rm` it, write the handoff schema below instead |
| You mention running out of space, or start self-summarising | The anxiety behaviour itself, now in the output | Hand off immediately |
| The same issue corrected twice in one session | Anthropic's documented `/clear` trigger — the first correction lost the attention competition against newer tokens | Hand off; a third correction will not stick either |
| Fewer than ~3 files read before an edit | AMD telemetry over 6,852 sessions caught the March 2026 regression as 6.6 → 2.0 files read before editing, with median thinking length falling 2,200 → 600 chars | Stop editing. Re-read the plan, then hand off |

Degradation starts long before the window is full. HumanLayer's ACE-FCA targets **40–60% context utilisation**, not 90% — compacting at 95% bakes already-degraded output into whatever you carry forward.

**The moment any signal fires:** stop opening new fronts. If the slice you are on is one verified command from done, run that command, record the evidence, then hand off. If it is not, `state.mjs note unfinished "<what exists, what is missing, where>"` and hand off with the half-slice named (Law 3). After a signal you do not start a new slice, a new file, or a new investigation — that decision is already made and is not yours to re-open.

## The gauges that are real

`state.mjs` counts what you actually did, and every tick returns the verdict, so you never poll for it:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs tick <read|edit|slice|fix|subagent>
```

The response carries `counts`, `caps` and `pressure`; `pressure.level` is `ok`, `warn` or `handoff`, and `pressure.directive` is the sentence to obey. Tick as the event happens — an untracked session has no gauge at all, only the intuition the section above disqualified. `state.mjs show` reports the same `pressure` block at any time. `context.mjs --brief` does **not**: it emits `RESUME`, `OPEN_ITEMS` and git directives, and no pressure reading. Do not claim a pressure level you have not read from `state.mjs`.

| Counter | `FINISH_CURRENT_SLICE` at | `HANDOFF_NOW` at | What the cap encodes |
|---|---|---|---|
| `slice` | — | 3 | Three vertical slices is a session's worth of structural judgement |
| `fix` | 6 | 8 | Past eight fix rounds you are stacking repairs on a wrong base ([implement.md](implement.md)) |
| `edit` | 42 | 60 | Edit volume without re-reading is the erosion signal |
| `read` | 63 | 90 | The window is materially consumed by file content |
| `subagent` | 9 | 12 | Delegation past this is theatre, at 3–10× tokens |

`slice` has no warning band: the third completed slice trips `HANDOFF_NOW` directly. Do not wait for a warning that will never arrive. Note also that `state.mjs slice <done>/<total>` increments the `slice` counter itself — do not also `tick slice` for the same slice, or the cap trips a full slice early.

- **`FINISH_CURRENT_SLICE`** — complete the slice you are on, verify it, hand off. Do not begin another.
- **`HANDOFF_NOW`** — do not start new work and do not compress remaining work to fit. Run `state.mjs handoff`, write the file completely, stop.

`HANDOFF_NOW` is a directive, not advice: pushing to a fourth slice buys one slice at the price of the session's remaining judgement.

Two operational traps, both verified against the script:

- **`state.mjs handoff` zeroes the session counters.** Running it and then continuing clears the gauge while the degraded context sits exactly where it was — worse than having no gauge. Handoff means handoff: write the file, tell the user to `/clear`, stop.
- **`state.mjs handoff` exits 1 with `no active work to hand off`** when `state.mjs start` was never run. Do not improvise a file path. Run `state.mjs start <slug> --title "..."`, then `state.mjs phase <phase>` to restore the phase — `start` resets phase to `research` and zeroes counters — then hand off.

## Reset, do not compact

Prefer a fresh session started from a written handoff over in-place compaction. Anthropic's finding is direct: compaction "doesn't give the agent a clean slate" — the compacted context inherits the same drift, the same wrong assumptions and the same wrapping-up reflex that made compaction necessary. A reset starts at zero and reads a document written while you still had the judgement to write it well. Which is why the handoff is written *before* the wall, not at it.

## The handoff file

`state.mjs handoff` returns `handoffFile` — `.factory/work/<slug>/HANDOFF.md` — plus `handoffNumber`, `phase`, `slice`, `openItems` and the closing session counts. Fill this schema exactly. It is the current front, not a history: the ledger keeps history, and each handoff replaces the last.

```markdown
# HANDOFF — <work title>

handoff #<n>   phase: <phase>   slice: <done>/<total>   written: <ISO timestamp>
branch: <branch>   head: <sha>   dirty: <yes — list files | no>

## End goal
<What the user asked for and what "done" looks like, in their terms. A session with zero prior
context must be able to recognise completion from this paragraph alone. Not "continue the refactor".>

## Approach being taken
<The chosen shape and why — the ruling, not the menu of options. Point at the artifacts holding the
detail: .factory/work/<slug>/PROGRAM-DESIGN.md, PLAN.md. If the approach changed mid-session, say
what it was, what it is now, and what forced the change. Rulings live in the ledger and never appear
in openItems, so an approach change that is not written here is lost.>

## Steps completed — with evidence
| # | What was done | Proof | Where |
|---|---|---|---|
| 1 | <past tense, specific> | <command run and its result, or commit sha> | <path or file:line> |

<A row with an empty Proof cell is not a completed step. Move it to Open items. Law 1 does not lapse
at a session boundary.>

## Current failure being worked on
<Exact symptom, the exact command that reproduces it, its verbatim output trimmed to the signal, and
the last hypothesis tested with what it ruled out. If nothing is failing: "None — stopped on session
caps, not on a failure." Never leave this heading empty. Dead hypotheses are the most valuable thing
a debugging handoff carries, because the next session's default is to try them again.>

## Open items
<Verbatim from `state.mjs show` → openItems, numbers kept so `state.mjs resolve <n>` still works.>
- #<n> <kind>: <text>

## Next action — exact
<One action, executable as written: a command, or a file plus the edit to make, or a subagent brief.
Not "continue implementing". If it is a decision, give the options and the cost-if-wrong of each so
the next session rules rather than stalls (Law 8).>

## Do NOT redo
- <work already done that a fresh session would plausibly repeat, and where its output lives>
- <path already explored and rejected, and why it was rejected>
```

The first four headings are ACE-FCA's proven minimum — **end goal / approach / steps completed / current failure**. They are not negotiable and not reorderable. The last three exist because a resumed session's two failure modes are re-deriving what you already knew and stalling on a question you already had standing to answer.

Only `note unfinished` and `note risk` create numbered entries in `openItems`; `ruling`, `decision` and `evidence` go to the ledger alone. Anything you need the next session to *act* on must be one of the first two kinds, or written into a heading above.

**Do not replace this schema with a freeform summary of the session.** Anthropic's finding on why model-authored summaries fail is that "the model didn't know what it didn't know": a narrative keeps what was salient at the end and silently drops what was decided at the beginning — the approach, the ruled-out paths, the reason the obvious thing does not work. That is exactly the material the next session needs and cannot reconstruct. A schema forces the fields a narrative would omit.

`skills.mjs resolve handoff` names the bundled `handoff` skill for gathering the material, and `obsidian-memory` when a fact is durable beyond this project. Gather with them; write **this** schema regardless. If either is unavailable, write the file by hand and say out loud that you are on the degraded path.

Two more rules, each paid for by a real failure:

- **No cliffhangers in file paths.** Every path is absolute or repo-relative and complete. "the auth middleware" costs the next session a grep it should not have to run.
- **Uncommitted work is stated as uncommitted**, with the file list and the reason it was not committed. A fresh session that assumes a clean tree will `git checkout` your last hour away.

## Resuming

`context.mjs --brief` emits `[RESUME]` and names `<workdir>/HANDOFF.md`. Read it in full before touching anything: earlier phases already happened and their output is on disk, and re-running them spends the user's money rediscovering what you already knew. `--brief` reports the open-item *count* only — run `state.mjs show` for the numbered list.

Then run exactly one cheap re-check before building on it: `git status`, and the command in the Proof column of the final completed step. A previous session's evidence column is a claim, and Law 1 applies across session boundaries as much as within one. If the re-check disagrees with the handoff, `state.mjs note risk "<the disagreement>"` and trust the command.

## Exit condition

The handoff is done when all of these are true. Each is checkable without judgement:

- [ ] `state.mjs show` → `artifacts["HANDOFF.md"].present` is `true`.
- [ ] All seven headings present; no heading followed by an empty body.
- [ ] Every row of "Steps completed" has a non-empty Proof cell naming a command or a commit sha.
- [ ] "Next action" is a single action a fresh session can execute without asking the user a question.
- [ ] Open items match `state.mjs show` → `openItems` exactly, numbers included.
- [ ] Every file, branch or command the file refers to appears in it as a literal path, sha or command string — no descriptions standing in for identifiers.
- [ ] The user has been told to `/clear` and say "factory resume".

Read the file back once as though you had never seen this project. Any answer that comes out as "I'd have to ask" is a failed check on the line above it, not a matter of taste.

---

**Restating this at the point it bites:** a full context window means hand off. It never means compress, abbreviate, stub, collapse three tasks into one, or declare victory early. A handoff costs one file and the user loses nothing. A rushed ending costs the rewrite — and because the user cannot see what you dropped, they find out later, from production. When you feel the pull to finish fast, that feeling *is* the signal to stop and write the handoff.
