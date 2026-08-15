#!/usr/bin/env node
// factory test suite — no dependencies, no framework.
//
// Law 1 applies to this skill's own code: a script that has not been run
// against a hostile input has not been verified. Every test here builds a
// throwaway project under os.tmpdir(), so nothing touches a real repo.
//
//   node test/run.mjs           run everything
//   node test/run.mjs state     run one group

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS = path.join(path.dirname(HERE), 'scripts')
const only = process.argv[2] || null

// Every test's workspace lands here, so a run never touches the shared temp
// location a real project would use.
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-home-root-'))

let pass = 0
const failures = []
let group = ''

const t = (name, fn) => {
  if (only && group !== only) return
  try {
    fn()
    pass++
    process.stdout.write('.')
  } catch (e) {
    failures.push({ group, name, error: e.message })
    process.stdout.write('F')
  }
}
const describe = (g, fn) => {
  group = g
  fn()
  group = ''
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${msg || 'not equal'}\n    expected: ${b}\n    actual:   ${a}`)
}

/** Run a factory script. Never throws on a non-zero exit — the code is the data. */
function run(script, args = [], opts = {}) {
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
const json = (r) => {
  try {
    return JSON.parse(r.out)
  } catch {
    throw new Error(`expected JSON on stdout, got:\n${r.out.slice(0, 300)}\n${r.err.slice(0, 300)}`)
  }
}

/** The workspace directory the scripts resolved for this project. */
const wsOf = (dir) => json(run('state.mjs', ['show', '--root', dir])).workspace

let tmpCount = 0
function project({ git = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `factory-test-${tmpCount++}-`))
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
  }
  return dir
}
const commitAll = (dir, msg = 'x') => {
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', msg], { cwd: dir })
}
const write = (dir, rel, body) => {
  const p = path.join(dir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
  return p
}

// ---------------------------------------------------------------- state.mjs

describe('state', () => {
  t('show before init reports NOT_INITIALIZED rather than crashing', () => {
    const d = project()
    const s = json(run('state.mjs', ['show', '--root', d]))
    eq(s.initialized, false)
    assert(/NOT_INITIALIZED/.test(s.directive), 'expected a NOT_INITIALIZED directive')
  })

  t('init is idempotent', () => {
    const d = project()
    const a = json(run('state.mjs', ['init', '--root', d]))
    const b = json(run('state.mjs', ['init', '--root', d]))
    eq(a.created, true)
    eq(b.already, true)
    eq(b.phase, 'research')
  })

  t('start creates the work dir and resets the session', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    const s = json(run('state.mjs', ['start', 'auth', '--title', 'Auth rework', '--root', d]))
    eq(s.work.slug, 'auth')
    eq(s.work.title, 'Auth rework')
    assert(fs.existsSync(path.join(wsOf(d), 'work/auth/evidence')), 'evidence dir missing')
  })

  t('a --title containing spaces and a dash survives argument parsing', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    const s = json(run('state.mjs', ['start', 'x', '--title', 'Fix the login — really', '--root', d]))
    eq(s.work.title, 'Fix the login — really')
  })

  t('phase rejects an unknown phase with a non-zero exit', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    const r = run('state.mjs', ['phase', 'wibble', '--root', d])
    assert(r.code !== 0, 'expected non-zero exit')
    assert(/unknown phase/.test(r.out), 'expected an explanatory error')
  })

  t('note records unfinished as an open item and resolve closes it', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    run('state.mjs', ['start', 'w', '--root', d])
    const n = json(run('state.mjs', ['note', 'unfinished', 'rate limiting missing', '--root', d]))
    eq(n.openCount, 1)
    const r = json(run('state.mjs', ['resolve', String(n.n), '--root', d]))
    eq(r.resolved, true)
    eq(r.openCount, 0)
  })

  t('a ruling is logged but is not an open item', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    run('state.mjs', ['start', 'w', '--root', d])
    const n = json(run('state.mjs', ['note', 'ruling', 'JWT over sessions', '--root', d]))
    eq(n.openCount, 0)
    assert(fs.readFileSync(path.join(wsOf(d), 'ledger.md'), 'utf8').includes('JWT over sessions'))
  })

  t('note rejects an unknown kind', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    const r = run('state.mjs', ['note', 'wibble', 'text', '--root', d])
    assert(r.code !== 0, 'expected non-zero exit')
  })

  t('crossing the slice cap returns HANDOFF_NOW', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    run('state.mjs', ['start', 'w', '--root', d])
    let last
    for (let i = 1; i <= 3; i++) last = json(run('state.mjs', ['slice', `${i}/5`, '--root', d]))
    eq(last.pressure.level, 'handoff')
    assert(/HANDOFF_NOW/.test(last.pressure.directive))
  })

  t('approaching a cap warns before it blocks', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    run('state.mjs', ['start', 'w', '--root', d])
    const r = json(run('state.mjs', ['tick', 'edit', '45', '--root', d]))
    eq(r.pressure.level, 'warn')
  })

  t('finish refuses while an item is open, and succeeds once it is resolved', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    run('state.mjs', ['start', 'w', '--root', d])
    const n = json(run('state.mjs', ['note', 'unfinished', 'x', '--root', d]))
    const blocked = run('state.mjs', ['finish', '--root', d])
    assert(blocked.code !== 0, 'finish should refuse with an open item')
    run('state.mjs', ['resolve', String(n.n), '--root', d])
    const ok = json(run('state.mjs', ['finish', '--root', d]))
    eq(ok.ok, true)
    eq(ok.phase, 'done')
  })

  t('handoff numbering increments across successive handoffs', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    run('state.mjs', ['start', 'w', '--root', d])
    const a = json(run('state.mjs', ['handoff', '--root', d]))
    const b = json(run('state.mjs', ['handoff', '--root', d]))
    eq(a.handoffNumber, 1)
    eq(b.handoffNumber, 2)
  })

  t('handoff resets the session counters but keeps open items', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    run('state.mjs', ['start', 'w', '--root', d])
    run('state.mjs', ['note', 'unfinished', 'keep me', '--root', d])
    run('state.mjs', ['tick', 'edit', '10', '--root', d])
    run('state.mjs', ['handoff', '--root', d])
    const s = json(run('state.mjs', ['show', '--root', d]))
    eq(s.session.counts, {})
    eq(s.openItems.length, 1)
  })

  t('the workspace defaults OUTSIDE the project — no .factory in the repo', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    run('state.mjs', ['start', 'w', '--root', d])
    run('state.mjs', ['note', 'decision', 'x', '--root', d])
    assert(!fs.existsSync(path.join(d, '.factory')), 'the factory wrote into the user\'s project')
    const s = json(run('state.mjs', ['show', '--root', d]))
    eq(s.inProject, false)
    assert(s.workspace.startsWith(TEST_HOME), `workspace escaped FACTORY_HOME: ${s.workspace}`)
  })

  t('--in-project puts the workspace in the repo when asked', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d, '--in-project'])
    const s = json(run('state.mjs', ['show', '--root', d]))
    eq(s.inProject, true)
    assert(fs.existsSync(path.join(d, '.factory/state.json')), 'opt-in workspace not created in project')
  })

  t('an existing in-project workspace keeps winning without the flag', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d, '--in-project'])
    run('state.mjs', ['start', 'w', '--root', d])
    const s = json(run('state.mjs', ['show', '--root', d]))
    eq(s.inProject, true)
  })

  t('two projects with the same basename get different workspaces', () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'same-name-a-'))
    const b = fs.mkdtempSync(path.join(os.tmpdir(), 'same-name-b-'))
    const pa = path.join(a, 'app')
    const pb = path.join(b, 'app')
    fs.mkdirSync(pa)
    fs.mkdirSync(pb)
    run('state.mjs', ['init', '--root', pa])
    run('state.mjs', ['init', '--root', pb])
    assert(wsOf(pa) !== wsOf(pb), 'two projects collided on one workspace')
  })

  t('a corrupt state.json does not crash show', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    fs.writeFileSync(path.join(wsOf(d), 'state.json'), '{ this is not json')
    const s = json(run('state.mjs', ['show', '--root', d]))
    assert(s.initialized === true || s.initialized === false, 'show must still answer')
  })

  t('the ledger is append-only across operations', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    run('state.mjs', ['start', 'w', '--root', d])
    const led = path.join(wsOf(d), 'ledger.md')
    const before = fs.readFileSync(led, 'utf8')
    run('state.mjs', ['note', 'decision', 'later entry', '--root', d])
    const after = fs.readFileSync(led, 'utf8')
    assert(after.startsWith(before), 'earlier ledger content was rewritten')
    assert(after.includes('later entry'))
  })
})

// --------------------------------------------------------------- skills.mjs

describe('skills', () => {
  t('list finds skills reached through a symlink', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-home-'))
    const real = path.join(home, 'real', 'linked-skill')
    fs.mkdirSync(real, { recursive: true })
    fs.writeFileSync(path.join(real, 'SKILL.md'), '---\nname: linked-skill\ndescription: x\n---\n')
    const skills = path.join(home, '.claude', 'skills')
    fs.mkdirSync(skills, { recursive: true })
    fs.symlinkSync(real, path.join(skills, 'linked-skill'))
    const r = json(run('skills.mjs', ['list'], { env: { CLAUDE_CONFIG_DIR: path.join(home, '.claude') } }))
    assert(r.skills.some((s) => s.name === 'linked-skill'), 'symlinked skill was not discovered')
  })

  t('a symlink cycle does not hang the walker', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-cycle-'))
    const skills = path.join(home, '.claude', 'skills')
    fs.mkdirSync(skills, { recursive: true })
    const a = path.join(skills, 'a')
    fs.mkdirSync(a)
    fs.symlinkSync(skills, path.join(a, 'loop'))
    const r = run('skills.mjs', ['list'], { env: { CLAUDE_CONFIG_DIR: path.join(home, '.claude') } })
    eq(r.code, 0, 'walker did not terminate cleanly on a symlink cycle')
  })

  t('resolve names a playbook that exists on disk', () => {
    const r = json(run('skills.mjs', ['resolve', 'design-ui', '--json']))
    eq(r.ok, true)
    assert(fs.existsSync(r.playbook), `playbook missing: ${r.playbook}`)
  })

  t('every job in the map points at a playbook that exists', () => {
    const r = json(run('skills.mjs', ['doctor']))
    const broken = Object.entries(r.jobs).filter(([, v]) => !v.playbookExists).map(([k]) => k)
    eq(broken, [], 'jobs with a missing playbook')
  })

  t('resolve rejects an unknown job and lists the valid ones', () => {
    const r = json(run('skills.mjs', ['resolve', 'not-a-job', '--json']))
    eq(r.ok, false)
    assert(Array.isArray(r.jobs) && r.jobs.length > 5, 'expected the valid job list back')
  })

  t('a missing skill comes back with a degraded path', () => {
    const r = json(run('skills.mjs', ['resolve', 'design-ui', '--json']))
    for (const s of [...r.prefer, ...r.also]) {
      if (s.status === 'missing') assert(s.degrade && s.degrade.length > 20, `${s.name} has no usable degrade note`)
    }
  })

  t('every skill named by a job has a registry entry or is a builtin', () => {
    const map = JSON.parse(fs.readFileSync(path.join(SCRIPTS, 'skill-map.json'), 'utf8'))
    const named = new Set(Object.values(map.jobs).flatMap((j) => [...(j.prefer || []), ...(j.also || [])]))
    const missing = [...named].filter((n) => !map.registry[n])
    eq(missing, [], 'skills routed to but absent from the registry')
  })

  t('every external id referenced by a job is defined', () => {
    const map = JSON.parse(fs.readFileSync(path.join(SCRIPTS, 'skill-map.json'), 'utf8'))
    const named = new Set(Object.values(map.jobs).flatMap((j) => j.external || []))
    const missing = [...named].filter((n) => !map.external[n])
    eq(missing, [], 'external ids referenced but undefined')
  })
})

// ----------------------------------------------------------------- slop.mjs

describe('slop', () => {
  t('a brace inside a template literal does not extend a function body', () => {
    const d = project()
    write(d, 'a.js', ['function small() {', '  const s = `a ${x} b {{{ c`', '  return s', '}', '', 'function next() {', '  return 1', '}', ''].join('\n'))
    const r = json(run('slop.mjs', ['scan', d, '--json']))
    const small = r.worst.find((w) => w.name === 'small')
    assert(small, 'small() was not detected')
    assert(small.sloc <= 4, `body leaked past the function: ${small.sloc} sloc`)
  })

  t('a brace inside a block comment does not extend a function body', () => {
    const d = project()
    write(d, 'a.js', ['function small() {', '  /* { { { */', '  return 1', '}', 'function next() { return 2 }', ''].join('\n'))
    const r = json(run('slop.mjs', ['scan', d, '--json']))
    const small = r.worst.find((w) => w.name === 'small')
    assert(small && small.sloc <= 4, 'block comment braces leaked into the body')
  })

  t('a one-line expression arrow is not counted as a block function', () => {
    const d = project()
    write(d, 'a.js', ['const tiny = (p) => /x{2}/.test(p)', 'function big() {', '  if (a) { if (b) { if (c) { return 1 } } }', '  return 0', '}', ''].join('\n'))
    const r = json(run('slop.mjs', ['scan', d, '--json']))
    assert(!r.worst.some((w) => w.name === 'tiny'), 'expression arrow was measured as a function body')
  })

  t('a branch keyword inside a string does not inflate complexity', () => {
    const d = project()
    write(d, 'a.js', ['function f() {', '  const msg = "if for while case if for while case"', '  return msg', '}', ''].join('\n'))
    const r = json(run('slop.mjs', ['scan', d, '--json']))
    const f = r.worst.find((w) => w.name === 'f')
    assert(f, 'f() not detected')
    assert(f.cc <= 2, `string contents counted as branches: cc=${f.cc}`)
  })

  t('erosion and verbosity are finite numbers in [0,1]', () => {
    const d = project()
    write(d, 'a.js', 'function f() {\n  return 1\n}\n')
    const r = json(run('slop.mjs', ['scan', d, '--json']))
    for (const k of ['erosion', 'verbosity']) {
      assert(Number.isFinite(r[k]), `${k} is not finite: ${r[k]}`)
      assert(r[k] >= 0 && r[k] <= 1, `${k} out of range: ${r[k]}`)
    }
  })

  t('a directory with no source files reports rather than crashing', () => {
    const d = project()
    write(d, 'notes.txt', 'hello')
    const r = json(run('slop.mjs', ['scan', d, '--json']))
    eq(r.ok, false)
    assert(/no source files/.test(r.error))
  })

  t('test files are excluded from the measurement', () => {
    const d = project()
    write(d, 'src/a.js', 'function f() {\n  return 1\n}\n')
    write(d, 'src/a.test.js', ['function t() {', ...Array.from({ length: 30 }, (_, i) => `  if (x${i}) { y() }`), '}', ''].join('\n'))
    const r = json(run('slop.mjs', ['scan', d, '--json']))
    assert(!r.worst.some((w) => w.at.includes('.test.')), 'a test file was measured')
  })

  t('placeholder markers are flagged', () => {
    const d = project()
    write(d, 'a.js', 'function f() {\n  // TODO: implement this\n  return null\n}\n')
    const r = json(run('slop.mjs', ['scan', d, '--json']))
    assert(r.ruleHits.placeholder >= 1, 'placeholder not flagged')
  })

  t('check without a baseline reports the absence as the breach', () => {
    const d = project()
    write(d, 'a.js', 'function f() {\n  return 1\n}\n')
    const r = run('slop.mjs', ['check', d])
    assert(r.code === 1, 'expected a non-zero exit with no baseline')
    assert(/no baseline/.test(r.out), 'expected the missing baseline to be named')
  })

  t('baseline then unchanged check passes', () => {
    const d = project()
    write(d, 'a.js', 'function f() {\n  return 1\n}\n')
    run('slop.mjs', ['baseline', d], { cwd: d })
    assert(fs.existsSync(path.join(wsOf(d), 'slop-baseline.json')), 'baseline file not written')
    const r = run('slop.mjs', ['check'], { cwd: d })
    eq(r.code, 0, `check should pass on an unchanged tree:\n${r.out}`)
  })

  t('adding a placeholder after a baseline breaches the check', () => {
    const d = project()
    write(d, 'a.js', 'function f() {\n  return 1\n}\n')
    run('slop.mjs', ['baseline'], { cwd: d })
    write(d, 'b.js', 'function g() {\n  // TODO: implement\n  return 0\n}\n')
    const r = run('slop.mjs', ['check'], { cwd: d })
    eq(r.code, 1, 'placeholder after baseline should breach')
    assert(/CONSOLIDATE/.test(r.out))
  })

  t('python function bodies are bounded by indentation', () => {
    const d = project()
    write(d, 'a.py', ['def small():', '    return 1', '', 'def other():', '    if a:', '        if b:', '            return 2', '    return 3', ''].join('\n'))
    const r = json(run('slop.mjs', ['scan', d, '--json']))
    const small = r.worst.find((w) => w.name === 'small')
    if (small) assert(small.sloc <= 2, `python body leaked: ${small.sloc}`)
  })
})

// ---------------------------------------------------------------- hooks.mjs

describe('hooks', () => {
  t('on then off leaves settings.json as it was found', () => {
    const d = project()
    write(d, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(ls)'] } }, null, 2) + '\n')
    const before = fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8')
    run('hooks.mjs', ['on'], { cwd: d })
    run('hooks.mjs', ['off'], { cwd: d })
    const after = JSON.parse(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8'))
    eq(after, JSON.parse(before), 'unrelated settings were not preserved')
  })

  t('on preserves a pre-existing Stop hook belonging to someone else', () => {
    const d = project()
    write(
      d,
      '.claude/settings.json',
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo theirs' }] }] } }, null, 2) + '\n',
    )
    run('hooks.mjs', ['on'], { cwd: d })
    run('hooks.mjs', ['off'], { cwd: d })
    const after = JSON.parse(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8'))
    const cmds = (after.hooks?.Stop || []).flatMap((g) => g.hooks.map((h) => h.command))
    eq(cmds, ['echo theirs'], "another tool's Stop hook was destroyed")
  })

  t('on is idempotent — twice installs one hook', () => {
    const d = project()
    run('hooks.mjs', ['on'], { cwd: d })
    run('hooks.mjs', ['on'], { cwd: d })
    const s = JSON.parse(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8'))
    const mine = (s.hooks.Stop || []).flatMap((g) => g.hooks).filter((h) => h.command.includes('factory:stop-gate'))
    eq(mine.length, 1, 'duplicate hooks installed')
  })

  t('gate passes on a clean diff', () => {
    const d = project()
    write(d, 'a.js', 'const a = 1\n')
    commitAll(d)
    const r = run('hooks.mjs', ['gate'], { cwd: d, input: '{"stop_hook_active":false}' })
    eq(r.code, 0, `expected pass, stderr: ${r.err}`)
  })

  t('gate blocks a placeholder added in the working tree', () => {
    const d = project()
    write(d, 'a.js', 'const a = 1\n')
    commitAll(d)
    fs.appendFileSync(path.join(d, 'a.js'), '// TODO: implement payments\n')
    const r = run('hooks.mjs', ['gate'], { cwd: d, input: '{"stop_hook_active":false}' })
    eq(r.code, 2, 'expected exit 2')
    assert(/Law 4/.test(r.err), 'expected the law to be named in the block reason')
  })

  t('gate ignores a placeholder inside a test file', () => {
    const d = project()
    write(d, 'a.js', 'const a = 1\n')
    commitAll(d)
    write(d, 'a.test.js', '// TODO: implement this test\n')
    const r = run('hooks.mjs', ['gate'], { cwd: d, input: '{"stop_hook_active":false}' })
    eq(r.code, 0, 'test files should not trip the gate')
  })

  t('gate does not block twice — stop_hook_active is honoured', () => {
    const d = project()
    write(d, 'a.js', 'const a = 1\n')
    commitAll(d)
    fs.appendFileSync(path.join(d, 'a.js'), '// TODO: implement payments\n')
    const r = run('hooks.mjs', ['gate'], { cwd: d, input: '{"stop_hook_active":true}' })
    eq(r.code, 0, 'a second block would trap the session in a loop')
  })

  t('gate survives an empty stdin', () => {
    const d = project()
    write(d, 'a.js', 'const a = 1\n')
    commitAll(d)
    const r = run('hooks.mjs', ['gate'], { cwd: d, input: '' })
    eq(r.code, 0)
  })

  t('gate stays quiet on a repo with no commits', () => {
    const d = project()
    write(d, 'a.js', '// TODO: implement\n')
    const r = run('hooks.mjs', ['gate'], { cwd: d, input: '{"stop_hook_active":false}' })
    eq(r.code, 0, 'nothing to diff against on an unborn repo')
  })

  t('status reports what the gate actually checks', () => {
    const d = project()
    const s = json(run('hooks.mjs', ['status'], { cwd: d }))
    eq(s.installed, false)
    assert(Array.isArray(s.checks) && s.checks.length >= 2)
  })
})

describe('doctor', () => {
  t('the skill passes its own integrity check', () => {
    const r = run('doctor.mjs', ['--json'])
    const d = json(r)
    eq(d.problems, [], 'doctor found problems in the shipped skill')
    eq(r.code, 0)
  })

  t('doctor exits non-zero when a playbook link is broken', () => {
    // Prove the check can fail, not just that it passes today.
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
    fs.copyFileSync(path.join(path.dirname(SCRIPTS), 'SKILL.md'), path.join(stage, 'SKILL.md'))
    fs.unlinkSync(path.join(stage, 'reference/verify.md'))
    const r = spawnSync('node', [path.join(stage, 'scripts/doctor.mjs'), '--json'], { encoding: 'utf8' })
    const d = JSON.parse(r.stdout)
    eq(r.status, 1, 'doctor should fail on a missing playbook')
    assert(d.problems.some((p) => /verify\.md/.test(p.msg)), 'the missing playbook was not named')
  })
})

// -------------------------------------------------------------- context.mjs

describe('context', () => {
  t('brief on an uninitialised project emits NOT_INITIALIZED', () => {
    const d = project()
    const r = run('context.mjs', ['--root', d, '--brief'])
    eq(r.code, 0)
    assert(/NOT_INITIALIZED/.test(r.out))
  })

  t('a git repo with no commits is still recognised as a repo', () => {
    const d = project()
    write(d, 'a.txt', 'x')
    const r = json(run('context.mjs', ['--root', d]))
    eq(r.git.repo, true)
    eq(r.git.unborn, true)
  })

  t('active work produces a RESUME directive', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    run('state.mjs', ['start', 'w', '--title', 'Work', '--root', d])
    const r = json(run('context.mjs', ['--root', d]))
    assert(r.directives.some((x) => x.code === 'RESUME'), 'expected RESUME')
  })

  t('open items are surfaced as a directive', () => {
    const d = project()
    run('state.mjs', ['init', '--root', d])
    run('state.mjs', ['start', 'w', '--root', d])
    run('state.mjs', ['note', 'unfinished', 'thing', '--root', d])
    const r = json(run('context.mjs', ['--root', d]))
    assert(r.directives.some((x) => x.code === 'OPEN_ITEMS'))
  })

  t('a malformed package.json does not crash the bootstrap', () => {
    const d = project()
    write(d, 'package.json', '{ nope')
    const r = run('context.mjs', ['--root', d, '--brief'])
    eq(r.code, 0, `crashed: ${r.err.slice(0, 200)}`)
  })

  t('test and build commands are detected from package.json', () => {
    const d = project()
    write(d, 'package.json', JSON.stringify({ scripts: { test: 'vitest', build: 'tsc' } }))
    const r = json(run('context.mjs', ['--root', d]))
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
