# factory

A Claude Code skill that runs software work as a pipeline instead of a conversation.

`/factory` turns intent into shipped, maintainable code by forcing the structural decisions to
happen while they are still cheap, keeping every piece of state on disk instead of in a context
window, and refusing to let the model quietly trade completeness for space when that window fills.

It routes to the skills you already have rather than reimplementing them. Nothing is vendored.

---

## The problem it exists for

Three failures are well documented, and none of them is fixed by asking the model to try harder.

**Context anxiety.** Anthropic's own engineering writeup describes models that "begin wrapping up
work prematurely as they approach what they believe is their context limit." Cognition, rebuilding
Devin on Sonnet 4.5, found the model "consistently underestimates how many tokens remain, with very
precise but wrong estimates." The result is the thing everyone recognises: you are 70% through a
task and the answers start getting shorter, stubs appear, three steps collapse into one, and it
declares victory.

**Instructions decay.** This is the finding that shaped the design.
[SlopCodeBench](https://arxiv.org/html/2603.24755v1) chained each agent's own output forward across
93 checkpoints instead of resetting to gold. Structural erosion rose in **80%** of trajectories and
verbosity in **89.8%**; in one case a `main()` went from cyclomatic complexity 29 to **285**. They
then added a well-written anti-slop *prompt*. It lowered the starting point by about 34% — and
degradation resumed at exactly the same per-checkpoint rate, for **+47.9% spend** and no significant
pass-rate change.

> A rule you can only assert is a rule that decays. Instructions move the intercept, not the slope.

**Self-verification doesn't work.** Anthropic again: agents "tend to respond by confidently praising
the work" when grading themselves, and "tuning a separate skeptical evaluator is far more tractable
than making a generator critical of its own work." Dan Luu logged an agent fabricating a `git
bisect` result, claiming a test it never ran, and producing a Playwright video of a bug repro that
turned out to be entirely synthetic.

**And the request was never shared in the first place.** The failure above all three is cheaper and
more common: the model built the wrong thing correctly. Nobody knows exactly what they want until
they are asked, and an agent that starts from one sentence has picked one reading of it and written
it down as a requirement. Regenerating from a longer prompt does not fix this — it produces a
different pile with the same shape, because the disagreement was never in the code. Matt Pocock's
talk at [Vercel Ship AI](https://www.youtube.com/watch?v=v4F1gFy-hqg) names the parts: interview
until the understanding is shared, agree the words before writing them, keep the feedback loop
faster than the work, and treat the design as something bought on every change rather than restored
by a rerun.

So this skill ties its guarantees to things that execute: a state machine with session caps, a
metric with a threshold, a reviewer that is not the writer — and an interview before the first
document.

---

## Install

```bash
git clone https://github.com/METANETSOFT/factory-skills ~/.claude/skills/factory
```

Then in Claude Code:

```
/factory
```

Requires Node 18+ (only Node built-ins are used — no dependencies). Nothing else is mandatory; the
skill degrades explicitly when an optional skill is missing rather than silently substituting.

---

## Use

```
/factory init                 write FACTORY.md, the durable charter, and record a slop baseline
/factory grill <subject>      interview you to a shared understanding before anything is written
/factory language             settle the project's words and module names, once, in one file
/factory research <topic>     what is actually true about this codebase right now
/factory product              what problem, and how will we know it worked
/factory architecture         services, flow, endpoints, tables
/factory program-design       call stack, file placement, signatures, what the tests look like
/factory plan                 vertical slices and their order
/factory implement            slice by slice, fresh subagent each time
/factory verify               evidence, and a reviewer who didn't write it
/factory design <target>      route interface work to the skill that owns it
/factory marketing <target>   positioning, copy, docs
/factory debug <symptom>      root cause before fix
/factory loop <goal>          unattended iteration toward a measurable target
/factory worker <name|none>   record the worker every dispatch goes through
/factory status | handoff | resume | skills
```

If the session carries a **worker** — any delegation skill or MCP that executes work on the agent's
behalf — record it once with `/factory worker <name> --dispatch "<call>" --does "<what it covers>"`.
The factory hardcodes no worker names: it checks each job against the envelope you recorded, sends
what fits to the worker instead of to a harness subagent, keeps what does not and says so, and puts
an announce line at the top of every brief so the dispatched agent routes its own labor the same way.
The choice survives `/clear`, a handoff and a resume. What never moves: the brief, the decision, and
the verdict on the evidence.

Typing `/factory` with no argument gives a menu built from the project's actual state, not a static
list. It never auto-starts a phase.

**On anything big, it asks before it writes.** Rounds of questions over the decision tree, each with
its recommended answer, until nothing is left silently assumed — then the artifact. Tell it not to
and it stops asking, but the decisions do not disappear: each becomes a ruling with its
cost-if-wrong, printed once where objecting to a line is still cheap. Make that permanent by putting
it in `FACTORY.md` under *How to work with me*, and no future session asks again.

---

## How it works

### Everything lives in files

**Not in your repository.** A run produces a research note, a PRD, a program design, a plan, a ledger
and a pile of evidence. That is scaffolding for the work, not part of your product, so it goes to a
workspace under the OS temp directory keyed by the project path:

```
$TMPDIR/claude-factory/<project>-<hash>/
    FACTORY.md            the durable charter — what this is, how we work, what proves it works
    state.json            phase, active work, slice counter, session counters
    ledger.md             append-only: every ruling, risk, and unfinished item
    slop-baseline.json    this project's structural starting line
    work/<slug>/
        RESEARCH.md PRD.md ARCHITECTURE.md PROGRAM-DESIGN.md PLAN.md HANDOFF.md
        evidence/
```

It survives `/clear`, a new session, and a machine that stays up — everything a handoff needs — and
it disappears on reboot, which is right for scaffolding. Two opt-outs, both explicit:

| | |
|---|---|
| `state.ts init --in-project` | use `<project>/.factory` instead, for work that spans weeks and belongs in the repo |
| `FACTORY_HOME=/some/dir` | keep every workspace under a directory of your own |

A `FACTORY.md` committed at the project root always wins over the workspace copy, so a team can keep
the charter under review without dragging the scaffolding along with it.

A session can die at any token count and the next one resumes from the workspace without asking you a
single question. Context is a cache; the workspace is the truth.

### Seven phases, seven checkpoints

| Phase | Question it answers |
|---|---|
| research | What is true about this codebase and this problem right now? |
| product | What user problem, and how will we know it worked? |
| architecture | How do the pieces fit — services, flow, endpoints, tables? |
| **program-design** | **Call stack, file placement, signatures, what the tests look like** |
| plan | What are the vertical slices, in what order? |
| implement | Slice by slice, fresh subagent each time |
| verify | What evidence proves this works? |

Two things run in front of that table rather than inside it, because both are cheaper than the first
artifact they precede. **grill** turns a one-sentence request into a set of decisions you actually
made — rounds of questions over the decision tree, ending when nothing is left assumed. **language**
settles what the project's words mean, in one file both sides read, so the plan, the tests and the
code all say the same thing. Neither writes a phase artifact and neither is a phase; they are what
makes the phases worth writing.

**program-design is the phase almost everyone skips and the one that pays.** Architecture names the
modules; program design says what the code inside them will look like — decided while the context is
light, because once thousands of lines exist the model is deep in its window and already biased by
what it chose first.

Human review is concentrated at **research and plan**, not at the diff. The leverage argument is
arithmetic: one bad line of code is one bad line, one bad line in a plan produces hundreds, and one
bad line of research — a misunderstanding of how the system works — produces thousands.

### Context discipline instead of context estimates

The model is never asked how much room it has left, because that estimate is documented as confident
and wrong. Instead the state machine counts what is observable — slices completed, fix rounds, edits,
reads, subagents dispatched — and returns `HANDOFF_NOW` when a cap is crossed. The handoff follows a
fixed schema rather than a freeform summary, because a model writing its own summary "didn't know
what it didn't know."

The correct response to a full context window is always to hand off, never to compress the work.

### Slope control, not adjectives

```bash
node scripts/slop.ts baseline    # record this project's structural starting line
node scripts/slop.ts check       # exit 1 if drift crosses the threshold
```

Two metrics from SlopCodeBench:

- **erosion** — share of total complexity mass in functions with cyclomatic complexity > 10
  (mass = CC × √SLOC)
- **verbosity** — slop-flagged lines ∪ duplicated lines, over LOC

Maintained human repos sit near **0.31 / 0.11**; agent trajectories drift to **0.68 / 0.32**.
Thresholds are drift-relative on purpose — a legacy codebase starts high, and what matters is
whether this session made it worse. A `CONSOLIDATE` verdict obliges a pass that reports lines
*deleted*, not added.

The complexity figure comes from keyword counting over brace- and indent-delimited bodies, not a
real parser. It is a trend instrument. Compare against your own baseline, and never read a good
score as evidence that the code works — that is what `verify` is for.

### The skill tree

```bash
node scripts/skills.ts resolve design-ui
```

For any job kind, this reports the playbook to read, which skills are installed here, which apply
only when their trigger fires, and — for anything missing — its source, its install line, and what
to do without it.

The rule is three-tier: **installed → use it; missing but installable → offer the one-line install;
unavailable → take the degraded path and say out loud that you are on it.** The factory carries no
design taste of its own and no documentation of its own. Library facts come from
[Context7](https://github.com/upstash/context7); interface craft goes to whichever design skill you
have installed.

Where a skill's upstream is genuinely unknown, the map records a *search* rather than a URL. A
guessed repository link is worse than none.

---

## Tests

```bash
node test/run.ts          # everything
node test/run.ts slop     # one group: state | skills | slop | hooks | context | doctor
node scripts/doctor.ts    # is the skill itself still coherent?
```

`doctor` checks the skill the way the skill asks you to check your code — with a command rather than
a reading. It fails on a cross-link to a playbook that no longer exists, a documented subcommand a
script does not accept, a job routed to a skill with no registry entry, a conditional skill with no
trigger saying when to load it, a description that reads like a workflow summary, and a playbook with
no exit condition. Run it after editing anything here.

No framework and no dependencies; each test builds a throwaway project under the system temp
directory. The suite exists because Law 1 applies to this skill's own code — the lexer in `slop.ts`
is asserted against braces hidden in template literals, block comments and regex literals, and the
Stop gate is asserted against a real git diff, a test file, an unborn repo, empty stdin, and the
re-entry guard that stops a blocking hook trapping a session in a loop.

## The Laws

Fifteen standing rules that hold for the whole session, not just the turn that loaded them. In short:

1. Evidence before claims — no status without a command run in this message
2. Never trade completeness for space — a full window means hand off, never compress
3. Unfinished work gets named, never hidden
4. No placeholders in delivered code
5. Design before volume
6. Build vertically
7. The ledger is the memory
8. Rulings, not stalls
9. Route, don't reinvent
10. Secrets never enter an artifact
11. A present worker gets the work it covers — and never certifies its own output
12. Agreement before artifacts — interview first, or turn every unasked question into a printed ruling
13. One name per thing — the project's words, written once, used by everyone
14. The rate of feedback is the speed limit — no step bigger than one command can check
15. Every change either invests in the design or pays interest on it

Law 10 is enforced by `.gitignore` and `.env.example`; the skill itself needs no credentials at all.

---

## Credits

This skill is an implementation of other people's ideas, and it is worth naming them.

- **[Dexter Horthy](https://github.com/humanlayer) / HumanLayer** — the four design layers, the
  program-design layer, vertical slices, the dumb zone, back pressure, and
  [ACE-FCA](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents). The
  deep-module vocabulary comes from their
  [`codebase-design`](https://github.com/humanlayer/fold/tree/main/.claude/skills/codebase-design) skill.
- **[Matt Pocock](https://github.com/mattpocock/skills)** — grilling to a shared design concept, the
  frontier rule that orders the rounds, the ubiquitous language as a file both sides read, and the
  argument that bad code is the most expensive thing in an AI codebase. Behind those: Brooks' design
  concept, Ousterhout's deep modules, the Pragmatic Programmer on entropy and outrunning your
  headlights, Evans on ubiquitous language, and Kent Beck on investing in design every day.
- **[obra/superpowers](https://github.com/obra/superpowers)** — evidence-before-claims, the
  completion gate, subagent-driven development, rulings-not-stalls, and the standard that a skill's
  `description` states *when to use it*, never what it does.
- **Anthropic** — [harness design for long-running
  agents](https://www.anthropic.com/engineering/harness-design-long-running-apps), the
  generator/evaluator split, and the
  [April 2026 postmortem](https://www.anthropic.com/engineering/april-23-postmortem).
- **Research** — SlopCodeBench (arXiv:2603.24755), TRACE (arXiv:2601.20103), EvilGenie
  (arXiv:2511.21654), and [Dan Luu's AI coding log](https://danluu.com/ai-coding/).
- Structural inspiration for the thin-router-plus-lazy-reference layout comes from the `impeccable`
  skill.

Every mechanism here names the failure it addresses, so it can be removed when it stops earning its
place. Anthropic's own note applies: "every harness component encodes an assumption about model
limitations, and those assumptions go stale." Opus 4.5 largely removed context anxiety and let them
delete their reset machinery. Delete parts of this the day they stop paying.

## License

Apache-2.0
