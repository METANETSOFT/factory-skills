#!/usr/bin/env node
// factory/slop.ts — the measured structural checkpoint.
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
//   node slop.ts scan [path...] [--json] [--top N]
//   node slop.ts baseline [path...]        record the current numbers as this project's line
//   node slop.ts check [path...]           scan, compare to baseline, exit 1 if a threshold is crossed

import fs from 'node:fs'
import path from 'node:path'
import { findRoot, paths as workspacePaths } from './lib/workspace.ts'
import type { FunctionMetric, RuleHit, ScanResult, SlopBaseline } from './lib/types.ts'

const argv = process.argv.slice(2)
const has = (f: string): boolean => argv.includes(`--${f}`)
const flagVal = (f: string, d: string): string => {
  // Both spellings, and a trailing `--flag` with nothing after it falls back to
  // the default: `--top=5` used to be silently ignored, and a bare `--top`
  // returned undefined.
  const eq = argv.find((a) => a.startsWith(`--${f}=`))
  if (eq !== undefined) return eq.slice(f.length + 3)
  const i = argv.indexOf(`--${f}`)
  if (i === -1) return d
  return argv[i + 1] ?? d
}
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--top'))

const cmd = positional[0] || 'scan'
const targets = positional.slice(1)

// How many callables the report lists. Validated here rather than at the point
// of use: `--top` with no number reached slice() as NaN, slice(0, NaN) returns
// [], and the heaviest-callables section then vanished from the report with exit
// 0 — while `check` still told the reader to consolidate "the functions below".
const topN = ((): number => {
  const n = Number(flagVal('top', '10'))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10
})()

type Lang = 'c' | 'py'

const EXT: Record<string, Lang> = {
  '.ts': 'c', '.tsx': 'c', '.js': 'c', '.jsx': 'c', '.mjs': 'c', '.cjs': 'c',
  '.go': 'c', '.java': 'c', '.c': 'c', '.h': 'c', '.cc': 'c', '.cpp': 'c', '.cs': 'c',
  '.rs': 'c', '.swift': 'c', '.kt': 'c', '.php': 'c', '.scala': 'c',
  '.py': 'py', '.rb': 'py',
}

const SKIP_DIR = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'vendor', 'target', '.next',
  'coverage', '__pycache__', '.venv', 'venv', '.factory', '.cache', 'bin', 'obj',
])

const isTestPath = (p: string): boolean => /(^|[\/.])(test|tests|spec|__tests__|e2e|fixtures?)([\/.]|$)/i.test(p)

const ROOT = findRoot()
const WS = workspacePaths(ROOT)

function walk(dir: string, acc: string[] = []): string[] {
  let entries
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

function collectFiles(): string[] {
  const roots = targets.length ? targets : [ROOT]
  const out: string[] = []
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

const WORD_CHAR = /[A-Za-z0-9_$]/

// A cursor over the source that writes a parallel, code-only buffer of exactly
// the same length. Blanked characters become spaces, newlines are preserved, so
// every downstream line and column still lines up with the original file.
class Blanker {
  src: string
  out: string[]
  i: number
  lastKept: string | null
  /** Last whole identifier or keyword kept, for the `return /re/` case. */
  lastKeptWord: string
  inWord: boolean
  /** Set by preserving() for the span of one walker: blank() then emits the
   *  raw character instead of a blank, so the rule scan keeps string and
   *  template text readable. Never set pass-wide — the regex and mention
   *  walkers run through the same blank() and must keep blanking. */
  preserve: boolean

  constructor(src: string) {
    this.src = src
    this.out = new Array<string>(src.length)
    this.i = 0
    this.lastKept = null // last non-space character actually kept, for regex disambiguation
    this.lastKeptWord = ''
    this.inWord = false
    this.preserve = false
  }
  get done(): boolean {
    return this.i >= this.src.length
  }
  at(k = 0): string | undefined {
    return this.src[this.i + k]
  }
  keep(n = 1): void {
    while (n-- > 0 && !this.done) {
      const c = this.at()
      if (c === undefined) return
      this.out[this.i] = c
      const space = /\s/.test(c)
      if (!space) this.lastKept = c
      // The word is tracked as well as the character because `return /re/` ends
      // in `n`, which is not punctuation — see REGEX_MAY_FOLLOW_WORD.
      if (WORD_CHAR.test(c)) {
        this.lastKeptWord = this.inWord ? this.lastKeptWord + c : c
        this.inWord = true
      } else {
        // Whitespace ends the word without erasing it; anything else means the
        // next `/` follows punctuation, not a keyword.
        if (!space) this.lastKeptWord = ''
        this.inWord = false
      }
      this.i++
    }
  }
  /** Keep the characters but do not let them pose as code context: string and
   *  comment text kept for the rule scan must not influence the regex-vs-
   *  division disambiguation, exactly as if it had been blanked. */
  keepRaw(n = 1): void {
    while (n-- > 0 && !this.done) {
      const c = this.at()
      if (c === undefined) return
      this.out[this.i] = c
      this.i++
    }
  }
  blank(n = 1): void {
    while (n-- > 0 && !this.done) {
      const c = this.at()
      if (c === undefined) return
      this.out[this.i] = this.preserve || c === '\n' ? c : ' '
      this.i++
    }
  }
  blankWhile(pred: () => boolean): void {
    while (!this.done && pred()) this.blank()
  }
  /** Blank an escape pair so a backslash cannot hide the closing delimiter. */
  blankEscape(): boolean {
    if (this.at() === '\\') {
      this.blank(2)
      return true
    }
    return false
  }
  result(): string {
    return this.out.join('')
  }
}

/** Run a walker with blank() emitting the raw character instead of a blank:
 *  the span's text stays readable for the rule scan, while the walk itself is
 *  unchanged and still bounds the span. Scoped to one walker on purpose — a
 *  pass-wide flag would reach the regex and mention walkers too, and those
 *  must keep blanking. */
function preserving(b: Blanker, walk: () => void): void {
  const was = b.preserve
  b.preserve = true
  walk()
  b.preserve = was
}

const blankLineComment = (b: Blanker): void => b.blankWhile(() => b.at() !== '\n')

function blankBlockComment(b: Blanker): void {
  b.blank(2)
  while (!b.done && !(b.at() === '*' && b.at(1) === '/')) b.blank()
  b.blank(2)
}

/** A single- or double-quoted string. Always stops at a newline.
 *
 *  Every language in EXT forbids a raw newline inside one — multi-line text is a
 *  template literal or a triple-quoted string, and those are handled separately.
 *  Running unbounded meant a single stray quote (an apostrophe in JSX text, or a
 *  quote inside a regex the lexer had already mistaken for division) blanked the
 *  file from there to EOF, so every function after it disappeared from the
 *  measurement and `check` passed a tree it had not actually measured. There is
 *  deliberately no flag to turn the bound off again. */
function blankQuoted(b: Blanker, quote: string): void {
  b.blank()
  while (!b.done && b.at() !== quote) {
    if (b.at() === '\n') return
    if (b.blankEscape()) continue
    b.blank()
  }
  b.blank()
}

function blankTripleQuoted(b: Blanker, quote: string): void {
  const close = quote.repeat(3)
  b.blank(3)
  while (!b.done && b.src.slice(b.i, b.i + 3) !== close) b.blank()
  b.blank(3)
}

/** A template literal: the text is blanked, the code inside ${...} is kept. */
function blankTemplate(b: Blanker): void {
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
function blankRegex(b: Blanker): void {
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

// The same rule for keywords, which the character test cannot see: `return /re/`
// ends in `n`, so the `/` was read as division, the regex body was read as code,
// and a quote inside it (`/^'[^']*'$/`) opened a string that ran to the end of
// the file. A bare identifier, a number, `)` or `]` stay deliberately on the
// division path — `)` is genuinely ambiguous (`(a+b)/c` against
// `if (x) /re/.test(y)`), and for a trend instrument silently blanking real code
// is the worse error.
const REGEX_MAY_FOLLOW_WORD = new Set([
  'return', 'typeof', 'case', 'in', 'of', 'instanceof', 'new', 'delete',
  'void', 'await', 'yield', 'do', 'else', 'throw',
])

// The code-only pass and the rule scan walk the same dispatch chain; what
// differs is what each construct does with its span. The handlers table is
// that difference, so the chain itself exists once per language family.
interface PyHandlers {
  lineComment(b: Blanker): void
  /** A raw string (r, R, or r/b combined, any case) with its quote at `prefix`. */
  raw(b: Blanker, prefix: number): void
  tripleQuoted(b: Blanker, quote: string): void
  quoted(b: Blanker, quote: string): void
}

function blankPython(b: Blanker, h: PyHandlers): void {
  while (!b.done) {
    const c = b.at()
    const raw = rawStringPrefix(b)
    if (c === '#') h.lineComment(b)
    else if (raw > 0) h.raw(b, raw)
    else if ((c === '"' || c === "'") && b.at(1) === c && b.at(2) === c) h.tripleQuoted(b, c)
    else if (c === '"' || c === "'") h.quoted(b, c)
    else b.keep()
  }
}

interface CLikeHandlers {
  lineComment(b: Blanker): void
  blockComment(b: Blanker): void
  quoted(b: Blanker, quote: string): void
  template(b: Blanker): void
  regex(b: Blanker): void
}

function blankCLike(b: Blanker, h: CLikeHandlers): void {
  while (!b.done) {
    const c = b.at()
    if (c === '/' && b.at(1) === '/') h.lineComment(b)
    else if (c === '/' && b.at(1) === '*') h.blockComment(b)
    else if (c === '"' || c === "'") h.quoted(b, c)
    else if (c === '`') h.template(b)
    else if (c === '/' && (b.lastKept === null || REGEX_MAY_FOLLOW.has(b.lastKept) || REGEX_MAY_FOLLOW_WORD.has(b.lastKeptWord))) h.regex(b)
    else b.keep()
  }
}

// --- mention blanking --------------------------------------------------------
// The rule scan needs a different cut of the source than the complexity scan.
// Comments and strings must stay READABLE — a real "TODO:" lives in a comment,
// and a thrown "not implemented" error is a genuine placeholder — but a marker
// that only ever appears as its own DEFINITION is not a violation. Two shapes
// are mentions by construction rather than uses:
//   - a regex literal: its text describes what to match. A lint rule table or
//     a marker-detection regex is the marker spelled out, and the lexer already
//     identifies these for the code-only pass above.
//   - a double-quoted span inside a comment: quotation is how prose mentions a
//     phrase. Single quotes are excluded — an apostrophe would blank the rest
//     of every plain-English comment.
//   - a Python raw string: the language has no regex literals, so a raw string
//     is where its patterns live. A lint table written as raw strings is the
//     marker spelled out, the direct analogue of a JS regex literal. Ordinary
//     strings stay readable: raise NotImplementedError("not implemented") is a
//     genuine stub and must keep firing.
// Scanning raw source instead meant slop scanning its own rule table reported
// its placeholder and any-cast pattern definitions as five violations in
// delivered code; any codebase holding a lint table, a marker regex, or docs
// about the markers gets phantom rule hits and an inflated verbosity.

/** A quoted string whose text is KEPT: blankQuoted run by preserving(). The
 *  walk is still needed so a `//` or a quote inside the text cannot be
 *  misread by the surrounding lexer. */
function keepQuoted(b: Blanker, quote: string): void {
  preserving(b, () => blankQuoted(b, quote))
}

function keepTripleQuoted(b: Blanker, quote: string): void {
  const close = quote.repeat(3)
  b.keepRaw(3)
  // A docstring is prose, so a quoted span inside it is a mention and is
  // blanked exactly as in a comment. A genuine stub is not touched: it sits
  // in an ordinary string, not in a quoted span inside a triple-quoted one.
  while (!b.done && b.src.slice(b.i, b.i + 3) !== close) {
    if (b.at() === '"') blankQuotedSpan(b)
    else b.keepRaw()
  }
  b.keepRaw(3)
}

/** A template literal whose text is kept. Code inside ${...} is kept as code
 *  in both modes — blankTemplate already routes it through keep() — so this
 *  is blankTemplate run by preserving(). */
function keepTemplate(b: Blanker): void {
  preserving(b, () => blankTemplate(b))
}

/** Blank a double-quoted span: from the opening quote to the closer, or to the
 *  end of the line when the prose never closes it. */
function blankQuotedSpan(b: Blanker): void {
  b.blank()
  while (!b.done && b.at() !== '"' && b.at() !== '\n') {
    if (b.blankEscape()) continue
    b.blank()
  }
  if (b.at() === '"') b.blank()
}

/** A comment is kept — the comment-targeted rules need its text — but quoted
 *  spans inside it are mentions and are blanked. */
/** A raw string's backslash is literal — it does not hide the closing quote —
 *  so unlike blankQuoted there is no escape pair to skip. The newline bound
 *  still holds: a single-quoted raw string cannot span lines either. */
function blankRawQuoted(b: Blanker, quote: string): void {
  b.blank()
  while (!b.done && b.at() !== quote && b.at() !== '\n') b.blank()
  if (b.at() === quote) b.blank()
}

/** Length of a Python raw-string prefix at the cursor — r, R, or r combined
 *  with b in either order and any case — when a quote follows it. Zero when
 *  this is not one: a word character immediately before means the letter is
 *  the tail of an identifier, not a prefix. The previous SOURCE character is
 *  the test, not lastKept — kept string and comment text must not pose as
 *  code context here any more than in the regex disambiguation above. */
function rawStringPrefix(b: Blanker): number {
  const prev = b.i > 0 ? b.src[b.i - 1] : undefined
  if (prev !== undefined && WORD_CHAR.test(prev)) return 0
  const c0 = b.at()
  const c1 = b.at(1)
  if (c0 === undefined || c1 === undefined) return 0
  if (/[rR]/.test(c0) && (c1 === '"' || c1 === "'")) return 1
  if (
    /[rbRB]/.test(c0) &&
    /[rbRB]/.test(c1) &&
    c0.toLowerCase() !== c1.toLowerCase() &&
    (b.at(2) === '"' || b.at(2) === "'")
  ) {
    return 2
  }
  return 0
}

function keepLineComment(b: Blanker): void {
  while (!b.done && b.at() !== '\n') {
    if (b.at() === '"') blankQuotedSpan(b)
    else b.keepRaw()
  }
}

function keepBlockComment(b: Blanker): void {
  b.keepRaw(2)
  while (!b.done && !(b.at() === '*' && b.at(1) === '/')) {
    if (b.at() === '"') blankQuotedSpan(b)
    else b.keepRaw()
  }
  b.keepRaw(2)
}

/** The code-only pass has no raw-string rule of its own: the prefix letters
 *  are kept, exactly as the plain dispatch kept them before the prefix had a
 *  branch, and the string blanks like any other. */
function rawStringAsCode(b: Blanker, prefix: number): void {
  b.keep(prefix)
  const q = b.at()
  if ((q === '"' || q === "'") && b.at(1) === q && b.at(2) === q) blankTripleQuoted(b, q)
  else if (q === '"' || q === "'") blankQuoted(b, q)
}

/** A raw string blanks whole in the rule scan, prefix included: the language
 *  has no regex literals, so a raw string is where its patterns live. */
function rawStringAsMention(b: Blanker, prefix: number): void {
  b.blank(prefix)
  const q = b.at()
  if ((q === '"' || q === "'") && b.at(1) === q && b.at(2) === q) blankTripleQuoted(b, q)
  else if (q === '"' || q === "'") blankRawQuoted(b, q)
}

const BLANK_C: CLikeHandlers = {
  lineComment: blankLineComment,
  blockComment: blankBlockComment,
  quoted: blankQuoted,
  template: blankTemplate,
  regex: blankRegex,
}

const BLANK_PY: PyHandlers = {
  lineComment: blankLineComment,
  raw: rawStringAsCode,
  tripleQuoted: blankTripleQuoted,
  quoted: blankQuoted,
}

const MENTION_C: CLikeHandlers = {
  lineComment: keepLineComment,
  blockComment: keepBlockComment,
  quoted: keepQuoted,
  template: keepTemplate,
  regex: blankRegex,
}

const MENTION_PY: PyHandlers = {
  lineComment: keepLineComment,
  raw: rawStringAsMention,
  tripleQuoted: keepTripleQuoted,
  quoted: keepQuoted,
}

// Blank every string, template literal, comment and regex literal, keeping the
// file's exact length and line structure. Everything downstream — brace
// balancing, keyword counting — then operates on real code only.
//
// This exists because line-wise regex stripping cannot see a template literal or
// block comment that spans lines, so one unbalanced brace inside either makes a
// function body run to the end of the file. That failure inflates a function's
// complexity into the hundreds and makes the erosion number a lie.
function blankNonCode(src: string, lang: Lang): string {
  const b = new Blanker(src)
  if (lang === 'py') blankPython(b, BLANK_PY)
  else blankCLike(b, BLANK_C)
  return b.result()
}

/** Source for the rule scan: comments and strings kept, regex literals and
 *  quoted mentions blanked. Same length, same line structure as the input. */
function blankMentions(src: string, lang: Lang): string {
  const b = new Blanker(src)
  if (lang === 'py') blankPython(b, MENTION_PY)
  else blankCLike(b, MENTION_C)
  return b.result()
}

function isComment(line: string, lang: Lang): boolean {
  const t = line.trim()
  if (lang === 'py') return t.startsWith('#')
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/')
}

const BRANCH_C = /\b(if|else\s+if|for|while|case|catch|switch)\b|&&|\|\||\?\s*[^:]*:/g
const BRANCH_PY = /\b(if|elif|for|while|except|and|or)\b/g

// Takes lines from the BLANKED source, so a branch keyword inside a string or a
// comment cannot inflate the count.
function complexityOf(bodyLines: string[], lang: Lang): { cc: number; sloc: number } {
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
function pythonFunctions(file: string, lines: string[]): FunctionMetric[] {
  const fns: FunctionMetric[] = []
  for (let i = 0; i < lines.length; i++) {
    const decl = lines[i]
    if (decl === undefined) continue
    const m = decl.match(FN_PY)
    if (!m) continue
    const name = m[2]
    if (name === undefined) continue
    // Group 1 is the leading whitespace, so an absent capture means column zero.
    const indent = m[1]?.length ?? 0
    const body: string[] = []
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]
      if (l === undefined) break
      if (l.trim() && l.search(/\S/) <= indent) break
      body.push(l)
    }
    const { cc, sloc } = complexityOf(body, 'py')
    fns.push({ name, file, line: i + 1, cc, sloc })
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
function findBodyStart(lines: string[], declLine: number, match: RegExpMatchArray): { line: number; col: number } | null {
  const LOOKAHEAD = 4
  // A match from String.prototype.match always carries both; the defaults keep
  // the search starting at the head of the declaration line rather than throwing.
  const matchAt = match.index ?? 0
  const matchLen = match[0]?.length ?? 0
  for (let j = declLine; j < Math.min(declLine + LOOKAHEAD, lines.length); j++) {
    const line = lines[j]
    if (line === undefined) return null
    const from = j === declLine ? Math.max(matchAt + matchLen - 1, 0) : 0
    const seg = line.slice(from)
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
function readBracedBody(lines: string[], start: { line: number; col: number }): { body: string[]; endLine: number } | null {
  let depth = 0
  let started = false
  const body: string[] = []
  for (let j = start.line; j < lines.length; j++) {
    const line = lines[j]
    if (line === undefined) break
    const from = j === start.line ? start.col : 0
    for (let k = from; k < line.length; k++) {
      const ch = line[k]
      if (ch === '{') {
        depth++
        started = true
      } else if (ch === '}') depth--
    }
    if (j > start.line) body.push(line)
    if (started && depth <= 0) return { body, endLine: j }
  }
  return null
}

function cLikeFunctions(file: string, lines: string[]): FunctionMetric[] {
  const fns: FunctionMetric[] = []
  for (let i = 0; i < lines.length; i++) {
    const decl = lines[i]
    if (decl === undefined) continue
    const m = decl.match(FN_C)
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

function functionsIn(file: string, blankedLines: string[]): FunctionMetric[] {
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

interface FileAnalysis {
  file: string
  lang: Lang
  /** Code lines: non-blank and not a comment. Reported, and baselined. */
  loc: number
  /** Every non-blank line — the denominator verbosity is measured against. */
  nonBlank: number
  lines: string[]
  flagged: Set<number>
  hits: RuleHit[]
  fns: FunctionMetric[]
}

function analyseFile(file: string): FileAnalysis | null {
  const lang = EXT[path.extname(file)]
  if (!lang) return null
  let src
  try {
    src = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const lines = src.split('\n')
  const blankedLines = blankNonCode(src, lang).split('\n')
  // Rules run against the mention-blanked source, not the raw text: a marker
  // inside a regex literal or a quoted span in a comment is the pattern being
  // DEFINED or discussed, not a violation left in the code. Without this, slop
  // flagged its own rule table as five placeholders in delivered code.
  const mentionLines = blankMentions(src, lang).split('\n')
  const nonBlank = lines.filter((l) => l.trim()).length
  const loc = lines.filter((l) => l.trim() && !isComment(l, lang)).length
  if (!loc) return null

  const flagged = new Set<number>()
  const hits: RuleHit[] = []
  mentionLines.forEach((l, i) => {
    for (const r of RULES) {
      if (r.re.test(l)) {
        flagged.add(i)
        hits.push({ rule: r.id, file, line: i + 1, why: r.why, text: (lines[i] ?? l).trim().slice(0, 120) })
        break
      }
    }
  })

  return { file, lang, loc, nonBlank, lines, flagged, hits, fns: functionsIn(file, blankedLines) }
}

// Duplicate detection: normalised 6-line shingles seen more than once anywhere
// in the scanned set. Catches the copy-paste growth GitClear measured (duplicated
// blocks up 4–8× since 2020, consolidation edits down from 25% to under 10%).
const SHINGLE = 6
function duplicateLines(files: FileAnalysis[]): Map<string, Set<number>> {
  const seen = new Map<string, { file: string; i: number }>()
  const dupPerFile = new Map<string, Set<number>>()
  for (const f of files) {
    // Comment lines are emptied before shingling, because a repeated licence
    // header or generated banner is not duplicated CODE — the window guard below
    // then discards any window that is wholly or partly comment. Left in, ten
    // copies of a nine-line header put verbosity at 1.000 on a codebase with no
    // duplicate logic in it, and deleting real code only made the number worse.
    const norm = f.lines.map((l) => (isComment(l, f.lang) ? '' : l.replace(/\s+/g, ' ').trim()))
    for (let i = 0; i + SHINGLE <= norm.length; i++) {
      const win = norm.slice(i, i + SHINGLE)
      if (win.filter(Boolean).length < SHINGLE) continue
      const key = win.join('')
      if (key.length < 80) continue
      const first = seen.get(key)
      if (!first) {
        seen.set(key, { file: f.file, i })
        continue
      }
      const spans: Array<[string, number]> = [[f.file, i], [first.file, first.i]]
      for (const [file, start] of spans) {
        let set = dupPerFile.get(file)
        if (!set) {
          set = new Set<number>()
          dupPerFile.set(file, set)
        }
        for (let k = 0; k < SHINGLE; k++) set.add(start + k)
      }
    }
  }
  return dupPerFile
}

function scan(): ScanResult {
  // flatMap rather than map().filter(Boolean): a file that cannot be read, or
  // whose extension is not in EXT, drops out here without the filter having to
  // claim to the checker that it removed the nulls.
  const files = collectFiles().flatMap((f) => analyseFile(f) ?? [])
  if (!files.length) return { ok: false, error: 'no source files found', root: ROOT }

  const dup = duplicateLines(files)
  let loc = 0
  let nonBlank = 0
  let noisy = 0
  let massTotal = 0
  let massHigh = 0
  const allFns: Array<FunctionMetric & { mass: number }> = []
  const allHits: RuleHit[] = []

  for (const f of files) {
    loc += f.loc
    nonBlank += f.nonBlank
    const d = dup.get(f.file) ?? new Set<number>()
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
  // Verbosity is a fraction, so both sides have to count the same lines. LOC
  // deliberately excludes comments, but the flagged set includes comment-only
  // rules (placeholder, narration, emoji), so noisy/loc could exceed 1 and the
  // clamp then hid a malformed ratio rather than bounding a real one — a
  // repeated licence header read as 1.000 on a project with nothing duplicated
  // in it. Measured against every non-blank line, the numerator is a subset of
  // the denominator again. LOC is still what gets reported and baselined.
  const verbosity = nonBlank ? Math.min(noisy / nonBlank, 1) : 0
  const high = allFns.filter((f) => f.cc > 10)

  const byRule: Record<string, number> = {}
  for (const h of allHits) byRule[h.rule] = (byRule[h.rule] ?? 0) + 1

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
    worst: allFns.slice(0, topN).map((f) => ({
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

/** The four measured fields, or null if any is missing or not a finite number. */
function baselineNumbers(fields: Map<string, unknown>): Omit<SlopBaseline, 'at'> | null {
  const n = (k: string): number => {
    const v = fields.get(k)
    return typeof v === 'number' && Number.isFinite(v) ? v : NaN
  }
  const erosion = n('erosion')
  const verbosity = n('verbosity')
  const loc = n('loc')
  const files = n('files')
  if ([erosion, verbosity, loc, files].some(Number.isNaN)) return null
  return { erosion, verbosity, loc, files }
}

/** The recorded baseline, or null when there is not a usable one.
 *
 *  The fields are checked rather than trusted: a truncated or hand-edited file
 *  would otherwise yield NaN deltas, and `NaN > limit` is false for every limit,
 *  so `check` would report a comparison it never actually made. */
function readBaseline(file: string): SlopBaseline | null {
  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const fields = new Map<string, unknown>(Object.entries(raw))
  const at = fields.get('at')
  const numbers = baselineNumbers(fields)
  if (typeof at !== 'string' || !numbers) return null
  return { at, ...numbers }
}

function report(r: ScanResult): void {
  if (has('json')) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n')
    return
  }
  if (!r.ok) {
    process.stdout.write(`slop: ${r.error}\n`)
    return
  }
  const L: string[] = []
  const scope = r.scanned.map((s) => path.relative(r.root, s) || '.').join(' ')
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
  if (r.worst.length) {
    L.push('')
    L.push('heaviest callables (complexity mass):')
    for (const w of r.worst) L.push(`  CC ${String(w.cc).padStart(3)}  ${String(w.sloc).padStart(4)} sloc  ${w.name}  ${w.at}`)
  }
  if (Object.keys(r.ruleHits).length) {
    L.push('')
    L.push('flagged patterns: ' + Object.entries(r.ruleHits).map(([k, v]) => `${k}×${v}`).join('  '))
    for (const e of r.examples.slice(0, 6)) L.push(`  ${e.at}  [${e.rule}] ${e.why}`)
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
    const base = fs.existsSync(BASELINE) ? readBaseline(BASELINE) : null
    const breaches: string[] = []
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
      breaches.push('no baseline recorded — run `slop.ts baseline` before implementing so drift is measurable')
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
