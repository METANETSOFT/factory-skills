# Hooks

Turning the factory's guarantees from things you intend to do into things the harness does. Read this at Step 6 of [init.md](init.md), when the user asks for enforcement, or when the same rule has been dropped late in two sessions running.

## Why a hook and not a rule

A rule written in a skill competes for attention against every token produced since it was loaded, and loses. That is the mechanism behind CLAUDE.md being ignored at 80% context — not a lapse of will. SlopCodeBench measured the ceiling on prose: a well-written anti-slop instruction block cut initial verbosity ~34%, then degradation resumed at exactly the same per-bin rate, for +47.9% spend, no pass-rate gain, and on one problem a pass rate that fell from 37.2% to 27.1%. **Instructions move the intercept, not the slope.**

A hook is executed by the harness between tool calls. It never reads the instruction, so it cannot weigh it against fatigue or a filling window. "Run the tests before committing" in a charter is a suggestion; a `Stop` hook that runs them is a fact.

So: anything mechanically checkable belongs in a hook or in a command with an exit code, and prose is reserved for judgement calls that cannot be mechanised. A hook is not a general safety net — it does not grade correctness ([verify.md](verify.md)) and it does not measure structural drift (`slop.ts check`, [anti-slop.md](anti-slop.md)). Claiming it covers either is how a session ships unverified work believing it was gated.

## What `hooks.ts` installs, and what it does not

**Do not run `on` before the user has said yes to it in this session.** It writes `<project>/.claude/settings.json` — the project-shared settings file, so the install lands in their `git status` and in their next diff. That is an effect outside the worktree and theirs to authorise (Law 8). Offer once, in one line, naming what will be blocked and that `off` removes it. A hook the user did not expect is worse than no hook: it makes the harness look broken, and the next real block gets disabled along with it. On a decline, `state.ts note decision "hooks declined"` and continue — it is not a blocker.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/hooks.ts status
node ${CLAUDE_SKILL_DIR}/scripts/hooks.ts on [--verify "npm test"]   # only after an explicit yes
node ${CLAUDE_SKILL_DIR}/scripts/hooks.ts off
```

`on` writes **one** `Stop` entry carrying the marker `factory:stop-gate`, so `off` removes exactly that entry and nothing a user or another tool installed; re-running `on` replaces its own entry rather than stacking copies. `--verify` additionally records the command in `<workspace>/config.json` and runs it at the gate. `status` returns `installed`, `verifyCommand` and `runVerifyOnStop` — read those three values back rather than asserting the result of your own install (Law 1).

| The gate checks | Law | Failure it prevents |
|---|---|---|
| 2 placeholder patterns in added non-test lines | 4 | a stub shipped as a feature, found by the user rather than by you |
| 2 truncation patterns (`...rest unchanged`, "omitted for brevity") | 2 | a full window converted into an abridged file instead of a handoff |
| The `--verify` command, when one was recorded | 1 | a turn ending on "should pass" with the suite red |

Bounds it holds deliberately, each with its reason:

- **It reads added lines from `git diff HEAD` only** — uncommitted work, not the whole tree, not behaviour. Anything already committed is invisible to it, so it is a turn-level check and never an audit.
- **Test files are skipped.** A test may legitimately contain the string "not implemented". Test subversion has its own taxonomy and its own review in [verify.md](verify.md); catching it here would trade a real check for false blocks.
- **Four patterns, no more.** A false block costs the user a turn, so only markers that cannot be legitimate in delivered code are matched.
- **At most 12 findings per block.** Enough to act on; a 200-line dump gets skimmed and the gate stops being read.
- **The verify command is killed at 300s** and the kill is reported as a Law 1 failure. Time the suite before wiring it: over 300s, scope `--verify` to the affected package instead of the monorepo, or leave it off and verify by hand.
- **It never blocks twice in one turn** (`stop_hook_active`). A gate that re-fires on its own block traps the session in a loop the user cannot exit.
- **On an unborn repo it stays quiet.** Nothing to diff against means no verdict, not a guess.

## The three placements

Placement is the whole design decision. Same script, wrong event, and you get either no enforcement or a session that cannot finish a turn.

| Event | Fires | Exit 2 means | What belongs here |
|---|---|---|---|
| `PreToolUse` | before a tool runs, `matcher` on tool name | **the tool is blocked**, stderr goes back to the model | destructive-command guards: `rm -rf`, `git push --force`, `DROP TABLE`, writes to `.env` or a production config |
| `PostToolUse` | after a tool succeeds | the edit already landed; stderr is advice, not a veto | formatters, fast per-file lint |
| `Stop` | once, when the turn ends | the turn is blocked and the model is told why | the full test suite, the completion check, the placeholder/truncation gate |

Why the suite goes on `Stop` and not `PostToolUse`: `Stop` fires **once per turn**; a per-edit hook fires on every write. A 300-second suite on `PostToolUse` costs 300 seconds times every edit in the slice, so it is disabled by the end of the week — and a hook that gets disabled enforces nothing. Cheap, per-file, idempotent things go on `PostToolUse`; expensive, whole-repo, once-is-enough things go on `Stop`.

Why a `PostToolUse` formatter must exit 0 even when it fails: it fires after the write has already happened. A formatter that crashes on a syntax error mid-edit and exits non-zero halts the session over a file the model was one tool call away from fixing. Format, swallow the failure, `exit 0`.

## The artifact

`<project>/.claude/settings.json`. Keep the shape exactly; fill in the commands.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",
        "hooks": [ { "type": "command", "command": "node .claude/hooks/guard-destructive.mjs", "timeout": 10 } ] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write",
        "hooks": [ { "type": "command", "command": "node .claude/hooks/format-edited.mjs", "timeout": 30 } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node <skill-dir>/scripts/hooks.ts gate # factory:stop-gate", "timeout": 330 } ] }
    ]
  }
}
```

`guard-destructive.mjs` and `format-edited.mjs` are scripts **you write into the project**; the factory ships neither. Each reads a JSON payload on stdin — `tool_name`, `tool_input`, `cwd`, and on `Stop`, `stop_hook_active` — and takes the edited path from `tool_input.file_path`. Do not depend on an environment variable to carry the path; stdin is the documented channel and the one the payload above guarantees.

The `Stop` entry above is what `hooks.ts on` writes, with an absolute path and a 330s timeout that leaves 30s of headroom over the gate's own 300s verify budget. **Install it with `on`, never by hand** — the marker is matched as a literal substring, so a hand-typed entry that differs by one character is one `off` cannot remove. `Stop` takes no `matcher`; it always fires. `timeout` is in seconds and must exceed the worst case of the command inside it, or the harness kills the hook mid-run and you get a failure that looks like a real block.

## The blocking response

Two ways to block. Exit 2 for a guard script; JSON when you want the reason structured.

```
exit 0   allow. stdout is shown in the transcript, not fed to the model as an instruction
exit 2   block. stderr is fed back to the model as the reason
other    non-blocking error. stderr goes to the user; the tool still runs
```

```json
{ "decision": "block", "reason": "Blocked: `git push --force` to a shared branch. Push to a feature branch, or ask the user." }
```

**The `reason` is the entire user interface of a hook.** The model sees it and nothing else, with no access to the script. "Blocked by policy" produces a retry loop that burns the turn; a reason that names the offending command *and* the legal alternative produces a corrected call on the next turn. Write it as an instruction to a capable agent that cannot see your code.

## Caveats that bite

- **Hooks run non-interactively.** No TTY, no prompt. A command that waits for input hangs until its timeout and takes the turn with it. Pass the non-interactive flag every time (`--yes`, `--no-input`), set `GIT_PAGER=cat`, and never invoke anything that opens an editor or a pager.
- **They run with the user's full permissions and are not gated by the permission prompt.** A hook that pushes, deploys, publishes or deletes executes without the user ever seeing a confirmation — the one place in the harness where that is true. Guards and formatters only.
- **On `--continue` and `--resume`, hook context is replayed as saved text.** Whatever a hook printed comes back verbatim, so "HEAD is `abc123`, 12 tests passing at 14:02" is presented as current when it is hours stale. Two consequences: keep SHAs, timestamps, counts and branch names out of hook stdout, and on resume re-derive git and test state with a command rather than trusting replayed hook text. Same failure as trusting a summary — [context-discipline.md](context-discipline.md).
- **Cost per fire is the design constraint, not correctness.** A hook that fires on every edit is a hook that gets uninstalled, and an uninstalled hook enforces nothing.
- **Editing `settings.json` mid-session does not reliably re-arm.** After `on`, confirm with `status` and promise the gate from the next session, not from this turn.

## Each hook carries an expiry

Every hook encodes an assumption about a model limitation, and those assumptions go stale — Opus 4.5 largely removed context anxiety, and Anthropic deleted the reset machinery built for it. A hook whose failure mode no longer exists is pure latency plus false-block risk.

So record it at install time, in the ledger, because JSON takes no comments and this is the only place it can live:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note decision "PreToolUse guard on git push --force — prevents <failure>; remove when <observable condition>"
```

At `review`, any hook that never fired during the work it was installed for is a candidate for removal, not a badge. Removing it is a ruling like any other (Law 8): decide, record, continue.

## Exit condition

All seven hold before this phase is done:

- [ ] `hooks.ts status` run **in this message**, and its `installed`, `verifyCommand` and `runVerifyOnStop` values reported verbatim rather than assumed.
- [ ] Every hook installed this session was offered first and explicitly accepted — none installed silently, none hand-written into `settings.json`.
- [ ] Every installed hook has a ledger entry naming the failure it prevents and the observable condition for removing it.
- [ ] Every `PostToolUse` command exits 0 on its own failure.
- [ ] Every hook command runs non-interactively and carries a `timeout` above its measured worst case; any `--verify` command completes in under 300s.
- [ ] No hook prints a SHA, timestamp, count or branch name that would read as current after a `--resume`.
- [ ] The user was told in one line what is now blocked, that it lives in the committed `settings.json`, and that `hooks.ts off` removes it.
