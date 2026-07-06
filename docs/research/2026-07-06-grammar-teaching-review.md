# Grammar teaching review — how the app teaches grammar today, and how to teach it better

> Review date 2026-07-06. All counts queried from the **live DB** this date (per the standing rule: never cite grammar counts from memory); all behavioural claims cite code. Companion to `docs/roadmap.md` §C and the bold-bets program specs.

## 1. How grammar teaching works today (verified)

**The capability ladder (the good bones).** Every grammar pattern emits **three scheduled capabilities** with a strict difficulty ladder and prerequisite chaining — `recognise → contrast → produce` (ADR 0017, shipped 2026-06-16; production unlocks one stabilised step after contrast, honouring receptive-before-productive staging, ADR 0007). Cognitive level lives on the capability, never the exercise — the settled principle that triggered the 0017 split (transfer-appropriate processing; receptive≠productive, Laufer & Goldstein 2004).

**The exercise layer.** Four typed, per-pattern exercise tables (ADR 0009/0010 regime), each row carrying `explanation_text NOT NULL`:

| Exercise type | Capability | Live rows | ~per pattern |
|---|---|---|---|
| `cloze_mcq_exercises` (migration.sql:3063) | recognise | 582 | 3.0 |
| `contrast_pair_exercises` (:2959) | contrast | 587 | 3.1 |
| `sentence_transformation_exercises` (:2994) | produce | 761 | 4.0 |
| `constrained_translation_exercises` (:3028) | produce | 955 | 5.0 |

**Live totals (2026-07-06):** 191 patterns → 573 grammar caps (3 per pattern, 100% ready+published) → **2,885 authored exercises** (≈15.1 per pattern). Variety is genuinely solved — the learner cannot memorise the sentence instead of the rule.

**Feedback pedagogy.** Wrong answers show the answer + the authored explanation on the Doorgaan screen: all four grammar types map `explanation_text` into the feedback primitive (`feedbackMapping.ts:201,216,231,253` → `ExerciseFeedback.tsx:274`). This is real focus-on-form at the moment of error — most commercial apps don't have it.

**The teach channels (pre-exercise).** Grammar is *introduced* in the lesson reader's grammar sections (bespoke lesson pages) and reinforced by the grammar podcasts (`LessonGrammarAudioBand.tsx`, NL + EN audio). There is **no standalone grammar surface outside lessons** — no browsable reference, no rule card at exercise time.

**Exposure machinery.** The grammar due-floor shipped (Part A, PR #375): sessions reserve grammar slots. The roadmap's recommended **grammar practice mode** is NOT built.

## 2. The findings (ranked by severity)

### F1 — Exposure is still the binding constraint, not variety ⚠️ the headline
Grammar is 3.8% of the ready pool (573 of 15,239 caps) and got **6.2% of reviews in the last 30 days** (191 of 3,106 events) — so the due-floor IS oversampling grammar ~1.6× relative to pool share. But the absolute number is the problem: **191 grammar reviews / 191 patterns / 30 days ≈ one review per pattern per month**, spread across its three caps. The 2,885 authored exercises are mostly never seen. Deepening variety further (more exercises per capability) is the *wrong* lever — the learner-minutes, not the content, are the bottleneck. (Interacts with the open review-saturation investigation — a frozen frontier also freezes new-pattern introduction.)

### F2 — There is no instruction moment at first scheduled encounter
A pattern's first-ever session appearance is a cloze MCQ, cold. The rule *was* explained in the lesson reader — possibly days earlier, possibly skimmed. Error-time explanations partially compensate, but "first encounter = test" inverts presentation-practice ordering for anyone who didn't just read the lesson.

### F3 — The explanation dead-ends
`explanation_text` renders once on the wrong-answer screen and vanishes. There's nowhere to go deeper: no per-pattern rule page, no way to review a rule outside a lesson, no link from the feedback card to anything.

### F4 — The produce grader is the same trust bug class just fixed for vocab
`acceptable_answers text[]` (sentence_transformation, migration.sql:3001) and the constrained-translation equivalent carry authored answer lists; the open `transform_sentence` grader issue (exercise-quality pass, 2026-07-05) is the grammar twin of the vocab thin-variants false-negative bug (diagnosed 89% items with 0 variants; fix shipped 2026-07-06). Being marked wrong when right, on the *hardest* exercises, poisons both trust and FSRS state.

### F5 — One cognitive level is missing from the ladder: interpretation
`recognise` asks "which form fits the slot" (form-selection). SLA processing-instruction research (VanPatten) says the higher-value receptive skill is **form→meaning mapping**: use the form to extract *who did what* ("Ayam dimakan Budi — who ate?"). No current exercise type tests whether the learner can *use* the grammar to understand a sentence — the skill reading/listening actually needs.

### F6 — Production tops out at controlled output
transform/translate are controlled production (one right answer family). There is no freer-production rung — "use this pattern in your own sentence" — which is where a rule becomes *owned*. Ungradeable deterministically; gradeable by LLM (cheap, async) — and the Percakapan/Dagboek programs are natural carriers.

## 3. Ideas, ranked (minimum mechanism honoured)

1. **Grammar practice mode** (roadmap §C's own recommendation — build it). Learner-initiated: pick a pattern (or "my weakest 3"), drill 5–10 exercises from the 2,885 already authored, FSRS-adjacent (practice counts as exposure, not scheduled reviews — design question for its spec). This attacks F1 with **zero new content**: it spends the inventory that already exists. Highest value-per-effort on this list.
2. **First-encounter rule card** (attacks F2). When a grammar cap is introduced in a session (the `intro`/activation moment already exists in the flow), show a one-screen rule presentation — name, 2-line rule, 2 examples — before the first exercise. Content derives from what's already authored (pattern brief / lesson section); one new screen, no new content type.
3. **"Grammatica" reference library + explanation deep-link** (attacks F3). A browsable per-pattern rule page (rule, examples, its 15 exercises' explanations as a corpus, mastery chips already exist in Voortgang) + a "leer meer" link from the wrong-answer card. Mostly a *surface* over existing data.
4. **Fix the produce grader** (attacks F4). Reuse the just-shipped vocab answer-variants machinery/lessons for `acceptable_answers` enrichment — same bug class, same fix shape, direct DB seed with the three gates. Do this before adding any new produce content.
5. **Interpretation exercise variants** (attacks F5). A new *variant shape within the recognise capability* — "read sentence, answer a meaning question that hinges on the form" — NOT a fourth capability (level stays receptive; the 0017 principle holds: variants vary surface within a level). Authorable by the existing linguist pipeline; needs a distractor design pass.
6. **Freer production via LLM grading** (attacks F6) — a later, premium-adjacent rung riding Dagboek/Percakapan (see `2026-07-06-experience-and-growth-ideas.md`): "write your own sentence with *sedang*" graded asynchronously. New cost profile → belongs with the Phase-2 AI features, not the core drill loop.
7. **Input flooding via the weekverhaal** (free rider). Bet 2 already feeds weak *grammar patterns* into generated stories — that IS the comprehensible-input side of grammar teaching. No extra work; noted so the weekverhaal spec keeps grammar patterns as a first-class input.

**Explicitly rejected:** more exercises per capability (the user's suggestion, honestly assessed — F1 shows inventory is ~15×/pattern and unseen; more rows deepen the unused pile); a fourth scheduled capability tier (interpretation fits as recognise-level variants; freer production is unscheduable-by-FSRS LLM territory); grammar gamification layers (off-strategy).

## 4. Suggested order

F4 grader fix (trust, reuses fresh machinery) → practice mode (spends existing inventory) → rule card (cheap, completes presentation-practice ordering) → reference library → interpretation variants → LLM production (Phase-2).

Each of 1–5 needs its own execution spec + gauntlet; none blocks the others.
