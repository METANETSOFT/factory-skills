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
import { findRoot, paths as workspacePaths } from './lib/workspace.ts'
import type { FactoryConfig, HookHandler, StopPayload } from './lib/types.ts'

// The installed hook runs this file by absolute path, so SELF must be the file
// actually executing. A hardcoded basename silently points at a path that does
// not exist the moment the file is renamed, and the gate then fails on every
// Stop event while `status` still reports it installed.
const SELF = fileURLToPath(import.meta.url)

const argv = process.argv.slice(2)
const cmd = argv.find((a) => !a.startsWith('--')) || 'status'
const flag = (n: string): string | null => {
  const i = argv.indexOf(`--${n}`)
  if (i === -1) return null
  return argv[i + 1] ?? null
}

// --root is how every other script is told which project it means; without it
// here, `on` could install the gate into an ancestor repository's settings.
const ROOT = path.resolve(flag('root') ?? findRoot())
const WS = workspacePaths(ROOT)
const SETTINGS = path.join(ROOT, '.claude', 'settings.json')
const CONFIG = WS.config
const MARK = 'factory:stop-gate'

/** A JSON object we only partly understand: keys we do not know are the user's. */
type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Parsed object, or null when the file is absent, unreadable, or not an object. */
const readJsonObject = (f: string): Json | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    return null
  }
  return isObject(parsed) ? parsed : null
}
const out = (o: unknown): void => {
  process.stdout.write(JSON.stringify(o, null, 2) + '\n')
}

/** Shell-quote a path. POSIX single quotes are the only form with no escapes
 *  inside them, so $, backtick, ", \ and space all become literal. The stored
 *  hook is a shell string — JSON quoting looks right and is not: an install path
 *  containing `$` silently disables the gate, and one containing a backtick runs
 *  its contents on every Stop event. */
const shq = (s: string): string => `'` + s.replaceAll(`'`, `'\\''`) + `'`

// The command string carries MARK so `off` can find and remove exactly this
// hook without disturbing hooks the user or another tool installed. MARK stays
// outside the quotes, so it is still a literal substring of the command.
const hookCommand = () => `node ${shq(SELF)} gate # ${MARK}`

function isOurs(h: unknown): boolean {
  return isObject(h) && typeof h['command'] === 'string' && h['command'].includes(MARK)
}

/** The Stop groups as found on disk. Anything malformed reads as empty rather
 *  than throwing — a hand-edited settings.json must not crash the gate. */
function stopGroups(s: Json): unknown[] {
  const hooks = s['hooks']
  if (!isObject(hooks)) return []
  const stop = hooks['Stop']
  if (Array.isArray(stop)) return stop
  return []
}

function handlersOf(group: unknown): unknown[] {
  if (!isObject(group)) return []
  const hooks = group['hooks']
  if (Array.isArray(hooks)) return hooks
  return []
}

/** Every Stop group with our handler taken out, dropping groups we emptied.
 *  Foreign keys on a group are carried through untouched. */
function withoutOurs(groups: unknown[]): Json[] {
  const kept: Json[] = []
  for (const g of groups) {
    const hooks = handlersOf(g).filter((h) => !isOurs(h))
    if (!hooks.length) continue
    const rewritten: Json = isObject(g) ? { ...g } : {}
    rewritten['hooks'] = hooks
    kept.push(rewritten)
  }
  return kept
}

function readConfig(): FactoryConfig {
  const raw = readJsonObject(CONFIG)
  if (!raw) return {}
  const cfg: FactoryConfig = {}
  const verify = raw['verifyCommand']
  if (typeof verify === 'string') cfg.verifyCommand = verify
  if (raw['runVerifyOnStop'] === true) cfg.runVerifyOnStop = true
  return cfg
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

/** One added line, and the file it genuinely belongs to. */
interface AddedLine {
  file: string
  text: string
}

// The git calls have always had this headroom; the verify call now shares it.
const MAX_BUFFER = 32 * 1024 * 1024
const VERIFY_TIMEOUT_MS = 300000
// An untracked file larger than this is data, not hand-written code.
const MAX_UNTRACKED_BYTES = 2 * 1024 * 1024

function hasHead(): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: ROOT, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** git C-quotes a path containing a quote, a backslash or a control byte — and,
 *  unless core.quotePath=false, any non-ASCII byte. Decode it back to the real
 *  name: an unrecognised header used to leave the previous file's name in place,
 *  which attributed added lines to a file that never contained them. */
function unquoteGitPath(s: string): string {
  if (s.length < 2 || !s.startsWith('"') || !s.endsWith('"')) return s
  const body = s.slice(1, -1)
  const bytes: number[] = []
  const pushUtf8 = (str: string) => {
    for (const b of Buffer.from(str, 'utf8')) bytes.push(b)
  }
  const SIMPLE: Record<string, number> = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '\\': 0x5c, '"': 0x22 }
  let i = 0
  while (i < body.length) {
    const ch = body[i]
    if (ch === undefined) break
    if (ch !== '\\') {
      pushUtf8(ch)
      i += 1
      continue
    }
    const esc = body[i + 1]
    if (esc === undefined) {
      pushUtf8(ch) // a trailing backslash is not an escape
      i += 1
      continue
    }
    const simple = SIMPLE[esc]
    if (simple !== undefined) {
      bytes.push(simple)
      i += 2
      continue
    }
    const octal = /^[0-7]{1,3}/.exec(body.slice(i + 1, i + 4))
    const digits = octal ? octal[0] : undefined
    if (digits) {
      bytes.push(parseInt(digits, 8) & 0xff)
      i += 1 + digits.length
      continue
    }
    pushUtf8(esc) // unknown escape: take the character literally
    i += 2
  }
  return Buffer.from(bytes).toString('utf8')
}

function addedLines(): AddedLine[] {
  // Working tree + staged, against HEAD. On an unborn repo there is nothing to
  // compare to, so the gate stays quiet rather than guessing.
  if (!hasHead()) return []
  let diff = ''
  try {
    // core.quotePath=false keeps non-ASCII paths readable in the +++ header;
    // without it git escapes them and the header no longer matches.
    diff = execFileSync('git', ['-c', 'core.quotePath=false', 'diff', 'HEAD', '--unified=0', '--no-color'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    })
  } catch {
    return []
  }
  const added: AddedLine[] = []
  let file: string | null = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      // Match the header generally, not just `+++ b/`: a header we fail to
      // recognise must not leave the previous file's name in place.
      const target = unquoteGitPath(line.slice(4).replace(/\t.*$/, ''))
      file = target === '/dev/null' ? null : target.replace(/^b\//, '')
      continue
    }
    // A `+` line only ever follows a header, so an unknown file means a diff we
    // did not understand — reporting it against the wrong path is worse than
    // reporting nothing.
    if (file !== null && line.startsWith('+') && !line.startsWith('+++')) added.push({ file, text: line.slice(1) })
  }
  return added
}

/** Is `abs` inside the factory's own workspace? */
function insideWorkspace(abs: string): boolean {
  const rel = path.relative(WS.ws, abs)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function untrackedLines(): AddedLine[] {
  // `git diff` never reports untracked paths, so a brand-new file — the usual
  // shape of agent-authored code — bypassed the gate entirely until it happened
  // to be staged. Before the first commit every file in the tree is untracked,
  // including code the agent never wrote, so this follows addedLines() in
  // staying quiet on an unborn repo.
  if (!hasHead()) return []
  let list = ''
  try {
    // --exclude-standard honours .gitignore, so node_modules and build output
    // stay out. -z keeps paths with newlines in them intact.
    list = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    })
  } catch {
    return []
  }
  const added: AddedLine[] = []
  for (const file of list.split('\0')) {
    if (!file) continue
    const abs = path.join(ROOT, file)
    // An in-project workspace is full of legitimate prose about unimplemented
    // work. Blocking on the factory's own notes would be a false positive we
    // manufactured for ourselves.
    if (insideWorkspace(abs)) continue
    let body = ''
    try {
      if (fs.statSync(abs).size > MAX_UNTRACKED_BYTES) continue
      body = fs.readFileSync(abs, 'utf8')
    } catch {
      continue // a dangling symlink, or a file deleted mid-run, is not a finding
    }
    if (body.includes('\0')) continue // binary
    for (const line of body.split('\n')) added.push({ file, text: line })
  }
  return added
}

// The delimiters must include _ and - : Go's `_test.go` is the only shape `go
// test` compiles, and pytest's `test_x.py` and RSpec's `x_spec.rb` are just as
// standard. Missing them meant ordinary test vocabulary ("not implemented on
// this platform") blocked the turn.
const isTestFile = (p: string): boolean => /(^|[\/._-])(tests?|specs?|__tests__|e2e)([\/._-]|$)/i.test(p)

const asText = (v: unknown): string => (typeof v === 'string' ? v : Buffer.isBuffer(v) ? v.toString('utf8') : '')

/** What to report when the verify command did not exit 0. A child we killed
 *  ourselves also exits with status null, so branch on `code`: blaming the
 *  user's suite for our buffer or our clock costs them a turn they cannot fix. */
function verifyFinding(command: string, e: unknown): string {
  const err = isObject(e) ? e : {}
  const code = typeof err['code'] === 'string' ? err['code'] : ''
  if (code === 'ENOBUFS') {
    const mib = Math.round(MAX_BUFFER / (1024 * 1024))
    return `Law 1 — verify command wrote more than ${mib} MiB, so it was killed before it could report: \`${command}\`. Its result is unknown — run it yourself, or quieten its output.`
  }
  if (code === 'ETIMEDOUT') {
    return `Law 1 — verify command was still running after ${Math.round(VERIFY_TIMEOUT_MS / 1000)}s and was killed: \`${command}\`. Its result is unknown.`
  }
  // Bound the tail by bytes as well as by lines: output with no newlines is one
  // enormous line, and a megabyte of it lands back in the model's context.
  const tail = (asText(err['stdout']).split('\n').slice(-15).join('\n') || asText(err['stderr'])).slice(-2000)
  return `Law 1 — verify command failed: \`${command}\`\n${tail}`
}

function readStopPayload(): StopPayload {
  try {
    const raw = fs.readFileSync(0, 'utf8')
    if (!raw.trim()) return {}
    const parsed: unknown = JSON.parse(raw)
    // Only the field the gate acts on is lifted out; the rest is never read.
    if (isObject(parsed) && parsed['stop_hook_active'] === true) return { stop_hook_active: true }
  } catch {
    // No stdin, or not JSON. Run the checks anyway — a gate that silently
    // disables itself on an unexpected payload is not a gate.
  }
  return {}
}

function gate(): void {
  const payload = readStopPayload()

  // If we already blocked this turn, do not block again. Repeated blocking on
  // the same condition traps the session in a loop the user cannot exit.
  if (payload.stop_hook_active === true) process.exit(0)

  const findings: string[] = []

  for (const { file, text } of [...addedLines(), ...untrackedLines()]) {
    if (isTestFile(file)) continue
    for (const v of VIOLATIONS) {
      if (v.re.test(text)) {
        findings.push(`Law ${v.law} (${v.id}) — ${file}: ${text.trim().slice(0, 110)}`)
        break
      }
    }
    if (findings.length >= 12) break
  }

  const cfg = readConfig()
  const verifyCommand = cfg.verifyCommand
  if (verifyCommand && cfg.runVerifyOnStop) {
    try {
      execSync(verifyCommand, { cwd: ROOT, stdio: 'pipe', timeout: VERIFY_TIMEOUT_MS, maxBuffer: MAX_BUFFER })
    } catch (e) {
      findings.push(verifyFinding(verifyCommand, e))
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

function load(): Json {
  if (!fs.existsSync(SETTINGS)) return {}
  let raw = ''
  try {
    raw = fs.readFileSync(SETTINGS, 'utf8')
  } catch (e) {
    out({ ok: false, error: `Could not read ${SETTINGS}: ${e instanceof Error ? e.message : String(e)}` })
    process.exit(1)
  }
  if (!raw.trim()) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    // Treating an unparseable file as an empty one meant `save()` then replaced
    // the user's permissions, env and other tools' hooks with just ours, with no
    // warning and no backup. A file we cannot read is a file we must not write.
    out({
      ok: false,
      error: `Could not parse ${SETTINGS}: ${e instanceof Error ? e.message : String(e)}. Refusing to write — fix the JSON and re-run.`,
    })
    process.exit(1)
  }
  if (!isObject(parsed)) {
    out({ ok: false, error: `${SETTINGS} is not a JSON object. Refusing to write — fix it and re-run.` })
    process.exit(1)
  }
  return parsed
}

function save(s: Json) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true })
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n')
}

interface Status {
  root: string
  settings: string
  settingsExists: boolean
  installed: boolean
  verifyCommand: string | null
  runVerifyOnStop: boolean
  checks: string[]
}

function status(): Status {
  const s = load()
  // Stop takes no matcher — it always fires — so the group is just { hooks: [...] }.
  const installed = stopGroups(s).some((g) => handlersOf(g).some(isOurs))
  const cfg = readConfig()
  return {
    root: ROOT,
    settings: SETTINGS,
    settingsExists: fs.existsSync(SETTINGS),
    installed,
    verifyCommand: cfg.verifyCommand ?? null,
    runVerifyOnStop: cfg.runVerifyOnStop === true,
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
    const existingHooks = s['hooks']
    const hooks: Json = isObject(existingHooks) ? { ...existingHooks } : {}
    // Drop any previous copy of ours first so `on` is idempotent.
    const groups = withoutOurs(stopGroups(s))
    const ours: HookHandler = { type: 'command', command: hookCommand(), timeout: 330 }
    groups.push({ hooks: [ours] })
    hooks['Stop'] = groups
    s['hooks'] = hooks
    save(s)

    const verify = flag('verify')
    if (verify) {
      // Merge rather than replace: config.json is the factory's own file, but a
      // key we did not write is still not ours to drop.
      const cfg: Json = readJsonObject(CONFIG) ?? {}
      cfg['verifyCommand'] = verify
      cfg['runVerifyOnStop'] = true
      fs.mkdirSync(path.dirname(CONFIG), { recursive: true })
      fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n')
    }
    out({
      ok: true,
      // `installed` comes from status() — a literal here was always overwritten
      // by the spread, and claiming it without reading it back would be a guess.
      ...status(),
      note: 'Project-scoped and removable with `hooks.mjs off`. Tell the user it is now active and what it blocks.',
    })
    break
  }

  case 'off': {
    const s = load()
    const existingHooks = s['hooks']
    // Only rewrite the file when there is a Stop list to edit — `off` on
    // settings we never installed into should leave them exactly as they are.
    if (isObject(existingHooks) && existingHooks['Stop']) {
      const hooks: Json = { ...existingHooks }
      const kept = withoutOurs(stopGroups(s))
      if (kept.length) hooks['Stop'] = kept
      else delete hooks['Stop']
      if (Object.keys(hooks).length) s['hooks'] = hooks
      else delete s['hooks']
      save(s)
    }
    out({ ok: true, removed: true, ...status() })
    break
  }

  case 'status':
  default:
    out(status())
}
