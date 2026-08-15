#!/usr/bin/env node
// factory/skills.mjs — the skill tree resolver.
//
// The factory does not reimplement design taste, animation craft, doc lookup or
// debugging discipline. It routes to the skills that already own those jobs.
// This script answers one question deterministically: for THIS job kind, which
// skills exist on this machine, which are missing, and how do I get them.
//
// Usage:
//   node skills.mjs list                     → every skill installed here
//   node skills.mjs jobs                     → job kinds this factory routes
//   node skills.mjs resolve <job> [--json]   → what to load for that job
//   node skills.mjs fetch <external-id>      → install an external skill from GitHub
//   node skills.mjs doctor                   → coverage report across all jobs

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import type { ExternalEntry, InstalledSkill, RegistryEntry, ResolvedSkill, SkillMap } from './lib/types.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = path.dirname(HERE)
const MAP: SkillMap = JSON.parse(fs.readFileSync(path.join(HERE, 'skill-map.json'), 'utf8'))

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(`--${f}`)
const positional = argv.filter((a) => !a.startsWith('--'))

type SkillScope = 'project' | 'user' | 'plugin'

interface SearchRoot {
  scope: SkillScope
  dir: string
  deep: boolean
}

// Skills can live in several places. Project-local wins over user-global, which
// wins over plugins — the same precedence the harness uses.
function searchRoots(): SearchRoot[] {
  const roots: SearchRoot[] = []
  const seen = new Set<string>()
  const add = (scope: SkillScope, dir: string, deep = false) => {
    if (!dir || !fs.existsSync(dir)) return
    // Skill dirs are routinely symlinked (e.g. ~/.claude/skills/x -> ~/.agents/skills/x),
    // so dedupe on the resolved path or the same tree gets walked twice.
    let key: string
    try {
      key = fs.realpathSync(dir)
    } catch {
      key = path.resolve(dir)
    }
    if (seen.has(key)) return
    seen.add(key)
    roots.push({ scope, dir, deep })
  }

  const home = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  add('project', path.join(process.cwd(), '.claude', 'skills'))
  add('user', path.join(home, 'skills'))
  add('user', '/config/.claude/skills')
  // Cross-runtime alias honoured by Claude Code, Codex, Copilot CLI and Gemini CLI.
  add('user', path.join(os.homedir(), '.agents', 'skills'))
  add('user', '/config/.agents/skills')
  add('plugin', path.join(home, 'plugins'), true)
  return roots
}

/** Folded block scalars (`>`) join their lines with a space; a blank line is a paragraph break. */
function foldBlock(body: string[]): string {
  let acc = ''
  for (const line of body) {
    if (line === '') acc += '\n\n'
    else if (acc === '' || acc.endsWith('\n')) acc += line
    else acc += ' ' + line
  }
  return acc.trim()
}

function readFrontmatter(file: string): Record<string, string> {
  try {
    const head = fs.readFileSync(file, 'utf8').slice(0, 4000)
    const m = head.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    const block = m?.[1]
    if (block === undefined) return {}
    const out: Record<string, string> = {}
    const lines = block.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line === undefined) continue
      const kv = line.match(/^([a-zA-Z-]+):\s*(.*)$/)
      const key = kv?.[1]
      const raw = kv?.[2]
      if (key === undefined || raw === undefined) continue
      let val = raw.replace(/^["']|["']$/g, '')
      // A YAML block scalar (`description: >-`, `|`, `>2`) carries its value on the
      // indented lines that follow, and the key regex above rejects every one of
      // them. Without this, the value is the bare indicator: several installed
      // skills reported a description of ">-" and their prose was thrown away.
      if (/^[|>][-+]?\d*$/.test(val)) {
        const folded = val.startsWith('>')
        const body: string[] = []
        for (;;) {
          const next = lines[i + 1]
          // The block ends at the first line that is neither blank nor indented.
          if (next === undefined) break
          if (next.trim() !== '' && !/^\s/.test(next)) break
          body.push(next.trim())
          i++
        }
        val = folded ? foldBlock(body) : body.join('\n').trim()
      }
      out[key] = val
    }
    return out
  } catch {
    return {}
  }
}

let _installed: Map<string, InstalledSkill> | null = null
function installed(): Map<string, InstalledSkill> {
  if (_installed) return _installed
  const found = new Map<string, InstalledSkill>()
  const visit = (dir: string, scope: SkillScope, depth: number, maxDepth: number): void => {
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      // Nothing under these can be a skill, and they are what makes a deeper walk
      // expensive — a plugin checkout carries both.
      if (e.name === '.git' || e.name === 'node_modules') continue
      const sub = path.join(dir, e.name)
      // A symlinked skill dir reports isDirectory() === false, and most installs
      // symlink. Follow the link instead of skipping it.
      if (!e.isDirectory()) {
        if (!e.isSymbolicLink()) continue
        try {
          if (!fs.statSync(sub).isDirectory()) continue
        } catch {
          continue
        }
      }
      const skillFile = path.join(sub, 'SKILL.md')
      if (fs.existsSync(skillFile)) {
        const fm = readFrontmatter(skillFile)
        // Register under both keys: the command comes from the directory name for
        // personal/project skills, while `name` is what plugin skills answer to.
        const names = fm.name ? [fm.name, e.name] : [e.name]
        for (const key of new Set(names)) {
          if (!found.has(key)) {
            found.set(key, { name: key, dir: sub, scope, description: (fm.description || '').slice(0, 200) })
          }
        }
      } else if (depth < maxDepth) {
        visit(sub, scope, depth + 1, maxDepth)
      }
    }
  }
  // Plugin trees nest far deeper than a personal skills dir: a marketplace skill
  // lives at plugins/marketplaces/<mp>/plugins/<plugin>/skills/<skill>, six levels
  // down. A flat budget of 3 reached four of them, so every marketplace-installed
  // skill was reported missing while sitting on disk. Deep roots get their own
  // budget; the other roots keep exactly the walk they had.
  for (const r of searchRoots()) visit(r.dir, r.scope, r.deep ? 0 : 2, r.deep ? 6 : 3)
  _installed = found
  return found
}

// Built-in harness skills have no directory on disk but are always callable.
const BUILTINS = new Set([
  'artifact-design', 'artifact-diagramming', 'artifact-capabilities', 'dataviz',
  'code-review', 'simplify', 'security-review', 'run', 'init', 'loop', 'schedule',
  'claude-api', 'handoff', 'update-config', 'keybindings-help', 'fewer-permission-prompts',
])

type ResolvedExternal = ExternalEntry & { id: string }

interface JobResolution {
  ok: true
  job: string
  playbook: string
  playbookRel: string
  prefer: ResolvedSkill[]
  also: ResolvedSkill[]
  external: ResolvedExternal[]
  missing: string[]
}

type ResolveResult = JobResolution | { ok: false; error: string; jobs: string[] }

function resolveJob(job: string | undefined): ResolveResult {
  // `job` is positional, so it can be absent entirely. An absent name reports the
  // same way as a name that is simply not in the map.
  const spec = job === undefined ? undefined : MAP.jobs[job]
  if (job === undefined || spec === undefined) {
    return { ok: false, error: `unknown job "${job}"`, jobs: Object.keys(MAP.jobs) }
  }
  const inst = installed()
  const decide = (name: string): ResolvedSkill => {
    const hit = inst.get(name)
    // Spelled out rather than spread: `hit.name` is the key it was registered
    // under, i.e. `name` itself, so a spread here only reads as a second source
    // of truth for a field that already has one.
    if (hit) return { name, status: 'installed', dir: hit.dir, scope: hit.scope, description: hit.description }
    if (BUILTINS.has(name)) return { name, status: 'builtin', dir: null, scope: 'builtin' }
    // Missing is not a dead end: carry the provenance so the caller can offer a
    // real install line, or fall back to the degraded path with its eyes open.
    const entry = MAP.registry?.[name]
    // A few registry keys hold prose (_comment, _provenance_warning); a string
    // there is documentation, not provenance for a skill.
    const reg: RegistryEntry = entry && typeof entry === 'object' ? entry : {}
    return {
      name,
      status: 'missing',
      source: reg.source || null,
      install: reg.install || null,
      find: reg.find || null,
      degrade: reg.degrade || 'No recorded fallback — tell the user the skill is missing and do the job to the standard in the playbook.',
    }
  }
  const prefer = (spec.prefer || []).map(decide)
  const also = (spec.also || []).map((n): ResolvedSkill => ({ ...decide(n), trigger: spec.triggers?.[n] || null }))
  const external = (spec.external || []).map((id): ResolvedExternal => {
    const e = MAP.external[id]
    return e ? { id, ...e } : { id }
  })
  return {
    ok: true,
    job,
    playbook: path.join(BASE, spec.playbook),
    playbookRel: spec.playbook,
    prefer,
    also,
    external,
    missing: [...prefer, ...also].filter((s) => s.status === 'missing').map((s) => s.name),
  }
}

// --- GitHub fetcher (only for skills that are plain files in a public repo) ---

interface FetchSpec {
  repo: string
  prefix: string
  into: string
}

const FETCHABLE: Record<string, FetchSpec> = {
  'humanlayer-codebase-design': {
    repo: 'humanlayer/fold',
    prefix: '.claude/skills/codebase-design',
    into: 'codebase-design',
  },
  'humanlayer-improve-codebase-architecture': {
    repo: 'humanlayer/fold',
    prefix: '.claude/skills/improve-codebase-architecture',
    into: 'improve-codebase-architecture',
  },
  'humanlayer-show-me': {
    repo: 'humanlayer/skills',
    prefix: 'plugins/show-me/skills/show-me',
    into: 'show-me',
  },
  'humanlayer-design-control-loop': {
    repo: 'humanlayer/skills',
    prefix: 'plugins/design-control-loop/skills/design-control-loop',
    into: 'design-control-loop',
  },
  'humanlayer-build-iterated-agentic-loop': {
    repo: 'humanlayer/skills',
    prefix: 'plugins/build-iterated-agentic-loop/skills/build-iterated-agentic-loop',
    into: 'build-iterated-agentic-loop',
  },
  'humanlayer-improve-claude-md': {
    repo: 'humanlayer/skills',
    prefix: 'plugins/improve-claude-md/skills/improve-claude-md',
    into: 'improve-claude-md',
  },
}

type FetchResult =
  | { ok: false; error: string; hint?: string }
  | { ok: true; id: string; repo: string; dest: string; files: string[]; count: number }

/** Blob paths under `prefix` in a GitHub tree response, which arrives as unknown JSON. */
function blobPaths(tree: unknown, prefix: string): string[] {
  if (typeof tree !== 'object' || tree === null || !('tree' in tree)) return []
  const raw = tree.tree
  if (!Array.isArray(raw)) return []
  const entries: unknown[] = raw
  const paths: string[] = []
  for (const e of entries) {
    if (typeof e !== 'object' || e === null) continue
    if (!('type' in e) || e.type !== 'blob') continue
    if (!('path' in e) || typeof e.path !== 'string') continue
    if (!e.path.startsWith(prefix + '/')) continue
    paths.push(e.path)
  }
  return paths
}

async function fetchSkill(id: string | undefined, destRoot: string): Promise<FetchResult> {
  const spec = id === undefined ? undefined : FETCHABLE[id]
  if (id === undefined || spec === undefined) {
    const ext = id === undefined ? undefined : MAP.external[id]
    return {
      ok: false,
      error: `"${id}" is not fetchable as plain files`,
      hint: ext?.install || `fetchable ids: ${Object.keys(FETCHABLE).join(', ')}`,
    }
  }
  const api = `https://api.github.com/repos/${spec.repo}/git/trees/HEAD?recursive=1`
  const r = await fetch(api, { headers: { 'user-agent': 'factory-skill' } })
  if (!r.ok) return { ok: false, error: `GitHub tree ${r.status} for ${spec.repo}` }
  const tree = await r.json()
  const files = blobPaths(tree, spec.prefix)
  if (!files.length) return { ok: false, error: `no files under ${spec.prefix} in ${spec.repo}` }

  const dest = path.join(destRoot, spec.into)
  const written: string[] = []
  for (const f of files) {
    const rel = f.slice(spec.prefix.length + 1)
    const url = `https://raw.githubusercontent.com/${spec.repo}/HEAD/${f}`
    const res = await fetch(url, { headers: { 'user-agent': 'factory-skill' } })
    if (!res.ok) continue
    const buf = Buffer.from(await res.arrayBuffer())
    const out = path.join(dest, rel)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, buf)
    written.push(rel)
  }
  return { ok: true, id, repo: spec.repo, dest, files: written, count: written.length }
}

// --- CLI ---

const out = (o: unknown) => process.stdout.write(JSON.stringify(o, null, 2) + '\n')
const cmd = positional[0]

interface JobSummary {
  playbook: string
  prefer: string[] | undefined
  also: string[] | undefined
}

interface JobReport {
  playbookExists: boolean
  installed: string[]
  missing: string[]
  external: string[]
  /** Only set if the map changed under us between listing a job and resolving it. */
  error?: string
}

switch (cmd) {
  case 'list': {
    const inst = [...installed().values()].sort((a, b) => a.name.localeCompare(b.name))
    out({ count: inst.length, roots: searchRoots(), skills: inst.map(({ name, scope, dir }) => ({ name, scope, dir })) })
    break
  }

  case 'jobs': {
    out({
      jobs: Object.fromEntries(
        Object.entries(MAP.jobs).map(([k, v]): [string, JobSummary] => [k, { playbook: v.playbook, prefer: v.prefer, also: v.also }]),
      ),
    })
    break
  }

  case 'resolve': {
    const r = resolveJob(positional[1])
    if (!r.ok || has('json')) {
      out(r)
      break
    }
    const lines = [`job: ${r.job}`, `playbook: ${r.playbookRel}  (read this first)`]
    if (r.prefer.length) {
      lines.push('', 'load — owns this job:')
      for (const s of r.prefer) lines.push(`  [${s.status}] ${s.name}`)
    }
    if (r.also.length) {
      lines.push('', 'load when the trigger applies:')
      for (const s of r.also) lines.push(`  [${s.status}] ${s.name}${s.trigger ? ` — ${s.trigger}` : ''}`)
    }
    if (r.external.length) {
      lines.push('', 'external (not a local skill):')
      for (const e of r.external) lines.push(`  ${e.id} — ${e.what || ''}\n      install: ${e.install || e.source || ''}`)
    }
    const gaps = [...r.prefer, ...r.also].filter((s) => s.status === 'missing')
    if (gaps.length) {
      lines.push('', 'NOT INSTALLED — offer the install line, or take the degraded path and say so:')
      for (const g of gaps) {
        lines.push(`  ${g.name}`)
        if (g.source) lines.push(`      source:  ${g.source}`)
        if (g.install) lines.push(`      install: ${g.install}`)
        if (g.find && !g.install) lines.push(`      find:    ${g.find}`)
        lines.push(`      without it: ${g.degrade}`)
      }
    }
    process.stdout.write(lines.join('\n') + '\n')
    break
  }

  case 'fetch': {
    const id = positional[1]
    const destRoot = positional[2] || path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'skills')
    const res = await fetchSkill(id, fs.existsSync('/config/.claude/skills') && !positional[2] ? '/config/.claude/skills' : destRoot)
    out(res)
    if (!res.ok) process.exit(1)
    break
  }

  case 'doctor': {
    const inst = installed()
    const report: Record<string, JobReport> = {}
    let missingAll = new Set<string>()
    for (const job of Object.keys(MAP.jobs)) {
      const r = resolveJob(job)
      // The name came straight from MAP.jobs, so this cannot fire — but reporting
      // it keeps a malformed map out of the report as a crash with no JSON.
      if (!r.ok) {
        report[job] = { playbookExists: false, installed: [], missing: [], external: [], error: r.error }
        continue
      }
      report[job] = {
        playbookExists: fs.existsSync(r.playbook),
        installed: [...r.prefer, ...r.also].filter((s) => s.status !== 'missing').map((s) => s.name),
        missing: r.missing,
        external: r.external.map((e) => e.id),
      }
      r.missing.forEach((m) => missingAll.add(m))
    }
    out({
      installedCount: inst.size,
      jobs: report,
      missingAcrossJobs: [...missingAll],
      fetchable: Object.keys(FETCHABLE),
    })
    break
  }

  default:
    out({
      usage: ['list', 'jobs', 'resolve <job> [--json]', 'fetch <external-id> [destDir]', 'doctor'],
      jobs: Object.keys(MAP.jobs),
      fetchable: Object.keys(FETCHABLE),
    })
}
