# design

Interface, visual and motion work. **The factory carries no design taste of its own** — `impeccable` owns interface craft (standing decision 2, [skill-map.md](skill-map.md)). This file decides *that* design work is needed, hands the owning skill the context it cannot infer, and verifies what comes back. If you catch yourself deciding here what looks good, you are doing the skill's job with none of its rules.

`design` is not a pipeline phase. It runs inside the phase you are already in — `implement` while a surface is built, `review` while it is graded. `state.ts phase` has no `design` value; do not invent one.

## Route the job

```bash
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts resolve design-ui     # or design-visual, or motion
```

Pick the job from the request, not from the file type in front of you.

| The request | Job | Owner |
|---|---|---|
| a screen, component, flow, layout, theme, redesign, polish, a11y, responsive behaviour | `design-ui` | `impeccable` |
| an image, logo, brand board, poster, ad, mockup image, art direction, generated asset | `design-visual` | none — one skill per trigger |
| an animation, transition, gesture, scroll effect, motion audit, naming an effect | `motion` | none — split by verb |

Load every `prefer` skill it names, plus each `also` skill whose trigger you can state in one sentence about *this* task. Two jobs in one request is two resolves and two handovers: a blended brief applies one skill's rules to another skill's deliverable, and neither bar is met.

### The three tiers

| Tier | `resolve` prints | What you do |
|---|---|---|
| 1 installed | the skill name | Load it and follow it. It is the authority; your judgement does not override a skill the user chose to install. |
| 2 installable | `install:` | Offer that line verbatim, then continue on the printed `degrade` note **in the same turn** — Law 8, no stall. Where only a `find:` line is printed, print the search string exactly and never convert it into a URL: those upstreams are forks with no authoritative source, and a fabricated repo sends the user somewhere that does not exist. |
| 3 unavailable | `degrade:` | Take the degrade note as your craft floor and say out loud which skill you lack. |

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note ruling "design-ui without impeccable; degraded craft floor per skill-map; cost-if-wrong: polish below the skill's bar, recoverable by re-running design after install"
```

Tiers 2 and 3 are announced or they are silent substitution: a user who installed a design skill and receives design work made without it believes they received the skill's output, and that belief is uncorrectable later because the work looks finished.

## Sequencing: product before pixels

No design pass starts without a measurable outcome ([product.md](product.md)). Without one the pass terminates on the model deciding it looks good — tier 3 in product's table, the one tier that grades as passed on the day the context window fills.

| Entry | Where the bar comes from |
|---|---|
| inside a run that has a PRD | the `PRD.md` Outcome row plus every acceptance-criteria row touching this surface, copied verbatim |
| `design` invoked standalone, no PRD | write three thresholded criteria into the brief before dispatching — one visual, one state (empty or error), one a11y — and `state.ts note decision`. Do not stall for a reply (Law 8); do not proceed on none. |

The grey-box mockups from product are a **scope** artifact. Hand them over as "this is the screen", never as "this is the direction" — a mockup handed over as direction gets shipped as one.

**Program design still governs the code that implements the design** ([program-design.md](program-design.md)). Components are modules: one interface, a seam only at the second real call site, and the deletion test applies to a wrapper component exactly as it applies to a service. A pass that emits twelve single-use components, or a fifth button variant nobody consolidated, is a program-design failure wearing a screenshot.

## The handover brief

A skill or subagent starts with zero context and receives only what you write. Split by context boundary, not by role. The field omitted most often — the incumbent visual truth — is the one whose absence turns a refinement into an accidental replacement.

```
SURFACE      <route, screen or component path> — <build new | refine existing | audit only>
OUTCOME      <verbatim from PRD.md Outcome: what is measured, measured by, threshold>
CRITERIA     <every acceptance-criteria row touching this surface, verbatim, with thresholds>
INCUMBENT    tokens      <file:line, or "none — this project has no token layer">
             theme       <mechanism: data-theme attribute, class, media query, none>
             components  <library and version, or the local kit's directory>
             reference   <one real page already built in this system — read it before editing>
CONSTRAINTS  framework <x>; no new dependency without its bundle cost stated;
             body contrast >= 4.5:1; keyboard focus visible; prefers-reduced-motion honoured
STATES       default / empty / loading / error / longest realistic content
OUT OF SCOPE <what must not change: routes, copy, data shape, the token layer itself>
RETURN       files changed, +added/-deleted from `git diff --shortstat`, and one screenshot per
             surface per state at 390px and 1440px under <workspace>/work/<slug>/evidence/
```

`INCUMBENT: none` is an answer; an omitted INCUMBENT block is not. Dispatch without it and you get two design languages in one product, discovered weeks later by a page nobody touched.

A `motion` brief adds the current inventory — durations, easings, what already animates — and its thresholds: interruptible, under 400ms unless the brief justifies longer, `prefers-reduced-motion` handled.

`state.ts tick subagent` after each dispatch; the cap is 12. Multi-agent runs burn 3–10× the tokens of single-agent work, so dispatch for context isolation, not for theatre.

## Mode is stated, never inferred

| Mode | Must carry | Done means |
|---|---|---|
| build new | mockups, tokens if any exist, the one reference page | the surface exists in every listed state |
| refine existing | INCUMBENT in full, plus an explicit do-not-change list | the diff touches only the named surfaces, and the token layer is unchanged unless OUT OF SCOPE says otherwise |
| audit only | a read-only instruction and no write tools in the brief | a findings list with severities and no diff |

An unstated mode defaults to replace, the most expensive default available: it discards a token system the rest of the app still uses.

## Verification

Design claims are Law 1 claims, and "looks right" is banned vocabulary ([verify.md](verify.md)) in exactly the register where it is most natural — so this work takes the harder gate, not the softer one.

**Capture the artefact.** `skills.ts resolve verify` names `run` for driving this project's app; without it, start the app yourself and screenshot it, or use the driver named in the `agent-browser` registry entry. A diff is not evidence that a screen renders. If nothing available here can run the app, that is `state.ts note unfinished` and the criterion stays unproven (Law 3) — never a pass granted on reading the code.

**Review the artefact apart from the code.** Read the screenshots in a pass that has not seen the diff. Read together, the diff explains the screenshot away; read alone, the screenshot has to stand up by itself. This is the countermeasure with the strongest first-hand support.

**Provenance-check every artefact before it counts** — a fabricated Playwright repro is a documented occurrence. Four checks: the host or port is one this project actually serves; timestamps inside the artefact fall within this session; something non-deterministic in it matches reality; the producing command appears in the transcript ([verify.md](verify.md)). A failed artefact is worse than none — it upgrades an unproven claim into a confidently proven false one.

**One batched pass, two rounds maximum.** Capture every surface × every listed state × 390px and 1440px in one round, list all findings, fix them in one edit pass, recapture once. If it still misses after round two, the direction is wrong — that is a brief problem, so return to the handover. Do not take a third lap.

**Grade against thresholds.** Any single criterion below its threshold fails the pass; there is no average, because an aggregate lets one real failure be absorbed by nine easy passes. Where the criterion is a judged rubric, the judge is not the builder — a generator grading its own work confidently praises it. Contrast, focus visibility and reduced motion are thresholded criteria, not polish to reach later.

The open-ended polish loop is the failure batching exists to kill: it has no exit condition, it spends the window one screenshot at a time, and it ends with the last change unverified. Do not estimate how much window remains — those self-estimates are precise and wrong. Use the observable tells instead: parallel tool calls turning sequential, an unprompted `SUMMARY.md`, the same visual issue corrected twice. Any one of them means handoff ([context-discipline.md](context-discipline.md)), not one more round.

## Before anyone is asked to look

```bash
node ${CLAUDE_SKILL_DIR}/scripts/slop.ts check
git diff --shortstat
```

Reviewers discard an entire PR on sight for emoji in a code comment or step-by-step narration comments, and nothing else in it then gets read. `slop.ts check` flags both by name; the full table and the 500-line diff ceiling are in [anti-slop.md](anti-slop.md), and design diffs bloat fastest. Report deleted lines, not only added: duplicated blocks grew 4–8× in the measured corpus while consolidation fell below 10% of changes, which is how the fifth button variant ships.

## Evidence

```
<workspace>/work/<slug>/evidence/
  10-checkout-default-1440.png
  11-checkout-default-390.png
  12-checkout-empty-390.png
  EVIDENCE.md            rows added to the table in verify.md
```

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note evidence "<criterion>: captured at 390 and 1440 → evidence/10-…"
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note unfinished "<state> never captured: <why>"
```

One index file, not a trail of summaries — a second unprompted summary is itself a context tell, and the next session reads whichever file it finds first.

## Exit condition

All seven true before this design work is called done:

1. `skills.ts resolve <design-ui|design-visual|motion>` ran this session, and every `prefer` skill is loaded or its absence is stated with its install line and recorded as a ruling.
2. The handover brief was written with INCUMBENT filled and STATES listed.
3. The mode was stated, and the diff stays inside what that mode allows.
4. Every surface has an artefact for every listed state at 390px and 1440px, and every artefact passed the four provenance checks.
5. The artefacts were read in a pass separate from the diff.
6. Every criterion touching this surface has a verdict against its threshold, or a line under **Not proven** with a reason (Law 3).
7. `slop.ts check` exited 0 — or its breach carries a ruling — and `git diff --shortstat` was reported with both numbers.

If the surface still misses the bar after two batched rounds, stop and hand back the named shortfall. That is recoverable; a third silent polish lap ends the session with an unverified change and no window left to check it.
