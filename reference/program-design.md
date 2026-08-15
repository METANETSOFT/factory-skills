# program-design

Phase 4 answers one question: **what will the code actually look like before it exists?** It produces `.factory/work/<slug>/PROGRAM-DESIGN.md` — file placement, the call stack for the main path, type and method signatures with no bodies, error modes, and what the tests will assert.

This is the layer everyone skips and the one that pays. [architecture.md](architecture.md) says which services exist; this says what a caller types and what the implementer writes. Skipping it is a Law 5 violation, and the cost is measured: agent trajectories chained on their own output drift to roughly double a maintained repo's complexity, high-complexity function counts climbing an order of magnitude, because nobody decided what shape the code was meant to be.

**Do this while the context is still light.** A call-stack sketch costs a few hundred tokens; re-steering two thousand written lines costs the session — once the model is deep in its window it is also biased toward whatever it chose first and will defend it. Never ask yourself how much context you have left (models estimate this precisely and wrongly). Use signals instead: parallel tool calls turning sequential, the same correction twice, fewer than ~3 files read before an edit. If any of those are showing when you arrive here, hand off first ([context-discipline.md](context-discipline.md)) and design in a fresh session.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs phase program-design
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs resolve program-design
```

Re-read `RESEARCH.md` and `ARCHITECTURE.md` before writing a line — instructions lose the attention competition against recent tokens, which is why each phase re-reads rather than remembers. The "What varies and what is fixed" table is the input that stops you inventing a seam nothing varies behind.

`skills.mjs` names `code-structure` when the design touches shared services or repeated operational blocks, and the external `humanlayer-codebase-design`, which is where this vocabulary comes from. Installed → use it. Missing but installable → offer the line (`node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs fetch humanlayer-codebase-design`). Unavailable → work from this file and say out loud you are on the degraded path.

## The vocabulary — use these words, not the other ones

| Word | Means |
|---|---|
| **Module** | Anything with an interface and an implementation. Scale-agnostic: a function, a file, a package. |
| **Interface** | Everything a caller must know to use it correctly. Not the type signature alone. |
| **Implementation** | Everything a caller must *not* need to know. |
| **Depth** | Leverage per unit of interface learned. Deep = a lot of behaviour behind a small interface. |
| **Seam** | A place you can alter behaviour without editing in that place. The interface lives at the seam. |
| **Adapter** | A concrete thing satisfying an interface at a seam. A role, not a substance. |
| **Leverage** | What callers get from depth. |
| **Locality** | What maintainers get: the change stays in one place. |

**Do not drift into "component", "service", "API" or "boundary" here.** Those are architecture words, already spent in the previous phase. An agent that reuses them writes a second `ARCHITECTURE.md` under a new filename, decides nothing new, and hands the implementer no signature to build against — which is exactly how this phase gets a reputation for being redundant.

## What goes in the interface

A type signature is the smallest part of it. Everything below is interface, because a caller who does not know it will use the module wrongly and the bug will surface far from here:

- **Invariants** — what is true before and after. "`id` is a validated UUID"; "the returned list is non-empty".
- **Ordering constraints** — what must be called first, what may not be called twice, what is safe to call concurrently.
- **Error modes** — every way it can fail, as named variants, and what the caller is expected to do about each.
- **Required config and credentials** — named by environment variable, never by value (Law 10).
- **Performance characteristics** — does it hit the network, is it O(n) in a field the caller controls, is it cached.

Anything a caller must know that is not written here becomes tribal knowledge, and tribal knowledge is re-derived wrongly by the next agent, which starts with zero context.

## Deep or shallow — decide per module, out loud

Ask, for each module in the design:

1. If a caller reads only the signature, can they use it correctly? If no, the interface is incomplete, not the caller.
2. How much behaviour does the caller get per concept they must learn? Shallow means the interface is nearly as complex as the implementation — a pass-through with a new name.
3. **The deletion test.** Imagine deleting this module and inlining it. Does complexity vanish, or does it reappear in every caller? Vanishing means it was a pass-through; reappearing across N callers means it earned its keep.
4. Does anything actually vary here? **One adapter is a hypothetical seam; two is a real one.** Do not add a seam, an interface or a strategy for a second implementation that does not exist — that abstraction has no call sites and will be maintained forever by someone who cannot tell why it is there.
5. **The interface is the test surface.** If you want to test past it — reaching into internals, asserting on a private field — the module is the wrong shape. Fix the shape now. Tests that reach inside freeze the implementation, and when they later break, the documented agent response is to mock the internals or weaken the assertion rather than reshape the code.

Two construction rules that decide most of this for you:

- **Accept dependencies, do not construct them.** A module that builds its own storage client, clock or HTTP session cannot be exercised without the real thing — and the documented failure that follows is an agent mocking out a service it invented rather than passing a fake in. Take them as parameters; the composition root wires them.
- **Return results, do not mutate inputs.** A mutating call has an invisible ordering constraint and nothing to assert on. A returned value is the test's assertion and the caller's contract.

## Design it twice when the interface is load-bearing

If the interface will be called from several places, is hard to change later, or is the thing the whole slice hangs on: **spawn two subagents in parallel and have each design the interface a radically different way** — not two variants of the same idea. Give each the same `RESEARCH.md` facts, the same constraints, and zero suggestion of the other's approach. Split by context boundary, never by role: two designers, not a designer and a critic.

Have each write to `.factory/work/<slug>/design-alt-<n>.md` and return a summary; `state.mjs tick subagent` per dispatch. Then compare on three axes only — **depth** (behaviour per concept learned), **locality** (where a likely future change lands), **seam placement** (does the seam sit where something actually varies) — pick one, and record the loser and why in the ledger. The first idea is rarely the best one, and a rejected alternative written down stops the next session relitigating it.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note decision "interface for <module>: chose <A> over <B> — deeper at <x>, change lands in one file"
```

## Write PROGRAM-DESIGN.md

```markdown
# Program design: <slug>

## Modules
| Module | Interface lives at | Caller learns | Caller gets | New or existing |
|---|---|---|---|---|
| <name> | `src/x/index.ts` | <small thing learned> | <large thing gained> | new |

## Seams
| Seam | What varies behind it | Adapters today | Real or hypothetical |
|---|---|---|---|
[Hypothetical seams are deleted before this file ships, not marked "future".]

## File placement
| Path | Contains | Why here |
|---|---|---|
| `src/x/index.ts` | the interface + composition | house pattern — matches `src/y/index.ts` (RESEARCH.md §Prior art) |
[Every row states WHY, or the next agent files the next one elsewhere. The house pattern beats a better pattern nothing else here follows.]

## Call stack — main path
[One line per hop, real function names, entry to exit. This is what makes the diff predictable.]
1. `POST /things` → `routes/things.ts: createThing`
2. → `ThingService.create(cmd)` — `src/thing/service.ts`
3. → `ThingRepo.insert(row)` — `src/thing/repo.ts`
4. → returns `Result<Thing, CreateError>` up the stack, mapped to HTTP at 1.

## Interfaces
[Signatures only. NO implementation bodies. One block per module.]

### ThingService
```ts
export type CreateCmd = { ownerId: UserId; name: string; quota: number }
export type CreateError =
  | { kind: 'name_taken'; name: string }
  | { kind: 'quota_exceeded'; limit: number }
  | { kind: 'storage_unavailable'; retryable: true }

export interface ThingService {
  create(cmd: CreateCmd): Promise<Result<Thing, CreateError>>
  get(id: ThingId): Promise<Thing | null>
}
```
- **Invariants:** `name` is trimmed and 1–64 chars before it reaches here; `create` is idempotent per `(ownerId, name)`.
- **Ordering:** none — no init call, safe to call concurrently.
- **Errors:** see the table below; `storage_unavailable` is the only retryable one.
- **Config:** `DATABASE_URL`, `THING_QUOTA_DEFAULT` (names only, never values).
- **Performance:** one round trip to Postgres; `get` is not cached.
- **Dependencies accepted:** `ThingRepo`, `Clock`. Constructed by the composition root in `src/app.ts`.

## Error modes
| Failure | Surfaced as | Handled where | Retryable |
|---|---|---|---|
| duplicate name | `CreateError.name_taken` | route → 409 | no |
| DB down | `CreateError.storage_unavailable` | route → 503 | yes |

## Tests
| Test | Level | Asserts through | Fails without the change how |
|---|---|---|---|
| creates a thing | integration | `ThingService.create` | 404 on the route |
| rejects duplicate name | unit | `ThingService.create` | second create succeeds |
[Every test asserts through an interface named above. One that reaches past it is a design defect, not a test detail — reshape the module.]

## Constraints for implementers
[Numeric and checkable. Adjectives are unenforceable; "simple" cannot be graded.]
- No function over <N> lines; no nesting past <N>.
- No new abstraction with fewer than 2 real call sites.
- No error handling beyond the variants above unless specified.
- Lines deleted are reported alongside lines added.

## What this design deliberately does not do
[Named non-goals and the alternative rejected in design-it-twice, with the reason.]
```

**Signatures go in fenced code blocks with no bodies.** Two reasons, both load-bearing. A human scans this in a minute and says yes or no — the review that pays happens here and at [slice.md](slice.md), not on 2,000 lines of diff nobody can read. And a design that contains bodies has already spent the context this phase exists to save, and quietly becomes an implementation nobody reviewed.

## Exit condition

All five must hold before [slice.md](slice.md) begins:

1. `PROGRAM-DESIGN.md` exists with Modules, Seams, File placement, Call stack, Interfaces, Error modes, Tests, Constraints, and non-goals — no bracketed placeholders left.
2. Every interface carries its invariants, ordering, errors, config names and performance line — not just a type signature.
3. Every module passed the deletion test in writing, and every seam has two adapters or is deleted.
4. Every test named asserts through an interface in this file; none reaches past one.
5. **A reader can predict what the diff will look like** — which files appear, which change, roughly what each contains. Read it back and ask yourself that question literally. If you cannot answer it, the design is not finished, and the missing part is the part the implementer will invent.

## What program design does not do

It does not write implementation, migrations or config. It does not restate the architecture in other words. It does not order the work — that is [slice.md](slice.md). It does not decide the visual interface; anything the user sees routes to `design-ui` and is owned by `impeccable`. If it uncovers a fact that changes the architecture, stop and amend `ARCHITECTURE.md` rather than carrying a contradiction forward — two artifacts that disagree are worse than either alone, because [implement.md](implement.md) will follow whichever it read last.
