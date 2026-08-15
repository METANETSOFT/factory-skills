#!/usr/bin/env node
// factory test suite — no dependencies, no framework.
//
// Law 1 applies to this skill's own code: a script that has not been run
// against a hostile input has not been verified. Every test here builds a
// throwaway project under os.tmpdir(), so nothing touches a real repo.
//
//   node test/run.ts           run everything
//   node test/run.ts state     run one group

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type {
  ClaudeSettings,
  Directive,
  GitSignals,
  NoteKind,
  OpenItem,
  Phase,
  Pressure,
  ProjectShape,
  ResolvedSkill,
  ScanResult,
  SessionState,
  SkillMap,
  WorkRef,
} from '../scripts/lib/types.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS = path.join(path.dirname(HERE), 'scripts')
const only = process.argv[2] || null

// Every test's workspace lands here, so a run never touches the shared temp
// location a real project would use.
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-home-root-'))

// ------------------------------------------------------------------- harness

interface RunResult {
  code: number | null
  out: string
  err: string
}

/**
 * What `state.ts` prints. Every command answers with the workspace snapshot,
 * some add an envelope (`created`, `finished`, ...), and a refusal adds
 * `ok: false` + `error`. A field a command may omit is optional, never
 * asserted present by the type.
 */
interface Snapshot {
  root: string
  workspace: string
  initialized: boolean
  directive?: string
  inProject?: boolean
  phase?: Phase
  nextPhase?: Phase | null
  nextAction?: string | null
  work?: WorkRef | null
  workDir?: string | null
  slice?: { done: number; total: number }
  openItems?: OpenItem[]
  openCount?: number
  session?: SessionState
  pressure?: Pressure
  ledger?: string | null
  ok?: boolean
  created?: boolean
  already?: boolean
  finished?: WorkRef
  error?: string
}

interface NoteResult {
  ok: boolean
  n: number
  kind: NoteKind
  openCount: number
}

interface ResolveResult {
  ok: boolean
  resolved: boolean
  openCount: number
}

// A scan either measured something or explained why it could not.
type ScanOk = Extract<ScanResult, { ok: true }>
type ScanFail = Extract<ScanResult, { ok: false }>

interface SkillListResult {
  skills: Array<{ name: string }>
}

interface ResolveSkillsOk {
  ok: true
  playbook: string
  prefer: ResolvedSkill[]
  also: ResolvedSkill[]
}

interface ResolveSkillsFail {
  ok: false
  error: string
  jobs: string[]
}

interface SkillsDoctor {
  jobs: Record<string, { playbookExists: boolean }>
}

interface HooksStatus {
  installed: boolean
  checks: string[]
}

interface DoctorReport {
  problems: Array<{ where: string; msg: string }>
}

interface ContextReport {
  initialized: boolean
  stateCorrupt: string | null
  phase: Phase | null
  work: WorkRef | null
  git: GitSignals
  project: ProjectShape
  directives: Directive[]
}

let pass = 0
const failures: Array<{ group: string; name: string; error: string }> = []
let group = ''

const t = (name: string, fn: () => void): void => {
  if (only && group !== only) return
  try {
    fn()
    pass++
    process.stdout.write('.')
  } catch (e) {
    failures.push({ group, name, error: e instanceof Error ? e.message : String(e) })
    process.stdout.write('F')
  }
}
const describe = (g: string, fn: () => void): void => {
  group = g
  fn()
  group = ''
}

function assert(cond: unknown, msg?: string): asserts cond {
  if (!cond) throw new Error(msg || 'assertion failed')
}
function eq(actual: unknown, expected: unknown, msg?: string): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${msg || 'not equal'}\n    expected: ${b}\n    actual:   ${a}`)
}

/** Run a factory script. Never throws on a non-zero exit — the code is the data. */
function run(script: string, args: string[] = [], opts: { cwd?: string; input?: string; env?: Record<string, string> } = {}): RunResult {
  const r = spawnSync('node', [path.join(SCRIPTS, script), ...args], {
    cwd: opts.cwd || process.cwd(),
    input: opts.input ?? '',
    encoding: 'utf8',
    // FACTORY_HOME must win over anything ambient, or a developer who has it set
    // would silently run the suite against their own workspace directory.
    env: { ...process.env, FACTORY_HOME: TEST_HOME, ...(opts.env || {}) },
  })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}

/** Parse a script's stdout as the shape the caller names. The cast lives here, at the JSON boundary — nowhere else. */
const json = <T>(r: RunResult): T => {
  try {
    return JSON.parse(r.out) as T
  } catch {
    throw new Error(`expected JSON on stdout, got:\n${r.out.slice(0, 300)}\n${r.err.slice(0, 300)}`)
  }
}

/** The workspace directory the scripts resolved for this project. */
const wsOf = (dir: string): string => json<Snapshot>(run('state.ts', ['show', '--root', dir])).workspace

let tmpCount = 0
function project({ git = true }: { git?: boolean } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `factory-test-${tmpCount++}-`))
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
  }
  return dir
}
const commitAll = (dir: string, msg = 'x'): void => {
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', msg], { cwd: dir })
}
const write = (dir: string, rel: string, body: string): string => {
  const p = path.join(dir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
  return p
}

// ----------------------------------------------------------------- state.ts

describe('state', () => {
  t('show before init reports NOT_INITIALIZED rather than crashing', () => {
    const d = project()
    const s = json<Snapshot>(run('state.ts', ['show', '--root', d]))
    eq(s.initialized, false)
    assert(/NOT_INITIALIZED/.test(s.directive ?? ''), 'expected a NOT_INITIALIZED directive')
  })

  t('init is idempotent', () => {
    const d = project()
    const a = json<Snapshot>(run('state.ts', ['init', '--root', d]))
    const b = json<Snapshot>(run('state.ts', ['init', '--root', d]))
    eq(a.created, true)
    eq(b.already, true)
    eq(b.phase, 'research')
  })

  t('start creates the work dir and resets the session', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    const s = json<Snapshot>(run('state.ts', ['start', 'auth', '--title', 'Auth rework', '--root', d]))
    eq(s.work?.slug, 'auth')
    eq(s.work?.title, 'Auth rework')
    assert(fs.existsSync(path.join(wsOf(d), 'work/auth/evidence')), 'evidence dir missing')
  })

  t('a --title containing spaces and a dash survives argument parsing', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    const s = json<Snapshot>(run('state.ts', ['start', 'x', '--title', 'Fix the login — really', '--root', d]))
    eq(s.work?.title, 'Fix the login — really')
  })

  t('phase rejects an unknown phase with a non-zero exit', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    const r = run('state.ts', ['phase', 'wibble', '--root', d])
    assert(r.code !== 0, 'expected non-zero exit')
    assert(/unknown phase/.test(r.out), 'expected an explanatory error')
  })

  t('note records unfinished as an open item and resolve closes it', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    const n = json<NoteResult>(run('state.ts', ['note', 'unfinished', 'rate limiting missing', '--root', d]))
    eq(n.openCount, 1)
    const r = json<ResolveResult>(run('state.ts', ['resolve', String(n.n), '--root', d]))
    eq(r.resolved, true)
    eq(r.openCount, 0)
  })

  t('a ruling is logged but is not an open item', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    const n = json<NoteResult>(run('state.ts', ['note', 'ruling', 'JWT over sessions', '--root', d]))
    eq(n.openCount, 0)
    assert(fs.readFileSync(path.join(wsOf(d), 'ledger.md'), 'utf8').includes('JWT over sessions'))
  })

  t('note rejects an unknown kind', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    const r = run('state.ts', ['note', 'wibble', 'text', '--root', d])
    assert(r.code !== 0, 'expected non-zero exit')
  })

  t('crossing the slice cap returns HANDOFF_NOW', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    let last: Snapshot | undefined
    for (let i = 1; i <= 3; i++) last = json<Snapshot>(run('state.ts', ['slice', `${i}/5`, '--root', d]))
    assert(last, 'slice produced no snapshot')
    eq(last.pressure?.level, 'handoff')
    assert(/HANDOFF_NOW/.test(last.pressure?.directive ?? ''))
  })

  t('approaching a cap warns before it blocks', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    const r = json<{ pressure: Pressure }>(run('state.ts', ['tick', 'edit', '45', '--root', d]))
    eq(r.pressure.level, 'warn')
  })

  t('finish refuses while an item is open, and succeeds once it is resolved', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    const n = json<NoteResult>(run('state.ts', ['note', 'unfinished', 'x', '--root', d]))
    const blocked = run('state.ts', ['finish', '--root', d])
    assert(blocked.code !== 0, 'finish should refuse with an open item')
    run('state.ts', ['resolve', String(n.n), '--root', d])
    const ok = json<Snapshot>(run('state.ts', ['finish', '--root', d]))
    eq(ok.ok, true)
    eq(ok.phase, 'done')
  })

  t('handoff numbering increments across successive handoffs', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    const a = json<{ handoffNumber: number }>(run('state.ts', ['handoff', '--root', d]))
    const b = json<{ handoffNumber: number }>(run('state.ts', ['handoff', '--root', d]))
    eq(a.handoffNumber, 1)
    eq(b.handoffNumber, 2)
  })

  t('handoff resets the session counters but keeps open items', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    run('state.ts', ['note', 'unfinished', 'keep me', '--root', d])
    run('state.ts', ['tick', 'edit', '10', '--root', d])
    run('state.ts', ['handoff', '--root', d])
    const s = json<Snapshot>(run('state.ts', ['show', '--root', d]))
    eq(s.session?.counts, {})
    eq(s.openItems?.length, 1)
  })

  t('the workspace defaults OUTSIDE the project — no .factory in the repo', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    run('state.ts', ['note', 'decision', 'x', '--root', d])
    assert(!fs.existsSync(path.join(d, '.factory')), 'the factory wrote into the user\'s project')
    const s = json<Snapshot>(run('state.ts', ['show', '--root', d]))
    eq(s.inProject, false)
    assert(s.workspace.startsWith(TEST_HOME), `workspace escaped FACTORY_HOME: ${s.workspace}`)
  })

  t('--in-project puts the workspace in the repo when asked', () => {
    const d = project()
    run('state.ts', ['init', '--root', d, '--in-project'])
    const s = json<Snapshot>(run('state.ts', ['show', '--root', d]))
    eq(s.inProject, true)
    assert(fs.existsSync(path.join(d, '.factory/state.json')), 'opt-in workspace not created in project')
  })

  t('an existing in-project workspace keeps winning without the flag', () => {
    const d = project()
    run('state.ts', ['init', '--root', d, '--in-project'])
    run('state.ts', ['start', 'w', '--root', d])
    const s = json<Snapshot>(run('state.ts', ['show', '--root', d]))
    eq(s.inProject, true)
  })

  t('two projects with the same basename get different workspaces', () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'same-name-a-'))
    const b = fs.mkdtempSync(path.join(os.tmpdir(), 'same-name-b-'))
    const pa = path.join(a, 'app')
    const pb = path.join(b, 'app')
    fs.mkdirSync(pa)
    fs.mkdirSync(pb)
    run('state.ts', ['init', '--root', pa])
    run('state.ts', ['init', '--root', pb])
    assert(wsOf(pa) !== wsOf(pb), 'two projects collided on one workspace')
  })

  t('a corrupt state.json is refused with CORRUPT_STATE, not answered over', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    fs.writeFileSync(path.join(wsOf(d), 'state.json'), '{ this is not json')
    const r = run('state.ts', ['show', '--root', d])
    eq(r.code, 2, 'a damaged state file must stop every command, not fabricate a fresh snapshot')
    const s = json<Snapshot>(r)
    eq(s.ok, false)
    eq(s.error, 'CORRUPT_STATE')
    eq(s.initialized, false)
  })

  t('the ledger is append-only across operations', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    const led = path.join(wsOf(d), 'ledger.md')
    const before = fs.readFileSync(led, 'utf8')
    run('state.ts', ['note', 'decision', 'later entry', '--root', d])
    const after = fs.readFileSync(led, 'utf8')
    assert(after.startsWith(before), 'earlier ledger content was rewritten')
    assert(after.includes('later entry'))
  })

  t('concurrent mutators serialise on the lock — no write is lost', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    // A throwaway fan-out script fires the mutators at once; the suite itself
    // stays synchronous. Measured before the lock existed: 12 parallel notes,
    // 9 recorded, two survivors sharing one id.
    const fan = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'factory-fan-')), 'fan.mjs')
    fs.writeFileSync(
      fan,
      [
        "import { spawn } from 'node:child_process'",
        'const [script, root, n] = process.argv.slice(2)',
        'const kids = []',
        'for (let i = 0; i < Number(n); i++) {',
        '  kids.push(new Promise((res) => {',
        "    const p = spawn('node', [script, 'note', 'unfinished', 'item ' + i, '--root', root], { env: process.env })",
        "    p.on('exit', (code) => res(code))",
        '  }))',
        '}',
        'process.stdout.write(JSON.stringify(await Promise.all(kids)))',
        '',
      ].join('\n'),
    )
    const out = execFileSync('node', [fan, path.join(SCRIPTS, 'state.ts'), d, '8'], {
      encoding: 'utf8',
      env: { ...process.env, FACTORY_HOME: TEST_HOME },
    })
    const codes: Array<number | null> = JSON.parse(out)
    eq(codes.length, 8)
    assert(codes.every((c) => c === 0), `a concurrent note exited non-zero: ${codes.join(',')}`)
    const s = json<Snapshot>(run('state.ts', ['show', '--root', d]))
    eq(s.openCount, 8, 'a concurrent write was lost')
    eq(new Set((s.openItems ?? []).map((o) => o.n)).size, 8, 'two notes shared a sequence number')
  })

  t('phase done is refused — finish is the only terminal path', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    const r = run('state.ts', ['phase', 'done', '--root', d])
    eq(r.code, 1, 'phase done must exit 1')
    assert(/refusing/.test(r.out), 'expected the refusal to be explained')
    const s = json<Snapshot>(run('state.ts', ['show', '--root', d]))
    assert(s.phase !== 'done', 'the phase moved to done without finish')
  })

  t('nextAction is finish at review, and nextPhase is never done', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    for (const p of ['product', 'architecture', 'program-design', 'plan', 'implement', 'verify', 'review'] as const) {
      const s = json<Snapshot>(run('state.ts', ['phase', p, '--root', d]))
      assert(s.nextPhase !== 'done', `nextPhase pointed at done from ${p}`)
      assert(s.nextAction, `nextAction missing at ${p}`)
    }
    const s = json<Snapshot>(run('state.ts', ['show', '--root', d]))
    eq(s.phase, 'review')
    eq(s.nextPhase, null)
    eq(s.nextAction, 'finish')
  })

  t('tick rejects an unknown event and a non-numeric count, and accepts 0', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    eq(run('state.ts', ['tick', 'wibble', '--root', d]).code, 1, 'unknown event was counted')
    eq(run('state.ts', ['tick', 'read', 'lots', '--root', d]).code, 1, 'a non-numeric count was counted')
    const ok = json<{ counts: Record<string, number> }>(run('state.ts', ['tick', 'read', '0', '--root', d]))
    eq(ok.counts['read'] ?? -1, 0, 'tick read 0 must record 0, not 1')
  })

  t('a bare -- ends option parsing, so text may begin with a dash', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    const n = json<NoteResult>(run('state.ts', ['note', 'ruling', '--root', d, '--', '--force', 'on', 'main']))
    eq(n.ok, true)
    const ledger = fs.readFileSync(path.join(wsOf(d), 'ledger.md'), 'utf8')
    assert(ledger.includes('`: --force on main'), `the ruling text was mangled:\n${ledger.slice(-300)}`)
  })
})

// ------------------------------------------------------------- workspace

describe('workspace', () => {
  // findRoot is exercised through the real CLI by withholding --root, so the
  // script resolves from its cwd. HOME is pointed at a throwaway dotfiles home;
  // os.homedir() reads $HOME on POSIX.
  t('a dotfiles repo in $HOME does not swallow a plain project inside it', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-fakehome-'))
    fs.mkdirSync(path.join(home, '.git'))
    const proj = path.join(home, 'scratch')
    fs.mkdirSync(proj)
    const s = json<Snapshot>(run('state.ts', ['show'], { cwd: proj, env: { HOME: home } }))
    eq(s.root, proj, 'findRoot climbed past the project and claimed $HOME')
  })

  t('the boundary is $HOME, not one level — a nested path still finds its project', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-fakehome-'))
    fs.mkdirSync(path.join(home, '.git'))
    const proj = path.join(home, 'proj')
    const deep = path.join(proj, 'src', 'deep')
    fs.mkdirSync(path.join(proj, '.git'), { recursive: true })
    fs.mkdirSync(deep, { recursive: true })
    const s = json<Snapshot>(run('state.ts', ['show'], { cwd: deep, env: { HOME: home } }))
    eq(s.root, proj)
  })

  t('a start that IS $HOME is still tested — the user pointed there', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-fakehome-'))
    fs.mkdirSync(path.join(home, '.git'))
    const s = json<Snapshot>(run('state.ts', ['show'], { cwd: home, env: { HOME: home } }))
    eq(s.root, home)
  })
})

// --------------------------------------------------------------- skills.ts

describe('skills', () => {
  t('list finds skills reached through a symlink', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-home-'))
    const real = path.join(home, 'real', 'linked-skill')
    fs.mkdirSync(real, { recursive: true })
    fs.writeFileSync(path.join(real, 'SKILL.md'), '---\nname: linked-skill\ndescription: x\n---\n')
    const skills = path.join(home, '.claude', 'skills')
    fs.mkdirSync(skills, { recursive: true })
    fs.symlinkSync(real, path.join(skills, 'linked-skill'))
    const r = json<SkillListResult>(run('skills.ts', ['list'], { env: { CLAUDE_CONFIG_DIR: path.join(home, '.claude') } }))
    assert(r.skills.some((s) => s.name === 'linked-skill'), 'symlinked skill was not discovered')
  })

  t('a symlink cycle does not hang the walker', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-cycle-'))
    const skills = path.join(home, '.claude', 'skills')
    fs.mkdirSync(skills, { recursive: true })
    const a = path.join(skills, 'a')
    fs.mkdirSync(a)
    fs.symlinkSync(skills, path.join(a, 'loop'))
    const r = run('skills.ts', ['list'], { env: { CLAUDE_CONFIG_DIR: path.join(home, '.claude') } })
    eq(r.code, 0, 'walker did not terminate cleanly on a symlink cycle')
  })

  t('resolve names a playbook that exists on disk', () => {
    const r = json<ResolveSkillsOk>(run('skills.ts', ['resolve', 'design-ui', '--json']))
    eq(r.ok, true)
    assert(fs.existsSync(r.playbook), `playbook missing: ${r.playbook}`)
  })

  t('every job in the map points at a playbook that exists', () => {
    const r = json<SkillsDoctor>(run('skills.ts', ['doctor']))
    const broken = Object.entries(r.jobs).filter(([, v]) => !v.playbookExists).map(([k]) => k)
    eq(broken, [], 'jobs with a missing playbook')
  })

  t('resolve rejects an unknown job and lists the valid ones', () => {
    const r = json<ResolveSkillsFail>(run('skills.ts', ['resolve', 'not-a-job', '--json']))
    eq(r.ok, false)
    assert(Array.isArray(r.jobs) && r.jobs.length > 5, 'expected the valid job list back')
  })

  t('a missing skill comes back with a degraded path', () => {
    const r = json<ResolveSkillsOk>(run('skills.ts', ['resolve', 'design-ui', '--json']))
    for (const s of [...r.prefer, ...r.also]) {
      if (s.status === 'missing') assert(s.degrade && s.degrade.length > 20, `${s.name} has no usable degrade note`)
    }
  })

  t('every skill named by a job has a registry entry or is a builtin', () => {
    const map: SkillMap = JSON.parse(fs.readFileSync(path.join(SCRIPTS, 'skill-map.json'), 'utf8'))
    const named = new Set(Object.values(map.jobs).flatMap((j) => [...(j.prefer || []), ...(j.also || [])]))
    const missing = [...named].filter((n) => !map.registry[n])
    eq(missing, [], 'skills routed to but absent from the registry')
  })

  t('every external id referenced by a job is defined', () => {
    const map: SkillMap = JSON.parse(fs.readFileSync(path.join(SCRIPTS, 'skill-map.json'), 'utf8'))
    const named = new Set(Object.values(map.jobs).flatMap((j) => j.external || []))
    const missing = [...named].filter((n) => !map.external[n])
    eq(missing, [], 'external ids referenced but undefined')
  })

  t('frontmatter block scalars resolve to their text, not the indicator', () => {
    // Project scope is searched first, so these win any same-named install.
    const d = project({ git: false })
    write(
      d,
      '.claude/skills/full-output-enforcement/SKILL.md',
      ['---', 'name: full-output-enforcement', 'description: >-', '  First line of', '  the description.', '---', ''].join('\n'),
    )
    write(
      d,
      '.claude/skills/code-structure/SKILL.md',
      ['---', 'name: code-structure', 'description: |', '  Line one', '  line two', '---', ''].join('\n'),
    )
    const impl = json<ResolveSkillsOk>(run('skills.ts', ['resolve', 'implement', '--json'], { cwd: d }))
    const folded = impl.prefer.find((s) => s.name === 'full-output-enforcement')
    assert(folded, 'the project skill was not resolved')
    eq(folded.status, 'installed')
    eq(folded.description, 'First line of the description.')
    const arch = json<ResolveSkillsOk>(run('skills.ts', ['resolve', 'architecture', '--json'], { cwd: d }))
    const literal = arch.also.find((s) => s.name === 'code-structure')
    assert(literal, 'the literal-scalar skill was not resolved')
    eq(literal.description, 'Line one\nline two')
  })

  t('a plugin skill at marketplace depth is found', () => {
    // plugins/marketplaces/<mp>/plugins/<plugin>/skills/<skill> is six levels
    // under the plugin root; a shallower walk never reached it.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-plugins-'))
    const skillDir = path.join(home, '.claude', 'plugins', 'marketplaces', 'mp', 'plugins', 'pl', 'skills', 'deep-skill')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: deep-plugin-skill\ndescription: x\n---\n')
    const r = json<{ skills: Array<{ name: string; scope: string }> }>(
      run('skills.ts', ['list'], { env: { CLAUDE_CONFIG_DIR: path.join(home, '.claude') } }),
    )
    const s = r.skills.find((x) => x.name === 'deep-plugin-skill')
    assert(s, 'a plugin-scope skill at marketplace depth was not discovered')
    eq(s.scope, 'plugin')
  })
})

// ----------------------------------------------------------------- slop.ts

describe('slop', () => {
  t('a brace inside a template literal does not extend a function body', () => {
    const d = project()
    write(d, 'a.js', ['function small() {', '  const s = `a ${x} b {{{ c`', '  return s', '}', '', 'function next() {', '  return 1', '}', ''].join('\n'))
    const r = json<ScanOk>(run('slop.ts', ['scan', d, '--json']))
    const small = r.worst.find((w) => w.name === 'small')
    assert(small, 'small() was not detected')
    assert(small.sloc <= 4, `body leaked past the function: ${small.sloc} sloc`)
  })

  t('a brace inside a block comment does not extend a function body', () => {
    const d = project()
    write(d, 'a.js', ['function small() {', '  /* { { { */', '  return 1', '}', 'function next() { return 2 }', ''].join('\n'))
    const r = json<ScanOk>(run('slop.ts', ['scan', d, '--json']))
    const small = r.worst.find((w) => w.name === 'small')
    assert(small && small.sloc <= 4, 'block comment braces leaked into the body')
  })

  t('a one-line expression arrow is not counted as a block function', () => {
    const d = project()
    write(d, 'a.js', ['const tiny = (p) => /x{2}/.test(p)', 'function big() {', '  if (a) { if (b) { if (c) { return 1 } } }', '  return 0', '}', ''].join('\n'))
    const r = json<ScanOk>(run('slop.ts', ['scan', d, '--json']))
    assert(!r.worst.some((w) => w.name === 'tiny'), 'expression arrow was measured as a function body')
  })

  t('a branch keyword inside a string does not inflate complexity', () => {
    const d = project()
    write(d, 'a.js', ['function f() {', '  const msg = "if for while case if for while case"', '  return msg', '}', ''].join('\n'))
    const r = json<ScanOk>(run('slop.ts', ['scan', d, '--json']))
    const f = r.worst.find((w) => w.name === 'f')
    assert(f, 'f() not detected')
    assert(f.cc <= 2, `string contents counted as branches: cc=${f.cc}`)
  })

  t('erosion and verbosity are finite numbers in [0,1]', () => {
    const d = project()
    write(d, 'a.js', 'function f() {\n  return 1\n}\n')
    const r = json<ScanOk>(run('slop.ts', ['scan', d, '--json']))
    for (const k of ['erosion', 'verbosity'] as const) {
      assert(Number.isFinite(r[k]), `${k} is not finite: ${r[k]}`)
      assert(r[k] >= 0 && r[k] <= 1, `${k} out of range: ${r[k]}`)
    }
  })

  t('a directory with no source files reports rather than crashing', () => {
    const d = project()
    write(d, 'notes.txt', 'hello')
    const r = json<ScanFail>(run('slop.ts', ['scan', d, '--json']))
    eq(r.ok, false)
    assert(/no source files/.test(r.error))
  })

  t('test files are excluded from the measurement', () => {
    const d = project()
    write(d, 'src/a.js', 'function f() {\n  return 1\n}\n')
    write(d, 'src/a.test.js', ['function t() {', ...Array.from({ length: 30 }, (_, i) => `  if (x${i}) { y() }`), '}', ''].join('\n'))
    const r = json<ScanOk>(run('slop.ts', ['scan', d, '--json']))
    assert(!r.worst.some((w) => w.at.includes('.test.')), 'a test file was measured')
  })

  t('placeholder markers are flagged', () => {
    const d = project()
    write(d, 'a.js', 'function f() {\n  // TODO: implement this\n  return null\n}\n')
    const r = json<ScanOk>(run('slop.ts', ['scan', d, '--json']))
    assert((r.ruleHits['placeholder'] ?? 0) >= 1, 'placeholder not flagged')
  })

  t('check without a baseline reports the absence as the breach', () => {
    const d = project()
    write(d, 'a.js', 'function f() {\n  return 1\n}\n')
    const r = run('slop.ts', ['check', d])
    assert(r.code === 1, 'expected a non-zero exit with no baseline')
    assert(/no baseline/.test(r.out), 'expected the missing baseline to be named')
  })

  t('baseline then unchanged check passes', () => {
    const d = project()
    write(d, 'a.js', 'function f() {\n  return 1\n}\n')
    run('slop.ts', ['baseline', d], { cwd: d })
    assert(fs.existsSync(path.join(wsOf(d), 'slop-baseline.json')), 'baseline file not written')
    const r = run('slop.ts', ['check'], { cwd: d })
    eq(r.code, 0, `check should pass on an unchanged tree:\n${r.out}`)
  })

  t('adding a placeholder after a baseline breaches the check', () => {
    const d = project()
    write(d, 'a.js', 'function f() {\n  return 1\n}\n')
    run('slop.ts', ['baseline'], { cwd: d })
    write(d, 'b.js', 'function g() {\n  // TODO: implement\n  return 0\n}\n')
    const r = run('slop.ts', ['check'], { cwd: d })
    eq(r.code, 1, 'placeholder after baseline should breach')
    assert(/CONSOLIDATE/.test(r.out))
  })

  t('python function bodies are bounded by indentation', () => {
    const d = project()
    write(d, 'a.py', ['def small():', '    return 1', '', 'def other():', '    if a:', '        if b:', '            return 2', '    return 3', ''].join('\n'))
    const r = json<ScanOk>(run('slop.ts', ['scan', d, '--json']))
    const small = r.worst.find((w) => w.name === 'small')
    if (small) assert(small.sloc <= 2, `python body leaked: ${small.sloc}`)
  })

  t('a multi-line template literal with braces does not derail the brace counter', () => {
    // The single-line case is pinned above; spanning lines is what produced a
    // 1463-line "function" measured at CC 737.
    const d = project()
    write(
      d,
      'a.js',
      ['function small() {', '  const s = `a { b', '  still { inside', '  `', '  return s', '}', 'function next() {', '  const a = 1', '  return a', '}', ''].join('\n'),
    )
    const r = json<ScanOk>(run('slop.ts', ['scan', d, '--json']))
    const small = r.worst.find((w) => w.name === 'small')
    assert(small, 'small() vanished — template text was counted as code')
    assert(small.sloc <= 3, `body leaked past the function: ${small.sloc} sloc`)
    assert(r.worst.some((w) => w.name === 'next'), 'next() was swallowed into small()')
  })

  t('a multi-line block comment with braces does not derail the brace counter', () => {
    const d = project()
    write(
      d,
      'a.js',
      ['function small() {', '  /* a { brace', '     and another { here', '  */', '  const x = 1', '  return x', '}', 'function next() {', '  const a = 1', '  return a', '}', ''].join('\n'),
    )
    const r = json<ScanOk>(run('slop.ts', ['scan', d, '--json']))
    const small = r.worst.find((w) => w.name === 'small')
    assert(small, 'small() vanished — comment text was counted as code')
    assert(small.sloc <= 3, `comment braces leaked into the body: ${small.sloc} sloc`)
    assert(r.worst.some((w) => w.name === 'next'), 'next() was swallowed into small()')
  })

  t('a regex literal after `return` is not read as division', () => {
    // `return` ends in a word character, so the character rule cannot see it;
    // read as division, the `{` below keeps the body from ever balancing.
    const d = project()
    write(
      d,
      'a.js',
      ['function f(s) {', '  if (!s) return 0', '  return /{/.test(s)', '}', 'function g() {', '  const a = 1', '  return a + 1', '}', ''].join('\n'),
    )
    const r = json<ScanOk>(run('slop.ts', ['scan', d, '--json']))
    const f = r.worst.find((w) => w.name === 'f')
    assert(f, 'f() vanished — the regex after return was lexed as division and the body never balanced')
    assert(f.sloc <= 3, `body leaked: ${f.sloc} sloc`)
  })

  t('an unterminated string stops at the newline instead of swallowing the file', () => {
    const d = project()
    write(
      d,
      'a.js',
      ['function f() {', '  const s = "never closed', '  return 1', '}', 'function g() {', '  const a = 1', '  return a + 1', '}', ''].join('\n'),
    )
    const r = json<ScanOk>(run('slop.ts', ['scan', d, '--json']))
    assert(r.worst.some((w) => w.name === 'f'), 'f() vanished')
    assert(r.worst.some((w) => w.name === 'g'), 'g() vanished — the unterminated string swallowed the rest of the file')
  })

  t('--top with a non-number falls back rather than emptying the report', () => {
    const d = project()
    write(d, 'a.js', 'function f() {\n  const a = 1\n  return a\n}\n')
    const r = json<ScanOk>(run('slop.ts', ['scan', d, '--json', '--top', 'abc']))
    assert(r.worst.length >= 1, '--top abc reached slice() as NaN and the heaviest-callables list vanished')
  })
})

// ---------------------------------------------------------------- hooks.ts

describe('hooks', () => {
  t('on then off leaves settings.json as it was found', () => {
    const d = project()
    write(d, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(ls)'] } }, null, 2) + '\n')
    const before = fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8')
    run('hooks.ts', ['on'], { cwd: d })
    run('hooks.ts', ['off'], { cwd: d })
    const after: ClaudeSettings = JSON.parse(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8'))
    eq(after, JSON.parse(before), 'unrelated settings were not preserved')
  })

  t('on preserves a pre-existing Stop hook belonging to someone else', () => {
    const d = project()
    write(
      d,
      '.claude/settings.json',
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo theirs' }] }] } }, null, 2) + '\n',
    )
    run('hooks.ts', ['on'], { cwd: d })
    run('hooks.ts', ['off'], { cwd: d })
    const after: ClaudeSettings = JSON.parse(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8'))
    const cmds = (after.hooks?.['Stop'] || []).flatMap((g) => g.hooks.map((h) => h.command))
    eq(cmds, ['echo theirs'], "another tool's Stop hook was destroyed")
  })

  t('on is idempotent — twice installs one hook', () => {
    const d = project()
    run('hooks.ts', ['on'], { cwd: d })
    run('hooks.ts', ['on'], { cwd: d })
    const s: ClaudeSettings = JSON.parse(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8'))
    const mine = (s.hooks?.['Stop'] || []).flatMap((g) => g.hooks).filter((h) => h.command?.includes('factory:stop-gate'))
    eq(mine.length, 1, 'duplicate hooks installed')
  })

  t('gate passes on a clean diff', () => {
    const d = project()
    write(d, 'a.js', 'const a = 1\n')
    commitAll(d)
    const r = run('hooks.ts', ['gate'], { cwd: d, input: '{"stop_hook_active":false}' })
    eq(r.code, 0, `expected pass, stderr: ${r.err}`)
  })

  t('gate blocks a placeholder added in the working tree', () => {
    const d = project()
    write(d, 'a.js', 'const a = 1\n')
    commitAll(d)
    fs.appendFileSync(path.join(d, 'a.js'), '// TODO: implement payments\n')
    const r = run('hooks.ts', ['gate'], { cwd: d, input: '{"stop_hook_active":false}' })
    eq(r.code, 2, 'expected exit 2')
    assert(/Law 4/.test(r.err), 'expected the law to be named in the block reason')
  })

  t('gate ignores a placeholder inside a test file', () => {
    const d = project()
    write(d, 'a.js', 'const a = 1\n')
    commitAll(d)
    write(d, 'a.test.js', '// TODO: implement this test\n')
    const r = run('hooks.ts', ['gate'], { cwd: d, input: '{"stop_hook_active":false}' })
    eq(r.code, 0, 'test files should not trip the gate')
  })

  t('gate does not block twice — stop_hook_active is honoured', () => {
    const d = project()
    write(d, 'a.js', 'const a = 1\n')
    commitAll(d)
    fs.appendFileSync(path.join(d, 'a.js'), '// TODO: implement payments\n')
    const r = run('hooks.ts', ['gate'], { cwd: d, input: '{"stop_hook_active":true}' })
    eq(r.code, 0, 'a second block would trap the session in a loop')
  })

  t('gate survives an empty stdin', () => {
    const d = project()
    write(d, 'a.js', 'const a = 1\n')
    commitAll(d)
    const r = run('hooks.ts', ['gate'], { cwd: d, input: '' })
    eq(r.code, 0)
  })

  t('gate stays quiet on a repo with no commits', () => {
    const d = project()
    write(d, 'a.js', '// TODO: implement\n')
    const r = run('hooks.ts', ['gate'], { cwd: d, input: '{"stop_hook_active":false}' })
    eq(r.code, 0, 'nothing to diff against on an unborn repo')
  })

  t('status reports what the gate actually checks', () => {
    const d = project()
    const s = json<HooksStatus>(run('hooks.ts', ['status'], { cwd: d }))
    eq(s.installed, false)
    assert(Array.isArray(s.checks) && s.checks.length >= 2)
  })

  t('gate blocks a placeholder in an untracked file', () => {
    // `git diff` never reports untracked paths, so a brand-new file — the usual
    // shape of agent-authored code — once bypassed the gate entirely.
    const d = project()
    write(d, 'a.js', 'const a = 1\n')
    commitAll(d)
    write(d, 'new.js', '// TODO: implement the feature\n')
    const r = run('hooks.ts', ['gate'], { cwd: d, input: '{"stop_hook_active":false}' })
    eq(r.code, 2, 'an untracked file bypassed the gate')
    assert(/new\.js/.test(r.err), 'the untracked file was not named')
  })

  t('on refuses to write over a settings.json it cannot parse', () => {
    const d = project()
    write(d, '.claude/settings.json', '{ not json')
    const r = run('hooks.ts', ['on'], { cwd: d })
    assert(r.code !== 0, 'expected a refusal, not a silent replacement')
    assert(/Refusing to write/.test(r.out), 'expected the refusal to be explained')
    eq(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8'), '{ not json', 'unparseable settings were overwritten')
  })

  t('gate attributes added lines to the right file when the path is non-ASCII', () => {
    // git C-quotes such paths in the +++ header; a header the parser does not
    // recognise leaves the previous file's name in place. Here that previous
    // file is a test file, so a wrong attribution would silence the block.
    const d = project()
    write(d, 'a.test.js', 'const t = 1\n')
    write(d, 'café.js', 'const c = 1\n')
    commitAll(d)
    fs.appendFileSync(path.join(d, 'a.test.js'), 'const t2 = 2\n')
    fs.appendFileSync(path.join(d, 'café.js'), '// TODO: implement the café feature\n')
    const r = run('hooks.ts', ['gate'], { cwd: d, input: '{"stop_hook_active":false}' })
    eq(r.code, 2, 'a placeholder in a non-ASCII path was missed or misattributed')
    assert(/café\.js/.test(r.err), `the finding named the wrong file:\n${r.err.slice(0, 300)}`)
  })

  t('gate treats _, - and plural delimited test files as tests', () => {
    const d = project()
    write(d, 'a.js', 'const a = 1\n')
    commitAll(d)
    write(d, 'thing_test.go', '// TODO: implement this test\n')
    write(d, 'thing-test.js', '// TODO: implement this test\n')
    write(d, 'unit_specs.js', '// TODO: implement this test\n')
    const r = run('hooks.ts', ['gate'], { cwd: d, input: '{"stop_hook_active":false}' })
    eq(r.code, 0, `test-file vocabulary was not recognised:\n${r.err.slice(0, 300)}`)
  })
})

/** A throwaway copy of the skill, so doctor can be pointed at a tree broken on purpose. */
const stageSkill = (): string => {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-doctor-'))
  for (const d of ['scripts', 'scripts/lib', 'reference']) fs.mkdirSync(path.join(stage, d), { recursive: true })
  for (const f of fs.readdirSync(SCRIPTS)) {
    const src = path.join(SCRIPTS, f)
    if (fs.statSync(src).isDirectory()) continue
    fs.copyFileSync(src, path.join(stage, 'scripts', f))
  }
  for (const f of fs.readdirSync(path.join(SCRIPTS, 'lib'))) {
    fs.copyFileSync(path.join(SCRIPTS, 'lib', f), path.join(stage, 'scripts/lib', f))
  }
  for (const f of fs.readdirSync(path.join(path.dirname(SCRIPTS), 'reference'))) {
    fs.copyFileSync(path.join(path.dirname(SCRIPTS), 'reference', f), path.join(stage, 'reference', f))
  }
  for (const f of ['SKILL.md', 'README.md']) {
    fs.copyFileSync(path.join(path.dirname(SCRIPTS), f), path.join(stage, f))
  }
  return stage
}

describe('doctor', () => {
  t('the skill passes its own integrity check', () => {
    const r = run('doctor.ts', ['--json'])
    const d = json<DoctorReport>(r)
    eq(d.problems, [], 'doctor found problems in the shipped skill')
    eq(r.code, 0)
  })

  t('doctor exits non-zero when a playbook link is broken', () => {
    // Prove the check can fail, not just that it passes today.
    const stage = stageSkill()
    fs.unlinkSync(path.join(stage, 'reference/verify.md'))
    const r = spawnSync('node', [path.join(stage, 'scripts/doctor.ts'), '--json'], { encoding: 'utf8' })
    const d: DoctorReport = JSON.parse(r.stdout)
    eq(r.status, 1, 'doctor should fail on a missing playbook')
    assert(d.problems.some((p) => /verify\.md/.test(p.msg)), 'the missing playbook was not named')
  })

  t('a stale pre-TypeScript filename in the scripts themselves is flagged', () => {
    // The scan used to read only the playbooks, so dead pointers lived on in
    // the scripts' own headers. A hook filename the user writes is not one of
    // the skill's former names and must not be flagged.
    const stage = stageSkill()
    fs.appendFileSync(path.join(stage, 'scripts/state.ts'), '\n//   node scripts/state.mjs init\n')
    fs.appendFileSync(path.join(stage, 'scripts/hooks.ts'), '\n// example hook you write yourself: node .claude/hooks/format-edited.mjs\n')
    const r = spawnSync('node', [path.join(stage, 'scripts/doctor.ts'), '--json'], { encoding: 'utf8' })
    const d: DoctorReport = JSON.parse(r.stdout)
    eq(r.status, 1, 'doctor should fail on a stale filename in a script header')
    assert(
      d.problems.some((p) => p.where === 'scripts/state.ts' && /state\.mjs/.test(p.msg)),
      'the stale reference in scripts/state.ts was not named',
    )
    assert(!d.problems.some((p) => /format-edited/.test(p.msg)), 'a hook the user writes was flagged as stale')
  })

  t('a stale pre-TypeScript filename in skill-map.json is flagged', () => {
    // The map routes the agent and its install lines are run verbatim, so a
    // dead pointer there is the worst kind. Inject one while keeping the JSON
    // valid, and expect doctor to name the file.
    const stage = stageSkill()
    const mapFile = path.join(stage, 'scripts/skill-map.json')
    fs.writeFileSync(
      mapFile,
      fs.readFileSync(mapFile, 'utf8').replace('skills.ts resolves a job kind', 'skills.mjs resolves a job kind'),
    )
    const r = spawnSync('node', [path.join(stage, 'scripts/doctor.ts'), '--json'], { encoding: 'utf8' })
    const d: DoctorReport = JSON.parse(r.stdout)
    eq(r.status, 1, 'doctor should fail on a stale filename in skill-map.json')
    assert(
      d.problems.some((p) => p.where === 'skill-map.json' && /skills\.mjs/.test(p.msg)),
      'the stale reference in skill-map.json was not named',
    )
  })
})

// -------------------------------------------------------------- context.ts

describe('context', () => {
  t('brief on an uninitialised project emits NOT_INITIALIZED', () => {
    const d = project()
    const r = run('context.ts', ['--root', d, '--brief'])
    eq(r.code, 0)
    assert(/NOT_INITIALIZED/.test(r.out))
  })

  t('a git repo with no commits is still recognised as a repo', () => {
    const d = project()
    write(d, 'a.txt', 'x')
    const r = json<ContextReport>(run('context.ts', ['--root', d]))
    eq(r.git.repo, true)
    eq(r.git.unborn, true)
  })

  t('active work produces a RESUME directive', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--title', 'Work', '--root', d])
    const r = json<ContextReport>(run('context.ts', ['--root', d]))
    assert(r.directives.some((x) => x.code === 'RESUME'), 'expected RESUME')
  })

  t('open items are surfaced as a directive', () => {
    const d = project()
    run('state.ts', ['init', '--root', d])
    run('state.ts', ['start', 'w', '--root', d])
    run('state.ts', ['note', 'unfinished', 'thing', '--root', d])
    const r = json<ContextReport>(run('context.ts', ['--root', d]))
    assert(r.directives.some((x) => x.code === 'OPEN_ITEMS'))
  })

  t('a malformed package.json does not crash the bootstrap', () => {
    const d = project()
    write(d, 'package.json', '{ nope')
    const r = run('context.ts', ['--root', d, '--brief'])
    eq(r.code, 0, `crashed: ${r.err.slice(0, 200)}`)
  })

  t('test and build commands are detected from package.json', () => {
    const d = project()
    write(d, 'package.json', JSON.stringify({ scripts: { test: 'vitest', build: 'tsc' } }))
    const r = json<ContextReport>(run('context.ts', ['--root', d]))
    eq(r.project.testCommand, 'npm test')
    eq(r.project.buildCommand, 'npm run build')
  })
})

// ---------------------------------------------------------------- reporting

process.stdout.write('\n\n')
if (failures.length) {
  for (const f of failures) console.log(`FAIL  ${f.group} › ${f.name}\n      ${f.error.replace(/\n/g, '\n      ')}\n`)
}
console.log(`${pass} passed, ${failures.length} failed`)
process.exit(failures.length ? 1 : 0)
