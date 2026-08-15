#!/usr/bin/env node
// factory/context.mjs — session bootstrap. Run once, at the top of a session.
//
// It reads the durable truth off disk (charter, state, ledger, git) and emits
// directives. The agent follows the directives instead of guessing what phase
// it is in — which is what makes a resumed session indistinguishable from one
// that never lost its context.
//
// Usage: node context.mjs [--root DIR] [--brief]

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { resolve as resolveWorkspace } from './lib/workspace.mjs'

const argv = process.argv.slice(2)
const flag = (n, d = null) => {
  const i = argv.indexOf(`--${n}`)
  return i === -1 ? d : argv[i + 1]
}

const P = resolveWorkspace(flag('root'))
const ROOT = P.root
const DIR = P.ws

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

function gitSignals() {
  // Detect the repo separately from HEAD: a freshly-initialised repo has no
  // commit, so `rev-parse HEAD` fails there while the repo is very much real.
  if (sh('git', ['rev-parse', '--is-inside-work-tree']) !== 'true') return { repo: false }
  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']) || sh('git', ['branch', '--show-current']) || 'HEAD'
  const unborn = sh('git', ['rev-parse', '--verify', 'HEAD']) === null
  const status = sh('git', ['status', '--porcelain']) || ''
  const changed = status.split('\n').filter(Boolean).map((l) => l.slice(3))
  const recent = (sh('git', ['log', '--oneline', '-12']) || '').split('\n').filter(Boolean)
  return {
    repo: true,
    branch,
    unborn,
    dirty: changed.length > 0,
    changedCount: changed.length,
    changedFiles: changed.slice(0, 25),
    recentCommits: recent,
    onDefaultBranch: ['main', 'master'].includes(branch),
  }
}

function projectShape() {
  const p = (f) => fs.existsSync(path.join(ROOT, f))
  const shape = { markers: [] }
  const marks = {
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
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
      shape.scripts = Object.keys(pkg.scripts || {})
      shape.testCommand =
        pkg.scripts?.test ? 'npm test' : pkg.scripts?.['test:unit'] ? 'npm run test:unit' : null
      shape.buildCommand = pkg.scripts?.build ? 'npm run build' : null
      shape.lintCommand = pkg.scripts?.lint ? 'npm run lint' : null
    } catch {}
  }
  return shape
}

function stateSnapshot() {
  const f = P.state
  if (!fs.existsSync(f)) return null
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch (e) {
    return { corrupt: String(e.message) }
  }
}

function tailLedger(n = 14) {
  const f = P.ledger
  if (!fs.existsSync(f)) return []
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).slice(-n)
}

const charterPath = P.charter
const hasCharter = fs.existsSync(charterPath)
const s = stateSnapshot()
const git = gitSignals()
const shape = projectShape()

const directives = []

if (!s) {
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
  if (s.work) {
    directives.push({
      code: 'RESUME',
      say: `Active work "${s.work.title}" is at phase \`${s.phase}\`, slice ${s.slice?.done ?? 0}/${s.slice?.total ?? 0}. Read ${path.join(s.work.dir, 'HANDOFF.md')} if it exists, then the artifact for the current phase. Do not restart earlier phases — their outputs are on disk.`,
    })
  } else {
    directives.push({
      code: 'NO_ACTIVE_WORK',
      say: 'No active unit of work. Start one with `state.mjs start <slug> --title "..."` before entering the pipeline.',
    })
  }
  if (s.open?.length) {
    directives.push({
      code: 'OPEN_ITEMS',
      say: `${s.open.length} unresolved item(s) carried from earlier sessions. These are commitments, not suggestions — read them and close or re-record each one.`,
      items: s.open,
    })
  }
}

if (git.repo && git.onDefaultBranch && git.dirty && !git.unborn) {
  directives.push({
    code: 'DIRTY_DEFAULT_BRANCH',
    say: `Uncommitted work on \`${git.branch}\`. Branch before implementing.`,
  })
}

if (!shape.testCommand && shape.markers.includes('node')) {
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
  initialized: !!s,
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
  const lines = [
    `factory @ ${ROOT}`,
    `workspace: ${DIR}${P.inProject ? ' (in project)' : ''}`,
    `phase: ${report.phase ?? '—'}   work: ${report.work?.title ?? '—'}   slice: ${report.slice ? `${report.slice.done}/${report.slice.total}` : '—'}`,
    `git: ${git.repo ? `${git.branch}${git.dirty ? ` (${git.changedCount} dirty)` : ''}` : 'no repo'}`,
    '',
    ...directives.map((d) => `[${d.code}] ${d.say}`),
  ]
  process.stdout.write(lines.join('\n') + '\n')
} else {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}
