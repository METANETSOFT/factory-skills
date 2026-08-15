#!/usr/bin/env node
// factory/hooks.mjs — turning the Laws from suggestions into enforcement.
//
// A rule written in a skill is a rule the model can rationalise away at 80%
// context; that is a documented failure mode, not a character flaw. A hook runs
// in the harness and cannot be talked out of. This installs one Stop-event gate
// that checks the two Laws which are mechanically checkable:
//
//   Law 4  no placeholders in delivered code
//   Law 2  no truncation markers standing in for work
//
// and, when the project has opted in, runs its own verify command.
//
// Opt-in, project-scoped, and removable — `hooks.mjs off` takes it out cleanly.
// A hook the user did not ask for is worse than no hook.
//
// Usage:
//   node hooks.mjs status
//   node hooks.mjs on [--verify "npm test"]     install into <project>/.claude/settings.json
//   node hooks.mjs off
//   node hooks.mjs gate                         (invoked by the hook itself; reads stdin)

import fs from 'node:fs'
import path from 'node:path'
import { execSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { findRoot, paths as workspacePaths } from './lib/workspace.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SELF = path.join(HERE, 'hooks.mjs')

const argv = process.argv.slice(2)
const cmd = argv.find((a) => !a.startsWith('--')) || 'status'
const flag = (n, d = null) => {
  const i = argv.indexOf(`--${n}`)
  return i === -1 ? d : argv[i + 1]
}

const ROOT = findRoot()
const WS = workspacePaths(ROOT)
const SETTINGS = path.join(ROOT, '.claude', 'settings.json')
const CONFIG = WS.config
const MARK = 'factory:stop-gate'

const readJson = (f, d = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    return d
  }
}
const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + '\n')

// The command string carries MARK so `off` can find and remove exactly this
// hook without disturbing hooks the user or another tool installed.
const hookCommand = () => `node ${JSON.stringify(SELF)} gate # ${MARK}`

function isOurs(h) {
  return typeof h?.command === 'string' && h.command.includes(MARK)
}

// --- the gate -----------------------------------------------------------------

// Patterns that mean "this was not finished but is being presented as if it
// were". Deliberately narrow: a false block costs the user a turn, so only
// flag things that cannot be legitimate in delivered code.
const VIOLATIONS = [
  { law: 4, id: 'placeholder', re: /\b(TODO|FIXME)\s*:?\s*(implement|fill|add|write|complete|finish)/i },
  { law: 4, id: 'not-implemented', re: /\b(not implemented|unimplemented|implement(ation)? (goes )?here)\b/i },
  { law: 2, id: 'truncated', re: /(\.\.\.|…)\s*(rest|remaining|other|existing)\s+(of\s+)?(the\s+)?(code|file|implementation|methods?|unchanged)|\/\/\s*\.\.\.\s*$/i },
  { law: 2, id: 'for-brevity', re: /\b(omitted|truncated|abbreviated|shortened)\s+for\s+(brevity|space|readability)\b/i },
]

function addedLines() {
  // Working tree + staged, against HEAD. On an unborn repo there is nothing to
  // compare to, so the gate stays quiet rather than guessing.
  try {
    execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: ROOT, stdio: 'ignore' })
  } catch {
    return []
  }
  let diff = ''
  try {
    diff = execFileSync('git', ['diff', 'HEAD', '--unified=0', '--no-color'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch {
    return []
  }
  const added = []
  let file = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      file = line.slice(6)
      continue
    }
    if (line.startsWith('+') && !line.startsWith('+++')) added.push({ file, text: line.slice(1) })
  }
  return added
}

const isTestFile = (p) => /(^|[\/.])(test|tests|spec|__tests__|e2e)([\/.]|$)/i.test(p || '')

function gate() {
  let payload = {}
  try {
    const raw = fs.readFileSync(0, 'utf8')
    if (raw.trim()) payload = JSON.parse(raw)
  } catch {
    // No stdin, or not JSON. Run the checks anyway — a gate that silently
    // disables itself on an unexpected payload is not a gate.
  }

  // If we already blocked this turn, do not block again. Repeated blocking on
  // the same condition traps the session in a loop the user cannot exit.
  if (payload.stop_hook_active === true) process.exit(0)

  const findings = []

  for (const { file, text } of addedLines()) {
    if (isTestFile(file)) continue
    for (const v of VIOLATIONS) {
      if (v.re.test(text)) {
        findings.push(`Law ${v.law} (${v.id}) — ${file}: ${text.trim().slice(0, 110)}`)
        break
      }
    }
    if (findings.length >= 12) break
  }

  const cfg = readJson(CONFIG, {})
  if (cfg.verifyCommand && cfg.runVerifyOnStop) {
    try {
      execSync(cfg.verifyCommand, { cwd: ROOT, stdio: 'pipe', timeout: 300000 })
    } catch (e) {
      const tail = String(e.stdout || '').split('\n').slice(-15).join('\n') || String(e.stderr || '').slice(-800)
      findings.push(`Law 1 — verify command failed: \`${cfg.verifyCommand}\`\n${tail}`)
    }
  }

  if (!findings.length) process.exit(0)

  process.stderr.write(
    'factory stop-gate blocked this turn.\n\n' +
      findings.map((f) => '  - ' + f).join('\n') +
      '\n\nFix these, or — if the work genuinely cannot be completed now — remove the marker and ' +
      'record it with `state.mjs note unfinished "<what and why>"`, then say so plainly to the user. ' +
      'Law 3: unfinished work gets named, never hidden.\n',
  )
  process.exit(2)
}

// --- install / remove ---------------------------------------------------------

function load() {
  return readJson(SETTINGS, {})
}

function save(s) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true })
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n')
}

function status() {
  const s = load()
  // Stop takes no matcher — it always fires — so the group is just { hooks: [...] }.
  const groups = s.hooks?.Stop || []
  const installed = groups.some((g) => (g.hooks || []).some(isOurs))
  const cfg = readJson(CONFIG, {})
  return {
    root: ROOT,
    settings: SETTINGS,
    settingsExists: fs.existsSync(SETTINGS),
    installed,
    verifyCommand: cfg.verifyCommand || null,
    runVerifyOnStop: !!cfg.runVerifyOnStop,
    checks: [
      'Law 4 — placeholder markers in added non-test lines',
      'Law 2 — truncation markers in added non-test lines',
      cfg.runVerifyOnStop && cfg.verifyCommand ? `Law 1 — runs \`${cfg.verifyCommand}\`` : 'Law 1 — not enabled (set a verify command with --verify)',
    ],
  }
}

switch (cmd) {
  case 'gate':
    gate()
    break

  case 'on': {
    const s = load()
    s.hooks = s.hooks || {}
    s.hooks.Stop = s.hooks.Stop || []
    // Drop any previous copy of ours first so `on` is idempotent.
    s.hooks.Stop = s.hooks.Stop
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
      .filter((g) => (g.hooks || []).length)
    s.hooks.Stop.push({ hooks: [{ type: 'command', command: hookCommand(), timeout: 330 }] })
    save(s)

    const verify = flag('verify')
    if (verify) {
      const cfg = readJson(CONFIG, {})
      cfg.verifyCommand = verify
      cfg.runVerifyOnStop = true
      fs.mkdirSync(path.dirname(CONFIG), { recursive: true })
      fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n')
    }
    out({
      ok: true,
      installed: true,
      ...status(),
      note: 'Project-scoped and removable with `hooks.mjs off`. Tell the user it is now active and what it blocks.',
    })
    break
  }

  case 'off': {
    const s = load()
    if (s.hooks?.Stop) {
      s.hooks.Stop = s.hooks.Stop
        .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
        .filter((g) => (g.hooks || []).length)
      if (!s.hooks.Stop.length) delete s.hooks.Stop
      if (s.hooks && !Object.keys(s.hooks).length) delete s.hooks
      save(s)
    }
    out({ ok: true, removed: true, ...status() })
    break
  }

  case 'status':
  default:
    out(status())
}
