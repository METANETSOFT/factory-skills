// Where the factory keeps its working state.
//
// Not in the user's repository. A pipeline run produces RESEARCH.md, PRD.md,
// PROGRAM-DESIGN.md, PLAN.md, a ledger and a pile of evidence, and roughly all
// of it is scaffolding for one session's work — committing that to someone's
// project is clutter they did not ask for and will have to clean up.
//
// So the default workspace lives under the OS temp directory, keyed by the
// project's real path so two checkouts of the same repo do not collide. It
// survives `/clear`, a new session, and a machine that stays up — which covers
// the handoff case — and it disappears on reboot, which is correct for
// scaffolding.
//
// Two escape hatches, both explicit:
//   FACTORY_HOME=/some/dir    put every workspace under a directory you keep
//   init --in-project         use <project>/.factory instead, for work that
//                             genuinely spans weeks and belongs in the repo
//
// A workspace that already exists in the project wins over the temp one, so a
// project that opted in keeps working without passing the flag again.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

/** Nearest enclosing project: an existing in-project workspace, else the git root. */
export function findRoot(start = process.cwd()) {
  let dir = path.resolve(start)
  for (;;) {
    if (fs.existsSync(path.join(dir, '.factory'))) return dir
    if (fs.existsSync(path.join(dir, '.git'))) return dir
    const up = path.dirname(dir)
    if (up === dir) return path.resolve(start)
    dir = up
  }
}

function tempWorkspace(root) {
  let real = root
  try {
    real = fs.realpathSync(root)
  } catch {
    // A path that cannot be resolved still gets a stable key from its literal form.
  }
  const key = crypto.createHash('sha1').update(real).digest('hex').slice(0, 8)
  const base = process.env.FACTORY_HOME || path.join(os.tmpdir(), 'claude-factory')
  return path.join(base, `${path.basename(real) || 'project'}-${key}`)
}

/**
 * Resolve every path the factory writes to.
 * `inProject` forces <root>/.factory; otherwise an existing one still wins.
 */
export function paths(root, { inProject = false } = {}) {
  const local = path.join(root, '.factory')
  const ws = inProject || fs.existsSync(local) ? local : tempWorkspace(root)
  const projectCharter = path.join(root, 'FACTORY.md')
  return {
    root,
    ws,
    inProject: ws === local,
    state: path.join(ws, 'state.json'),
    ledger: path.join(ws, 'ledger.md'),
    baseline: path.join(ws, 'slop-baseline.json'),
    config: path.join(ws, 'config.json'),
    work: path.join(ws, 'work'),
    // The charter is the one artifact a team may genuinely want committed, so a
    // project copy takes precedence over the workspace one when it exists.
    charter: fs.existsSync(projectCharter) ? projectCharter : path.join(ws, 'FACTORY.md'),
    charterInProject: fs.existsSync(projectCharter),
  }
}

/** Resolve root and paths together — what every script needs at startup. */
export function resolve(explicitRoot, opts) {
  const root = path.resolve(explicitRoot || findRoot())
  return paths(root, opts)
}
