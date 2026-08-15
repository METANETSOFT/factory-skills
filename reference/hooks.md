# Hooks

Turning the factory's guarantees from things you intend to do into things the harness does. Read this at Step 6 of [init.md](init.md), when the user asks for enforcement, or when the same rule has been dropped late in two sessions running.

## Why a hook and not a rule

A rule written in a skill competes for attention against every token produced since it was loaded, and loses. That is the documented mechanism behind CLAUDE.md being ignored at 80% context — not a lapse of will. SlopCodeBench measured the ceiling on prose: a well-written anti-slop instruction block cut initial verbosity ~34%, and then degradation resumed at exactly the same per-bin rate, for +47.9% spend and no pass-rate gain. **Instructions move the intercept, not the slope.**

A hook is executed by the harness between tool calls. It never reads the instruction, so it cannot weigh it against fatigue or a filling window. "Run the tests before committing" in a charter is a suggestion; a `PreToolUse` hook matching `git commit` is a fact.

Reserve prose for judgement calls. Anything mechanically checkable belongs in a hook, or in [anti-slop.md](anti-slop.md)'s exit codes.

## What `hooks.mjs` installs, and what it does not

```bash
node ${CLAUDE_SKILL_DIR}/scripts/hooks.mjs status
node ${CLAUDE_SKILL_DIR}/scripts/hooks.mjs on [--verify "npm test"]
node ${CLAUDE_SKILL_DIR}/scripts/hooks.mjs off
```

`on` writes **one** `Stop`-event gate into `<project>/.claude/settings.json`, carrying a `factory:stop-gate` marker so `off` removes exactly that entry and nothing a user or another tool installed. `--verify` additionally records a command in `.factory/config.json` and runs it at the gate.

| The gate checks | Law | Failure it prevents |
|---|---|---|
| Placeholder markers in added non-test lines | 4 | a stub shipped as a feature, discovered by the user rather than by you |
| Truncation markers (`...rest unchanged`, "omitted for brevity") in added non-test lines | 2 | a full window converted into an abridged file instead of a handoff |
| The project's verify command, when `--verify` was given | 1 | a turn ending on "should pass" with the suite red |

Bounds it deliberately holds, and the reason for each:

- **It reads added lines from `git diff HEAD` only.** Not behaviour, not the whole tree. A gate that graded correctness would be a self-administered verification, which does not work — that job is [verify.md](verify.md)'s and needs a different agent.
- **Test files are skipped.** A test may legitimately contain the string "not implemented". Test subversion has its own taxonomy and its own review in [verify.md](verify.md); catching it here would trade a real check for false blocks.
- **The patterns are narrow.** A false block costs the user a turn, so only markers that cannot be legitimate in delivered code are matched.
- **It never blocks twice on one turn** (`stop_hook_active`). A gate that re-fires on its own block traps the session in a loop the user cannot exit.
- **On an unborn repo it stays quiet.** Nothing to diff against means no verdict, not a guess.

**It is opt-in, project-scoped and removable — say all three out loud when you offer it.** It edits the user's settings, which is an effect outside the worktree and theirs to authorise under Law 8. Offer once, install only on a yes, and never install it silently. A hook the user did not expect is worse than no hook: it makes the harness feel broken and the next real block gets disabled along with it. If they decline, `state.mjs note decision "hooks declined"` and move on — it is not a blocker.

## The three placements

Placement is the whole design decision. Same script, wrong event, and you get either no enforcement or a session that cannot finish a turn.

| Event | Fires | Exit 2 means | What belongs here |
|---|---|---|---|
| `PreToolUse` | before a tool runs, matcher on tool name | **the tool is blocked**, stderr goes back to the model | destructive-command guards: `rm -rf`, `git push --force`, `DROP TABLE`, writes to `.env` or a production config |
| `PostToolUse` | after a tool succeeds | the edit already landed; stderr is advice, not a veto | formatters, `prettier`/`gofmt`/`ruff`, fast per-file lint |
| `Stop` | once, when the turn ends | the turn is blocked and the model is told why | the full test suite, the completion check, the placeholder/truncation gate |

Why the suite belongs on `Stop` and not `PostToolUse`: `Stop` runs **once per turn**, a per-edit hook runs on every write. A 90-second suite on `PostToolUse` costs 90 seconds times every edit in the slice, so it gets disabled by the end of the week — and a hook that gets disabled enforces nothing. Put the cheap, per-file, idempotent things on `PostToolUse`; put the expensive, whole-repo, once-is-enough things on `Stop`.

Why formatters must exit 0 even when they fail: `PostToolUse` fires after the write has already happened. A formatter that crashes on a syntax error mid-edit and exits non-zero halts the session over a file the model was about to fix anyway. Format, swallow the failure, exit 0.

## The artifact

`<project>/.claude/settings.json`. Fill in the commands; keep the shape exactly.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/guard-destructive.mjs", "timeout": 10 }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "npx prettier --write \"$CLAUDE_FILE_PATHS\" 2>/dev/null; exit 0", "timeout": 30 }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node /abs/path/to/factory/scripts/hooks.mjs gate # factory:stop-gate", "timeout": 330 }
        ]
      }
    ]
  }
}
```

`Stop` takes no `matcher` — it always fires. `timeout` is seconds, and must exceed the worst-case run of the command inside it. Every hook reads a JSON payload on stdin (`tool_name`, `tool_input`, `cwd`, and on `Stop`, `stop_hook_active`).

## The blocking response

Two ways to block. Use exit 2 for a guard script; use JSON when you want the reason to be structured.

```
exit 0   allow. stdout is shown in the transcript, not fed to the model as an instruction
exit 2   block. stderr is fed back to the model as the reason
other    non-blocking error. stderr goes to the user; the tool still runs
```

```json
{ "decision": "block", "reason": "Blocked: `git push --force` to a shared branch. Push to a feature branch, or ask the user." }
```

**The `reason` is the entire user interface of a hook.** The model sees it and nothing else, with no access to the script. A reason that says "blocked by policy" produces a retry loop; a reason that names the offending command and the legal alternative produces a corrected call on the next turn. Write it as an instruction to a capable agent that cannot see your code.

## Caveats that bite

- **Hooks run non-interactively.** No TTY, no prompt. A command that waits for input hangs until its timeout and takes the turn with it. Pass the non-interactive flag every time (`--yes`, `--no-input`, `--frozen-lockfile`), set `GIT_PAGER=cat`, and never invoke anything that opens an editor or a pager.
- **They run with the user's full permissions.** A hook is not sandboxed by the permission system. Do not write one that pushes, deploys, publishes, or deletes.
- **On `--continue` and `--resume`, hook context is replayed as saved text.** Whatever a hook printed into the transcript comes back verbatim, so a line reading "HEAD is `abc123`, 12 tests passing at 14:02" is presented as current when it is hours stale. Two consequences: keep volatile facts — SHAs, timestamps, counts, branch names — out of hook stdout, and when resuming, re-derive git and test state with a command rather than trusting replayed hook text. This is the same failure as trusting a summary: see [context-discipline.md](context-discipline.md).
- **A hook that fires on every edit is a hook that gets uninstalled.** Cost per fire is the design constraint, not correctness.
- **Editing `settings.json` mid-session does not reliably re-arm.** After `hooks.mjs on`, verify with `status` and expect the gate from the next session, not necessarily this turn.

## Every hook names the failure it prevents

Each hook encodes an assumption about a model limitation, and those assumptions go stale — Opus 4.5 largely removed context anxiety, and Anthropic deleted the reset machinery built for it. A hook whose failure mode no longer exists is pure latency plus a false-block risk.

So when you install one, record it: `state.mjs note decision "PreToolUse guard on git push --force — prevents <failure>; remove when <condition>"`. JSON takes no comments, so the ledger is the only place this can live. At `review`, any hook that has not fired in the work it was installed for is a candidate for removal, not a badge.

## Exit condition

- [ ] `hooks.mjs status` run in this message and its `installed` value reported to the user, not assumed.
- [ ] Every hook installed this session was offered first and accepted — none installed silently.
- [ ] Every hook has a ledger entry naming the failure it prevents and the condition for removing it.
- [ ] Every `PostToolUse` command exits 0 on its own failure.
- [ ] Every hook command runs non-interactively and has a `timeout` above its worst case.
- [ ] No hook prints a SHA, timestamp or count that will read as current after a `--resume`.
- [ ] The user was told, in one line, what is now blocked and that `hooks.mjs off` removes it.
