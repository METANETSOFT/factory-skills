#!/usr/bin/env node
// factory/doctor.ts — does this skill still hold together?
//
// A skill rots quietly. A playbook gets renamed and six cross-links die; a
// script grows a subcommand and the docs keep naming the old one; a job is
// added to the map with no playbook behind it. None of that throws an error at
// runtime — the agent just follows a dead pointer and improvises, which is the
// exact failure the skill exists to prevent.
//
// So the integrity of the skill is checked the same way it asks you to check
// your code: with a command, not a reading.
//
// Usage:
//   node doctor.ts            human-readable report, exit 1 on any problem
//   node doctor.ts --json

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PHASES, NOTE_KINDS } from './lib/types.ts'
import type { SkillMap, RegistryEntry } from './lib/types.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = path.dirname(HERE)
const REF = path.join(BASE, 'reference')
const asJson = process.argv.includes('--json')

interface Problem {
  where: string
  msg: string
}

const problems: Problem[] = []
const add = (where: string, msg: string): void => {
  problems.push({ where, msg })
}

// What the scripts actually accept. The docs are checked against this, so a
// renamed subcommand fails here instead of failing in front of a user.
const SUBCOMMANDS: Record<string, string[]> = {
  'state.ts': ['init', 'show', 'start', 'phase', 'slice', 'note', 'resolve', 'tick', 'worker', 'handoff', 'finish'],
  'skills.ts': ['list', 'jobs', 'resolve', 'worker', 'fetch', 'doctor'],
  'slop.ts': ['scan', 'baseline', 'check'],
  'hooks.ts': ['on', 'off', 'status', 'gate'],
  'doctor.ts': [],
  'context.ts': [],
}

const scriptFiles = new Set(fs.readdirSync(HERE).filter((f) => f.endsWith('.ts')))

function readSkillMap(): SkillMap {
  const raw = fs.readFileSync(path.join(HERE, 'skill-map.json'), 'utf8')
  return JSON.parse(raw) as SkillMap
}
const map = readSkillMap()
const jobs = new Set(Object.keys(map.jobs))
const refFiles = fs.existsSync(REF) ? fs.readdirSync(REF).filter((f) => f.endsWith('.md')) : []
const refSet = new Set(refFiles)

/** A capture group that the regex guarantees, expressed without a non-null assertion. */
const group = (m: RegExpMatchArray, i: number): string => m[i] ?? ''

// --- SKILL.md -----------------------------------------------------------------

const skillPath = path.join(BASE, 'SKILL.md')
const skill = fs.readFileSync(skillPath, 'utf8')
const fm = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/)

if (!fm) add('SKILL.md', 'no YAML frontmatter')
else {
  const frontmatter = group(fm, 1)
  const field = (n: string): string => {
    const m = frontmatter.match(new RegExp(`^${n}:\\s*([\\s\\S]*?)(?=\\n[a-z_-]+:|$)`, 'm'))
    return m ? group(m, 1).trim() : ''
  }
  const desc = field('description')
  const when = field('when_to_use')
  if (!desc) add('SKILL.md', 'no description — the model cannot route to this skill without one')
  // The listing truncates description + when_to_use at 1536 characters.
  if (desc.length + when.length > 1536) {
    add('SKILL.md', `description + when_to_use is ${desc.length + when.length} chars; the skill listing truncates at 1536`)
  }
  // A description that summarises the workflow invites the model to follow the
  // summary and skip the body — a measured failure, not a style preference.
  if (!/^Use when/i.test(desc)) add('SKILL.md', 'description should start with "Use when" and state triggering conditions only')
  if (/\bthen\b.*\bthen\b/i.test(desc)) add('SKILL.md', 'description reads like a workflow summary; state when to use it, not what it does')
}

for (const m of skill.matchAll(/\]\(reference\/([^)#]+)/g)) {
  const target = group(m, 1)
  if (!refSet.has(target)) add('SKILL.md', `links to a missing playbook: reference/${target}`)
}

// --- reference playbooks ------------------------------------------------------

for (const f of refFiles) {
  const src = fs.readFileSync(path.join(REF, f), 'utf8')
  const lines = src.split('\n').length
  const where = `reference/${f}`

  if (lines < 40) add(where, `${lines} lines — too thin to carry a procedure`)
  if (lines > 200) add(where, `${lines} lines — over budget; split it or cut padding`)
  if (!/exit condition/i.test(src)) add(where, 'no exit condition — nothing says when this phase is done')
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src)) add(where, 'contains emoji')
  if (/(api[_-]?key|token|password|secret)\s*[:=]\s*['"][^'"]{8,}/i.test(src)) add(where, 'possible embedded credential')

  for (const m of src.matchAll(/\]\(([^)#]+\.md)/g)) {
    const target = group(m, 1)
    if (target.startsWith('http')) continue
    if (!refSet.has(path.basename(target))) add(where, `broken link → ${target}`)
  }
  for (const m of src.matchAll(/scripts\/([a-z-]+\.ts)(?:\s+([a-z-]+))?/g)) {
    const script = group(m, 1)
    const sub = m[2]
    const known = SUBCOMMANDS[script]
    if (!scriptFiles.has(script)) add(where, `names a script that does not exist: ${script}`)
    else if (sub && known && known.length > 0 && !known.includes(sub)) {
      add(where, `names a subcommand that does not exist: ${script} ${sub}`)
    }
  }
  // Docs that still name the pre-TypeScript filenames point at files that are gone.
  for (const m of src.matchAll(/scripts\/([a-z-]+\.mjs)/g)) {
    add(where, `stale filename from before the TypeScript conversion: ${group(m, 1)}`)
  }
  for (const m of src.matchAll(/state\.ts\s+note\s+([a-z-]+)/g)) {
    const kind = group(m, 1)
    if (!(NOTE_KINDS as readonly string[]).includes(kind)) add(where, `invented note kind: ${kind}`)
  }
  for (const m of src.matchAll(/state\.ts\s+phase\s+([a-z-]+)/g)) {
    const ph = group(m, 1)
    if (!(PHASES as readonly string[]).includes(ph)) add(where, `invented phase: ${ph}`)
  }
  for (const m of src.matchAll(/skills\.ts\s+resolve\s+([a-z-]+)/g)) {
    const job = group(m, 1)
    if (!jobs.has(job)) add(where, `invented job kind: ${job}`)
  }
  // A bare relative script path will not resolve from the user's project dir.
  for (const m of src.matchAll(/(?:^|[`\s])node\s+((?!\$\{CLAUDE_SKILL_DIR\})[^\s`]*scripts\/[a-z-]+\.ts)/gm)) {
    add(where, `script path is missing \${CLAUDE_SKILL_DIR}: ${group(m, 1)}`)
  }
}

// --- the skill's own files ----------------------------------------------------

// The same dead pointer can sit in the skill's own source and docs: a usage
// line that names a pre-TypeScript filename sends the reader after a file that
// is gone, and while this scan covered only the playbooks the scripts' own
// headers carried exactly that. Only this skill's former names count — an
// extension in a scanner's table, or an example hook the user writes under
// .claude/hooks, is legitimate and stays silent.
const OWN_MJS = /\b(?:state|skills|slop|hooks|doctor|context|workspace|run)\.mjs\b/g

const ownFiles: Array<{ where: string; file: string }> = [...scriptFiles]
  .sort()
  .map((f) => ({ where: `scripts/${f}`, file: path.join(HERE, f) }))
const libDir = path.join(HERE, 'lib')
if (fs.existsSync(libDir)) {
  for (const f of fs.readdirSync(libDir).filter((x) => x.endsWith('.ts')).sort()) {
    ownFiles.push({ where: `scripts/lib/${f}`, file: path.join(libDir, f) })
  }
}
// The map routes the agent, and its install lines are run verbatim — a stale
// filename there is a live dead pointer, not stale prose.
ownFiles.push({ where: 'skill-map.json', file: path.join(HERE, 'skill-map.json') })
for (const f of ['SKILL.md', 'README.md']) {
  const p = path.join(BASE, f)
  if (fs.existsSync(p)) ownFiles.push({ where: f, file: p })
}

for (const { where, file } of ownFiles) {
  for (const m of fs.readFileSync(file, 'utf8').matchAll(OWN_MJS)) {
    add(where, `stale filename from before the TypeScript conversion: ${group(m, 0)}`)
  }
}

// --- skill map ----------------------------------------------------------------

for (const [job, spec] of Object.entries(map.jobs)) {
  if (!fs.existsSync(path.join(BASE, spec.playbook))) {
    add(`skill-map.json:${job}`, `playbook does not exist: ${spec.playbook}`)
  }
  for (const name of [...(spec.prefer ?? []), ...(spec.also ?? [])]) {
    if (!map.registry[name]) add(`skill-map.json:${job}`, `routes to "${name}" but the registry has no entry for it`)
  }
  for (const name of spec.also ?? []) {
    if (!spec.triggers?.[name]) {
      add(`skill-map.json:${job}`, `"${name}" is conditional but has no trigger, so nothing says when to load it`)
    }
  }
  for (const id of spec.external ?? []) {
    if (!map.external[id]) add(`skill-map.json:${job}`, `external id "${id}" is undefined`)
  }
}

// A worker is discovered at runtime, never listed here — the factory routes to
// whatever delegation skill or MCP the session happens to carry. What can rot
// is the opposite: a named worker leaking back into the skill's own text, which
// would make the routing rule stop firing the day that name changes.
const NAMED_WORKER = /\b(kole-kimi|omniroute-router|kimi_(?:agent|ask|swarm|jobs|models))\b/g
for (const { where, file } of [
  { where: 'SKILL.md', file: skillPath },
  ...refFiles.map((f) => ({ where: `reference/${f}`, file: path.join(REF, f) })),
]) {
  // The skill map is the one place a specific skill name is legitimate: it is a
  // registry of skills that exist, not a routing rule keyed to one of them.
  for (const m of fs.readFileSync(file, 'utf8').matchAll(NAMED_WORKER)) {
    add(where, `names a specific worker (${group(m, 0)}) — the worker rule must stay generic, or it dies with that name`)
  }
}

// The registry carries a couple of `_`-prefixed prose notes alongside the real
// entries; those are documentation for a human reader, not routable skills.
const isEntry = (v: RegistryEntry | string): v is RegistryEntry => typeof v === 'object' && v !== null

for (const [name, reg] of Object.entries(map.registry)) {
  if (name.startsWith('_')) continue
  if (!isEntry(reg)) {
    add('skill-map.json:registry', `"${name}" is not an object — a registry entry must carry degrade and a source/install/find`)
    continue
  }
  if (!reg.degrade) add('skill-map.json:registry', `"${name}" has no degrade note — a machine without it gets no fallback`)
  if (!reg.source && !reg.install && !reg.find) {
    add('skill-map.json:registry', `"${name}" has no source, install or find — nothing tells the user where to get it`)
  }
}

// --- report -------------------------------------------------------------------

const summary = {
  ok: problems.length === 0,
  playbooks: refFiles.length,
  scripts: scriptFiles.size,
  jobs: jobs.size,
  registryEntries: Object.keys(map.registry).filter((k) => !k.startsWith('_')).length,
  problems,
}

if (asJson) {
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
} else {
  const L = [
    'factory doctor',
    `${summary.playbooks} playbooks, ${summary.scripts} scripts, ${summary.jobs} jobs, ${summary.registryEntries} registry entries`,
    '',
  ]
  if (problems.length === 0) L.push('no problems found')
  else {
    L.push(`${problems.length} problem(s):`)
    for (const p of problems) L.push(`  ${p.where}: ${p.msg}`)
  }
  process.stdout.write(L.join('\n') + '\n')
}

process.exit(problems.length ? 1 : 0)
