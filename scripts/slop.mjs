#!/usr/bin/env node
// factory/slop.mjs — the measured structural checkpoint.
//
// Why this exists rather than another paragraph of instructions:
// SlopCodeBench (arXiv:2603.24755) chained agents' own output forward across 93
// checkpoints and found structural erosion rising in 80% of trajectories and
// verbosity in 89.8%. Their `anti_slop` PROMPT lowered the starting point by
// ~34% and then degradation resumed at exactly the same per-checkpoint rate,
// for +47.9% spend and no significant pass-rate change. Instructions move the
// intercept, not the slope. Slope control needs a number with a threshold.
//
// Two metrics, both from that paper:
//   erosion   = share of total complexity mass sitting in functions with CC > 10
//               (mass per callable = cyclomaticComplexity × sqrt(SLOC))
//   verbosity = (slop-flagged lines ∪ duplicated lines) / LOC, clamped to [0,1]
//
// Reference points from the paper: maintained human repos ≈ erosion 0.31 /
// verbosity 0.11; agent trajectories drift to ≈ 0.68 / 0.32.
//
// HONEST LIMITS: complexity here is computed by keyword counting over
// brace/indent-delimited bodies, not a real parser. It is a trend instrument.
// Compare a scan against this project's own baseline; do not read one absolute
// number as a verdict, and never treat a good score as evidence that the code
// works — that is what `verify` is for.
//
// Usage:
//   node slop.mjs scan [path...] [--json] [--top N]
//   node slop.mjs baseline [path...]        record the current numbers as this project's line
//   node slop.mjs check [path...]           scan, compare to baseline, exit 1 if a threshold is crossed

import fs from 'node:fs'
import path from 'node:path'
import { findRoot, paths as workspacePaths } from './lib/workspace.mjs'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(`--${f}`)
const flagVal = (f, d) => {
  const i = argv.indexOf(`--${f}`)
  return i === -1 ? d : argv[i + 1]
}
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--top'))

const cmd = positional[0] || 'scan'
const targets = positional.slice(1)

const EXT = {
  '.ts': 'c', '.tsx': 'c', '.js': 'c', '.jsx': 'c', '.mjs': 'c', '.cjs': 'c',
  '.go': 'c', '.java': 'c', '.c': 'c', '.h': 'c', '.cc': 'c', '.cpp': 'c', '.cs': 'c',
  '.rs': 'c', '.swift': 'c', '.kt': 'c', '.php': 'c', '.scala': 'c',
  '.py': 'py', '.rb': 'py',
}

const SKIP_DIR = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'vendor', 'target', '.next',
  'coverage', '__pycache__', '.venv', 'venv', '.factory', '.cache', 'bin', 'obj',
])

const isTestPath = (p) => /(^|[\/.])(test|tests|spec|__tests__|e2e|fixtures?)([\/.]|$)/i.test(p)

const ROOT = findRoot()
const WS = workspacePaths(ROOT)

function walk(dir, acc = []) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue
    const p = path.join(dir, e.name)
    let isDir = e.isDirectory()
    if (!isDir && e.isSymbolicLink()) {
      try {
        isDir = fs.statSync(p).isDirectory()
      } catch {
        continue
      }
    }
    if (isDir) {
      if (SKIP_DIR.has(e.name)) continue
      walk(p, acc)
    } else if (EXT[path.extname(e.name)]) {
      acc.push(p)
    }
  }
  return acc
}

function collectFiles() {
  const roots = targets.length ? targets : [ROOT]
  const out = []
  for (const t of roots) {
    const p = path.resolve(t)
    if (!fs.existsSync(p)) continue
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else if (EXT[path.extname(p)]) out.push(p)
  }
  // Test files are excluded: their branchiness is legitimate and would mask
  // erosion in the code that actually ships.
  return [...new Set(out)].filter((f) => !isTestPath(path.relative(ROOT, f)))
}

// --- lexing ------------------------------------------------------------------

// A cursor over the source that writes a parallel, code-only buffer of exactly
// the same length. Blanked characters become spaces, newlines are preserved, so
// every downstream line and column still lines up with the original file.
class Blanker {
  constructor(src) {
    this.src = src
    this.out = new Array(src.length)
    this.i = 0
    this.lastKept = null // last non-space character actually kept, for regex disambiguation
  }
  get done() {
    return this.i >= this.src.length
  }
  at(k = 0) {
    return this.src[this.i + k]
  }
  keep(n = 1) {
    while (n-- > 0 && !this.done) {
      const c = this.src[this.i]
      this.out[this.i] = c
      if (!/\s/.test(c)) this.lastKept = c
      this.i++
    }
  }
  blank(n = 1) {
    while (n-- > 0 && !this.done) {
      const c = this.src[this.i]
      this.out[this.i] = c === '\n' ? '\n' : ' '
      this.i++
    }
  }
  blankWhile(pred) {
    while (!this.done && pred()) this.blank()
  }
  /** Blank an escape pair so a backslash cannot hide the closing delimiter. */
  blankEscape() {
    if (this.at() === '\\') {
      this.blank(2)
      return true
    }
    return false
  }
  result() {
    return this.out.join('')
  }
}

const blankLineComment = (b) => b.blankWhile(() => b.at() !== '\n')

function blankBlockComment(b) {
  b.blank(2)
  while (!b.done && !(b.at() === '*' && b.at(1) === '/')) b.blank()
  b.blank(2)
}

/** A single- or double-quoted string. `bounded` stops at a newline (Python). */
function blankQuoted(b, quote, bounded) {
  b.blank()
  while (!b.done && b.at() !== quote) {
    if (bounded && b.at() === '\n') return
    if (b.blankEscape()) continue
    b.blank()
  }
  b.blank()
}

function blankTripleQuoted(b, quote) {
  const close = quote.repeat(3)
  b.blank(3)
  while (!b.done && b.src.slice(b.i, b.i + 3) !== close) b.blank()
  b.blank(3)
}

/** A template literal: the text is blanked, the code inside ${...} is kept. */
function blankTemplate(b) {
  b.blank()
  let depth = 0
  while (!b.done) {
    if (b.blankEscape()) continue
    if (depth === 0) {
      if (b.at() === '`') break
      if (b.at() === '$' && b.at(1) === '{') {
        b.blank()
        b.keep()
        depth = 1
        continue
      }
      b.blank()
      continue
    }
    if (b.at() === '{') depth++
    else if (b.at() === '}') depth--
    b.keep()
  }
  b.blank()
}

/** A regex literal, including its character classes and trailing flags. */
function blankRegex(b) {
  b.blank()
  let inClass = false
  while (!b.done && b.at() !== '\n') {
    if (b.blankEscape()) continue
    const c = b.at()
    if (c === '[') inClass = true
    else if (c === ']') inClass = false
    else if (c === '/' && !inClass) break
    b.blank()
  }
  if (b.at() === '/') b.blank()
  b.blankWhile(() => /[a-z]/.test(b.at() || ''))
}

// A `/` opens a regex only where a value cannot already be present — otherwise
// it is division. Getting this wrong silently blanks real code, so the test
// suite pins it with a regex containing braces.
const REGEX_MAY_FOLLOW = new Set('(,=:[!&|?{};+-*%~^<>'.split(''))

function blankPython(b) {
  while (!b.done) {
    const c = b.at()
    if (c === '#') {
      blankLineComment(b)
    } else if ((c === '"' || c === "'") && b.at(1) === c && b.at(2) === c) {
      blankTripleQuoted(b, c)
    } else if (c === '"' || c === "'") {
      blankQuoted(b, c, true)
    } else {
      b.keep()
    }
  }
}

function blankCLike(b) {
  while (!b.done) {
    const c = b.at()
    if (c === '/' && b.at(1) === '/') blankLineComment(b)
    else if (c === '/' && b.at(1) === '*') blankBlockComment(b)
    else if (c === '"' || c === "'") blankQuoted(b, c, false)
    else if (c === '`') blankTemplate(b)
    else if (c === '/' && (b.lastKept === null || REGEX_MAY_FOLLOW.has(b.lastKept))) blankRegex(b)
    else b.keep()
  }
}

// Blank every string, template literal, comment and regex literal, keeping the
// file's exact length and line structure. Everything downstream — brace
// balancing, keyword counting — then operates on real code only.
//
// This exists because line-wise regex stripping cannot see a template literal or
// block comment that spans lines, so one unbalanced brace inside either makes a
// function body run to the end of the file. That failure inflates a function's
// complexity into the hundreds and makes the erosion number a lie.
function blankNonCode(src, lang) {
  const b = new Blanker(src)
  if (lang === 'py') blankPython(b)
  else blankCLike(b)
  return b.result()
}

function isComment(line, lang) {
  const t = line.trim()
  if (lang === 'py') return t.startsWith('#')
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/')
}

const BRANCH_C = /\b(if|else\s+if|for|while|case|catch|switch)\b|&&|\|\||\?\s*[^:]*:/g
const BRANCH_PY = /\b(if|elif|for|while|except|and|or)\b/g

// Takes lines from the BLANKED source, so a branch keyword inside a string or a
// comment cannot inflate the count.
function complexityOf(bodyLines, lang) {
  let cc = 1
  let sloc = 0
  for (const l of bodyLines) {
    if (!l.trim()) continue
    sloc += 1
    const m = l.match(lang === 'py' ? BRANCH_PY : BRANCH_C)
    if (m) cc += m.length
  }
  return { cc, sloc }
}

// Function extraction. Brace balancing for C-like, indentation for Python-like.
const FN_C =
  /(?:^|\s)(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|func\s+(?:\([^)]*\)\s*)?([A-Za-z_$][\w$]*)|(?:public|private|protected|static|\s)*[A-Za-z_$][\w$<>,\[\]\s]*\s+([A-Za-z_$][\w$]*)\s*\([^;{]*\)\s*\{)/
const FN_PY = /^(\s*)(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/

/** Python bodies are bounded by indentation: the block ends at the first
 *  non-blank line indented no further than the `def`. */
function pythonFunctions(file, lines) {
  const fns = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FN_PY)
    if (!m) continue
    const indent = m[1].length
    const body = []
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() && lines[j].search(/\S/) <= indent) break
      body.push(lines[j])
    }
    const { cc, sloc } = complexityOf(body, 'py')
    fns.push({ name: m[2], file, line: i + 1, cc, sloc })
  }
  return fns
}

/** Locate the `{` that opens a body, or null when there is none.
 *
 *  Only a brace-bodied function has a body to measure. An expression arrow
 *  (`const f = (x) => x + 1`) has none, and balancing from its line would
 *  swallow the NEXT function's braces and report its complexity here — which is
 *  how a one-line helper ends up reported at CC 30.
 */
function findBodyStart(lines, declLine, match) {
  const LOOKAHEAD = 4
  for (let j = declLine; j < Math.min(declLine + LOOKAHEAD, lines.length); j++) {
    const from = j === declLine ? Math.max(match.index + match[0].length - 1, 0) : 0
    const seg = lines[j].slice(from)
    const brace = seg.indexOf('{')
    const semi = seg.indexOf(';')
    if (brace !== -1 && (semi === -1 || brace < semi)) return { line: j, col: from + brace }
    if (semi !== -1) return null
    // Keep looking on the next line only when this one clearly continues — a
    // dangling parameter list, or an arrow whose body opens on the line below.
    if (!/[(,]\s*$|=>\s*$/.test(seg)) return null
  }
  return null
}

/** Read a brace-balanced body. Returns null when the braces never balance,
 *  which means the lexer lost track on minified or exotic source. Skipping is
 *  correct there: a fabricated number is worse than a missing one. */
function readBracedBody(lines, start) {
  let depth = 0
  let started = false
  const body = []
  for (let j = start.line; j < lines.length; j++) {
    const from = j === start.line ? start.col : 0
    for (let k = from; k < lines[j].length; k++) {
      const ch = lines[j][k]
      if (ch === '{') {
        depth++
        started = true
      } else if (ch === '}') depth--
    }
    if (j > start.line) body.push(lines[j])
    if (started && depth <= 0) return { body, endLine: j }
  }
  return null
}

function cLikeFunctions(file, lines) {
  const fns = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FN_C)
    if (!m) continue
    const name = m[1] || m[2] || m[3] || m[4]
    if (!name) continue
    const start = findBodyStart(lines, i, m)
    if (!start) continue
    const read = readBracedBody(lines, start)
    if (!read) continue
    const { cc, sloc } = complexityOf(read.body, 'c')
    if (sloc >= 2) fns.push({ name, file, line: i + 1, cc, sloc })
    i = read.endLine
  }
  return fns
}

function functionsIn(file, blankedLines) {
  const lang = EXT[path.extname(file)]
  return lang === 'py' ? pythonFunctions(file, blankedLines) : cLikeFunctions(file, blankedLines)
}

// --- slop line patterns ------------------------------------------------------
// Each rule names the behaviour it catches. Rules are deliberately conservative;
// a false positive here costs a pointless refactor, so under-flag rather than over-flag.
const RULES = [
  { id: 'placeholder', re: /\b(TODO|FIXME|XXX)\b|\bnot implemented\b|\bimplement(ation)? (here|later)\b/i, why: 'placeholder left in delivered code' },
  { id: 'rest-unchanged', re: /(\.\.\.|…)\s*(rest|remaining|other|existing)\s+(of\s+)?(the\s+)?(code|implementation|file|unchanged)/i, why: 'truncated output pretending to be code' },
  { id: 'any-cast', re: /\bas\s+any\b|:\s*any\b|@ts-ignore|@ts-nocheck|#\s*type:\s*ignore|\beslint-disable\b/, why: 'type check suppressed rather than satisfied' },
  { id: 'empty-catch', re: /catch\s*(\([^)]*\))?\s*\{\s*\}|except[^:]*:\s*pass\b/, why: 'exception swallowed' },
  { id: 'rethrow-only', re: /catch\s*\(\s*(\w+)\s*\)\s*\{\s*(console\.\w+\([^)]*\);?\s*)?throw\s+\1\s*;?\s*\}/, why: 'try/catch that only rethrows adds noise, not handling' },
  { id: 'narration-comment', re: /^\s*(?:\/\/|#)\s*(?:step\s*\d|first,|next,|then,|now (?:we|let)|finally,|this (?:function|method|code) (?:will|does))/i, why: 'step-by-step narration comment — a reviewer tell' },
  { id: 'emoji-comment', re: /^\s*(?:\/\/|#|\*)\s*.*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, why: 'emoji in a code comment — reviewers treat this as a machine-authored guarantee' },
  { id: 'defensive-noise', re: /if\s*\(\s*!?\w+\s*(===?\s*(null|undefined)\s*)?\)\s*\{?\s*return\s*(null|undefined|\[\]|\{\}|false)\s*;?\s*\}?\s*\/\/\s*(just in case|safety|defensive)/i, why: 'defensive branch with no caller that needs it' },
  { id: 'sleep-bandaid', re: /setTimeout\s*\(\s*[^,]*,\s*\d{3,}\s*\)|time\.sleep\(\s*\d+/, why: 'timing band-aid in place of a fix' },
]

function analyseFile(file) {
  const lang = EXT[path.extname(file)]
  let src
  try {
    src = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const lines = src.split('\n')
  const blankedLines = blankNonCode(src, lang).split('\n')
  const loc = lines.filter((l) => l.trim() && !isComment(l, lang)).length
  if (!loc) return null

  const flagged = new Set()
  const hits = []
  lines.forEach((l, i) => {
    for (const r of RULES) {
      if (r.re.test(l)) {
        flagged.add(i)
        hits.push({ rule: r.id, file, line: i + 1, why: r.why, text: l.trim().slice(0, 120) })
        break
      }
    }
  })

  return { file, lang, loc, lines, flagged, hits, fns: functionsIn(file, blankedLines) }
}

// Duplicate detection: normalised 6-line shingles seen more than once anywhere
// in the scanned set. Catches the copy-paste growth GitClear measured (duplicated
// blocks up 4–8× since 2020, consolidation edits down from 25% to under 10%).
const SHINGLE = 6
function duplicateLines(files) {
  const seen = new Map()
  const dupPerFile = new Map()
  for (const f of files) {
    const norm = f.lines.map((l) => l.replace(/\s+/g, ' ').trim())
    for (let i = 0; i + SHINGLE <= norm.length; i++) {
      const win = norm.slice(i, i + SHINGLE)
      if (win.filter(Boolean).length < SHINGLE) continue
      const key = win.join('')
      if (key.length < 80) continue
      if (!seen.has(key)) {
        seen.set(key, { file: f.file, i })
        continue
      }
      for (const [file, start] of [[f.file, i], [seen.get(key).file, seen.get(key).i]]) {
        if (!dupPerFile.has(file)) dupPerFile.set(file, new Set())
        const set = dupPerFile.get(file)
        for (let k = 0; k < SHINGLE; k++) set.add(start + k)
      }
    }
  }
  return dupPerFile
}

function scan() {
  const files = collectFiles().map(analyseFile).filter(Boolean)
  if (!files.length) return { ok: false, error: 'no source files found', root: ROOT }

  const dup = duplicateLines(files)
  let loc = 0
  let noisy = 0
  let massTotal = 0
  let massHigh = 0
  const allFns = []
  const allHits = []

  for (const f of files) {
    loc += f.loc
    const d = dup.get(f.file) || new Set()
    const union = new Set([...f.flagged, ...d])
    noisy += union.size
    allHits.push(...f.hits)
    for (const fn of f.fns) {
      const mass = fn.cc * Math.sqrt(Math.max(fn.sloc, 1))
      massTotal += mass
      if (fn.cc > 10) massHigh += mass
      allFns.push({ ...fn, mass })
    }
  }

  allFns.sort((a, b) => b.mass - a.mass)
  const erosion = massTotal ? massHigh / massTotal : 0
  const verbosity = loc ? Math.min(noisy / loc, 1) : 0
  const high = allFns.filter((f) => f.cc > 10)

  const byRule = {}
  for (const h of allHits) byRule[h.rule] = (byRule[h.rule] || 0) + 1

  return {
    ok: true,
    root: ROOT,
    // What was actually measured. Without this the header reports the project
    // root even when the scan was narrowed to one directory, which quietly
    // invites comparing two numbers taken over different file sets.
    scanned: targets.length ? targets.map((t) => path.resolve(t)) : [ROOT],
    files: files.length,
    loc,
    // Erosion is complexity-mass weighted, so in a small codebase two or three
    // heavy functions dominate the ratio. Say so rather than letting a noisy
    // number be read as a verdict.
    smallSample: files.length < 20 || allFns.length < 30,
    erosion: Number(erosion.toFixed(4)),
    verbosity: Number(verbosity.toFixed(4)),
    highComplexityCount: high.length,
    maxComplexity: allFns.length ? allFns.reduce((m, f) => Math.max(m, f.cc), 0) : 0,
    reference: { humanRepos: { erosion: 0.31, verbosity: 0.11 }, agentDrift: { erosion: 0.68, verbosity: 0.32 } },
    worst: allFns.slice(0, Number(flagVal('top', 10))).map((f) => ({
      name: f.name,
      at: `${path.relative(ROOT, f.file)}:${f.line}`,
      cc: f.cc,
      sloc: f.sloc,
    })),
    ruleHits: byRule,
    examples: allHits.slice(0, 15).map((h) => ({ rule: h.rule, at: `${path.relative(ROOT, h.file)}:${h.line}`, why: h.why, text: h.text })),
  }
}

const BASELINE = WS.baseline

function report(r) {
  if (has('json')) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n')
    return
  }
  if (!r.ok) {
    process.stdout.write(`slop: ${r.error}\n`)
    return
  }
  const L = []
  const scope = (r.scanned || [r.root]).map((s) => path.relative(r.root, s) || '.').join(' ')
  L.push(`slop scan @ ${r.root}${scope === '.' ? '' : `  (scope: ${scope})`}`)
  L.push(`${r.files} files, ${r.loc} LOC`)
  if (scope !== '.') L.push('scoped scan — do not compare this against a baseline taken over the whole project')
  L.push(`erosion   ${r.erosion.toFixed(3)}   (human repos ~0.31, agent drift ~0.68)`)
  L.push(`verbosity ${r.verbosity.toFixed(3)}   (human repos ~0.11, agent drift ~0.32)`)
  L.push(`functions with CC>10: ${r.highComplexityCount}   max CC: ${r.maxComplexity}`)
  if (r.smallSample) L.push('note: small sample — erosion is mass-weighted, so a couple of heavy functions dominate it here. Track the trend against your own baseline, not the absolute number.')
  if (r.delta) {
    L.push('')
    L.push(`vs baseline (${r.delta.baselineAt}):`)
    L.push(`  erosion   ${r.delta.erosion >= 0 ? '+' : ''}${r.delta.erosion.toFixed(3)}`)
    L.push(`  verbosity ${r.delta.verbosity >= 0 ? '+' : ''}${r.delta.verbosity.toFixed(3)}`)
    L.push(`  LOC       ${r.delta.loc >= 0 ? '+' : ''}${r.delta.loc}`)
  }
  if (r.verdict) {
    L.push('')
    L.push(r.verdict.pass ? 'PASS' : 'CONSOLIDATE')
    for (const b of r.verdict.breaches) L.push(`  - ${b}`)
    if (!r.verdict.pass) {
      L.push('')
      L.push('This is a slope signal, not a style opinion. Before adding more features, take one')
      L.push('consolidation pass over the functions below and report lines DELETED, not added.')
    }
  }
  if (r.worst?.length) {
    L.push('')
    L.push('heaviest callables (complexity mass):')
    for (const w of r.worst) L.push(`  CC ${String(w.cc).padStart(3)}  ${String(w.sloc).padStart(4)} sloc  ${w.name}  ${w.at}`)
  }
  if (Object.keys(r.ruleHits || {}).length) {
    L.push('')
    L.push('flagged patterns: ' + Object.entries(r.ruleHits).map(([k, v]) => `${k}×${v}`).join('  '))
    for (const e of (r.examples || []).slice(0, 6)) L.push(`  ${e.at}  [${e.rule}] ${e.why}`)
  }
  process.stdout.write(L.join('\n') + '\n')
}

switch (cmd) {
  case 'baseline': {
    const r = scan()
    if (!r.ok) {
      report(r)
      process.exit(1)
    }
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true })
    const rec = { at: new Date().toISOString(), erosion: r.erosion, verbosity: r.verbosity, loc: r.loc, files: r.files }
    fs.writeFileSync(BASELINE, JSON.stringify(rec, null, 2) + '\n')
    report({ ...r, baselineWritten: BASELINE })
    process.stdout.write(`\nbaseline written: ${BASELINE}\n`)
    break
  }

  case 'check': {
    const r = scan()
    if (!r.ok) {
      report(r)
      process.exit(1)
    }
    let base = null
    if (fs.existsSync(BASELINE)) {
      try {
        base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
      } catch {}
    }
    const breaches = []
    if (base) {
      r.delta = {
        baselineAt: base.at,
        erosion: r.erosion - base.erosion,
        verbosity: r.verbosity - base.verbosity,
        loc: r.loc - base.loc,
      }
      // Thresholds are drift-relative on purpose: a legacy codebase starts high
      // and what matters is whether this session made it worse.
      if (r.delta.erosion > 0.05) breaches.push(`erosion rose ${r.delta.erosion.toFixed(3)} since baseline (limit 0.05)`)
      if (r.delta.verbosity > 0.03) breaches.push(`verbosity rose ${r.delta.verbosity.toFixed(3)} since baseline (limit 0.03)`)
    } else {
      breaches.push('no baseline recorded — run `slop.mjs baseline` before implementing so drift is measurable')
    }
    if (r.erosion > 0.68) breaches.push(`erosion ${r.erosion.toFixed(3)} is at the measured agent-drift level (0.68)`)
    if (r.verbosity > 0.32) breaches.push(`verbosity ${r.verbosity.toFixed(3)} is at the measured agent-drift level (0.32)`)
    if (r.ruleHits?.placeholder) breaches.push(`${r.ruleHits.placeholder} placeholder marker(s) in delivered code — Law 4`)
    if (r.ruleHits?.['rest-unchanged']) breaches.push(`${r.ruleHits['rest-unchanged']} truncated-code marker(s) — Law 2`)
    r.verdict = { pass: breaches.length === 0, breaches }
    report(r)
    process.exit(breaches.length ? 1 : 0)
  }

  case 'scan':
  default:
    report(scan())
}
