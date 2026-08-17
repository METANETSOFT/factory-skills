# marketing

Non-code deliverables — positioning, launch copy, a landing page, documentation, a report — run the same four phases with different artefacts.
What changes is the cost of being wrong: a false claim in shipped copy is a liability rather than a style problem, and unlike a bug it cannot
be patched, because it has already been read, quoted and screenshotted. Treat every factual sentence as a test assertion that must pass before
the file leaves your hands (Law 1).

## Order

`marketing` is a command, not a pipeline phase: set the phase to whichever of the four you are in, one value per call. There is no
`marketing` phase value, and inventing one loses the state update.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts resolve marketing   # positioning, copy, launch, campaign
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts resolve docs        # reference, guides, reports, changelogs
node ${CLAUDE_SKILL_DIR}/scripts/state.ts phase research       # then product, then implement, then verify
```

| Phase | Here it means | Artifact |
|---|---|---|
| research | who the reader is, what they believe, what competitors claim in their own words | `<workspace>/work/<slug>/RESEARCH.md` |
| product | the one measurable action a reader takes, derived from the announcement | `<workspace>/work/<slug>/PRD.md` |
| implement | the deliverable, at the path it will be used from | the file, or a published artifact |
| verify | every claim traced, every number measured, a pass that tried to refute it | `<workspace>/work/<slug>/evidence/claims.md` |

Both jobs land here and differ only in who reads and what they do next. `resolve marketing` names competitor search and image generation;
`resolve docs` names `artifact-design`, diagramming and `dataviz`. Load one only when you can state its trigger in one sentence about
*this* task; a skill it marks missing is a gap you state with its install line, never improvise past (Law 9). `architecture` and
`program-design` are skipped by default and the skip is recorded below, because a silent skip is indistinguishable from forgetting. A landing
page with real interface work does **not** skip design: the words are yours, the craft is `impeccable`'s via [design.md](design.md), scope
stays [product.md](product.md)'s, and the outcome is measured by [verify.md](verify.md).

## Research

Follow [research.md](research.md)'s citation discipline — a claim with no citation is not a finding.

- **Competitor claims are quoted verbatim from the live page, fetched this session, with URL and fetch date in the row.** Taglines,
  pricing and limits change weekly, and a wrong comparison is the one error a competitor will publicly correct.
- **Label every audience row `quoted` / `reported` / `inferred`** — what the audience wrote (ticket, review, forum post, sales-call note)
  beats what the user says about them, which beats your inference. **At least one `quoted` row before any copy is written**; zero is allowed
  only with a `note unfinished` and the same line said in your reply, because copy for an imagined reader is unfalsifiable and so never gets
  corrected. No composite persona: name a situation with a trigger — "the on-call engineer paged at 03:00 for the third time this week".
- Any named library, framework, SDK, CLI or service resolves through `find-docs` / Context7 before it appears in a sentence: training data
  lags releases, and a stale version fact ships as a false claim.

## Product

[product.md](product.md) already requires the announcement — under 120 words, the paragraph you would publish the day this ships. Here it
is the source text, not a comprehension check: write it first, derive the deliverable from it, and treat any claim in the copy absent from the
announcement as either missing there or unwanted here. Working backwards surfaces the unverifiable claim before a page has been laid out around
it, which is the cheapest moment to lose it.

- **Exactly one primary action**, a verb the reader performs, **exercised rather than assumed**: run the command and read its exit code, or
  `curl -sSI -o /dev/null -w '%{http_code}\n' <url>` and read a 2xx/3xx. "Learn more" is not an action; a 404 behind a CTA is this phase's
  cheapest self-inflicted wound.
- **The outcome is a rate, not a feeling** — signups from this page, docs page to task completed, replies to the launch post. With nothing
  instrumented, gate on product.md's tier-2 judged rubric with a named judge who is not you.

## What counts as a source

Every factual sentence about the product is checked against the thing itself: the PRD says what was intended, only the code and the shipped docs say what exists.

| Claim type | Verified by | Fails as |
|---|---|---|
| capability — "supports X", "works with Y" | the code path located (`file:line`) **and** exercised once this session | a feature that was planned, or lives behind a flag nobody enables |
| performance or scale number | the command that measured it, run this session, dataset and machine stated | a number remembered from a README, where stale numbers go to be believed |
| comparison to a competitor | their live page fetched this session: quote, URL, date | a memory of a pricing table |
| pricing, limits, quotas | the config, plan file or vendor page read this session | inference from a tier name |
| integration or compatibility | the dependency in the manifest, at the stated version | a package discussed and never installed |
| social proof — quotes, counts, logos, ratings | a real, named, permission-granted source | an invented one, which has no verified form |
| roadmap, "coming soon" | an issue, ticket or ledger decision naming it | a hope |

Record each as it lands, never in a sweep at the end that a truncated session never writes (Law 7):

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note evidence "<claim>: verified at <file:line | command | URL fetched YYYY-MM-DD>"
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note ruling "marketing: skipped architecture and program-design — ships no code"
node ${CLAUDE_SKILL_DIR}/scripts/state.ts note unfinished "<page>: testimonial slot empty — no real customer quote available"
```

Hedging is not a repair. Run `grep -nEi '\b(up to|as much as|may |can help|helps you|effortless|seamless|blazing|industry.leading|world.class|[0-9]+x (faster|better))\b' <deliverable>`
and back every hit with a claim row or delete it: "can help you save up to 40%" is not a softer version of an unverified claim, it is an
unfalsifiable one, still doing the persuading, now immune to correction.

**Fabricate nothing.** No invented testimonial, customer name, quote, logo wall, "trusted by" row, user count, revenue figure, rating,
award, case study or before/after number — not as a sample, not as filler, not labelled "example". A fabricated testimonial is a fabricated
person, an unlicensed logo is trademark misuse, and one recognisably false element discredits every true claim beside it, because the reader
cannot tell which half you checked. A slot you cannot fill ships **visibly empty** and is noted unfinished; never a plausible fake, because
the "sample" label is the first thing removed downstream and the fake is what ships (Law 4; Law 3 — the gap is named, not hidden).

## The deliverable

Write it to the path it will be used from — the repo's `docs/`, the page source, or a published artifact. Draft and claim table live in one file so the table cannot drift out of step with the copy.

```markdown
# <deliverable>
## Audience
[One reader in one situation; it must exclude somebody. "developers", "teams", "users" unqualified is not yet an audience.]
## The one thing they should do
[One action, one verb, reachable: <the URL, the command, the button>. Not "learn more".]
## Claim stack
| # | Claim, verbatim as the reader will read it | Evidence | Checked how, this session | Verdict |
|---|---|---|---|---|
| 1 | <the sentence, copied from the body> | <file:line, measurement, URL + date> | <command run> | verified |
[Ordered by what the reader must believe first. A row that cannot reach `verified` is deleted, not softened.]
## Body
[The copy. Every factual sentence maps to a claim row. A sentence mapping to nothing is opinion — written as opinion — or unsourced.]
## Call to action
[The one action again, where the reader is most convinced, and what happens next.]
## Not claimed
[What a reader might reasonably infer that is not true, one line each — this is what stops a true sentence reading as a false promise.]
```

## Docs and reports

Same skeleton, two substitutions: the audience line becomes the reader's starting state, the one action the task they complete.

- **Every command in the document was executed this session and every pasted output is copied real output**, never typed from expectation —
  fabricated terminal transcripts are documented agent behaviour, which is why a reader cannot take yours on trust. **Run the quickstart from
  the state it claims to start from**; a guide that only works from your current working tree describes your machine.
- **No secret in a document** — no key, token, password or connection string, including inside an example command or a `.env` sample. Name the
  variable, never its value (Law 10); a doc is the highest-traffic place a leaked credential can land.
- Screenshots go to `<workspace>/work/<slug>/evidence/` and count only after [verify.md](verify.md)'s provenance checks; numbers become charts
  through `dataviz`, a mechanism gets `artifact-diagramming`. A report's claim rows are measurements — query, date range, row count returned — and a chart with no query behind it is a drawing.

## Refutation pass

Do not re-read your own draft and call it checked. A generator grading its own work confidently praises it, and the documented failure is
identifying a legitimate problem and then talking itself into deciding it was not a big deal. Dispatch one agent — the recorded worker when refutation is inside its envelope, announce line included (Law 11, [worker.md](worker.md)) — carrying the deliverable
and the claim table and **not** the drafting history: split by context boundary, not by role. Its only instruction is to refute: for each row
it returns exactly one of `source found` / `source not found` / `source contradicts`, with the `file:line`, command or URL it used. A row that
survived only because the reviewer could not find the source is `unverified`, and `unverified` means the sentence is deleted, not reworded.
`<workspace>/work/<slug>/evidence/claims.md` is the graded artefact; where the run also ships code, [verify.md](verify.md)'s `EVIDENCE.md` indexes it rather than restating it.

## Publishing

Publish when the deliverable has an audience beyond this terminal — a report a team will read, a page someone will link, a doc that outlives
the session. Scrollback is not delivery: the user cannot share it, search it or return to it, so work left there is work you will redo.

- Load `artifact-design` first (`skills.ts resolve docs` names it), write the file, publish it, hand back **the URL on one line**.
  Republishing the same file path keeps that URL; a new path is a new artifact and a dead link in whatever the user already shared.
- Never publish anything impersonating a real organisation or person, presenting fabricated records as genuine, or carrying a claim row that
  is not `verified`.
- An artifact starts private, so publishing is not broadcasting. **Sending, posting or emailing it is** — a side effect outside the worktree
  that needs the user's word first (Law 8).

## Exit condition

All seven true, checked rather than felt:

1. `grep -nE '^\[|\bTODO\b|lorem ipsum' <deliverable>` returns nothing, and the file is at its real destination path.
2. `grep -nEi '\b(developers|teams|users|customers|businesses|everyone|anyone)\b'` over the Audience line returns nothing, or each surviving word is narrowed by the situation named beside it.
3. Exactly one primary action, exercised this session, its exit code or HTTP status written into the claim table.
4. `grep -c unverified <workspace>/work/<slug>/evidence/claims.md` returns 0, and every hedging-grep hit maps to a claim row.
5. Zero social-proof elements without a named, permissioned source; every unfillable slot is visibly empty and noted unfinished.
6. The refutation pass ran in a separate context, and each finding is fixed, deleted, or recorded as a ruling with its cost-if-wrong.
7. If published: the URL was handed back and the file path recorded, so the next redeploy keeps the link.

Anything you could not establish is in **Not claimed** and noted (Law 3). "It reads well" is not an exit condition. The checkable statement is:
every sentence asserting a fact has a row, every row names a source located this session, and a reviewer who tried to break it could not.
