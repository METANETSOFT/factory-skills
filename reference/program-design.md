# program-design

Phase 4 answers one question: **what will the code look like before it exists?** It writes `<workspace>/work/<slug>/PROGRAM-DESIGN.md`, and it is done only when a reader can predict the diff. [architecture.md](architecture.md) settled which modules exist and what flows between them; this settles what a caller types and what the implementer writes. Skipping it violates Law 5, and the cost is measured: chained on their own output across 93 checkpoints, agent trajectories drift from a maintained repo's 0.31 structural erosion / 0.11 verbosity to 0.68 / 0.32, and average high-complexity function counts climb 4.1 → 37.0 — because nobody decided what shape the code was meant to be, so every session invented one and defended it.

**Design while the context is light.** A call-stack sketch costs a few hundred tokens; re-steering two thousand written lines costs the session, and a model deep in its window is biased toward whatever it chose first. Never ask yourself how much context remains — models estimate this precisely and wrongly. Use observable signals: parallel tool calls turning sequential, the same correction made twice, fewer than ~3 files read before an edit, unprompted offers to write a summary file. If any is showing when you arrive here, hand off ([context-discipline.md](context-discipline.md)) and design in a fresh session.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts phase program-design
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts resolve program-design
```

Re-read `RESEARCH.md` and `ARCHITECTURE.md` in full before writing a line. Re-read, do not remember: instructions lose the attention competition against recent tokens, and a design written from a memory of the architecture invents a second architecture that quietly disagrees with the first. `skills.ts` names `code-structure` when the design touches shared services or repeated operational blocks, and the external `humanlayer-codebase-design`, which is where this vocabulary comes from. Installed → use it. Missing but installable → offer `node ${CLAUDE_SKILL_DIR}/scripts/skills.ts fetch humanlayer-codebase-design`. Unavailable → work from this file and say out loud you are on the degraded path (Law 9).

**Any signature that names a third-party type, client or return shape is resolved through Context7, never from memory** — `npx ctx7@latest library "<name>" "<what to look up>"` then `npx ctx7@latest docs <id> "<question>"`. Training data lags releases; a wrong signature written here is copied into every slice and costs a debugging cycle per slice instead of one lookup.

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
| **Locality** | What maintainers get: the change lands in one place. |

**Do not drift into "component", "service", "API" or "boundary" here.** Those are architecture words, already spent in the previous phase. An agent that reuses them writes a second `ARCHITECTURE.md` under a new filename, decides nothing new, and hands the implementer no signature to build against — which is exactly how this phase earns its reputation for being redundant and gets skipped next time.

## What goes in the interface

The type signature is the smallest part. Each of these is interface, because a caller who does not know it uses the module wrongly and the bug surfaces far from here:

- **Invariants** — what holds before and after. "`id` is a validated UUID"; "the returned list is non-empty".
- **Ordering constraints** — what must be called first, what may not be called twice, what is safe concurrently.
- **Error modes** — every way it fails, as named variants, and what the caller does about each.
- **Required config and credentials** — named by environment variable, never by value (Law 10).
- **Performance characteristics** — does it hit the network, is it O(n) in a field the caller controls, is it cached.

Anything a caller must know that is not written here becomes tribal knowledge, and the next agent starts with zero context and re-derives it wrongly.

## Deep or shallow — run these seven per module and write the verdict down

| | Shallow | Deep |
|---|---|---|
| Signature | `saveThing(conn, thing, retries, logger, opts)` | `things.save(thing): Promise<Result<Thing, SaveError>>` |
| Caller must learn | five parameters, connection lifecycle, retry semantics | one call, three error variants |
| Deletion test | inline it and nothing gets simpler | inline it and six callers each grow retry and mapping code |

1. Reading only the signature, can a caller use it correctly? If not, the interface is incomplete — not the caller.
2. How much behaviour arrives per concept the caller must learn? Interface nearly as complex as the implementation means it is a pass-through with a new name.
3. **The deletion test.** Imagine deleting the module and inlining it. Complexity vanishes → it was a pass-through, delete it now. Complexity reappears in N callers → it earned its keep; name those callers.
4. Does anything actually vary here? **One adapter is a hypothetical seam; two is a real one.** An abstraction with fewer than two real call sites has no reason to exist and will be maintained forever by someone who cannot tell why it is there.
5. **The interface is the test surface.** Wanting to test past it — reaching into internals, asserting on a private field — means the module is the wrong shape. Reshape it now. Tests that reach inside freeze the implementation, and when they later break the documented agent responses are Assertion Weakening, Test Mocking and Exception Suppression rather than fixing the code.

6. **Accept dependencies, do not construct them.** A module that builds its own storage client, clock or HTTP session cannot be exercised without the real thing, and the documented failure that follows is an agent mocking out a service it invented. Take them as parameters; the composition root wires them.
7. **Return results, do not mutate inputs.** A mutating call carries an invisible ordering constraint and gives the test nothing to assert on. A returned value is both the assertion and the caller's contract.

## Design it twice when the interface is load-bearing

Trigger, not a mood: the interface has **3+ call sites**, or every slice in the plan depends on it, or changing it later means a data migration or a breaking release. Then **dispatch two subagents in parallel and have each design it a radically different way** — not two variants of one idea. Give each the same `RESEARCH.md` facts and constraints, and no knowledge of the other's approach. Split by context boundary, never by role: two designers, not a designer and a critic — role-split handoffs are a documented telephone game that loses fidelity at every hop. Each writes to `<workspace>/work/<slug>/design-alt-<n>.md` and returns its interface block plus deletion-test verdict; `state.ts tick subagent` per dispatch (budget: 12 a session). Compare on three axes only — **depth**, **locality**, **seam placement** — pick one, and record the loser with its reason. A rejected alternative written down stops the next session relitigating it.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note decision "interface for <module>: chose <A> over <B> — deeper at <x>, change lands in one file"
```

## Write PROGRAM-DESIGN.md

````markdown
# Program design: <slug>

## Modules
| Module | Interface lives at | Caller learns | Caller gets | New/existing | Deletion test |
|---|---|---|---|---|---|
| <name> | `src/x/index.ts` | <small thing> | <large thing> | new | reappears in 4 callers |

## Seams
[ARCHITECTURE.md named the seams and what varies behind each; here you place the interface file and list the adapters existing TODAY. A seam still on one adapter is deleted here, not carried as "future".]
| Seam | Interface file | Adapters today |
|---|---|---|

## File placement
| Path | Contains | Why here |
|---|---|---|
| `src/x/index.ts` | the interface + composition | house pattern — matches `src/y/index.ts` (RESEARCH.md §Prior art) |
[Every row states WHY, or the next agent files the next one elsewhere. The house pattern beats a better pattern nothing else in this repo follows.]

## Call stack — main path
[One line per hop, real function names, entry to exit. This is what makes the diff predictable.]
1. `POST /things` → `routes/things.ts: createThing`
2. → `ThingService.create(cmd)` — `src/thing/service.ts`
3. → `ThingRepo.insert(row)` — `src/thing/repo.ts`
4. → `Result<Thing, CreateError>` returns up the stack, mapped to HTTP at 1.

## Interfaces
[Signatures only. NO implementation bodies. One block per module, each naming its file.]

### ThingService — `src/thing/service.ts`
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
- **Invariants:** `name` is trimmed and 1–64 chars before it arrives; `create` is idempotent per `(ownerId, name)`.
- **Ordering:** none — no init call, safe to call concurrently.
- **Errors:** table below; `storage_unavailable` is the only retryable one.
- **Config:** `DATABASE_URL`, `THING_QUOTA_DEFAULT` (names only, never values).
- **Performance:** one Postgres round trip; `get` is not cached.
- **Dependencies accepted:** `ThingRepo`, `Clock` — wired by the composition root in `src/app.ts`.

## Error modes
| Failure | Surfaced as | Caught where | Retries | Retryable |
|---|---|---|---|---|
| duplicate name | `CreateError.name_taken` | route → 409 | 0 | no |
| DB down | `CreateError.storage_unavailable` | route → 503 | 2, 200ms backoff | yes |

## Tests
| Test | Level | Asserts through | Fails without the change how |
|---|---|---|---|
| creates a thing | integration | `ThingService.create` | 404 on the route |
| rejects duplicate name | unit | `ThingService.create` | second create succeeds |
[Every test asserts through an interface named above. One that reaches past an interface is a design defect, not a test detail — reshape the module.]

## Constraints for implementers
[Numeric and checkable. "Simple" cannot be graded, so it will not be obeyed.]
- No function over 50 lines. No nesting deeper than 3.
- No new abstraction with fewer than 2 real call sites.
- No error handling beyond the variants above unless specified here.
- Lines deleted reported alongside lines added (agents add and never consolidate: duplicated blocks grew 4–8× across 211M measured lines).

## Non-goals
[What this deliberately does not do, and the design-it-twice alternative rejected, with the reason.]
````

**Signatures go in fenced blocks with no bodies.** Both halves are load-bearing. A human scans a page of signatures in a minute and says yes or no — that is where review pays, not on 2,000 lines of diff nobody finishes reading. And a "design" containing bodies has already spent the context this phase exists to save, becoming an implementation nobody reviewed.

## What this phase does not do

It does not write implementation, migrations or config. It does not restate the architecture in new words. It does not order the work — that is [slice.md](slice.md). It does not decide anything the user looks at; that routes to `design-ui` and is owned by `impeccable`. If it uncovers a fact that breaks the architecture, stop and amend `ARCHITECTURE.md` rather than carrying the contradiction forward — [implement.md](implement.md) follows whichever artifact it read last. An undecidable detail is a ruling with its cost-if-wrong (Law 8), never a parked session; anything you could not settle is `state.ts note unfinished` (Law 3).

## Exit condition

All six must hold before [slice.md](slice.md) begins:

1. `PROGRAM-DESIGN.md` exists with Modules, Seams, File placement, Call stack, Interfaces, Error modes, Tests, Constraints and Non-goals — no bracketed placeholder text and no `<N>` left in.
2. Every interface block carries invariants, ordering, errors, config names, performance and accepted dependencies — not just a type signature — and names the file it lands in.
3. Every module has a written deletion-test verdict naming its callers; every seam lists 2+ adapters existing today or has been deleted.
4. Every test named asserts through an interface in this file; none reaches past one.
5. The file is under 200 lines — reviewable in one sitting, which is where review pays; one team declines diff review above 500 lines and gets none of this leverage.
6. **Read the file back and answer literally: which files appear, which change, roughly what does each contain?** If you cannot, the design is unfinished, and the missing part is precisely the part the implementer will invent.
