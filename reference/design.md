# design

Interface, visual and motion work. **The factory carries no design taste of its own.** `impeccable` owns interface craft; the visual and motion skills own their lenses. This file decides *that* design work is needed, hands the owning skill the context it cannot infer, and verifies what comes back. Nothing below tells you what looks good — if you find yourself deciding that here, you are doing the skill's job with none of its rules.

`design` is not a pipeline phase. It runs inside the phase you are already in: `implement` while the surface is being built, `review` while it is being graded. There is no `design` value for `state.mjs phase` — do not invent one.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs resolve design-ui     # or design-visual, or motion
```

Pick the job kind from the request, not from the file type in front of you:

| The request | Job | Owns it |
|---|---|---|
| a screen, component, flow, layout, theme, redesign, polish, a11y, responsive behaviour | `design-ui` | `impeccable` |
| an image, logo, brand board, poster, ad, mockup image, art direction, generated asset | `design-visual` | no owner — one skill per trigger |
| an animation, transition, gesture, scroll effect, a motion audit, naming an effect | `motion` | no owner — split by verb |

Load exactly what `resolve` names: every `prefer` skill, plus each `also` skill whose trigger you can state in one sentence about *this* task. Two or more of these jobs in one request is two resolves and two handovers, not one blended pass.

## The three tiers

| Status | What you do |
|---|---|
| installed | Load it and follow it. It is the authority. Your taste does not override a skill the user deliberately installed. |
| missing, has an `install:` line | Offer that command verbatim in one line, then continue on the printed `degrade` note in the same turn. Do not stall — Law 8. |
| missing, only a `find:` line | Print the search string exactly. Never turn it into a URL; the upstreams here are forks with no authoritative source. |
| cannot be had here | Take the `degrade` note as your standard and say out loud which skill you lack. |

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note ruling "design-ui without impeccable; degraded craft floor per skill-map; cost-if-wrong: polish below the skill's bar, recoverable by re-running design after install"
```

The failure this prevents is silent substitution: a user who installed a design skill and receives design work made without it believes they got the skill's output, and that belief is uncorrectable later because the work looks finished. Full rules in [skill-map.md](skill-map.md).

## Sequencing: product before pixels

Design work does not start until the PRD's Outcome row exists ([product.md](product.md)). Without a measurable outcome the pass has no bar, so it terminates on the model deciding it looks good — which is tier 3, the one tier that grades as passed on the day the context window fills.

The grey-box mockups from product are a **scope** artifact, not a design deliverable. Hand them over as "this is the screen", never as "this is the direction".

**Program design still applies to the code that implements the design** ([program-design.md](program-design.md)). A design pass that emits twelve single-use components, or a fifth button variant nobody consolidated, is a program-design failure wearing a screenshot. Components are modules: one interface, two real call sites before a seam exists, and the deletion test applies to a wrapper component exactly as it applies to a service.

## The handover brief

A skill or subagent starts with zero context and receives only what you write. Split by context boundary, not by role — and the field that gets omitted most often, the incumbent visual truth, is the one whose absence turns a refinement into an accidental replacement.

```
SURFACE      <route, screen or component path> — <build new | refine existing | audit only>
OUTCOME      <verbatim from PRD.md Outcome: what is measured, measured by, threshold>
CRITERIA     <the acceptance-criteria rows touching this surface, verbatim, with thresholds>
INCUMBENT    tokens      <file:line, or "none — this project has no token layer">
             theme       <mechanism: data-theme attribute, class, media query, none>
             components  <library and version, or the local kit's directory>
             reference   <one real page already built in this system — read it before editing>
CONSTRAINTS  framework <x>; no new dependency without stating its bundle cost;
             body contrast >= 4.5:1; keyboard focus visible; prefers-reduced-motion honoured
STATES       default / empty / loading / error / longest realistic content
OUT OF SCOPE <what must not change: routes, copy, data shape, the token layer itself>
RETURN       files changed, lines added AND lines deleted, plus one screenshot per surface
             per state at 390px and 1440px, written to .factory/work/<slug>/evidence/
```

`state.mjs tick subagent` after each dispatch; the cap is 12. Multi-agent runs burn 3–10× the tokens, so dispatch for context isolation, not for theatre.

## Mode is stated, never inferred

| Mode | Must carry | Done means |
|---|---|---|
| build new | mockups, tokens if any exist, the one reference page | the surface exists in every listed state |
| refine existing | incumbent block in full, plus an explicit do-not-change list | the diff touches only the named surfaces and the token layer is unchanged unless the brief says otherwise |
| audit only | read-only instruction, and no write tools in the brief | a findings list with severities and no diff |
| motion | the current motion inventory: durations, easings, what already animates | motion is interruptible, under 400ms unless justified, and reduced-motion is handled |

An unstated mode defaults to replace, which is the most expensive default available: it discards a token system the rest of the app still uses and leaves two design languages in one product, discovered weeks later by a page nobody touched.

## Verification

Design claims are Law 1 claims. "Looks right" is banned vocabulary ([verify.md](verify.md)) and it is the natural register of this work, so it needs the harder gate, not the softer one.

- **The artefact is the deliverable.** One screenshot or recording per surface per state, from a real run of this project's app — `run`, or whatever browser driver `resolve` names. A diff is not evidence that a screen renders.
- **Review the artefact separately from the code.** Read it in a pass that has not seen the diff. Reading both together lets the diff explain the screenshot away; alone, the screenshot has to stand up by itself. This is the countermeasure with the strongest first-hand support.
- **Provenance-check every artefact** before it counts — a fabricated Playwright repro is a documented occurrence, and the four checks are in [verify.md](verify.md). An artefact that fails provenance is worse than none: it upgrades an unproven claim into a confidently proven false one.
- **Desktop and mobile in one batched pass.** Capture every surface, every state, both viewports in one round. List all findings. Fix them in one edit pass. Recapture once. **Two rounds maximum** — if it is still wrong, the direction is wrong and that is a brief problem, not a polish problem: go back to the handover, do not take a third lap.
- **Grade against the PRD criteria, with thresholds.** Any single criterion below threshold fails the pass; there is no average, because an aggregate lets one real failure be absorbed by nine easy passes. Where the criterion is a judged rubric, the judge is not the builder — a generator grading its own work confidently praises it.
- Reduced motion, visible keyboard focus and body contrast are criteria with thresholds, not polish items to get to later.

The open-ended polish loop is the specific failure the batching rule kills. It has no exit condition, it spends the window one screenshot at a time, and it ends in context anxiety with the last change unverified — and the model cannot self-assess how much window is left, because those estimates are precise and wrong. Behavioural tells that the loop has already gone too long: parallel tool calls turning sequential, an unprompted `SUMMARY.md`, or the same visual issue corrected twice. Any of those means handoff ([context-discipline.md](context-discipline.md)), not one more round.

## Surface tells that get the whole PR distrusted

Reviewers discard a diff on sight for these, and then nothing else in it gets read:

| Tell | Why it costs the review |
|---|---|
| emoji in a code comment | reported as a near-certain generated-code signal; one tell condemns the file |
| step-by-step narration comments (`// Now we map over the items`) | describes the line below it and nothing a reader needed |
| stray Unicode artifacts, smart quotes in code, glyphs standing in for icons | icons are drawn, from a real library or authored SVG |
| a 1–2k-line diff | one team declines review above 500 lines outright; design diffs bloat fastest |
| added lines only, none deleted | duplicated blocks grew 4–8× in the corpus while consolidation fell below 10% of changes — report lines deleted, or the fifth button variant ships |

Run the diff through [anti-slop.md](anti-slop.md) before asking anyone to look at it.

## Evidence

Design artefacts live in the same index as everything else — one `EVIDENCE.md`, not a trail of summaries.

```
.factory/work/<slug>/evidence/
  10-checkout-default-1440.png
  11-checkout-default-390.png
  12-checkout-empty-390.png
  13-checkout-error-1440.png
  EVIDENCE.md            rows added to the table in verify.md
```

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note evidence "<criterion>: captured at 390 and 1440 → evidence/10-…"
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note unfinished "<state> never captured: <why>"
```

## Exit condition

All seven true before the design work is called done:

1. `skills.mjs resolve <design-ui|design-visual|motion>` ran, every `prefer` skill is loaded or its absence is stated with its install line, and any degraded path is a recorded ruling.
2. The handover brief was written with the INCUMBENT block filled — a `none` is an answer; an omission is not.
3. The mode was stated, and the diff stays inside what that mode allows.
4. Every surface has an artefact for every listed state at both viewports, and every artefact passed provenance.
5. The artefacts were reviewed in a pass separate from the code.
6. Every PRD criterion touching this surface has a verdict against its threshold, or a line under **Not proven** with a reason (Law 3).
7. Lines deleted are reported alongside lines added, and no tell from the table above survives in the diff.

If the surface still does not meet the bar after two batched rounds, stop and say so. Handing back a named shortfall is recoverable; a third silent polish lap is how a session ends with an unverified change and no window left to check it.
