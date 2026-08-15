#!/usr/bin/env node
// factory/context.mjs — session bootstrap. Run once, at the top of a session.
//
// It reads the durable truth off disk (charter, state, ledger, git) and emits
// directives. The agent follows the directives instead of guessing what phase
// it is in — which is what makes a resumed session indistinguishable from one
// that never lost its context.
//
// Every directive here is read as fact by a session that has no other source,
// so a signal this file cannot read must come out as "unknown", never as the
// benign value. A confident falsehood is worse than a gap: the gap gets asked
// about, the falsehood gets acted on.
//
// Usage: node context.mjs [--root DIR] [--brief]

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { resolve as resolveWorkspace } from './lib/workspace.ts'
import { NOTE_KINDS, PHASES, SESSION_EVENTS } from './lib/types.ts'
import type {
  Directive,
  GitSignals,
  OpenItem,
  Phase,
  ProjectShape,
  SessionEvent,
  SessionState,
  State,
  WorkRef,
} from './lib/types.ts'

const argv = process.argv.slice(2)
const flag = (n: string, d: string | null = null): string | null => {
  const i = argv.indexOf(`--${n}`)
  return i === -1 ? d : (argv[i + 1] ?? null)
}

const P = resolveWorkspace(flag('root'))
const ROOT = P.root
const DIR = P.ws

const sh = (cmd: string, args: string[]): string | null => {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

// JSON this script did not write is `unknown` until a guard says otherwise.
// state.ts refuses to *write* a state.json it cannot read; this file only
// reports, so it reads the same fields with the same strictness and says so
// when they do not hold.
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** `statusUnavailable` is not in the shared GitSignals yet — see the report. */
interface GitReport extends GitSignals {
  /** `git status` itself failed, so dirty/changed are unknown rather than clean. */
  statusUnavailable?: boolean
}

function gitSignals(): GitReport {
  // Detect the repo separately from HEAD: a freshly-initialised repo has no
  // commit, so `rev-parse HEAD` fails there while the repo is very much real.
  if (sh('git', ['rev-parse', '--is-inside-work-tree']) !== 'true') return { repo: false }
  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']) || sh('git', ['branch', '--show-current']) || 'HEAD'
  const unborn = sh('git', ['rev-parse', '--verify', 'HEAD']) === null
  // `sh` returns null for a failed command and '' for one that printed nothing.
  // Collapsing those with `|| ''` reported a corrupt index or an unreadable
  // worktree as `dirty: false, changedCount: 0` — a clean tree, positively
  // asserted, with no error anywhere: exit 0, empty stderr, DIRTY_DEFAULT_BRANCH
  // silently gone. Keep the two apart all the way to the directive.
  const status = sh('git', ['status', '--porcelain'])
  const recent = (sh('git', ['log', '--oneline', '-12']) ?? '').split('\n').filter(Boolean)
  const base = {
    repo: true,
    branch,
    unborn,
    recentCommits: recent,
    onDefaultBranch: ['main', 'master'].includes(branch),
  }
  // The count keys are omitted, not zeroed: absent says "not measured", 0 lies.
  if (status === null) return { ...base, statusUnavailable: true }
  const changed = status.split('\n').filter(Boolean).map((l) => l.slice(3))
  return {
    ...base,
    statusUnavailable: false,
    dirty: changed.length > 0,
    changedCount: changed.length,
    changedFiles: changed.slice(0, 25),
  }
}

/** `manifestError` is not in the shared ProjectShape yet — see the report. */
interface ProjectReport extends ProjectShape {
  /** package.json is present but does not parse, so no command could be inferred. */
  manifestError?: string
}

function projectShape(): ProjectReport {
  const p = (f: string): boolean => fs.existsSync(path.join(ROOT, f))
  const shape: ProjectReport = { markers: [] }
  const marks: Record<string, string> = {
    'package.json': 'node',
    'pnpm-lock.yaml': 'pnpm',
    'bun.lock': 'bun',
    'bun.lockb': 'bun',
    'requirements.txt': 'python',
    'pyproject.toml': 'python',
    'go.mod': 'go',
    'Cargo.toml': 'rust',
    'composer.json': 'php',
    Gemfile: 'ruby',
    'CLAUDE.md': 'claude-md',
    'docs/adr': 'adr',
  }
  for (const [f, tag] of Object.entries(marks)) if (p(f)) shape.markers.push(tag)
  if (p('package.json')) {
    try {
      const pkg: unknown = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
      const scripts = isRecord(pkg) && isRecord(pkg['scripts']) ? pkg['scripts'] : {}
      const has = (k: string): boolean => {
        const v = scripts[k]
        return isString(v) && v !== ''
      }
      shape.scripts = Object.keys(scripts)
      shape.testCommand = has('test') ? 'npm test' : has('test:unit') ? 'npm run test:unit' : null
      shape.buildCommand = has('build') ? 'npm run build' : null
      shape.lintCommand = has('lint') ? 'npm run lint' : null
    } catch (e) {
      // Swallowing this is what let NO_TEST_COMMAND announce "no test script"
      // for a manifest that has one and merely does not parse — a trailing
      // comma, a merge marker, a truncated write. The agent is told not to
      // re-derive what this file reports, so the falsehood stood.
      shape.manifestError = message(e)
    }
  }
  return shape
}

/** Exactly what this script reads out of state.json; anything absent is null. */
interface StateView {
  phase: Phase | null
  work: WorkRef | null
  slice: State['slice'] | null
  open: OpenItem[]
  session: SessionState | null
}

type StateRead = { kind: 'missing' } | { kind: 'corrupt'; detail: string } | { kind: 'ok'; view: StateView }

const isPhase = (v: unknown): v is Phase => PHASES.some((p) => p === v)
const isWorkRef = (v: unknown): v is WorkRef | null =>
  v === null ||
  (isRecord(v) && isString(v['slug']) && isString(v['title']) && isString(v['startedAt']) && isString(v['dir']))
const isSlice = (v: unknown): v is State['slice'] => isRecord(v) && isNumber(v['done']) && isNumber(v['total'])
const isOpenItem = (v: unknown): v is OpenItem =>
  isRecord(v) &&
  isNumber(v['n']) &&
  NOTE_KINDS.some((k) => k === v['kind']) &&
  isString(v['text']) &&
  isString(v['at'])
const isOpenItems = (v: unknown): v is OpenItem[] => Array.isArray(v) && v.every(isOpenItem)

/** Counters are read tolerantly: an unknown key goes, a known one must be a number. */
function toSession(v: unknown): SessionState | null {
  if (!isRecord(v)) return null
  const startedAt = v['startedAt']
  const handoffs = v['handoffs']
  if (!isString(startedAt) || !isNumber(handoffs)) return null
  const counts: Partial<Record<SessionEvent, number>> = {}
  const raw = v['counts']
  if (isRecord(raw)) {
    for (const ev of SESSION_EVENTS) {
      const n = raw[ev]
      if (isNumber(n)) counts[ev] = n
    }
  }
  return { startedAt, counts, handoffs }
}

/**
 * What state.json holds, or why it cannot be read.
 *
 * A parse failure used to come back as `{ corrupt: msg }` and then be treated
 * as a perfectly readable state that happened to have no work in it: the report
 * asserted `work: null` and `openItems: []`, and the agent got NO_ACTIVE_WORK —
 * an instruction to start fresh work on top of the only machine-readable record
 * of the old work and its open commitments. Corruption is its own case here,
 * all the way out to a directive.
 *
 * A field that is present but the wrong shape counts as corruption too, for the
 * reason state.ts gives for refusing to write such a file: quietly dropping a
 * malformed `open` entry loses exactly the commitment it recorded.
 */
function readStateFile(): StateRead {
  const f = P.state
  if (!fs.existsSync(f)) return { kind: 'missing' }
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch (e) {
    return { kind: 'corrupt', detail: message(e) }
  }
  if (!isRecord(parsed)) return { kind: 'corrupt', detail: 'state.json does not hold an object' }
  const obj: Record<string, unknown> = parsed

  // Absent takes the null default, so a file written by an older version still
  // loads. Present-but-wrong is named, never repaired.
  const wrong: string[] = []
  const field = <T>(name: string, ok: (v: unknown) => v is T): T | null => {
    const raw = obj[name]
    if (raw === undefined) return null
    if (ok(raw)) return raw
    wrong.push(name)
    return null
  }
  const phase = field('phase', isPhase)
  const work = field('work', isWorkRef)
  const slice = field('slice', isSlice)
  const open = field('open', isOpenItems)
  const rawSession = obj['session']
  const session = rawSession === undefined ? null : toSession(rawSession)
  if (rawSession !== undefined && session === null) wrong.push('session')

  if (wrong.length) return { kind: 'corrupt', detail: `state.json field(s) not readable: ${wrong.join(', ')}` }
  return { kind: 'ok', view: { phase, work, slice, open: open ?? [], session } }
}

function tailLedger(n = 14): string[] {
  const f = P.ledger
  if (!fs.existsSync(f)) return []
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).slice(-n)
}

const charterPath = P.charter
const hasCharter = fs.existsSync(charterPath)
const stateFile = readStateFile()
const s = stateFile.kind === 'ok' ? stateFile.view : null
const git = gitSignals()
const shape = projectShape()

const directives: Directive[] = []

if (stateFile.kind === 'corrupt') {
  // Deliberately the only state directive in this case. NOT_INITIALIZED would
  // send the agent to `init`, and NO_ACTIVE_WORK to `start` — both of which read
  // as permission to build on top of the damaged file.
  directives.push({
    code: 'CORRUPT_STATE',
    say:
      `state.json at ${P.state} cannot be read (${stateFile.detail}). Its bytes are untouched and every factory ` +
      'command that writes will refuse until it is fixed. It is the only machine-readable record of the active ' +
      `work and every open item — rebuild it from that file and ${P.ledger}, or move it aside deliberately. ` +
      'Do not start new work on top of it, and do not treat anything below as a reading of this project’s state.',
  })
} else if (stateFile.kind === 'missing') {
  directives.push({
    code: 'NOT_INITIALIZED',
    say: 'This project has no factory yet. Run `node <skill>/scripts/state.mjs init`, then read reference/init.md and write FACTORY.md with the user before any build work.',
  })
} else {
  if (!hasCharter) {
    directives.push({
      code: 'NO_CHARTER',
      say: 'FACTORY.md is missing. The charter is what keeps a fresh session from re-litigating settled decisions. Write it (reference/init.md) before the next phase.',
    })
  }
  if (s?.work && s.phase === 'done') {
    // `finish` sets phase `done` and leaves `work` in place, so RESUME used to
    // fire on a unit that had been shipped — telling the session to pick up the
    // handoff of finished work and forbidding it to touch the earlier phases.
    directives.push({
      code: 'WORK_COMPLETE',
      say: `Work "${s.work.title}" is finished — phase \`done\`, nothing in flight. Do not resume or reopen it uninvited. Start the next unit with \`state.mjs start <slug> --title "..."\` when the user names one.`,
    })
  } else if (s?.work) {
    directives.push({
      code: 'RESUME',
      say: `Active work "${s.work.title}" is at phase \`${s.phase ?? 'unknown'}\`, slice ${s.slice?.done ?? 0}/${s.slice?.total ?? 0}. Read ${path.join(s.work.dir, 'HANDOFF.md')} if it exists, then the artifact for the current phase. Do not restart earlier phases — their outputs are on disk.`,
    })
  } else {
    directives.push({
      code: 'NO_ACTIVE_WORK',
      say: 'No active unit of work. Start one with `state.mjs start <slug> --title "..."` before entering the pipeline.',
    })
  }
  if (s?.open.length) {
    directives.push({
      code: 'OPEN_ITEMS',
      say: `${s.open.length} unresolved item(s) carried from earlier sessions. These are commitments, not suggestions — read them and close or re-record each one.`,
      items: s.open,
    })
  }
}

if (git.repo && git.onDefaultBranch) {
  if (git.statusUnavailable) {
    // `unborn` is allowed to suppress the real-dirty case below, but not this
    // one: when `git status` has already failed, a failed `rev-parse HEAD` is
    // most likely the same breakage, not an honestly empty repo.
    directives.push({
      code: 'DIRTY_DEFAULT_BRANCH',
      say: `\`git status\` failed on \`${git.branch}\`, so the working tree cannot be read and must not be assumed clean. Branch before implementing, and tell the user git is unhealthy here.`,
    })
  } else if (git.dirty && !git.unborn) {
    directives.push({
      code: 'DIRTY_DEFAULT_BRANCH',
      say: `Uncommitted work on \`${git.branch}\`. Branch before implementing.`,
    })
  }
}

if (shape.manifestError) {
  directives.push({
    code: 'UNREADABLE_MANIFEST',
    say: `package.json exists but does not parse (${shape.manifestError}). No project command could be inferred, so treat the test, build and lint commands as unknown rather than absent. Fix the manifest first.`,
  })
} else if (!shape.testCommand && shape.markers.includes('node')) {
  directives.push({
    code: 'NO_TEST_COMMAND',
    say: 'No test script found. The verify phase needs a command that produces evidence — agree one with the user or the verify gate has nothing to run.',
  })
}

const report = {
  root: ROOT,
  workspace: DIR,
  workspaceInProject: P.inProject,
  charter: hasCharter ? charterPath : null,
  initialized: stateFile.kind === 'ok',
  stateCorrupt: stateFile.kind === 'corrupt' ? stateFile.detail : null,
  phase: s?.phase ?? null,
  work: s?.work ?? null,
  slice: s?.slice ?? null,
  openItems: s?.open ?? [],
  session: s?.session ?? null,
  git,
  project: shape,
  ledgerTail: tailLedger(),
  directives,
}

if (argv.includes('--brief')) {
  const gitLine = !git.repo
    ? 'no repo'
    : git.statusUnavailable
      ? `${git.branch} (status unavailable)`
      : `${git.branch}${git.dirty ? ` (${git.changedCount} dirty)` : ''}`
  const lines = [
    `factory @ ${ROOT}`,
    `workspace: ${DIR}${P.inProject ? ' (in project)' : ''}`,
    `phase: ${report.phase ?? '—'}   work: ${report.work?.title ?? '—'}   slice: ${report.slice ? `${report.slice.done}/${report.slice.total}` : '—'}`,
    `git: ${gitLine}`,
    '',
    ...directives.map((d) => `[${d.code}] ${d.say}`),
  ]
  process.stdout.write(lines.join('\n') + '\n')
} else {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}
