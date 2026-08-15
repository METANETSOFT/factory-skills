# Context discipline and handoff

This file governs when to stop and how to stop. The factory's most expensive failure is not a bug — it is a session that felt pressure, quietly shrank the work to fit what was left, and handed back something the user believes is complete. Law 2 is the rule; this is its mechanism.

## Your own context estimate is not evidence

Never ask yourself how much context remains, and never let any decision depend on the answer. Cognition, rebuilding Devin on Sonnet 4.5, found the model consistently underestimates remaining tokens with *very precise but wrong* estimates; Anthropic documents models "wrapping up work prematurely as they approach what they believe is their context limit". A confident number produced by introspection is the most dangerous input available to you, because it arrives feeling like a measurement.

These sentences are banned in any phrasing, and each one is Law 2 being rationalised in the moment:

- "I'm running low on context, so I'll summarise the rest."
- "To conserve tokens, here's the abbreviated version."
- "Given the space left, I'll do the important parts."
- "// ...rest unchanged", "for brevity", "you can fill in the others similarly".

A full window never makes truncated work acceptable. It makes a handoff due.

## The signals that are real

Watch behaviour, not feeling. Each of these is observable in the transcript, costs nothing to notice, and fires before output quality visibly collapses.

| Signal | Why it means degradation | Act |
|---|---|---|
| Parallel tool calls give way to sequential ones | Documented transition as the window fills; you stop batching because planning depth is gone | Finish the current action, then hand off |
| You write `SUMMARY.md` / `CHANGELOG.md` unprompted | You are offloading to disk without being asked — the reflex that precedes wrapping up early | Delete it, write a real handoff instead |
| You mention running out of space, or start self-summarising | The anxiety behaviour itself, now in the output | Hand off immediately |
| The same issue gets corrected twice in one session | Anthropic's own documented `/clear` trigger — the earlier correction has lost the attention competition | Hand off; a third correction will not stick |
| Files read before an edit drops below ~3 | AMD telemetry over 6,852 sessions caught the March 2026 regression as 6.6 → 2.0 files read before editing, with median thinking length falling 2,200 → 600 chars | Stop editing. Re-read the plan, then hand off |

Degradation starts long before the window is full. HumanLayer's ACE-FCA targets **40–60% context utilisation**, not 90% — compacting at 95% bakes already-degraded output into whatever you carry forward.

**The moment any signal fires:** stop opening new fronts. If the slice you are on is one verified command from done, finish it and record the evidence. If it is not, `state.mjs note unfinished "<what exists, what is missing>"` and hand off with the half-slice named (Law 3). Never start a new slice, a new file, or a new investigation after a signal.

## The gauges that are real

`state.mjs` counts what you actually did. Caps: `slice 3`, `fix 8`, `edit 60`, `read 90`, `subagent 12`.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs tick <read|edit|slice|fix|subagent>
```

Tick as the events happen. An untracked session has no gauge at all, only your intuition, which the section above disqualified. `context.mjs --brief` already reports the pressure level at session start — read it, do not recompute it.

Two directives come back:

- **`FINISH_CURRENT_SLICE`** (~70% of a cap) — complete the slice you are on, verify it, hand off. Do not begin another.
- **`HANDOFF_NOW`** (cap reached) — do not start new work and do not compress remaining work to fit. Run `state.mjs handoff`, write the file completely, stop.

`HANDOFF_NOW` is a directive, not advice. The caps encode that a session which has run three slices or eight fix rounds has spent its good tokens; pushing to a fourth buys one more slice at the price of the session's remaining judgement.

Note the trap: `state.mjs handoff` resets the session counters. Running it and then continuing to work clears the gauge while the degraded context stays exactly where it was, which is worse than never having a gauge. Handoff means handoff — write the file, tell the user to `/clear`, stop.

## Reset, do not compact

Prefer a fresh session started from a written handoff over in-place compaction. Anthropic's finding is direct: compaction "doesn't give the agent a clean slate" — the compacted context inherits the same drift, the same wrong assumptions, and the same wrapping-up reflex that made compaction necessary. A reset starts at zero and reads a document written while you still had the judgement to write it well.

Which is why the handoff is written *before* the wall, not at it.

## The handoff file

`state.mjs handoff` returns the path — `.factory/work/<slug>/HANDOFF.md` — plus phase, slice, open items and the closing session counts. Fill this schema exactly. It is the current front, not a history; the ledger keeps history and each handoff replaces the last.

```markdown
# HANDOFF — <work title>

handoff #<n>   phase: <phase>   slice: <done>/<total>   written: <ISO timestamp>
branch: <branch>   head: <sha>   dirty: <yes|no>

## End goal
<What the user asked for and what "done" looks like, in their terms. A session with zero prior
context must be able to recognise completion from this paragraph alone. Not "continue the refactor".>

## Approach being taken
<The chosen shape and why — the ruling, not the menu of options. Point at the artifacts holding the
detail: .factory/work/<slug>/PROGRAM-DESIGN.md, PLAN.md. If the approach changed mid-session, say
what it was, what it is now, and what forced the change.>

## Steps completed — with evidence
| # | What was done | Proof | Where |
|---|---|---|---|
| 1 | <past tense, specific> | <command run and its result, or commit sha> | <path or file:line> |

<Anything with no entry in the Proof column is not a completed step. Move it to Open items. Law 1
does not lapse at a session boundary.>

## Current failure being worked on
<The exact symptom, the exact command that reproduces it, its verbatim output trimmed to the signal,
and the last hypothesis tested with what it ruled out. If nothing is failing, write "None — stopped
on session caps, not on a failure." Never leave this heading empty.>

## Open items
<Verbatim from `state.mjs show` → openItems, keeping the numbers so `state.mjs resolve <n>` works.>
- #<n> <kind>: <text>

## Next action — exact
<One action, executable as written: a command, or a file plus the edit to make, or a subagent brief.
Not "continue implementing". If the next action is a decision, give the options and the cost-if-wrong
of each so the next session rules rather than stalls (Law 8).>

## Do NOT redo
- <work already done that a fresh session would plausibly repeat, and where its output lives>
- <path already explored and rejected, and why it was rejected>
```

The first four headings are ACE-FCA's proven minimum — **end goal / approach / steps completed / current failure**. They are not negotiable and not reorderable. The last three exist because a resumed session's two failure modes are re-deriving what you already knew and stalling on a question you already had the standing to answer.

**Do not replace this schema with a freeform summary of the session.** Anthropic's finding on why model-authored summaries fail is that "the model didn't know what it didn't know": a narrative keeps what was salient at the end and silently drops what was decided at the beginning — the approach, the ruled-out paths, the reason the obvious thing does not work. That is exactly the material the next session needs and cannot reconstruct. A schema forces the fields the narrative would have omitted.

`skills.mjs resolve handoff` routes to the bundled `handoff` skill. Use it to gather the material; then write **this** schema. If it is unavailable, write the file by hand and say you are on the degraded path.

Two more rules, each paid for by a real failure:

- **No cliffhangers in file paths.** Every path in the handoff is absolute or repo-relative and complete. "the auth middleware" costs the next session a grep it should not need to run.
- **Uncommitted work is stated as uncommitted.** If the tree is dirty, say which files and why they were not committed. A fresh session that assumes a clean tree will `git checkout` your last hour away.

## Resuming

`context.mjs --brief` reports `RESUME` and names the handoff. Read it in full before touching anything — earlier phases already happened and their output is on disk; re-running them spends the user's money rediscovering what you already knew.

Then run exactly one cheap re-check before building on the handoff: `git status`, and the command in the Proof column of the final completed step. A previous session's evidence column is a claim, and Law 1 applies across session boundaries as much as within one. If the re-check disagrees with the handoff, `state.mjs note risk "<the disagreement>"` and trust the command.

## Exit condition

The handoff is done when all of these are true, checkable without judgement:

- [ ] All seven headings present; none empty.
- [ ] Every row of "Steps completed" has a non-empty Proof cell naming a command or a commit.
- [ ] "Next action" is a single action a fresh session can execute without asking the user a question.
- [ ] Open items match `state.mjs show` → `openItems` exactly, numbers included.
- [ ] No sentence in the file relies on anything only this session knows.
- [ ] The user has been told to `/clear` and say "factory resume".

Read the file back once as if you had never seen this project. If any answer would be "I'd have to ask", it is not finished.

---

**Restating this at the point it bites:** a full context window means hand off. It never means compress, abbreviate, stub, collapse three tasks into one, or declare victory early. A handoff costs one file and the user loses nothing. A rushed ending costs the rewrite, and — because the user cannot see what you dropped — they only find out later. When you feel the pull to finish fast, that feeling *is* the signal to stop and write the handoff.
