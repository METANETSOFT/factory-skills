#!/usr/bin/env node
// factory/state.mjs — the on-disk brain.
//
// Everything the factory knows lives in files, never only in a context window.
// A session can die at any token count and the next one resumes from here with
// zero loss. That is the whole point: context is a cache, the workspace is truth.
//
// The workspace lives under the OS temp directory by default, keyed by the
// project path — see lib/workspace.mjs for why, and for the two opt-outs.
//
// Layout (inside the workspace):
//   FACTORY.md      durable charter: what this product is, how we work
//   state.json      machine state (phase, active work, counters)
//   ledger.md       append-only log of decisions, rulings, unfinished work
//   work/<slug>/    one directory per unit of work
//       RESEARCH.md PRD.md ARCHITECTURE.md PROGRAM-DESIGN.md PLAN.md HANDOFF.md
//       evidence/   verification output, screenshots, logs
//
// Usage:
//   node state.mjs init [--root DIR] [--in-project]
//   node state.mjs show                       → JSON snapshot for the agent
//   node state.mjs start <slug> [--title T]   → begin a unit of work
//   node state.mjs phase <phase>              → advance the pipeline (not `done` — that is `finish`)
//   node state.mjs slice <done>/<total>
//   node state.mjs note <kind> <text...>      → ruling|unfinished|risk|decision|evidence
//   node state.mjs resolve <n>                → close an open unfinished item
//   node state.mjs tick <event> [count]       → count a session event (read|edit|slice|fix|subagent)
//   node state.mjs handoff                    → freeze session, emit handoff path
//   node state.mjs finish                     → close the current work

import fs from 'node:fs'
import path from 'node:path'
import { resolve as resolveWorkspace } from './lib/workspace.ts'
import { NOTE_KINDS, PHASES, SESSION_EVENTS } from './lib/types.ts'
import type {
  NoteKind,
  OpenItem,
  Phase,
  Pressure,
  SessionEvent,
  SessionState,
  State,
  WorkRef,
} from './lib/types.ts'

/** Every phase except `done`. `finish` is the only way into the terminal one. */
const SETTABLE_PHASES: Phase[] = PHASES.filter((p) => p !== 'done')

// A session that has done this much has spent its good tokens. Past these the
// model starts trading quality for closure — the "dumb zone". We hand off
// instead of pushing through, because a handoff costs one file and pushing
// through costs a rewrite.
const SESSION_CAPS: Record<SessionEvent, number> = {
  slice: 3,      // vertical slices completed in one session
  fix: 8,        // review-fix rounds
  edit: 60,      // file edits
  read: 90,      // file reads
  subagent: 12,  // subagents dispatched
}

/** A handled failure: JSON on stdout, non-zero exit, never a stack trace. */
class Fail extends Error {
  payload: Record<string, unknown>
  code: number
  constructor(payload: Record<string, unknown>, code = 1) {
    super(typeof payload['error'] === 'string' ? payload['error'] : 'failed')
    this.payload = payload
    this.code = code
  }
}

const argv = process.argv.slice(2)

interface Flags {
  root?: string
  title?: string
  inProject: boolean
}

/**
 * Split argv into flags and text.
 *
 * The old filter dropped every `--token` AND the token after it, whatever the
 * flag was, so `note ruling never use --force on main` recorded "never use main
 * branch" — the opposite ruling, reported as ok with a sequence number. Only
 * the flags below take a value, an unrecognised `--token` stays in the text,
 * and `--` ends flag parsing for text that genuinely begins with a dash.
 */
function parseArgv(args: readonly string[]): { positional: string[]; flags: Flags; error: string | null } {
  const positional: string[] = []
  const flags: Flags = { inProject: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === undefined) break
    if (a === '--') {
      for (const rest of args.slice(i + 1)) positional.push(rest)
      break
    }
    if (a === '--in-project') {
      flags.inProject = true
      continue
    }
    if (a === '--root' || a === '--title') {
      const value = args[i + 1]
      if (value === undefined) return { positional, flags, error: `${a} needs a value` }
      if (a === '--root') flags.root = value
      else flags.title = value
      i += 1
      continue
    }
    positional.push(a)
  }
  return { positional, flags, error: null }
}

const { positional, flags, error: argvError } = parseArgv(argv)

const P = resolveWorkspace(flags.root, { inProject: flags.inProject })
const ROOT = P.root
const DIR = P.ws
const STATE = P.state
const LEDGER = P.ledger

const nowISO = (): string => new Date().toISOString()

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** The errno of a filesystem failure, or '' when it is not one. */
const errnoOf = (e: unknown): string =>
  typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : ''

function blankState(): State {
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

// --------------------------------------------------------------- reading

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isArray = (v: unknown): v is unknown[] => Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPhase = (v: unknown): v is Phase => PHASES.some((p) => p === v)
const isNoteKind = (v: unknown): v is NoteKind => NOTE_KINDS.some((k) => k === v)
const isSessionEvent = (v: unknown): v is SessionEvent => SESSION_EVENTS.some((e) => e === v)
const isWorkRef = (v: unknown): v is WorkRef | null =>
  v === null ||
  (isRecord(v) && isString(v['slug']) && isString(v['title']) && isString(v['startedAt']) && isString(v['dir']))
const isSlice = (v: unknown): v is { done: number; total: number } =>
  isRecord(v) && isNumber(v['done']) && isNumber(v['total'])

/**
 * Counters are read tolerantly. A file written before `tick` validated its
 * arguments can hold `"read": null` or an invented `"reads": 99`, and calling
 * that whole state unreadable would strand the work it describes. Unknown keys
 * go — no cap ever watched them — and a known one must be a finite number.
 */
function toCounts(v: unknown): Partial<Record<SessionEvent, number>> {
  const counts: Partial<Record<SessionEvent, number>> = {}
  if (!isRecord(v)) return counts
  for (const ev of SESSION_EVENTS) {
    const n = v[ev]
    if (isNumber(n)) counts[ev] = n
  }
  return counts
}

function toSession(v: unknown): SessionState | null {
  if (!isRecord(v)) return null
  const startedAt = v['startedAt']
  const handoffs = v['handoffs']
  if (!isString(startedAt) || !isNumber(handoffs)) return null
  return { startedAt, counts: toCounts(v['counts']), handoffs }
}

function toOpen(v: unknown): OpenItem[] | null {
  if (!isArray(v)) return null
  const items: OpenItem[] = []
  for (const raw of v) {
    if (!isRecord(raw)) return null
    const n = raw['n']
    const kind = raw['kind']
    const text = raw['text']
    const at = raw['at']
    if (!isNumber(n) || !isNoteKind(kind) || !isString(text) || !isString(at)) return null
    items.push({ n, kind, text, at })
  }
  return items
}

function toHistory(v: unknown): Array<{ at: string; phase: Phase }> | null {
  if (!isArray(v)) return null
  const entries: Array<{ at: string; phase: Phase }> = []
  for (const raw of v) {
    if (!isRecord(raw)) return null
    const at = raw['at']
    const phase = raw['phase']
    if (!isString(at) || !isPhase(phase)) return null
    entries.push({ at, phase })
  }
  return entries
}

/**
 * Parsed JSON to a State, or the reason it is not one.
 *
 * An absent field takes the blank default, so a file written by an older
 * version still loads. A field that is present but the wrong shape is reported,
 * never repaired: quietly dropping a malformed `open` entry would lose exactly
 * the Law 3 commitment this file exists to keep.
 */
function toState(v: unknown): { ok: true; state: State } | { ok: false; why: string } {
  if (!isRecord(v)) return { ok: false, why: 'state.json does not hold an object' }
  const blank = blankState()
  const wrong: string[] = []
  const need = <T>(field: string, raw: unknown, ok: (x: unknown) => x is T, fallback: T): T => {
    if (raw === undefined) return fallback
    if (ok(raw)) return raw
    wrong.push(field)
    return fallback
  }
  const session = v['session'] === undefined ? blank.session : toSession(v['session'])
  const open = v['open'] === undefined ? blank.open : toOpen(v['open'])
  const history = v['history'] === undefined ? blank.history : toHistory(v['history'])
  if (session === null) wrong.push('session')
  if (open === null) wrong.push('open')
  if (history === null) wrong.push('history')
  const state: State = {
    version: need('version', v['version'], isNumber, blank.version),
    createdAt: need('createdAt', v['createdAt'], isString, blank.createdAt),
    phase: need('phase', v['phase'], isPhase, blank.phase),
    work: need('work', v['work'], isWorkRef, blank.work),
    slice: need('slice', v['slice'], isSlice, blank.slice),
    session: session ?? blank.session,
    open: open ?? blank.open,
    history: history ?? blank.history,
    seq: need('seq', v['seq'], isNumber, blank.seq),
  }
  if (wrong.length) return { ok: false, why: `state.json field(s) not readable: ${wrong.join(', ')}` }
  return { ok: true, state }
}

/**
 * What is on disk right now.
 *
 * A parse failure is its own case, never a blank state. Returning a fresh
 * object for a damaged file is what turned one truncated write into a wipe:
 * the mutator that read it wrote the blank straight back, and the active work,
 * every open item and the whole history went with it while the command
 * reported ok.
 */
type StateFile = { kind: 'missing' } | { kind: 'ok'; state: State } | { kind: 'corrupt'; detail: string }

function read(): StateFile {
  if (!fs.existsSync(STATE)) return { kind: 'missing' }
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(STATE, 'utf8'))
  } catch (e) {
    return { kind: 'corrupt', detail: message(e) }
  }
  const s = toState(parsed)
  return s.ok ? { kind: 'ok', state: s.state } : { kind: 'corrupt', detail: s.why }
}

/**
 * state.json is unreadable, so refuse rather than write. The damaged file is
 * the only machine-readable record of the active work and every open item, and
 * the ledger beside it is the append-only copy to rebuild from.
 */
function corruptFail(detail: string): Fail {
  return new Fail(
    {
      ok: false,
      error: 'CORRUPT_STATE',
      detail,
      root: ROOT,
      workspace: DIR,
      initialized: false,
      state: STATE,
      ledger: fs.existsSync(LEDGER) ? LEDGER : null,
      directive:
        `state.json at ${STATE} cannot be read (${detail}). Its bytes are left untouched and every factory ` +
        'command that writes will refuse until it is fixed. Rebuild it from that file and ledger.md, or move ' +
        'it aside and re-init deliberately. Do not start new work on top of it — that discards the record.',
    },
    2,
  )
}

/** The state, or a handled failure. Every command that writes goes through here. */
function readState(): State {
  const f = read()
  if (f.kind === 'ok') return f.state
  if (f.kind === 'corrupt') throw corruptFail(f.detail)
  throw new Fail({ ok: false, error: 'not initialized' })
}

/** `start` is the one command allowed to run before `init` — but not on a damaged file. */
function readStateOrBlank(): State {
  const f = read()
  if (f.kind === 'corrupt') throw corruptFail(f.detail)
  return f.kind === 'ok' ? f.state : blankState()
}

// --------------------------------------------------------------- writing

/**
 * Replace state.json in one step.
 *
 * The old write truncated the file in place, so a reader arriving mid-write saw
 * half a JSON document. A temp file plus rename means every reader sees either
 * the whole old file or the whole new one.
 */
function write(s: State): void {
  fs.mkdirSync(DIR, { recursive: true })
  const tmp = `${STATE}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n')
  fs.renameSync(tmp, STATE)   // atomic within the same filesystem
}

/** Synchronous sleep. The point of the lock is that nothing else runs meanwhile. */
const sleep = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Serialise read → mutate → write across processes.
 *
 * Every mutating command reads the file, changes it and writes it back. Two of
 * them at once — an ordinary batch of Bash calls in one message — interleaved,
 * and the loser's change vanished while it still printed ok: measured at 12
 * parallel `note` calls, 9 recorded, two of the survivors sharing one id, so
 * `resolve` would close the wrong commitment. The ledger append happens inside
 * the lock too, so it cannot record something state.json dropped.
 */
function withLock<T>(fn: () => T): T {
  fs.mkdirSync(DIR, { recursive: true })
  const lock = path.join(DIR, '.state.lock')
  const deadline = Date.now() + 10_000
  for (;;) {
    let fd: number
    try {
      fd = fs.openSync(lock, 'wx')   // create-or-fail: the atomic bit
    } catch (e) {
      if (errnoOf(e) !== 'EEXIST') throw e
      // A command killed mid-write leaves the file behind. Reap it rather than
      // wedging the factory for good.
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 30_000) fs.unlinkSync(lock)
      } catch {
        // Someone else reaped it first, which is the outcome we wanted anyway.
      }
      if (Date.now() > deadline) {
        throw new Fail({ ok: false, error: `state.json is locked by another factory command (${lock})` })
      }
      sleep(25)
      continue
    }
    try {
      fs.writeSync(fd, String(process.pid))
      return fn()
    } finally {
      fs.closeSync(fd)
      try {
        fs.unlinkSync(lock)
      } catch {
        // Already reaped as stale; the next writer creates its own.
      }
    }
  }
}

function appendLedger(line: string): void {
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
function pressure(s: State): Pressure {
  const c = s.session.counts
  const over: string[] = []
  const near: string[] = []
  for (const k of SESSION_EVENTS) {
    const cap = SESSION_CAPS[k]
    const v = c[k] ?? 0
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

interface Artifact {
  present: boolean
  bytes?: number
}

function snapshot(s: State | null) {
  if (!s) {
    return {
      root: ROOT,
      workspace: DIR,
      initialized: false,
      directive: 'NOT_INITIALIZED — run `node scripts/state.mjs init` and write FACTORY.md before any build work.',
    }
  }
  const workDir = s.work ? path.join(P.work, s.work.slug) : null
  const artifacts: Record<string, Artifact> = {}
  if (workDir && fs.existsSync(workDir)) {
    for (const f of ['RESEARCH.md', 'PRD.md', 'ARCHITECTURE.md', 'PROGRAM-DESIGN.md', 'PLAN.md', 'HANDOFF.md']) {
      const p = path.join(workDir, f)
      artifacts[f] = fs.existsSync(p) ? { present: true, bytes: fs.statSync(p).size } : { present: false }
    }
  }
  // The lookahead stops below `done`, because `phase done` is refused — pointing
  // at it made the obvious next call an error. `nextAction` names the command
  // that actually closes a unit, the one that checks the open items.
  const i = SETTABLE_PHASES.indexOf(s.phase)
  const nextPhase = i === -1 ? null : SETTABLE_PHASES[i + 1] ?? null
  return {
    root: ROOT,
    workspace: DIR,
    inProject: P.inProject,
    initialized: true,
    charter: fs.existsSync(P.charter) ? P.charter : null,
    phase: s.phase,
    nextPhase,
    nextAction: s.phase === 'done' ? null : nextPhase === null ? 'finish' : `phase ${nextPhase}`,
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

function out(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n')
}

const cmd = positional[0]

try {
  if (argvError) throw new Fail({ ok: false, error: argvError })

  switch (cmd) {
    case 'init': {
      const result = withLock((): { created: boolean; state: State } => {
        const f = read()
        if (f.kind === 'corrupt') throw corruptFail(f.detail)
        if (f.kind === 'ok') return { created: false, state: f.state }
        const s = blankState()
        s.phase = 'research'
        write(s)
        fs.mkdirSync(P.work, { recursive: true })
        appendLedger(`\n## ${nowISO()} — factory initialized\n\nroot: ${ROOT}\nworkspace: ${DIR}\n`)
        return { created: true, state: s }
      })
      if (result.created) out({ ok: true, created: true, ...snapshot(result.state) })
      else out({ ok: true, already: true, ...snapshot(result.state) })
      break
    }

    case 'show': {
      const f = read()
      if (f.kind === 'corrupt') throw corruptFail(f.detail)
      out(snapshot(f.kind === 'ok' ? f.state : null))
      break
    }

    case 'start': {
      const slug = positional[1]
      if (!slug) throw new Fail({ ok: false, error: 'usage: state.mjs start <slug> [--title "..."]' })
      const title = flags.title ?? slug
      const s = withLock((): State => {
        const st = readStateOrBlank()
        const workDir = path.join(P.work, slug)
        fs.mkdirSync(path.join(workDir, 'evidence'), { recursive: true })
        st.work = { slug, title, startedAt: nowISO(), dir: workDir }
        st.phase = 'research'
        st.slice = { done: 0, total: 0 }
        st.session = { startedAt: nowISO(), counts: {}, handoffs: st.session.handoffs }
        st.history.push({ at: nowISO(), phase: 'research' })
        write(st)
        appendLedger(`\n## ${nowISO()} — start: ${title}\n\nslug: \`${slug}\`\nwork dir: \`${workDir}\`\n`)
        return st
      })
      out({ ok: true, ...snapshot(s) })
      break
    }

    case 'phase': {
      const p = positional[1]
      if (!isPhase(p)) throw new Fail({ ok: false, error: `unknown phase "${p ?? ''}"`, valid: SETTABLE_PHASES })
      // `done` belongs to `finish`. Setting it here skipped the open-items guard
      // and the `finished:` ledger entry, so a unit reached the terminal phase
      // with Law 3 commitments still open and nothing in the record closing it.
      if (p === 'done') {
        throw new Fail({
          ok: false,
          error:
            'refusing to set phase `done` directly — run `state.mjs finish`, which enforces the open-items ' +
            'guard and records the completion',
        })
      }
      const s = withLock((): State => {
        const st = readState()
        const from = st.phase
        st.phase = p
        st.history.push({ at: nowISO(), phase: p })
        write(st)
        appendLedger(`- ${nowISO()} — phase: ${from} → ${p}`)
        return st
      })
      out({ ok: true, ...snapshot(s) })
      break
    }

    case 'slice': {
      const m = (positional[1] ?? '').match(/^(\d+)\s*\/\s*(\d+)$/)
      const doneArg = m?.[1]
      const totalArg = m?.[2]
      if (doneArg === undefined || totalArg === undefined) {
        throw new Fail({ ok: false, error: 'usage: state.mjs slice <done>/<total>' })
      }
      const s = withLock((): State => {
        const st = readState()
        st.slice = { done: Number(doneArg), total: Number(totalArg) }
        st.session.counts.slice = (st.session.counts.slice ?? 0) + 1
        write(st)
        appendLedger(`- ${nowISO()} — slice ${st.slice.done}/${st.slice.total} complete`)
        return st
      })
      out({ ok: true, ...snapshot(s) })
      break
    }

    case 'note': {
      const kind = positional[1]
      const text = positional.slice(2).join(' ').trim()
      if (!isNoteKind(kind) || !text) {
        throw new Fail({
          ok: false,
          error: `usage: state.mjs note <${NOTE_KINDS.join('|')}> <text> — for text that starts with a dash, put any flags first and the text after \`--\``,
        })
      }
      const recorded = withLock((): { n: number; openCount: number } => {
        const st = readState()
        st.seq += 1
        const n = st.seq
        if (kind === 'unfinished' || kind === 'risk') st.open.push({ n, kind, text, at: nowISO() })
        write(st)
        appendLedger(`- ${nowISO()} — **${kind}** \`#${n}\`: ${text}`)
        return { n, openCount: st.open.length }
      })
      out({ ok: true, n: recorded.n, kind, openCount: recorded.openCount })
      break
    }

    case 'resolve': {
      const arg = positional[1]
      // A non-numeric argument used to report ok:true having closed nothing.
      const n = arg === undefined ? Number.NaN : Number(arg)
      if (!Number.isInteger(n)) throw new Fail({ ok: false, error: 'usage: state.mjs resolve <n>' })
      const closed = withLock((): { resolved: boolean; openCount: number } => {
        const st = readState()
        const before = st.open.length
        const item = st.open.find((o) => o.n === n)
        st.open = st.open.filter((o) => o.n !== n)
        write(st)
        if (item) appendLedger(`- ${nowISO()} — resolved \`#${n}\`: ${item.text}`)
        return { resolved: before !== st.open.length, openCount: st.open.length }
      })
      out({ ok: true, resolved: closed.resolved, openCount: closed.openCount })
      break
    }

    case 'tick': {
      const ev = positional[1]
      const countArg = positional[2]
      const inc = countArg === undefined ? 1 : Number(countArg)
      // Both operands are checked, like `phase` and `note` already do. An
      // unknown event name landed under a key no cap watches, and a
      // non-numeric count stored NaN — which JSON writes as null, destroying
      // the accumulated total and silently dropping an active HANDOFF_NOW back
      // to CONTINUE. `=== undefined` also keeps an explicit `tick read 0` at 0.
      if (!isSessionEvent(ev) || !Number.isFinite(inc) || inc < 0) {
        throw new Fail({ ok: false, error: `usage: state.mjs tick <${Object.keys(SESSION_CAPS).join('|')}> [count]` })
      }
      const ticked = withLock((): { counts: Partial<Record<SessionEvent, number>>; pressure: Pressure } => {
        const st = readState()
        st.session.counts[ev] = (st.session.counts[ev] ?? 0) + inc
        write(st)
        return { counts: st.session.counts, pressure: pressure(st) }
      })
      out({ ok: true, counts: ticked.counts, caps: SESSION_CAPS, pressure: ticked.pressure })
      break
    }

    case 'handoff': {
      const frozen = withLock(() => {
        const st = readState()
        const work = st.work
        if (!work) throw new Fail({ ok: false, error: 'no active work to hand off' })
        const file = path.join(work.dir, 'HANDOFF.md')
        st.session.handoffs += 1
        const closing = { ...st.session }
        st.session = { startedAt: nowISO(), counts: {}, handoffs: st.session.handoffs }
        write(st)
        appendLedger(
          `- ${nowISO()} — **handoff #${st.session.handoffs}** at phase \`${st.phase}\`, slice ${st.slice.done}/${st.slice.total}, ${st.open.length} open item(s)`,
        )
        return {
          file,
          number: st.session.handoffs,
          closing,
          phase: st.phase,
          slice: st.slice,
          openItems: st.open,
        }
      })
      out({
        ok: true,
        handoffFile: frozen.file,
        handoffNumber: frozen.number,
        closedSession: frozen.closing,
        phase: frozen.phase,
        slice: frozen.slice,
        openItems: frozen.openItems,
        directive:
          'Write ' +
          frozen.file +
          ' NOW, in full, before you do anything else. It must let a fresh session with zero prior context continue without asking the user a single question. ' +
          'Then tell the user to /clear and say "factory resume".',
      })
      break
    }

    case 'finish': {
      const closed = withLock((): { work: WorkRef; state: State } => {
        const st = readState()
        const work = st.work
        if (!work) throw new Fail({ ok: false, error: 'no active work' })
        if (st.open.length) {
          throw new Fail({
            ok: false,
            error: `${st.open.length} open item(s) — resolve them or record why they stay open before finishing`,
            openItems: st.open,
          })
        }
        st.phase = 'done'
        st.history.push({ at: nowISO(), phase: 'done' })
        write(st)
        appendLedger(`\n## ${nowISO()} — finished: ${work.title}\n`)
        return { work, state: st }
      })
      out({ ok: true, finished: closed.work, ...snapshot(closed.state) })
      break
    }

    default:
      out({
        usage: [
          'init', 'show', 'start <slug> [--title T]', 'phase <phase>', 'slice <done>/<total>',
          'note <ruling|unfinished|risk|decision|evidence> <text>', 'resolve <n>',
          'tick <read|edit|slice|fix|subagent> [count]', 'handoff', 'finish',
        ],
        phases: SETTABLE_PHASES,
        caps: SESSION_CAPS,
        root: ROOT,
      })
  }
} catch (e) {
  if (e instanceof Fail) {
    out(e.payload)
    process.exit(e.code)
  }
  // Anything unexpected still leaves JSON on stdout. A caller that parses us
  // must never get an empty string and a stack trace on stderr — that is how
  // `note`, `slice`, `tick` and `resolve` used to fail before `init`.
  if (e instanceof Error && e.stack) process.stderr.write(e.stack + '\n')
  out({ ok: false, error: message(e) })
  process.exit(1)
}
