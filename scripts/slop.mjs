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

function findRoot(start = process.cwd()) {
  let dir = path.resolve(start)
  for (;;) {
    if (fs.existsSync(path.join(dir, '.factory')) || fs.existsSync(path.join(dir, '.git'))) return dir
    const up = path.dirname(dir)
    if (up === dir) return path.resolve(start)
    dir = up
  }
}
const ROOT = findRoot()

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

// Blank out every string, template literal, comment and regex literal, keeping
// the file's exact length and line structure. Everything downstream — brace
// balancing, keyword counting — then operates on real code only.
//
// This exists because line-wise regex stripping cannot see a template literal
// or block comment that spans lines, so a single unbalanced brace inside one
// makes a function body run to the end of the file. That failure inflates a
// function's complexity into the hundreds and makes the erosion number a lie.
function blankNonCode(src, lang) {
  const out = new Array(src.length)
  const keep = (i) => (out[i] = src[i])
  const blank = (i) => (out[i] = src[i] === '\n' ? '\n' : ' ')

  let i = 0
  const n = src.length
  const prevSignificant = () => {
    for (let k = i - 1; k >= 0; k--) {
      const c = out[k]
      if (c && !/\s/.test(c)) return c
    }
    return null
  }

  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]

    if (lang === 'py') {
      if (c === '#') {
        while (i < n && src[i] !== '\n') blank(i++)
        continue
      }
      if ((c === '"' || c === "'") && src[i + 1] === c && src[i + 2] === c) {
        const q = c + c + c
        blank(i++), blank(i++), blank(i++)
        while (i < n && src.slice(i, i + 3) !== q) blank(i++)
        for (let k = 0; k < 3 && i < n; k++) blank(i++)
        continue
      }
      if (c === '"' || c === "'") {
        blank(i++)
        while (i < n && src[i] !== c && src[i] !== '\n') {
          if (src[i] === '\\') blank(i++)
          if (i < n) blank(i++)
        }
        if (i < n) blank(i++)
        continue
      }
      keep(i++)
      continue
    }

    // C-like
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') blank(i++)
      continue
    }
    if (c === '/' && c2 === '*') {
      blank(i++), blank(i++)
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) blank(i++)
      if (i < n) blank(i++)
      if (i < n) blank(i++)
      continue
    }
    if (c === '"' || c === "'") {
      blank(i++)
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') blank(i++)
        if (i < n) blank(i++)
      }
      if (i < n) blank(i++)
      continue
    }
    if (c === '`') {
      blank(i++)
      // Template literals nest code inside ${...}; keep that code, blank the text.
      let depth = 0
      while (i < n) {
        if (src[i] === '\\') {
          blank(i++)
          if (i < n) blank(i++)
          continue
        }
        if (depth === 0 && src[i] === '$' && src[i + 1] === '{') {
          blank(i++), keep(i++)
          depth = 1
          continue
        }
        if (depth > 0) {
          if (src[i] === '{') depth++
          if (src[i] === '}') {
            depth--
            keep(i++)
            continue
          }
          keep(i++)
          continue
        }
        if (src[i] === '`') break
        blank(i++)
      }
      if (i < n) blank(i++)
      continue
    }
    if (c === '/') {
      // Regex literal vs division: a regex may only follow an operator, an
      // opening bracket, or the start of a statement.
      const p = prevSignificant()
      if (p === null || '(,=:[!&|?{};+-*%~^<>'.includes(p)) {
        blank(i++)
        let cls = false
        while (i < n && src[i] !== '\n') {
          if (src[i] === '\\') {
            blank(i++)
            if (i < n) blank(i++)
            continue
          }
          if (src[i] === '[') cls = true
          else if (src[i] === ']') cls = false
          else if (src[i] === '/' && !cls) break
          blank(i++)
        }
        if (i < n && src[i] === '/') blank(i++)
        while (i < n && /[a-z]/.test(src[i])) blank(i++)
        continue
      }
    }
    keep(i++)
  }
  return out.join('')
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

function functionsIn(file, blankedLines) {
  const lang = EXT[path.extname(file)]
  const lines = blankedLines
  const fns = []

  if (lang === 'py') {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(FN_PY)
      if (!m) continue
      const indent = m[1].length
      const body = []
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j]
        if (l.trim() && l.search(/\S/) <= indent) break
        body.push(l)
      }
      const { cc, sloc } = complexityOf(body, lang)
      fns.push({ name: m[2], file, line: i + 1, cc, sloc })
    }
    return fns
  }

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FN_C)
    if (!m) continue
    const name = m[1] || m[2] || m[3] || m[4]
    if (!name) continue

    // Only a brace-bodied function has a body to measure. An expression arrow
    // (`const f = (x) => x + 1`) has none, and balancing from its line would
    // swallow the NEXT function's braces and report its complexity here.
    // Look ahead for the opening brace, bailing at a statement end.
    let bodyStartLine = -1
    let bodyStartCol = -1
    scan: for (let j = i; j < Math.min(i + 4, lines.length); j++) {
      const from = j === i ? Math.max(m.index + m[0].length - 1, 0) : 0
      const seg = lines[j].slice(from)
      const brace = seg.indexOf('{')
      const semi = seg.indexOf(';')
      if (brace !== -1 && (semi === -1 || brace < semi)) {
        bodyStartLine = j
        bodyStartCol = from + brace
        break scan
      }
      if (semi !== -1) break scan
      // Only keep looking on the next line when this one clearly continues —
      // a dangling parameter list or an arrow whose body is on the line below.
      // Without this, a one-line expression arrow walks forward and adopts the
      // braces of whatever function is declared next.
      if (!/[(,]\s*$|=>\s*$/.test(seg)) break scan
    }
    if (bodyStartLine === -1) continue

    let depth = 0
    let started = false
    const body = []
    let j = bodyStartLine
    for (; j < lines.length; j++) {
      const from = j === bodyStartLine ? bodyStartCol : 0
      for (let k = from; k < lines[j].length; k++) {
        const ch = lines[j][k]
        if (ch === '{') {
          depth++
          started = true
        } else if (ch === '}') depth--
      }
      if (j > bodyStartLine) body.push(lines[j])
      if (started && depth <= 0) break
    }
    // An unbalanced body means the lexer lost track (minified or exotic source).
    // Skip it rather than reporting a function with the complexity of a whole
    // file — a fabricated number is worse than a missing one.
    if (!started || depth > 0) continue
    const { cc, sloc } = complexityOf(body, lang)
    if (sloc < 2) continue
    fns.push({ name, file, line: i + 1, cc, sloc })
    i = j
  }
  return fns
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

const BASELINE = path.join(ROOT, '.factory', 'slop-baseline.json')

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
  L.push(`slop scan @ ${r.root}`)
  L.push(`${r.files} files, ${r.loc} LOC`)
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
