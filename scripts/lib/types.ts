// The factory's domain model, in one place.
//
// These types are the contract between the scripts. state.ts writes a State;
// context.ts reads one; doctor.ts validates a SkillMap that skills.ts routes
// with. Writing them down once means a rename breaks the typecheck instead of
// breaking a directive the agent then follows off a cliff.

// ---------------------------------------------------------------- pipeline

export const PHASES = [
  'uninitialized',
  'research',
  'product',
  'architecture',
  'program-design',
  'plan',
  'implement',
  'verify',
  'review',
  'done',
] as const
export type Phase = (typeof PHASES)[number]

export const NOTE_KINDS = ['ruling', 'unfinished', 'risk', 'decision', 'evidence'] as const
export type NoteKind = (typeof NOTE_KINDS)[number]

/** Events the session counter tracks. Deliberately observable — never a token estimate. */
export const SESSION_EVENTS = ['read', 'edit', 'slice', 'fix', 'subagent'] as const
export type SessionEvent = (typeof SESSION_EVENTS)[number]

// ------------------------------------------------------------------- state

export interface WorkRef {
  slug: string
  title: string
  startedAt: string
  dir: string
}

export interface OpenItem {
  n: number
  kind: NoteKind
  text: string
  at: string
}

/**
 * A worker: anything present in this session's context that executes work on
 * the factory's behalf — a delegation skill, an MCP server, a gateway. The
 * factory never names a specific one. Which worker exists is a fact about the
 * session, discoverable only by the agent reading its own context, so it is
 * recorded here rather than hardcoded anywhere.
 *
 * It lives in State because a worker the session forgets after /clear silently
 * reverts every later dispatch to the path the user asked to stop using.
 */
export interface WorkerRef {
  /** Whatever it is called here. The factory does not care, and never assumes. */
  name: string
  /** How it arrived: a loaded skill, an MCP server, or something else stated. */
  kind: string
  /** The call that dispatches to it, verbatim. Without this a brief has nothing to invoke. */
  dispatch: string
  /**
   * What it can actually do, in the agent's own words. This is the gate: a job
   * outside this envelope is not delegated to it, however cheap it is. Recorded
   * rather than inferred, because only the agent that read the worker's own
   * description knows where its edges are.
   */
  does: string
  /** The line every brief carries so a dispatched agent routes its own labor the same way. */
  announce: string
  at: string
}

export interface SessionState {
  startedAt: string
  counts: Partial<Record<SessionEvent, number>>
  handoffs: number
}

export interface State {
  version: number
  createdAt: string
  phase: Phase
  work: WorkRef | null
  worker: WorkerRef | null
  slice: { done: number; total: number }
  session: SessionState
  open: OpenItem[]
  history: Array<{ at: string; phase: Phase }>
  seq: number
}

export type PressureLevel = 'ok' | 'warn' | 'handoff'

export interface Pressure {
  level: PressureLevel
  over: string[]
  near: string[]
  directive: string
}

// --------------------------------------------------------------- workspace

export interface WorkspacePaths {
  root: string
  ws: string
  inProject: boolean
  state: string
  ledger: string
  baseline: string
  config: string
  work: string
  charter: string
  charterInProject: boolean
}

/** Written by `hooks on --verify`, read by the Stop gate. */
export interface FactoryConfig {
  verifyCommand?: string
  runVerifyOnStop?: boolean
}

// --------------------------------------------------------------- skill map

export interface RegistryEntry {
  /** Recorded only where the upstream is genuinely known. A guessed URL is worse than none. */
  source?: string
  install?: string
  /** A search that will find current copies, for skills with no single authoritative upstream. */
  find?: string
  /** What to do when the skill cannot be had here. Every entry must have one. */
  degrade?: string
}

export interface ExternalEntry {
  what?: string
  source?: string
  install?: string
  why?: string
}

export interface JobSpec {
  playbook: string
  /** Loaded unconditionally — this skill owns the job. */
  prefer?: string[]
  /** Loaded only when its trigger is literally true of the work in hand. */
  also?: string[]
  triggers?: Record<string, string>
  external?: string[]
}

export interface SkillMap {
  version: number
  note?: string
  registry: Record<string, RegistryEntry | string>
  jobs: Record<string, JobSpec>
  external: Record<string, ExternalEntry>
}

// ------------------------------------------------------------ skill lookup

export type SkillStatus = 'installed' | 'builtin' | 'missing'

export interface ResolvedSkill {
  name: string
  status: SkillStatus
  dir?: string | null
  scope?: string
  description?: string
  trigger?: string | null
  source?: string | null
  install?: string | null
  find?: string | null
  degrade?: string
}

export interface InstalledSkill {
  name: string
  dir: string
  scope: string
  description: string
}

// ------------------------------------------------------------------- slop

export interface FunctionMetric {
  name: string
  file: string
  line: number
  cc: number
  sloc: number
}

export interface RuleHit {
  rule: string
  file: string
  line: number
  why: string
  text: string
}

export interface SlopBaseline {
  at: string
  erosion: number
  verbosity: number
  loc: number
  files: number
}

// A scan either measured something or explained why it could not. Modelling that
// as a union means a caller cannot read `erosion` off a failed scan.
export type ScanResult =
  | { ok: false; error: string; root: string }
  | {
      ok: true
      root: string
      scanned: string[]
      files: number
      loc: number
      smallSample: boolean
      erosion: number
      verbosity: number
      highComplexityCount: number
      maxComplexity: number
      reference: { humanRepos: { erosion: number; verbosity: number }; agentDrift: { erosion: number; verbosity: number } }
      worst: Array<{ name: string; at: string; cc: number; sloc: number }>
      ruleHits: Record<string, number>
      examples: Array<{ rule: string; at: string; why: string; text: string }>
      delta?: { baselineAt: string; erosion: number; verbosity: number; loc: number }
      verdict?: { pass: boolean; breaches: string[] }
      baselineWritten?: string
    }

// ------------------------------------------------------------------ hooks

export interface HookHandler {
  type: string
  command?: string
  timeout?: number
  [k: string]: unknown
}

export interface HookGroup {
  matcher?: string
  hooks: HookHandler[]
}

export interface ClaudeSettings {
  hooks?: Record<string, HookGroup[]>
  [k: string]: unknown
}

/** The Stop-event payload. `stop_hook_active` is the re-entry guard. */
export interface StopPayload {
  stop_hook_active?: boolean
  hook_event_name?: string
  [k: string]: unknown
}

// ----------------------------------------------------------------- context

export interface Directive {
  code: string
  say: string
  items?: OpenItem[]
}

export interface GitSignals {
  repo: boolean
  branch?: string
  unborn?: boolean
  dirty?: boolean
  changedCount?: number
  changedFiles?: string[]
  recentCommits?: string[]
  onDefaultBranch?: boolean
}

export interface ProjectShape {
  markers: string[]
  scripts?: string[]
  testCommand?: string | null
  buildCommand?: string | null
  lintCommand?: string | null
}
