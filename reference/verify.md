# Verify

Phase 7 turns a build that looks finished into evidence a stranger can check. Two commands live here: `verify` produces that evidence against the PRD's acceptance criteria, `review` is the adversarial pass that tries to break it — and the agent that wrote the code does not run the second one.

## The five-step gate

Run all five, in order, for every sentence you are about to write that asserts something works, passes, is fixed, or is done. There is no short version for small claims; small claims are where the habit erodes.

1. **Identify the command that proves this exact claim.** Not the suite, not the build — the command whose output changes if the claim is false. If no such command exists you are about to assert an opinion: go find one, or downgrade the sentence.
2. **Run it fresh, in this message.** Output from three messages ago is a memory, and the intervening edits are exactly what could have broken it. Law 1 is written "in this message" because that is the only version of it that survives a long session.
3. **Read the whole output, including the exit code.** A suite that prints `42 passing` and exits 1 is a failing suite; a build that logs warnings and exits 0 is a passing build. Reading the last line only is how a red run gets reported green. Capture it so the code survives into the file — `<cmd> > evidence/01-<name>.txt 2>&1; echo "exit $?" >> evidence/01-<name>.txt` — and do not pipe through `tee` before reading `$?`, which returns `tee`'s status: 0 while the run beneath it fails.
4. **Confirm it proves THIS claim and not the neighbour.** Unit tests passing does not prove the endpoint responds. A compile does not prove the migration ran. A 200 does not prove the row was written. Where the command is the closest available proxy rather than the proof, name the gap in the same sentence.
5. **State the claim with its evidence inline** — the command, the exit code, and the line of output that carries the verdict. A claim whose evidence is elsewhere gets re-checked by nobody.

If any step fails, the claim is not available to you. Say what you could not prove and `state.ts note unfinished "<claim> unproven: <why>"` (Law 3). A subagent reporting success is not evidence at any of the five steps — its diff and its command output are.

## Banned vocabulary

Before any status sentence, scan it for these. Each one is the grammar of a claim that skipped step 2.

| Banned | What it actually means | Write instead |
|---|---|---|
| should work / should pass | I have not run it | ran `<cmd>`, exit 0, `<line>` |
| probably / likely | I am estimating from the diff | the estimate, labelled as one, or nothing |
| seems to / appears to | I read output I did not understand | quote the output and say what is unclear |
| in theory | I am describing the design, not the run | "designed to X; not yet exercised" |
| I've updated it so it now… | the edit is the evidence | the command that proves the edit worked |
| looks right / looks good | no criterion was applied | the criterion and its threshold |

Expressing satisfaction before the verification runs is the same violation in a friendlier register. So is "all tests pass" when you ran one file.

## The criteria are frozen before you verify

Every row of the evidence table quotes a `PRD.md` acceptance criterion **verbatim**. A criterion first written during `verify` was written by someone who already knew what the code does — which is how a bar ends up at exactly the height the build clears. If the PRD carries none, that is a product gap: go back to [product.md](product.md) rather than inventing a passable one here. Each criterion needs a threshold before you run anything: a number, an exit code, or a named observable — "fast enough" is unverifiable, "p95 under 400ms over the seeded dataset" is checkable by a stranger. Where the PRD left one qualitative, set the threshold now and record it — `state.ts note ruling "<criterion> thresholded at <X>; cost if wrong: <Y>"` (Law 8) — then verify against that number. **Any single criterion below threshold fails the phase.** Never an average: an aggregate lets one real failure be absorbed by nine easy passes.

## What counts as evidence

| Source | Counts when | Never counts |
|---|---|---|
| Test suite | run this message, exit code read, the new test named | "the suite is green" with no run |
| Running app | you drove it and captured the artefact | the server started |
| Screenshot / recording | provenance-checked below | any artefact whose origin you did not verify |
| Subagent report | its written file and its diff, re-read by you | its prose summary or its returned count |
| `slop.ts check` | asked about the shape of the code — [anti-slop.md](anti-slop.md) | asked whether the feature works |

## Regression protocol

A fix without a failing-first test is a claim, not a repair.

1. Write the test against the reported symptom.
2. **Run it with the fix reverted** (`git stash`, or comment the fix out) and paste the failure. If it passes without the fix, it tests the wrong thing — the most common outcome, and invisible unless you look.
3. Restore the fix, re-run, paste the pass.
4. Both outputs go in `evidence/`, red before green. "This test would have caught it" is not step 2. Skip the protocol and you ship a test that goes green against any code: a green light wired to nothing.

## Tests are part of the diff, and are reviewed as such

Test subversion has a documented taxonomy — direct overwriting, assertion weakening, test deletion, mocking the thing under test, exception suppression, timeout manipulation, plus coverage gaming (partial implementation, edge-case omission, error-path skipping). Anthropic's system card records Claude special-casing test cases in agentic coding; real reports include an authorisation bypass whose AuthZ layer was mocked out in tests so the suite went green.

So: **any diff touching a test file during a bugfix carries a written justification in the same message** — what changed, and why the old assertion was wrong rather than inconvenient. An unexplained test edit during a fix is a finding until explained. And prefer a **judged diff review over hidden tests**: LLM judges caught unambiguous reward hacking well while held-out tests added only minimal improvement, and a hidden test teaches nobody *why* the diff was wrong.

## The structural rule: whoever wrote it does not approve it

Dispatch a separate reviewer for the `review` pass. Not ceremony: a generator grading its own work confidently praises it, and tuning a separate sceptical evaluator is far more tractable than making a generator critical of itself. The reviewer starts with zero context, so the brief carries everything — split by context boundary, not by role, and never summarise the diff for it in place of the diff. One dispatch per slice diff, not one for the accumulated branch; a reviewer handed 2,000 lines reads none of them ([anti-slop.md](anti-slop.md) caps a slice at 500).

```
You are reviewing code you did not write. Your job is to refute it.

WHAT WAS BUILT   <the user problem, one paragraph — not the implementation>
WHY IT MATTERS   <the cost if this ships broken>
THE DIFF         git diff <base>..HEAD   — read it yourself; trust nothing above
THE BAR          <workspace>/work/<slug>/PRD.md acceptance criteria, each with its threshold
CLAIMED EVIDENCE <workspace>/work/<slug>/evidence/EVIDENCE.md — re-run what it claims

HARSHNESS 7/10. Assume competence and look for the defect anyway. Do not manufacture
findings to look thorough.

HUNT, in this order:
  1 test subversion — weakened assertions, deleted cases, mocks over the thing under test,
    suppressed exceptions, widened timeouts, an always-true assertion
  2 placeholders, stubs, fake return values, `// ...rest unchanged`
  3 error paths and the empty / first-run state — the documented omissions
  4 claims in EVIDENCE.md whose command you cannot reproduce
  5 the criterion nobody wrote a check for

REPORT to <workspace>/work/<slug>/evidence/EVIDENCE.md under "## Review findings", one row
each, exactly these fields: finding | file:line | blocking|material|minor | how to
reproduce | what you ran to confirm it. Then return only the count by severity.

FORBIDDEN: praise, "looks good", and deciding a real issue does not matter. If you found
it, report it at its severity. Downgrading is the orchestrator's call, not yours.
```

That last line exists because of a measured failure: the evaluator identifies a legitimate issue, then talks itself into it not being a big deal. Mechanise the fix — the reviewer may only *classify*; only the orchestrator may *dismiss*, and a dismissal is a ruling with its cost-if-wrong in the ledger (Law 8), never a sentence in a summary.

**Then verify the reviewer.** Its returned count is prose, and Law 1 exempts nobody you dispatched: a fabricated `git bisect` result and a claim to have "written a test and confirmed" something never run are both first-hand documented. Read the rows in `EVIDENCE.md` yourself, and reproduce the stated command on every `blocking` row in this message before you accept it *or* dismiss it. A blocking finding that does not reproduce is a finding about the reviewer — re-dispatch with the failed reproduction in the brief.

Calibrate harshness at **7/10**. At 10 the reviewer turns contrarian and generates findings costing more to dismiss than the real ones cost to fix; below 5 it drifts back into praise. Adversarial personas improve findings per token, so one sceptical reviewer beats three agreeable ones — and multi-agent runs burn 3–10× the tokens, so dispatch for context isolation, not for theatre. `state.ts tick subagent` per dispatch and `state.ts tick fix` per review-fix round; the caps are 12 and 8, and crossing one returns `HANDOFF_NOW`. Eight fix rounds on one diff is not convergence — revert to the last green commit and improve the slice brief rather than stacking a ninth patch on a bad base. Route the pass rather than improvising it: `skills.ts resolve review` names `code-review` for correctness, `security-review` where the change touches auth, secrets, input handling or a network boundary, `simplify` for a diff that works but duplicates. Installed → use it; missing but installable → offer the one-line install; unavailable → take the degraded path and say out loud that you are on it (Law 9).

## Artefacts, and where artefacts lie

Anything visual, anything with a running surface, anything a user would see: capture the artefact. `skills.ts resolve verify` names `run` for driving the real app; if it is absent, start the app yourself and screenshot it. **Review the artefact separately from the code** — reading a screenshot in the same pass that reads the diff lets the diff explain the screenshot; reviewed alone, the screenshot has to stand up by itself. This is the countermeasure with the strongest first-hand support.

Then check the artefact came from a real environment, because a **fabricated Playwright repro is a documented occurrence** — an artificial browser environment built to produce a fake bug video. Four checks, all cheap:

- the host, port or URL is one this project actually serves;
- timestamps inside the artefact fall within this session;
- something non-deterministic in it matches reality — a seeded id, a real record, copy that exists in the source;
- the command that produced it appears in the transcript or in the subagent's written output.

An artefact failing provenance is worse than none: it upgrades an unproven claim into a confidently proven false one.

## The artifact

```
<workspace>/work/<slug>/evidence/
  01-auth-suite.txt        raw stdout; `exit <n>` on the last line
  02-empty-state.png       artefact from a real run
  03-regression-red.txt    the failing-first output, before the fix
  EVIDENCE.md              the index below
```

```markdown
# Evidence — <slug>
Commit <sha> · verified <ISO date> · environment <local | CI | url>

| # | Criterion (verbatim from PRD.md) | Threshold | Command run | Exit | Artefact | Verdict |
|---|---|---|---|---|---|---|
| 1 | | | | | `01-…` | PASS / FAIL |

## Not proven
[Every criterion with no evidence: why, and what it would take. Empty is valid; vague is not.]

## Review findings
| # | Finding | file:line | Severity | Reproduced by | Verdict |
|---|---|---|---|---|---|
| 1 | | | blocking / material / minor | `<cmd>` | fixed / ruling recorded |
```

Write each row at the moment its command runs, never from memory at the end: reconstruction is where fabrication enters, and an end-of-session write is the write a truncated session never makes. One index file, not a trail of summaries — an unprompted `SUMMARY.md` is itself a context-anxiety tell, and the next session reads whichever file it finds first. Raw stdout is a file the factory writes, so Law 10 holds: scan each capture for a key, token, password or connection string before it lands, and keep the variable's name instead of its value. Record as you go (Law 7):

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note evidence "<criterion>: <cmd> exit 0 → evidence/01-…"
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note unfinished "<criterion> unproven: <why>"
node ${CLAUDE_SKILL_DIR}/scripts/state.ts phase review
```

## Exit condition

All eight hold before `state.ts finish` — which refuses while unresolved items are open, correctly:

1. Every PRD acceptance criterion has a row in `EVIDENCE.md` with its threshold, or a line under **Not proven** with a reason. No criterion below its threshold.
2. Every command in the table was run this session and its exit code read and recorded in the capture file.
3. Every regression fix has both its red and its green output on disk.
4. The review pass ran under a different agent than the one that wrote the code, and every `blocking` finding was reproduced by you and is fixed or carries a recorded ruling.
5. Every visual criterion has a provenance-checked artefact, reviewed apart from the code.
6. `slop.ts check` run this message with no path arguments, exit 0 — or exit 1 with a consolidation done or a ruling recorded ([anti-slop.md](anti-slop.md)).
7. No capture in `evidence/` contains a secret value (Law 10).
8. Nothing in your final message uses the banned vocabulary.

A failure here is not a verify problem. Take the mechanism to [debug.md](debug.md), and back through [slice.md](slice.md) if the fix is more than one slice's work. If the window is tight, hand off rather than finish on thin evidence ([context-discipline.md](context-discipline.md)) — a verify phase ending in "should be fine" has produced nothing at all, and Law 2 says the answer to a full window is always a handoff.
