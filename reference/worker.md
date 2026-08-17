# worker — who does the labor

The factory dispatches constantly: recon in research, two parallel interface designs in program design, one fresh agent per slice, a sceptical reviewer in verify, an independent re-run in debug. Every one of those is a choice of *hands*, and by default the hands are a harness subagent running on the same model you are.

A worker changes that. A worker is anything present in this session that executes work on your behalf — a delegation skill the user loaded, a connected MCP server, a gateway someone wired up. **This file never names one.** Which worker exists is a fact about the session, not about the factory, and a routing rule keyed to a particular name stops firing the day that name changes. The rule is about capability, not identity.

Law 11 is the short version: a present worker gets the work it covers.

## Recording it

```bash
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts worker    # the executor, and what is never delegated
node ${CLAUDE_SKILL_DIR}/scripts/state.ts worker <name> \
  --dispatch "<the exact call a brief would invoke>" \
  --does "<what it can actually do>" \
  --kind skill|mcp
node ${CLAUDE_SKILL_DIR}/scripts/state.ts worker none    # it is gone from this session
```

**Record it in the turn you learn it.** No script can see which skills were invoked or which servers are connected; that signal exists only in your context, and `/clear` takes it. A worker held only in your head is one context reset away from being silently abandoned halfway through a run — and the symptom is not an error, it is work that quietly went back to the path the user had moved away from.

Both flags are refused if missing, on purpose. Without `--dispatch` every later brief names a call that does not exist. Without `--does` there is nothing to check a job against, and the rule collapses from *delegate what it covers* into *delegate*. You have just read the worker's own description, so its envelope costs one sentence: what it can read, write, run, reach; what it explicitly cannot.

Once recorded it rides in `state.json`, so `context.ts` announces it on every setup and `skills.ts resolve <job>` names it on every job. A resumed session inherits the executor along with the phase.

## The routing rule

**Before each dispatch, match the job to the envelope.** Inside it, the worker does the work. Outside it, you do — and you say which in one line rather than forcing a fit.

| Phase | What a capable worker takes | Playbook |
|---|---|---|
| research | Every recon pass, read-only | [research.md](research.md) |
| program-design | Both parallel interface designs | [program-design.md](program-design.md) |
| implement | Each slice, one dispatch per slice | [implement.md](implement.md) |
| verify | The sceptical review pass, read-only | [verify.md](verify.md) |
| debug | The independent re-run of a stalled narrowing | [debug.md](debug.md) |
| design / marketing | The deliverable pass and its critic | [design.md](design.md), [marketing.md](marketing.md) |
| loop | Each pass body | [loop.md](loop.md) |

"Capable" is read from what you recorded, never assumed from the table. A worker that cannot reach the web does not get the doc-lookup pass; one with no filesystem access does not get a slice; one that is a cost lever rather than a competence lever does not get the security-sensitive change. Forcing a job past the edge of a worker's ability produces confident output nobody can use, and it costs a full round trip to find that out.

`state.ts tick subagent` still counts every dispatch, and the cap is still 12. The caps measure the pressure on *your* context — briefs written, evidence read, decisions made — and none of that got cheaper because the hands did.

## What never leaves you

The worker executes. Four things stay whatever it costs to keep them:

1. **The brief.** Decomposition is the job, not the typing. A brief that restates the user's sentence has delegated nothing.
2. **The decision.** A one-token call costs less to make than to delegate. Structural calls are Law 5 and were made before any dispatch.
3. **The verdict on the evidence.** Law 1 does not relax. A report is not evidence; the diff, the command output and the changed-file list are. A success claim with nothing changed means nothing happened.
4. **The user.** The worker never talks to them, and never learns anything they were not told.

`skills.ts worker` prints this list. Read it once per session rather than reconstructing it from memory.

## Writing the brief

A dispatched agent starts with **zero context** — it cannot see this conversation, the Laws, the phase, or that a worker exists at all. Every factory brief is hand-constructed for that reason; with a worker recorded it carries one more block, at the top:

```
DELEGATION: the <name> <kind> is available in this session and is the executor for
work it covers (<envelope>). Route your own labor through it rather than doing it
yourself where the job fits that envelope, and judge the evidence it returns —
diffs, command output, file lists — rather than its confidence.
```

`state.ts worker` generates that line from what you recorded and `skills.ts worker` prints it; paste it rather than paraphrasing. Without it the agent you dispatched does the labor itself on the expensive path, and the delegation bought nothing. This is the most common way a worker is present, is used, and still changes nothing.

The rest of the brief is unchanged from the phase playbook: goal, context, constraints, mechanically checkable done-criteria, report shape. The worker cannot ask a follow-up question — test the brief before sending it. Could this run end to end without one?

## When the worker is the wrong hands

Not an escape hatch, a short list. Say which one applies and record it: `state.ts note ruling "<slice n ran on a harness subagent: <which exception>>"`.

- **The job is outside the envelope.** The first check, and the most common. Do not stretch a worker past what you recorded it can do.
- **It does not answer.** Confirm it is live before the first dispatch, by whatever health call it offers. A worker that is not responding is not a worker, and dispatching into a void costs the pass and the wall-clock.
- **Correctness is worth more than the saving.** Security-sensitive changes, auth boundaries, anything where a wrong answer is expensive and the check is not mechanical.
- **Two well-written briefs failed on the same task.** Stop looping. Send one read-only diagnostic dispatch to explain why, or take it yourself — and say so plainly rather than burning a third pass.

## Failure modes seen in the wild

- **Present but never used.** The worker sits in context and every dispatch is still a harness subagent. This is the default failure, and it is why `context.ts` and every `skills.ts resolve` reprint the executor.
- **Used but never announced.** No delegation block in the brief, so the dispatched agent does the labor itself. Costs more than not delegating at all.
- **Trusted.** A report claiming tests pass with no output pasted is not a pass. Send a read-only dispatch to run them and paste real output, or run them yourself.
- **Forced past its edge.** A job the worker cannot actually do comes back plausible and wrong, and the wrongness surfaces two slices later.
- **Over-delegated.** Wrapping a one-sentence answer in a dispatch costs a round trip to save nothing. Trivial stays with you.

## Exit condition

The worker is correctly wired when all four hold:

1. `skills.ts worker` reports the executor this session actually carries, with an envelope you wrote rather than guessed.
2. Every dispatch went to it, or carries a recorded ruling naming which exception applied.
3. Every brief opened with the announce line, verbatim.
4. Every accepted result was judged on its diff, its command output or its changed-file list — never on the report's confidence.

If a handoff happens while a worker is recorded, [context-discipline.md](context-discipline.md) requires it in the handoff document by name and envelope. The next session cannot see what this one was carrying, and a handoff that omits it hands over a run that silently reverts.
