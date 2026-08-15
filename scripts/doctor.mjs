#!/usr/bin/env node
// factory/doctor.mjs — does this skill still hold together?
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
//   node doctor.mjs            human-readable report, exit 1 on any problem
//   node doctor.mjs --json

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = path.dirname(HERE)
const REF = path.join(BASE, 'reference')
const asJson = process.argv.includes('--json')

const problems = []
const add = (where, msg) => problems.push({ where, msg })

// What the scripts actually accept. The docs are checked against this, so a
// renamed subcommand fails here instead of failing in front of a user.
const SUBCOMMANDS = {
  'state.mjs': ['init', 'show', 'start', 'phase', 'slice', 'note', 'resolve', 'tick', 'handoff', 'finish'],
  'skills.mjs': ['list', 'jobs', 'resolve', 'fetch', 'doctor'],
  'slop.mjs': ['scan', 'baseline', 'check'],
  'hooks.mjs': ['on', 'off', 'status', 'gate'],
  'doctor.mjs': [],
  'context.mjs': [],
}
const NOTE_KINDS = ['ruling', 'unfinished', 'risk', 'decision', 'evidence']
const PHASES = ['uninitialized', 'research', 'product', 'architecture', 'program-design', 'plan', 'implement', 'verify', 'review', 'done']

const scriptFiles = new Set(fs.readdirSync(HERE).filter((f) => f.endsWith('.mjs')))
const map = JSON.parse(fs.readFileSync(path.join(HERE, 'skill-map.json'), 'utf8'))
const jobs = new Set(Object.keys(map.jobs))
const refFiles = fs.existsSync(REF) ? fs.readdirSync(REF).filter((f) => f.endsWith('.md')) : []
const refSet = new Set(refFiles)

// --- SKILL.md -----------------------------------------------------------------

const skillPath = path.join(BASE, 'SKILL.md')
const skill = fs.readFileSync(skillPath, 'utf8')
const fm = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/)

if (!fm) add('SKILL.md', 'no YAML frontmatter')
else {
  const field = (n) => (fm[1].match(new RegExp(`^${n}:\\s*([\\s\\S]*?)(?=\\n[a-z_-]+:|$)`, 'm')) || [])[1]?.trim() || ''
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
  if (!refSet.has(m[1])) add('SKILL.md', `links to a missing playbook: reference/${m[1]}`)
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
    if (m[1].startsWith('http')) continue
    if (!refSet.has(path.basename(m[1]))) add(where, `broken link → ${m[1]}`)
  }
  for (const m of src.matchAll(/scripts\/([a-z-]+\.mjs)(?:\s+([a-z-]+))?/g)) {
    const [, script, sub] = m
    if (!scriptFiles.has(script)) add(where, `names a script that does not exist: ${script}`)
    else if (sub && SUBCOMMANDS[script]?.length && !SUBCOMMANDS[script].includes(sub)) {
      add(where, `names a subcommand that does not exist: ${script} ${sub}`)
    }
  }
  for (const m of src.matchAll(/state\.mjs\s+note\s+([a-z-]+)/g)) {
    if (!NOTE_KINDS.includes(m[1])) add(where, `invented note kind: ${m[1]}`)
  }
  for (const m of src.matchAll(/state\.mjs\s+phase\s+([a-z-]+)/g)) {
    if (!PHASES.includes(m[1])) add(where, `invented phase: ${m[1]}`)
  }
  for (const m of src.matchAll(/skills\.mjs\s+resolve\s+([a-z-]+)/g)) {
    if (!jobs.has(m[1])) add(where, `invented job kind: ${m[1]}`)
  }
  // A bare relative script path will not resolve from the user's project dir.
  for (const m of src.matchAll(/(?:^|[`\s])node\s+((?!\$\{CLAUDE_SKILL_DIR\})[^\s`]*scripts\/[a-z-]+\.mjs)/gm)) {
    add(where, `script path is missing \${CLAUDE_SKILL_DIR}: ${m[1]}`)
  }
}

// --- skill map ----------------------------------------------------------------

for (const [job, spec] of Object.entries(map.jobs)) {
  if (!fs.existsSync(path.join(BASE, spec.playbook))) add(`skill-map.json:${job}`, `playbook does not exist: ${spec.playbook}`)
  for (const name of [...(spec.prefer || []), ...(spec.also || [])]) {
    if (!map.registry[name]) add(`skill-map.json:${job}`, `routes to "${name}" but the registry has no entry for it`)
  }
  for (const name of spec.also || []) {
    if (!spec.triggers?.[name]) add(`skill-map.json:${job}`, `"${name}" is conditional but has no trigger, so nothing says when to load it`)
  }
  for (const id of spec.external || []) {
    if (!map.external[id]) add(`skill-map.json:${job}`, `external id "${id}" is undefined`)
  }
}
for (const [name, reg] of Object.entries(map.registry)) {
  if (name.startsWith('_')) continue
  if (!reg.degrade) add(`skill-map.json:registry`, `"${name}" has no degrade note — a machine without it gets no fallback`)
  if (!reg.source && !reg.install && !reg.find) add(`skill-map.json:registry`, `"${name}" has no source, install or find — nothing tells the user where to get it`)
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
    `factory doctor`,
    `${summary.playbooks} playbooks, ${summary.scripts} scripts, ${summary.jobs} jobs, ${summary.registryEntries} registry entries`,
    '',
  ]
  if (!problems.length) L.push('no problems found')
  else {
    L.push(`${problems.length} problem(s):`)
    for (const p of problems) L.push(`  ${p.where}: ${p.msg}`)
  }
  process.stdout.write(L.join('\n') + '\n')
}

process.exit(problems.length ? 1 : 0)
