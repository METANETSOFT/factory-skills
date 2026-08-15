# marketing

Non-code deliverables — positioning, launch copy, a landing page, documentation, a report — run the same pipeline with different artefacts: research about the audience and the competitors, a product phase that names the one measurable thing a reader should do, the deliverable, then verification. What changes is the cost of being wrong. A confident false claim in shipped copy is a liability rather than a style problem, and unlike a bug it is not repaired by a patch — it has already been read, quoted and screenshotted.

## Order

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs phase <research|product|implement|verify>
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs resolve marketing     # positioning, copy, launch, campaign
node ${CLAUDE_SKILL_DIR}/scripts/skills.mjs resolve docs          # reference, guides, reports, changelogs
```

Both jobs route to this playbook and differ in who the reader is and what they do next; `marketing` routes to competitor research and image generation, `docs` to `artifact-design` and diagramming. Load what the resolver names. A skill it marks missing is a gap you state out loud with its install line, never one you improvise past (Law 9).

| Phase | Here it means | Artifact |
|---|---|---|
| research | who the reader is, what they already believe, what competitors claim in their own words | `RESEARCH.md` |
| product | the one measurable action a reader takes, written backwards from the announcement | `PRD.md` |
| implement | the deliverable, at the path it will actually be used from | the file, or a published artifact |
| verify | every claim traced, every number measured, a separate pass that tried to refute it | `evidence/claims.md` |

`architecture` and `program-design` are skipped by default — record the skip as a ruling and say it in your reply, because a silent skip is indistinguishable from forgetting. A landing page with real interface work does **not** skip design: the words are yours, the visual craft is owned by `impeccable` through [design.md](design.md).

## Research: evidence about people, not assumptions about them

Follow [research.md](research.md)'s evidence table; the sources change, the discipline does not.

- **Competitor claims are quoted from their live pages, fetched this session, with the URL and the date.** Taglines, pricing and limits change weekly; a remembered positioning is a stale positioning, and a wrong comparison is the single thing a competitor will publicly correct.
- **Audience evidence, ranked:** something the audience wrote (a ticket, issue, review, forum post, sales-call note) beats something the user reports about them, which beats your inference. Mark inferred rows as `inferred`. If every row is inferred you are about to write copy for an imagined person — say so in one line before continuing.
- **Do not invent a persona.** A composite nobody has met produces copy that speaks to nobody, and it is unfalsifiable, so it never gets corrected. Name a real situation instead.
- Anything about a named library, framework or service resolves through `find-docs` / Context7 rather than memory (Setup's standing routing decision).

## Product: work backwards from the announcement

[product.md](product.md) already requires the announcement — the paragraph you would publish the day this ships. Here it is not a comprehension check; it is the source text. Write it first, then derive the deliverable from it. Anything in the copy that is not a claim already present in the announcement either belongs in the announcement or does not belong at all.

The working-backwards move pays here because it surfaces the copy's real problem at the cheapest point: if the announcement needs a claim you cannot verify, you discover that before a page exists, not after a designer has laid it out around the claim.

- **One primary action per deliverable**, written as a verb the reader performs, and reachable — the URL resolves, the command runs, the button exists. "Learn more" is not an action.
- **The outcome is an action rate, not a feeling**: signups from this page, docs page to task completed, replies to the launch post. If nothing is instrumented, say so and gate on a tier-2 judged rubric with a named judge who is not you.

## Claim verification: what counts as a source

Every factual sentence about the product is checked against the thing itself, not against the PRD. The PRD says what was intended; only the code and the shipped docs say what exists.

| Claim type | Verified by | Fails as |
|---|---|---|
| capability — "supports X", "works with Y" | the code path located (`file:line`) **and** exercised once | a feature that was planned, or that exists behind a flag nobody enables |
| performance or scale number | the command that measured it, run this session, with the dataset and machine stated | a number remembered from a README, which is where stale numbers go to be believed |
| comparison to a competitor | their live page fetched this session, quoted, URL and date recorded | a memory of a pricing table |
| pricing, limits, quotas | the config, plan file or vendor page read this session | inference from a tier name |
| integration or compatibility | the dependency in the manifest at the stated version | a package that was discussed and never installed |
| social proof — quotes, counts, logos, ratings | a real, named, permission-granted source | see below: there is no verified form of an invented one |
| roadmap, "coming soon" | an issue, ticket or ledger decision that names it | a hope |

Record each as it lands, not in a sweep at the end (Law 7):

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note evidence "<claim>: verified at <file:line | command | URL fetched <date>>"
```

## Never fabricate, and never fill a slot with a placeholder that reads as real

No invented testimonial, customer name, quote, logo wall, "trusted by" row, user count, revenue figure, rating, award, case study or before/after figure. Not as a sample, not as filler, not labelled "example". A fabricated testimonial is a fabricated person; an unlicensed logo is trademark misuse; and one recognisably false element discredits every true claim on the same page — the reader has no way to tell which half you checked.

If the layout needs a slot you cannot fill, the slot ships **visibly empty** and the gap is named:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/state.mjs note unfinished "<page>: testimonial slot empty — no real customer quote available"
```

Never a plausible fake, because the "sample" label is the first thing removed downstream and the fake is what ships (Law 4 — a stub is not a deliverable; Law 3 — the gap gets named, not hidden).

## The deliverable

Write it to the path it will be used from — the repo's `docs/`, the page source, or an artifact. Draft and claim table live together so the table cannot drift from the copy.

```markdown
# <deliverable>

<!-- factory-copy 1 · slug: <slug> -->

## Audience
[One sentence naming a specific reader in a specific situation. It must exclude somebody.
If "developers", "teams" or "users" survives the sentence, it is not yet an audience.]

## The one thing they should do
[One action, one verb, reachable: <the URL, the command, the button>. Not "learn more".]

## Claim stack
| # | Claim, as the reader will read it | Evidence | Verified how, this session | Verdict |
|---|---|---|---|---|
| 1 | <the sentence, verbatim from the copy> | <file:line, measurement, URL + date> | <command run / file read> | verified |

[Ordered by what the reader must believe first. Any row that cannot reach `verified` is deleted
from the copy, not softened: "may", "can help", "up to" convert an unverifiable claim into an
unfalsifiable one and leave it in the text where it still does the persuading.]

## Body
[The copy. Every factual sentence maps to a claim-stack row. Sentences that map to nothing are
either opinion — allowed, and written as opinion — or they are unsourced claims.]

## Call to action
[The one action again, at the point the reader is most convinced, and what happens next.]

## Not claimed
[What a reader might reasonably infer that is not true, one line each. This section is what stops
a true sentence being read as a false promise.]
```

**Docs variant:** the audience line becomes the reader's starting state, the one action becomes the task they complete. Every command in the document was executed this session and the pasted output is copied real output, never typed from expectation — fabricated terminal transcripts are documented agent behaviour, which is exactly why yours are not trusted by default. Run the quickstart top to bottom from the state it claims to start from; a guide that only works from your current working tree is not a guide. Screenshots go to `evidence/` and are checked as coming from a real environment. Numbers get charts through `dataviz`, not through prose approximation.

## Verification is a separate pass

Do not re-read your own draft and call it checked. An agent grading its own work confidently praises it, and the documented failure is identifying a legitimate problem and then talking itself into deciding it was not a big deal.

Dispatch a subagent with the deliverable and the claim table and **not** the drafting history — split by context boundary, not by role. Its only instruction is to refute: for each row report `source found` / `source not found` / `source contradicts the claim`, with the path or URL it used. A claim that survived only because the reviewer could not find the source is `unverified`, and `unverified` means deleted, not reworded. [verify.md](verify.md) owns the grading form; `evidence/claims.md` is what it grades.

## Publishing

Publish when the deliverable has an audience beyond this terminal — a report a team will read, a page someone will link, a doc that outlives the session. Scrollback is not delivery: the user cannot share it, search it, or return to it, so work left there is work you have to redo.

- Load `artifact-design` first (`skills.mjs resolve docs` names it), write the file, then publish it and hand back **the URL in one line**. Redeploy to the same file path to keep that URL; a new path is a new artifact and a dead link in whatever the user already shared.
- Do not publish anything impersonating a real organisation or person, presenting fabricated records as genuine, or carrying a claim-stack row that is not `verified`. Publishing is where a draft stops being a draft.
- An artifact starts private, so publishing is not broadcasting. **Sending, posting or emailing it is** — that is a side effect outside the worktree and it needs the user's word first (Law 8).

## Exit condition

All six true before this is handed back:

1. The deliverable exists at its real destination path, every section filled, no bracketed placeholder text remaining.
2. The audience sentence names a specific reader in a specific situation and excludes somebody.
3. Exactly one primary action, and it was exercised — the URL opened or the command run — not assumed reachable.
4. Every claim-stack row reads `verified` with a source located this session. Zero `unverified` rows survive, because the rule is deletion rather than hedging.
5. Zero social-proof elements without a named, permissioned source; any empty slot is visibly empty and noted unfinished.
6. The refutation pass ran in a separate context and its findings are fixed, deleted, or noted with cost-if-wrong.

Anything you could not establish is named in `Not claimed` and noted (Law 3). "It reads well" is not an exit condition.

## What marketing does not do

It does not do visual craft — [design.md](design.md) routes that to `impeccable`. It does not decide product scope; [product.md](product.md) does, and copy that quietly expands the promise has changed the spec without changing the code. It does not measure the outcome it claims — [verify.md](verify.md) does. And it never invents a customer, a number, a benchmark or an endorsement: every downstream phase then optimises honestly against a lie, and the person who has to defend the claim is the user, not you.
