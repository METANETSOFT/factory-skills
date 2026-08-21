# grill — reach a shared understanding before anything is written

The most expensive failure in agent work is not bad code. It is good code for the wrong thing, discovered late, by the person who asked for it. It happens because the user's request and the agent's understanding of it were never the same object, and nothing in the pipeline forced them to be compared.

So before the first artifact of any unit of work whose shape is not already settled, you interview the user until you both mean the same thing. Not a summary you read back for approval — an interview, where they answer and their answers change what you ask next.

This is Law 12. It runs *before* `product`, and it is also the right move before `architecture` or `plan` when the phase before it left a real fork open.

`grill` is not a pipeline phase. `state.ts phase` has no `grill` value; do not invent one. It runs inside the phase you are entering.

**This does not contradict Law 8.** Law 8 forbids parking a running pipeline on a question — an ambiguity discovered mid-build is yours to rule on, because the user is waiting on work already in flight. Law 12 is the other end: nothing is in flight yet, nothing has been written, and the question costs a minute instead of a rewrite. Once the artifact exists, Law 8 governs again and you stop asking.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/skills.ts resolve grill
```

## When it fires

Triggers are conditions, not topics. Any one of these is enough:

| Condition | Why it means you cannot start yet |
|---|---|
| The request is bigger than one slice | A large request is a bundle of unstated decisions, and the artifact you write will pick each one silently |
| Two honest readings of the request would produce different software | You are about to gamble on one of them and call it a plan |
| The next artifact would settle something the user has never said out loud | Written down, it stops looking like a guess and starts looking like a requirement |
| A noun in the request has no agreed meaning here | See [language.md](language.md) — an unresolved word becomes two implementations |
| The work came from one sentence and would take a day | The ratio is the signal, on its own |

It does not fire for a scoped fix whose correct behaviour is already specified somewhere you can name, for a request already precise enough to build without guessing, or when the user has told you not to ask.

## When the user does not want to be asked

"Don't ask me questions", "just build it", "no interview" — that is a legitimate instruction and it holds. What it does not do is delete the decisions. Every one still gets made; the only change is who makes it.

- Take a ruling on each open branch, with its cost-if-wrong (Law 8), and record it: `node ${CLAUDE_SKILL_DIR}/scripts/state.ts note ruling "<decision> chosen over <alternative>; cost if wrong: <what gets redone>"`.
- Print the list once, compactly, in the reply where you start building. Not a question — a receipt. A user who said "no questions" still gets to see what was decided for them, and to object to one line cheaply.
- Rank it: the two or three highest cost-if-wrong rulings go first, because those are the ones worth a correction.

If it is a standing preference rather than one session's mood, it belongs in `FACTORY.md` under *How to work with me* ([init.md](init.md)) so the next session inherits it instead of asking again.

Silently skipping the questions *and* the receipt is the failure this section exists to prevent: the user gets a plan whose assumptions are invisible until the build contradicts one.

## The mechanics

Map the work as a **decision tree**: every decision branches into the decisions that hang off it. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask now without guessing at an answer you have not heard.

Work in rounds. Ask the whole frontier in one round, then wait.

```
Q1. <short title>
<the question, in the user's own words where possible, with the options you see>
Recommend: <your answer, and the one-clause reason>

---

Q2. <short title>
...
```

Rules that make a round worth the user's time:

1. **Every question carries your recommendation.** A tired user can answer "yes to all" and still get your best judgement rather than a blank. A question with no recommendation is you outsourcing the thinking you were hired for.
2. **One decision per question.** Two decisions in one question get one answer, and you will not know which half it applied to.
3. **Never ask what you can find out.** Facts are your job: file layout, existing behaviour, versions, what the last migration did. Dispatch recon for those ([research.md](research.md)) and do not block the round on it — a running lookup is an unsettled prerequisite, so only the questions downstream of it wait. Ask the rest now. The *decisions* are the user's; the *facts* are never theirs to supply.
4. **A question whose answer depends on another open question belongs to a later round.** Asking it now produces an answer given under a wrong assumption, which is worse than no answer.
5. **Match the fidelity to what is still open.** Do not ask about copy or spacing while the data model is undecided. The cost of a wrong answer sets the order.
6. **Write down what got settled, as it settles.** After each round: `node ${CLAUDE_SKILL_DIR}/scripts/state.ts note decision "<what was agreed, in one line>"`. Law 7 — a shared understanding that exists only in a conversation dies with the context window, and an interview nobody can point to has to be run twice.

## Questions talking cannot answer

Some questions need something to react to. "Is this one long form or three pages?", "how should this feel?", "is this the right shape?" — call these **ungrillable**: no number of rephrasings gets an answer, and each attempt grows the scope to fill the uncertainty.

Stop asking. Build the throwaway version, show it, and get the answer in one line. [product.md](product.md) Step 4 already owns the cheapest form of this: neutral mockups per surface state, real-shaped data, no craft. Use it mid-grill rather than after.

The tell that you are stuck on one of these: the same decision comes back in three different wordings, and each answer is a hedge.

## Failure modes

- **Agreement all the way down.** If the user has accepted every recommendation, the questions were either too easy or leading, and nothing was decided. Take the two with the highest cost-if-wrong and put them again as a genuine choice, naming what each option costs.
- **The frontier grows instead of shrinking.** Rounds getting bigger means the unit of work is too large to hold. Stop, split the work into pieces, say what the pieces are, and grill only the first one. Name the round sizes you saw, so the split is a decision with a reason rather than a mood.
- **The interview becomes the work.** The point is a shared understanding, not a transcript. When every question left is ungrillable, or too small to change what gets built, the frontier is empty — proceed.
- **A grill that starts on top of a plan.** If an artifact already exists for this shape, you are not grilling, you are re-litigating. Read it first, then grill only the forks it left open.

## What it leaves behind

Ledger decision lines, always. Plus, when the session settled more than eight decisions, a compact `<workspace>/work/<slug>/AGREED.md`: one line per decision, one line per open question, no prose. The next phase reads that instead of trusting your memory of a long conversation, and a handoff mid-grill hands over something real ([context-discipline.md](context-discipline.md)).

Nothing else. No PRD, no architecture, no code. The whole value is that the next artifact is written by someone who already knows what the user meant.

## Exit condition

1. The frontier is empty: every branch is answered, ruled on, or named ungrillable with the throwaway version that will answer it.
2. Every settled decision is on disk as a ledger line, not only in the conversation.
3. The user has confirmed the understanding is shared, in their own words — or, in no-questions mode, the ruling receipt has been printed and every ruling carries a cost-if-wrong.
4. Any decision you took by ruling because nobody answered is recorded as a ruling, not silently absorbed into the next artifact (Law 3).
5. You can state, in one paragraph, what is being built and what is deliberately not — and that paragraph would survive being read back to the user.
