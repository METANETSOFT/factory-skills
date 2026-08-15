#!/usr/bin/env node
// factory/state.mjs — the on-disk brain.
//
// Everything the factory knows lives in files, never only in a context window.
// A session can die at any token count and the next one resumes from here with
// zero loss. That is the whole point: context is a cache, `.factory/` is truth.
//
// Layout (relative to the project root):
//   FACTORY.md                  durable charter: what this product is, how we work
//   .factory/state.json         machine state (phase, active work, counters)
//   .factory/ledger.md          append-only log of decisions, rulings, unfinished work
//   .factory/work/<slug>/       one directory per unit of work
//       RESEARCH.md PRD.md ARCHITECTURE.md PROGRAM-DESIGN.md PLAN.md HANDOFF.md
//       evidence/               verification output, screenshots, logs
//
// Usage:
//   node state.mjs init [--root DIR]
//   node state.mjs show                       → JSON snapshot for the agent
//   node state.mjs start <slug> [--title T]   → begin a unit of work
//   node state.mjs phase <phase>              → advance the pipeline
//   node state.mjs slice <done>/<total>
//   node state.mjs note <kind> <text...>      → ruling|unfinished|risk|decision|evidence
//   node state.mjs resolve <n>                → close an open unfinished item
//   node state.mjs tick <event>               → count a session event (read|edit|slice|fix|subagent)
//   node state.mjs handoff                    → freeze session, emit handoff path
//   node state.mjs finish                     → close the current work

import fs from 'node:fs'
import path from 'node:path'

const PHASES = [
  'uninitialized',
  'research',
  'product',
  'architecture',
  'program-design',
  'plan',
  'implement',
  'verify',
  'review',
  'done',
]

// A session that has done this much has spent its good tokens. Past these the
// model starts trading quality for closure — the "dumb zone". We hand off
// instead of pushing through, because a handoff costs one file and pushing
// through costs a rewrite.
const SESSION_CAPS = {
  slice: 3,      // vertical slices completed in one session
  fix: 8,        // review-fix rounds
  edit: 60,      // file edits
  read: 90,      // file reads
  subagent: 12,  // subagents dispatched
}

function findRoot(start = process.cwd()) {
  let dir = path.resolve(start)
  for (;;) {
    if (fs.existsSync(path.join(dir, '.factory'))) return dir
    if (fs.existsSync(path.join(dir, '.git'))) return dir
    const up = path.dirname(dir)
    if (up === dir) return path.resolve(start)
    dir = up
  }
}

const argv = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')))

const ROOT = path.resolve(flag('root') || findRoot())
const DIR = path.join(ROOT, '.factory')
const STATE = path.join(DIR, 'state.json')
const LEDGER = path.join(DIR, 'ledger.md')

const nowISO = () => new Date().toISOString()

function blankState() {
  return {
    version: 1,
    createdAt: nowISO(),
    phase: 'uninitialized',
    work: null,          // { slug, title, startedAt, dir }
    slice: { done: 0, total: 0 },
    session: { startedAt: nowISO(), counts: {}, handoffs: 0 },
    open: [],            // unresolved items: { n, kind, text, at }
    history: [],         // [{ at, phase }]
    seq: 0,
  }
}

function read() {
  if (!fs.existsSync(STATE)) return null
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'))
  } catch (e) {
    return { ...blankState(), corrupt: String(e.message) }
  }
}

function write(s) {
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n')
}

function appendLedger(line) {
  fs.mkdirSync(DIR, { recursive: true })
  if (!fs.existsSync(LEDGER)) {
    fs.writeFileSync(
      LEDGER,
      '# Factory ledger\n\nAppend-only. Every ruling, every unfinished thing, every phase change.\nNothing here is ever edited or deleted — a wrong entry is corrected by a later entry.\n\n',
    )
  }
  fs.appendFileSync(LEDGER, line.endsWith('\n') ? line : line + '\n')
}

/** What the caps say about this session right now. */
function pressure(s) {
  const c = s.session?.counts || {}
  const over = []
  const near = []
  for (const [k, cap] of Object.entries(SESSION_CAPS)) {
    const v = c[k] || 0
    if (v >= cap) over.push(`${k} ${v}/${cap}`)
    else if (v >= Math.ceil(cap * 0.7)) near.push(`${k} ${v}/${cap}`)
  }
  if (over.length) {
    return {
      level: 'handoff',
      over,
      near,
      directive:
        'HANDOFF_NOW — session caps exceeded (' +
        over.join(', ') +
        '). Do NOT start new work and do NOT compress your remaining work to fit. ' +
        'Run `state.mjs handoff`, write the handoff file completely, then tell the user to /clear and resume.',
    }
  }
  if (near.length) {
    return {
      level: 'warn',
      over,
      near,
      directive:
        'FINISH_CURRENT_SLICE — approaching session caps (' +
        near.join(', ') +
        '). Complete the slice you are on, verify it, then hand off. Do not begin another.',
    }
  }
  return { level: 'ok', over, near, directive: 'CONTINUE' }
}

function snapshot() {
  const s = read()
  if (!s) {
    return {
      root: ROOT,
      initialized: false,
      directive: 'NOT_INITIALIZED — run `node scripts/state.mjs init` and write FACTORY.md before any build work.',
    }
  }
  const charter = path.join(ROOT, 'FACTORY.md')
  const workDir = s.work ? path.join(DIR, 'work', s.work.slug) : null
  const artifacts = {}
  if (workDir && fs.existsSync(workDir)) {
    for (const f of ['RESEARCH.md', 'PRD.md', 'ARCHITECTURE.md', 'PROGRAM-DESIGN.md', 'PLAN.md', 'HANDOFF.md']) {
      const p = path.join(workDir, f)
      artifacts[f] = fs.existsSync(p) ? { present: true, bytes: fs.statSync(p).size } : { present: false }
    }
  }
  return {
    root: ROOT,
    initialized: true,
    charter: fs.existsSync(charter),
    phase: s.phase,
    nextPhase: PHASES[Math.min(PHASES.indexOf(s.phase) + 1, PHASES.length - 1)],
    work: s.work,
    workDir,
    artifacts,
    slice: s.slice,
    openItems: s.open,
    openCount: s.open.length,
    session: s.session,
    pressure: pressure(s),
    ledger: fs.existsSync(LEDGER) ? LEDGER : null,
  }
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n')
}

const cmd = positional[0]

switch (cmd) {
  case 'init': {
    const existing = read()
    if (existing) {
      out({ ok: true, already: true, ...snapshot() })
      break
    }
    const s = blankState()
    s.phase = 'research'
    write(s)
    fs.mkdirSync(path.join(DIR, 'work'), { recursive: true })
    appendLedger(`\n## ${nowISO()} — factory initialized\n\nroot: ${ROOT}\n`)
    out({ ok: true, created: true, ...snapshot() })
    break
  }

  case 'show': {
    out(snapshot())
    break
  }

  case 'start': {
    const slug = positional[1]
    if (!slug) {
      out({ ok: false, error: 'usage: state.mjs start <slug> [--title "..."]' })
      process.exit(1)
    }
    const s = read() || blankState()
    const title = flag('title', slug)
    const workDir = path.join(DIR, 'work', slug)
    fs.mkdirSync(path.join(workDir, 'evidence'), { recursive: true })
    s.work = { slug, title, startedAt: nowISO(), dir: workDir }
    s.phase = 'research'
    s.slice = { done: 0, total: 0 }
    s.session = { startedAt: nowISO(), counts: {}, handoffs: s.session?.handoffs || 0 }
    s.history.push({ at: nowISO(), phase: 'research' })
    write(s)
    appendLedger(`\n## ${nowISO()} — start: ${title}\n\nslug: \`${slug}\`\nwork dir: \`${workDir}\`\n`)
    out({ ok: true, ...snapshot() })
    break
  }

  case 'phase': {
    const p = positional[1]
    if (!PHASES.includes(p)) {
      out({ ok: false, error: `unknown phase "${p}"`, valid: PHASES })
      process.exit(1)
    }
    const s = read()
    if (!s) {
      out({ ok: false, error: 'not initialized' })
      process.exit(1)
    }
    const from = s.phase
    s.phase = p
    s.history.push({ at: nowISO(), phase: p })
    write(s)
    appendLedger(`- ${nowISO()} — phase: ${from} → ${p}`)
    out({ ok: true, ...snapshot() })
    break
  }

  case 'slice': {
    const spec = positional[1] || ''
    const m = spec.match(/^(\d+)\s*\/\s*(\d+)$/)
    if (!m) {
      out({ ok: false, error: 'usage: state.mjs slice <done>/<total>' })
      process.exit(1)
    }
    const s = read()
    s.slice = { done: Number(m[1]), total: Number(m[2]) }
    s.session.counts.slice = (s.session.counts.slice || 0) + 1
    write(s)
    appendLedger(`- ${nowISO()} — slice ${s.slice.done}/${s.slice.total} complete`)
    out({ ok: true, ...snapshot() })
    break
  }

  case 'note': {
    const kind = positional[1]
    const text = positional.slice(2).join(' ').trim()
    const kinds = ['ruling', 'unfinished', 'risk', 'decision', 'evidence']
    if (!kinds.includes(kind) || !text) {
      out({ ok: false, error: `usage: state.mjs note <${kinds.join('|')}> <text>` })
      process.exit(1)
    }
    const s = read()
    s.seq += 1
    const n = s.seq
    if (kind === 'unfinished' || kind === 'risk') s.open.push({ n, kind, text, at: nowISO() })
    write(s)
    appendLedger(`- ${nowISO()} — **${kind}** \`#${n}\`: ${text}`)
    out({ ok: true, n, kind, openCount: s.open.length })
    break
  }

  case 'resolve': {
    const n = Number(positional[1])
    const s = read()
    const before = s.open.length
    const item = s.open.find((o) => o.n === n)
    s.open = s.open.filter((o) => o.n !== n)
    write(s)
    if (item) appendLedger(`- ${nowISO()} — resolved \`#${n}\`: ${item.text}`)
    out({ ok: true, resolved: before !== s.open.length, openCount: s.open.length })
    break
  }

  case 'tick': {
    const ev = positional[1]
    if (!ev) {
      out({ ok: false, error: `usage: state.mjs tick <${Object.keys(SESSION_CAPS).join('|')}>` })
      process.exit(1)
    }
    const s = read()
    s.session.counts[ev] = (s.session.counts[ev] || 0) + Number(positional[2] || 1)
    write(s)
    const p = pressure(s)
    out({ ok: true, counts: s.session.counts, caps: SESSION_CAPS, pressure: p })
    break
  }

  case 'handoff': {
    const s = read()
    if (!s?.work) {
      out({ ok: false, error: 'no active work to hand off' })
      process.exit(1)
    }
    const file = path.join(s.work.dir, 'HANDOFF.md')
    s.session.handoffs = (s.session.handoffs || 0) + 1
    const closing = { ...s.session }
    s.session = { startedAt: nowISO(), counts: {}, handoffs: s.session.handoffs }
    write(s)
    appendLedger(
      `- ${nowISO()} — **handoff #${s.session.handoffs}** at phase \`${s.phase}\`, slice ${s.slice.done}/${s.slice.total}, ${s.open.length} open item(s)`,
    )
    out({
      ok: true,
      handoffFile: file,
      handoffNumber: s.session.handoffs,
      closedSession: closing,
      phase: s.phase,
      slice: s.slice,
      openItems: s.open,
      directive:
        'Write ' +
        file +
        ' NOW, in full, before you do anything else. It must let a fresh session with zero prior context continue without asking the user a single question. ' +
        'Then tell the user to /clear and say "factory resume".',
    })
    break
  }

  case 'finish': {
    const s = read()
    if (!s?.work) {
      out({ ok: false, error: 'no active work' })
      process.exit(1)
    }
    if (s.open.length) {
      out({
        ok: false,
        error: `${s.open.length} open item(s) — resolve them or record why they stay open before finishing`,
        openItems: s.open,
      })
      process.exit(1)
    }
    s.phase = 'done'
    s.history.push({ at: nowISO(), phase: 'done' })
    const done = s.work
    write(s)
    appendLedger(`\n## ${nowISO()} — finished: ${done.title}\n`)
    out({ ok: true, finished: done, ...snapshot() })
    break
  }

  default:
    out({
      usage: [
        'init', 'show', 'start <slug> [--title T]', 'phase <phase>', 'slice <done>/<total>',
        'note <ruling|unfinished|risk|decision|evidence> <text>', 'resolve <n>',
        'tick <read|edit|slice|fix|subagent>', 'handoff', 'finish',
      ],
      phases: PHASES,
      caps: SESSION_CAPS,
      root: ROOT,
    })
}
