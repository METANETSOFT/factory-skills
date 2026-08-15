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
import type { WorkspacePaths } from './types.ts'

/** Nearest enclosing project: an existing in-project workspace, else the git root. */
export function findRoot(start: string = process.cwd()): string {
  let dir = path.resolve(start)
  // The directory the user pointed at is always tested. After that first step
  // the walk never tests $HOME or any ancestor of it: a dotfiles repo (~/.git)
  // is extremely common, and without this boundary a run from a plain directory
  // inside ~ claimed the user's entire home directory as the project — the
  // workspace key, the git signals and the slop scan all pointed at ~.
  // An unset, empty or root HOME disables the guard rather than locking every
  // result to `start`.
  const home = process.env['HOME'] ? path.resolve(os.homedir()) : null
  const boundary = home !== null && home !== path.parse(home).root ? home : null
  for (;;) {
    if (fs.existsSync(path.join(dir, '.factory'))) return dir
    if (fs.existsSync(path.join(dir, '.git'))) return dir
    const up = path.dirname(dir)
    if (up === dir) return path.resolve(start)
    if (boundary !== null && (up === boundary || boundary.startsWith(up + path.sep))) return path.resolve(start)
    dir = up
  }
}

function tempWorkspace(root: string): string {
  let real = root
  try {
    real = fs.realpathSync(root)
  } catch {
    // A path that cannot be resolved still gets a stable key from its literal form.
  }
  const key = crypto.createHash('sha1').update(real).digest('hex').slice(0, 8)
  const base = process.env['FACTORY_HOME'] || path.join(os.tmpdir(), 'claude-factory')
  return path.join(base, `${path.basename(real) || 'project'}-${key}`)
}

/**
 * Resolve every path the factory writes to.
 * `inProject` forces <root>/.factory; otherwise an existing one still wins.
 */
export function paths(root: string, { inProject = false }: { inProject?: boolean } = {}): WorkspacePaths {
  const local = path.join(root, '.factory')
  const ws = inProject || fs.existsSync(local) ? local : tempWorkspace(root)
  const projectCharter = path.join(root, 'FACTORY.md')
  const charterInProject = fs.existsSync(projectCharter)
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
    charter: charterInProject ? projectCharter : path.join(ws, 'FACTORY.md'),
    charterInProject,
  }
}

/** Resolve root and paths together — what every script needs at startup. */
export function resolve(explicitRoot?: string | null, opts?: { inProject?: boolean }): WorkspacePaths {
  const root = path.resolve(explicitRoot || findRoot())
  return paths(root, opts)
}
