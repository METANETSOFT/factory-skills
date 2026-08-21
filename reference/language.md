# language — one name per thing

Two people building the same system with different words build two systems. It happens quietly: the user says *account*, the code says `User`, the schema says `customer`, and each of those is right somewhere. Then a plan says "cancel the account" and three of the four readings are wrong.

An agent makes this worse, not better. It will happily adopt whichever word appeared most recently, translate between all four without noticing, and pad every explanation with the translation. The visible symptom is verbosity — long paragraphs that restate a term four ways because none of them is agreed. The invisible symptom is an implementation that matches the plan word for word and still does the wrong thing.

So the project gets one written vocabulary, and everyone uses it: the user, you, every brief you dispatch, every artifact, and the code. This is Law 13.

`language` is not a pipeline phase — `state.ts phase` has no `language` value. It is a job you run whenever the words are in the way, which is most often just before `product` or `program-design`, and sometimes in the middle of a review that keeps arguing about what a thing is called.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts resolve language
```

## Where it lives

The glossary is about the product, not about a unit of work, so it outlives every artifact in the workspace.

1. **The project already has one** — a glossary, a domain doc, a context file, a terminology section in the README. Use it. Do not start a second one; a second glossary is the exact bug this file exists to fix.
2. **Otherwise** it starts at `<workspace>/LANGUAGE.md`, like every other factory artifact — the workspace is the default because the factory does not put files in the user's repository uninvited.
3. **Offer the repository once.** A glossary is worth more committed: it is read by people, by other tools and by every future session, and in the workspace it dies at the next reboot. Say so, name the path you would use, and write there only if the user agrees.

Whichever it is, record the location in `FACTORY.md` under *Where durable facts live* ([init.md](init.md)), so the next session finds it instead of writing a rival.

## Build it by harvesting, never by inventing

A glossary of words you made up is a rename waiting to happen. Every row starts as something already in use.

| Source | What it gives you |
|---|---|
| Type, table, route, event, queue and directory names | the words the code already commits to, with a `file:line` you can cite |
| The user's own sentences, and the ticket or message that started the work | the words the humans use, which usually differ |
| `RESEARCH.md` | the terms the codebase reading already surfaced ([research.md](research.md)) |
| The module map | the names of the boundaries, which are load-bearing in every later plan |

Put the code list and the human list side by side. Every place they disagree is a row you have to resolve, and that comparison is the whole method.

## The table

| Term | Means | Does not mean | Lives in code as | Status |
|---|---|---|---|---|
| <the one word> | <one sentence, in the domain, no implementation> | <the neighbouring thing it keeps getting confused with> | `<symbol>` at `<file:line>` | settled / contested |

- **Means** is a sentence a user would recognise. If it only parses once you mention a table or a function, it is an implementation note, and it does not belong here.
- **Does not mean** is the load-bearing column and the one people skip. A term is defined by its edge, and the edge is always the term next to it.
- **Status contested** is allowed and honest. What is not allowed is contested and silent.

Keep out: implementation detail, decisions and their reasons (those are ADRs and the ledger), and aspirational words nobody says yet.

## Resolving a collision

Two shapes, two fixes:

- **One thing, two names.** Pick one, and say which. The loser becomes an alias row with either a rename slice in `PLAN.md` or a stated decision to leave it alone. An alias with neither is how both names survive another year.
- **One name, two things.** Split it into two terms and name both, even if one of the names is new — this is the single case where inventing a word is correct, because the alternative is a word that means two things in one sentence.

Record the resolution where a future session will hit it: `node ${CLAUDE_SKILL_DIR}/scripts/state.ts note decision "<term> means <X>, not <Y>; <Y> is now <other term>"`.

## Using it

- **Read it before you write any artifact or dispatch any brief.** Reading it is a one-line habit, not a job; you only run this playbook when you are *changing* the vocabulary.
- **Every brief inherits the terms it touches.** A dispatched agent starts with zero context ([implement.md](implement.md)) and will invent a synonym within three paragraphs unless the words arrive with the work.
- **Test names, commit messages and artifact headings use the settled term.** A test called `cancels_customer` under a glossary that says *account* is a rename nobody will do.
- **Challenge a conflicting term in the moment it is used.** "The glossary says *cancellation* ends the whole order, but you seem to mean one line item — which is it?" One sentence in the conversation is cheaper than a slice.
- **A term you have explained twice in one session is a missing row.** Add it then, not later.

## The module map belongs here

Names of the boundaries, and what each one owns — one line each. It is part of the vocabulary because every plan and every review needs to say *which* module changes and *at which interface*, and a sentence like that is only checkable if the names are agreed. [program-design.md](program-design.md) owns the depth and seam vocabulary; this file owns the fact that the names are written down where the user can read them.

A plan that says "update the importer's interface to take a stream" is reviewable in one line. "Refactor the import code" is not, and the difference is only this table.

## Refresh, do not rewrite

Add rows as phases surface nouns. A full re-harvest is warranted only when the code and the glossary have visibly drifted — new subsystems the table never learned, or more than a couple of rows whose `file:line` no longer resolves. Note the refresh as a decision so the next session knows the table was checked and when.

## Exit condition

1. The glossary exists at one location, and `FACTORY.md` names it.
2. Every term that appears in the current unit of work has a row, and every row has *Means*, *Does not mean* and a code location or an explicit "no code yet".
3. No collision is left silent: each is either resolved, or present with status `contested` and a ledger line saying so.
4. The modules touched by this work are named in the map, with what each one owns.
5. The artifacts and briefs written this session use those terms — checkable by grepping any one of them for a word the glossary retired.
