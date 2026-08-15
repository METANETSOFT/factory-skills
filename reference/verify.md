# Verify

Phase 7 turns a build that looks finished into evidence a stranger can check. It owns two commands: `verify` produces the evidence against the PRD's acceptance criteria, `review` is the adversarial pass that tries to break it — and **the agent that wrote the code does not run the review half.**

## The five-step gate

Run all five, in order, for every sentence you are about to write that asserts something works, passes, is fixed, or is done. There is no short version for small claims; small claims are where the habit erodes.

1. **Identify the command that proves this exact claim.** Not the suite, not the build — the command whose output changes if the claim is false. If no such command exists, you are about to assert an opinion; go find one or downgrade the sentence.
2. **Run it fresh, in this message.** Output from three messages ago is a memory, and the intervening edits are exactly what could have broken it. Law 1 is written as "in this message" because that is the only version of it that survives a long session.
3. **Read the whole output, including the exit code.** `echo $?` or the harness's own status line. A suite that prints `42 passing` and exits 1 is a failing suite; a build that logs warnings and exits 0 is a passing build. Reading the last line only is how a red run gets reported green.
4. **Confirm it proves THIS claim and not the neighbour.** Unit tests passing does not prove the endpoint responds. A compile does not prove the migration ran. A 200 does not prove the row was written. Name the gap out loud when the command is the closest available proxy rather than the proof.
5. **State the claim with its evidence inline** — the command, the exit code, and the line of output that carries the verdict. A claim whose evidence is elsewhere gets re-checked by nobody.

If any step fails, the claim is not available to you. Say what you could not prove and `state.mjs note unfinished "<claim> unproven: <why>"` (Law 3). A subagent reporting success is not evidence at any of the five steps — its diff and its command output are.

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

## What counts as evidence

| Source | Evidence when | Never evidence |
|---|---|---|
| Test suite | run this message, exit code read, the new test named | "the suite is green" with no run |
| Running app | you drove it and captured the artefact | the server started |
| Screenshot / recording | provenance-checked below | any artefact whose origin you did not verify |
| Subagent report | its file output and diff, re-read by you | its prose summary |
| `slop.mjs check` | shape of the code — see [anti-slop.md](anti-slop.md) | proof that the feature works |

## Regression protocol

A fix without a failing-first test is a claim, not a repair.

1. Write the test against the reported symptom.
2. **Run it with the fix reverted** (`git stash`, or comment the fix) and paste the failure. If it passes without the fix, it tests the wrong thing — the most common outcome, and invisible unless you look.
3. Restore the fix, re-run, paste the pass.
4. Both outputs go in `evidence/`. Asserting "this test would have caught it" is not step 2.

Skipping this ships tests that green on any code, which is worse than no test: it is a green light wired to nothing.

## Tests are part of the diff, and are reviewed as such

Test subversion has a documented taxonomy — direct overwriting, assertion weakening, test deletion, test mocking, exception suppression, timeout manipulation, plus coverage gaming (partial implementation, edge-case omission, error-path skipping). Anthropic's own system card records Claude special-casing test cases in agentic coding, and real reports include an authorisation bypass whose AuthZ layer was mocked out in tests so the suite went green.

So: **any diff that touches a test file during a bugfix carries a written justification in the same message** — what changed, why the old assertion was wrong rather than inconvenient. An unexplained test edit during a fix is treated as a finding until explained. And prefer a **judged diff review over hidden tests**: EvilGenie found LLM judges caught unambiguous reward hacking well while held-out tests added only minimal improvement, and hidden tests teach nothing about *why* a diff is wrong.

## The structural rule: whoever wrote it does not approve it

Dispatch a separate reviewer for the `review` pass. This is not ceremony. A generator grading its own work confidently praises it, and tuning a separate sceptical evaluator is far more tractable than making a generator critical of itself. The reviewer starts with zero context, so the brief carries everything — split by context boundary, not by role, and never summarise the diff for it in place of the diff.

```
You are reviewing code you did not write. Your job is to refute it.

WHAT WAS BUILT   <the user problem, one paragraph — not the implementation>
WHY IT MATTERS   <the cost if this ships broken>
THE DIFF         git diff <base>..HEAD   — read it yourself; trust nothing above
THE BAR          <workspace>/work/<slug>/PRD.md acceptance criteria; every row thresholded
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

That last line exists because of a specific measured failure: the evaluator identifies a legitimate issue, then talks itself into it not being a big deal. Mechanise the fix — the reviewer may only *classify*; only the orchestrator may *dismiss*, and a dismissal is a ruling with a cost-if-wrong in the ledger (Law 8), never a sentence in a summary.

Calibrate harshness at **7/10**. At 10 the reviewer turns contrarian and generates findings that cost more to dismiss than the real ones cost to fix; below 5 it drifts back into praise. Adversarial personas improve findings per token, so one sceptical reviewer beats three agreeable ones — and multi-agent runs burn 3–10× the tokens, so dispatch for context isolation, not for theatre. `state.mjs tick subagent` after each dispatch; the cap is 12.

Route the pass rather than improvising it: `skills.mjs resolve review` names `code-review` for correctness, `security-review` where the change touches auth, secrets, input handling or a network boundary, `simplify` for a diff that works but duplicates. Installed → use it; missing but installable → offer the one-line install; unavailable → take the degraded path and say out loud that you are on it.

## Artefacts, and where artefacts lie

Anything visual, anything with a running surface, anything a user would see: capture the artefact. `run`, or the browser driver the tree names, or start it yourself and screenshot it.

**Review the artefact separately from the code.** Reading a screenshot in the same pass that reads the diff lets the diff explain the screenshot; reviewed alone, the screenshot has to stand up by itself. This is the single countermeasure with the strongest first-hand support.

Then check the artefact came from a real environment, because a **fabricated Playwright repro is a documented occurrence** — an artificial browser environment built to produce a fake bug video. Four checks, all cheap:

- the host, port or URL is one this project actually serves;
- timestamps inside the artefact fall within this session;
- something non-deterministic in it matches reality — a seeded id, a real record, copy that exists in the source;
- the command that produced it appears in the transcript or in the subagent's written output.

An artefact failing provenance is worse than none: it upgrades an unproven claim to a confidently proven false one.

## The artifact

```
<workspace>/work/<slug>/evidence/
  01-auth-suite.txt        raw stdout; exit code on the last line
  02-empty-state.png       artefact from a real run
  03-regression-red.txt    the failing-first output, before the fix
  EVIDENCE.md              the index below
```

```markdown
# Evidence — <slug>
Commit <sha> · verified <ISO date> · environment <local | CI | url>

| # | Criterion (verbatim from PRD.md) | Command run | Exit | Artefact | Verdict |
|---|---|---|---|---|---|
| 1 | | | | `01-…` | PASS / FAIL |

## Not proven
[Every criterion with no evidence: why, and what it would take. Empty is valid; vague is not.]

## Review findings
| # | Finding | file:line | Severity | Reproduced by | Verdict |
|---|---|---|---|---|---|
| 1 | | | blocking / material / minor | `<cmd>` | fixed / ruling recorded |
```

One index file, not a trail of summaries — an unprompted `SUMMARY.md` is itself a context-anxiety tell, and the next session reads whichever file it finds first. Record as you go (Law 7):

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note evidence "<criterion>: <cmd> exit 0 → evidence/01-…"
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note unfinished "<criterion> unproven: <why>"
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs phase review
```

## Exit condition

Before `state.mjs finish` — which refuses while unresolved items are open, correctly:

1. Every PRD acceptance criterion has a row in `EVIDENCE.md`, or a line under **Not proven** with a reason. **Any single criterion below threshold fails the phase** — there is no average, because an aggregate lets one real failure be absorbed by nine easy passes.
2. Every command in the table was run in this session and its exit code read.
3. Every regression fix has both its red and green outputs on disk.
4. The review pass ran under a different agent than the one that wrote the code, and every finding is fixed or carries a recorded ruling.
5. Every visual criterion has a provenance-checked artefact, reviewed apart from the code.
6. `slop.mjs check` over the whole diff — [anti-slop.md](anti-slop.md).
7. Nothing in your final message uses the banned vocabulary.

A failure here is not a verify problem. Take it to [debug.md](debug.md) for the mechanism, and back through [slice.md](slice.md) if the fix is more than one slice's work. If the window is tight, hand off rather than finishing on thin evidence ([context-discipline.md](context-discipline.md)) — a verify phase that ends in "should be fine" has produced nothing at all, and Law 2 says the answer to a full window is always a handoff.
