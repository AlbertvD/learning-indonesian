---
status: draft
audience: fresh-context reviewer (Fable) — self-contained, assumes no prior conversation
---

# Review brief: the vocabulary learning model — problem, evidence, and proposed solution

## What I want reviewed

This is a design decision about the **durable vocabulary learning model** for a spaced-repetition Indonesian-learning app ("Kamoe Bisa"), heading into a commercial preview. It is **not** about fixing one user's backlog — the owner's own account is used only as the first sustained-use dataset (evidence). Please review, as a skeptic:

1. Is the **core thesis** sound — that the review load is *convergent* (a learner can "learn it all") **iff** each word's lifelong review cost is *bounded*, and that today's stall is caused by an *unbounded* per-word cost, not by the introduction policy?
2. Is the **maintenance-ceiling argument** (below) correct and decisive?
3. Is the proposed **solution** (bound per-word cost via *mode graduation* + a *minimal mode set*; **no** forced-intake override) the right, minimal, FSRS-consistent design? What's missing or wrong?
4. Is the **mode set we keep** (productive-recall frontier + one aural, retire the rest after mastery) pedagogically defensible, and are the graduation triggers right?

---

## 1. Background: how vocabulary is modelled today

FSRS schedules **capabilities**, not content (ADR 0003). Each vocabulary word is generated as **6 independent capabilities** ("modes"), arranged as a prerequisite ladder from easy receptive recognition to hard productive recall. Verified live (`indonesian.learning_capabilities`, 2026-07-08): **2,359 words × 6 = 14,154 vocab capabilities**.

| # | capability_type | direction | modality | role | prereq (ladder) |
|---|---|---|---|---|---|
| 1 | `recognise_meaning_from_text` | id→nl | text | receptive recognition (MCQ) | — (ROOT) |
| 2 | `recognise_form_from_meaning` | nl→id | text | productive recognition (MCQ) | #1 |
| 3 | `recognise_meaning_from_audio` | audio→nl | **audio** | **aural** recognition | #1 |
| 4 | `recall_meaning_from_text` | id→nl | text | receptive recall (typed) | #1 |
| 5 | `produce_form_from_audio` | audio→id | audio | dictation (typed) | #1 |
| 6 | `produce_form_from_meaning` | nl→id | text | **productive recall (typed) — the frontier** | #2 |

The prerequisites gate **introduction** (recognise before produce). But once introduced, **all 6 become lifelong FSRS review cards.** A mastered word therefore carries 6 cards in perpetual rotation.

Session model: a session is a fixed size (learner's `preferredSessionSize`, default 15; owner's = 25). It is filled **due reviews first**, and new material fills the remainder: `openSlots = max(0, sessionSize − dueCount)`, `maxNewCapabilities = openSlots`. So new introductions only happen from slots left over after due reviews.

---

## 2. The problem, with live evidence (owner account `7eaacda5`, a committed daily user)

### 2a. The frontier is frozen — for everything, not just grammar

Introductions (a capability the learner has actually started — i.e. has a `learner_capability_state` row) by lesson:

| Lesson | grammar introduced / total | vocab introduced / total |
|---|---|---|
| 1–2 | complete | ~mostly complete |
| 5 | 12 / 21 | 76 / 390 |
| 8 | 4 / 33 | 5 / 306 |
| **9–30** | **0 / all** | **0 / all** |

Lessons 9–30 have **zero** cards introduced despite being *activated* — and even lessons 5–8 are only partial. The learner has practised hard (200+ reviews/day on some days) and is still finishing **lessons 1–2**.

### 2b. Why: the review backlog structurally exceeds the session, so `openSlots = 0`

- Due now (owner): ~200+ vocab caps; **177 distinct words even after sibling-burying** (one card per word/day). Against a 25-card session, `openSlots = max(0, 25 − 25) = 0`. The builder literally stamps the reason `review_backlog_exhausts_budget`.
- Activation ≠ scheduling: activating lessons 9+ makes their cards *eligible*, but they still need a free slot to be *introduced*, and there are none.

### 2c. The "new material" a committed user sees is mostly repackaging

Of everything newly introduced to the owner in the last 4 days: **64 caps (48 words) were new *modes* of words already met; only 6 caps (4 words) were genuinely new vocabulary.** The frontier's tiny trickle goes to the **lowest incomplete lesson** (lesson-major ordering), which is still lessons 1–2 because 6 modes/word inflates each lesson to hundreds of caps (lesson 1 = 396 vocab caps). A committed user feels stuck while working hard.

### 2d. Load distribution across the 6 modes (owner, active caps)

| mode | active | due now | avg reviews | avg stability (d) |
|---|---|---|---|---|
| recognise_meaning_from_text | 519 | 30 | 2.1 | 15.3 |
| recognise_meaning_from_audio | 310 | 8 | 1.8 | 15.6 |
| produce_form_from_audio | 222 | 12 | 2.0 | 13.7 |
| recall_meaning_from_text | 206 | 28 | 2.3 | 13.3 |
| recognise_form_from_meaning | 145 | 13 | 1.6 | 12.2 |
| produce_form_from_meaning | 103 | 5 | 1.5 | 10.2 |

Counts fall up the ladder (recognition introduced first; production last). **Nothing is productively mastered** (frontier avg 1.5 reviews).

### 2e. The decisive argument — the maintenance ceiling

For a *fixed* set of learned words, FSRS makes daily load **drain toward near-zero**: as words mature, intervals stretch to months/years, so each word's daily review contribution shrinks. That drain is *what frees capacity for new words* and lets a learner eventually "learn it all."

But estimate the **steady-state maintenance load of the fully-learned corpus** (2,359 words, ~1-year mature intervals):

- **6 modes/word:** 2,359 × 6 ÷ ~365 d ≈ **~30–40 reviews/day just to maintain a fully-mastered deck** — at or above a 25-card session **before learning anything new**.
- **2 modes/word:** ≈ **~10–13 reviews/day** — leaving most of every session free.

**With 6 modes, the system cannot converge even in principle**: maintenance alone saturates the session, so a committed learner can never simultaneously hold the corpus *and* take on new material. This is the root defect, and it is a *design* property, not a tuning issue.

---

## 3. Pedagogical grounding (SLA literature)

1. **Productive knowledge subsumes receptive** — single developmental continuum; productive mastery presupposes the receptive form-meaning link (Melka 1997, in Schmitt & McCarthy; Nation 2001, *learning burden*).
2. **Recall subsumes recognition, and transfer runs *upward*** — recall practice improves later recognition, not vice-versa (Rowland et al.). Karpicke & Roediger (2008, *Science*): once recalled, repeated *study* adds ~nothing; continued recognition drilling after recall is solid ≈ that inert condition.
3. **Retire at criterion, focus the frontier** — successive relearning (Rawson & Dunlosky 2018, 2022): drop a mastered sub-skill (~3 spaced successful recalls) and spend effort on the frontier; diminishing returns per extra retrieval. A high-stability FSRS card *is* an item past successive relearning.
4. **Two guardrails:** aural recognition is a **distinct construct** productive typing never trains (Milton & Hopkins 2006; Uchihara et al. 2025) → **never retire the listening mode**. Recall subsumes recognition *knowledge* but not *speed/automaticity* (transfer-appropriate processing; Barenberg & Roelle 2021) → set the retirement bar at genuine mastery.
5. **Lapses relearn fast (savings)** (Ebbinghaus; Nelson 1978) → a lapse needs only a brief scaffold reactivation, not a full rebuild.

---

## 4. The thesis we converged on

- **The `openSlots` model is *correct and FSRS-consistent*, not the bug.** New-material-from-leftover-slots protects retention and paces intake to available capacity. It is *convergent* — provided per-word cost is bounded.
- **The bug is the *unbounded per-word cost*** (6 lifelong cards + a wide ladder). It prevents the load from ever draining (§2e), so capacity never frees and the frontier freezes.
- **Fix the per-word cost and the existing machinery self-paces**: mature words' load drains → `openSlots` opens → new material flows at a sustainable rate → the learner reaches steady state and can exhaust the corpus. **No override of FSRS is needed or wanted.**

### Explicitly rejected: a forced new-material reserve

An earlier idea — reserve a floor of each session for new introductions regardless of backlog — was **rejected**. It fights FSRS (forces due cards to lapse past their optimal review) and, worse, **diverges**: intake outruns consolidation, the backlog grows unbounded, retention collapses, and the learner *never* learns it all (the classic "too many new cards" failure). At most a *tiny* anti-total-stall floor (≤1 new/session, capped so it cannot diverge) as a UX nicety — not a mechanism.

---

## 5. Proposed solution — bound the per-word cost (two complementary mechanisms)

### Mechanism A — Mode graduation (retire subsumed modes after mastery)

A **stateless, build-time due-suppression rule** — the exact mirror of the *receptive-before-productive* introduction gate that already exists in the session builder. Once a word is mastered on the mode(s) that subsume a rung, that rung stops being scheduled for review.

**Retirement map** (keyed on the subsuming prerequisite successor; `source_ref` groups a word's modes):

| Retire | once successor is | rationale |
|---|---|---|
| #1 recognise-meaning | #4 recall-meaning **stable** (rolling) | recall subsumes recognition of meaning |
| #2 recognise-form | #6 produce-form **stable** (rolling) | production subsumes recognition of form |
| #4 recall-meaning | #6 **mastered** (deep) | full productive mastery of the pair |
| #5 dictation | #6 mastered **and** #3 present | dictation ≈ aural (#3) + spelling (#6) |
| **keep always** | **#6 produce-form (frontier) + #3 aural (listening)** | Karpicke maintenance + distinct aural construct |

End state for a mastered word: **2 cards** (#6 + #3), not 6.

**Triggers (tunable):** rolling = successor `stability ≥ 7d ∧ successfulReviewCount ≥ 3 ∧ not currently failing`; deep = reuse the app's existing `isCapabilityMastered` (`reviewCount ≥ 4 ∧ stability ≥ 14 ∧ recent ∧ not failing`) — one already-parity-tested mastery definition.

**Properties:** reads only the already-loaded session snapshot (capability type / source_ref / prereqs + FSRS state); scoped to `vocabulary_src`; **no schema, no learner-data writes, no migration, no RPC change.** Reversibility is *free* — the predicate is stateless, so if the frontier later fails, the retired scaffold reappears automatically (savings clears it fast). Graduation does **not** fight FSRS: it is a pedagogical choice of *which cards to track* (deck selection), upstream of scheduling; FSRS still optimally schedules whatever remains.

**Modeled impact (owner):** graduation is a **long-horizon** lever, not an immediate unclog. At full-mastery: 0 words qualify today (nothing productively mastered). Rolling: ~184 active caps (~12%) become retirable, but only 3 are due today (retirable cards are stable, so weren't crowding the queue). It stops mature cards from *resurfacing* over weeks/months — the durable steady-state fix.

### Mechanism B — Minimal mode set at authoring (Capability Stage)

Generate **fewer modes per word** (target ~3: productive-recall frontier + aural + a single receptive scaffold rung) instead of the full 6-way matrix. This bounds the **acquisition** load (fewer cards to introduce and mature per word), which is what limits the *near-term* frontier speed — the complement to graduation's steady-state effect. Modes chosen from the SLA evidence (§3), not a mechanical matrix.

Together: Mechanism B bounds acquisition cost; Mechanism A bounds maintenance cost; the existing `openSlots` policy then paces intake correctly and convergently.

---

## 6. Where it lands (code seams, for feasibility review)

- **Mechanism A:** a pure helper in `src/lib/session-builder/`, composed into the due pass (`builder.ts`) **and** the `dueCount` computation (`adapter.ts` / `getDueCapabilitiesFromRows`) so the shed feeds `openSlots`. Mirrors the existing `reserveGrammarDueFloor` and the staging gate (`pedagogy.ts` `capabilityPhase` + the same-`source_ref` stability check). Reuses `isCapabilityMastered` (`src/lib/analytics/mastery/mastered.ts`).
- **Mechanism B:** the Capability Stage generator (`scripts/lib/pipeline/capability-stage/`) — reduce the modes emitted per vocabulary item. A content-side change (regenerable), not learner data.
- Prior related work: grammar due-floor (`docs/plans/2026-07-05-grammar-exposure-session-quota-design.md`), the deferred "grammar-intro reserve" (now subsumed/reconsidered under §4), session-builder module spec (`docs/current-system/modules/session-builder.md`).

---

## 7. Open questions for the reviewer

1. Is the maintenance-ceiling math (§2e) right, and is it truly decisive (i.e. is 6 modes unsustainable *in principle*)?
2. Is ~3 the right target mode count, and **which** 3? (Proposed: produce-form + aural + one receptive scaffold. Is dropping receptive *recall* (#4) too aggressive vs. keeping it as a reading-comprehension mode?)
3. Are the graduation triggers well-chosen? Any risk that rolling-retiring recognition at `stability ≥ 7d` harms recognition *speed* (TAP) more than the evidence suggests?
4. Is dropping the forced-intake reserve (§4) correct, or is a bounded reserve ever justified for engagement without risking divergence?
5. Does Mechanism B (fewer modes) interact badly with anything — e.g. the receptive-before-productive staging gate, or existing distractor/exercise generation?
6. Anything that makes this *not* minimal, or any learner-data-safety concern in Mechanism A's read-time suppression?

---

## 8. Review outcome (2026-07-08, Fable — main-thread code verification, all cites checked live)

**Verdict: thesis CONFIRMED; proposed solution directionally right but reshaped by three code-level
defects.** The implementable spec is `docs/plans/2026-07-08-vocab-mode-set-reduction-and-graduation.md`
(supersedes the Mechanism-A draft). Per-question answers:

1. **Maintenance ceiling — arithmetic right, framing slightly overstated, conclusion stands.** FSRS
   intervals grow super-linearly, so a *fixed* corpus's daily load does decay below any bound eventually —
   "cannot converge even in principle" is technically false. What is true and decisive: (a) at the
   realistic ~1-year-interval horizon, 6 modes cost ~35–40 maintenance reviews/day against a 25-card
   budget, so the learner spends **years** pinned at saturation before drain wins; (b) the sharper number
   is *acquisition*: 14,154 cards × ~8–12 reviews each to maturity ÷ 25/day ≈ 15+ years to even reach the
   maintenance regime. 6 modes is a design defect either way.
2. **3 modes, specifically {#1 recognition, #3 aural, #6 productive recall}.** #4 is the right one to drop,
   not #1: transfer asymmetry (production practice strengthens receptive knowledge strongly, the reverse
   weakly), the reader + dialogue cloze already serve receptive depth, and #1 is structurally required —
   it is the Phase-1 introduction vehicle the staging gate needs (`pedagogy.ts:360-369`) and typed
   receptive recall as *first* exposure would invert learning-burden staging. #2 is redundant with #6
   (same direction, weaker practice); #5 ≈ #3 + #6.
3. **Triggers — one defect found, and the map collapses.** Reusing `isCapabilityMastered` verbatim is
   WRONG: its 30-day recency term (`mastered.ts:32`) means a mature #6 (interval > 30d) flickers out of
   "mastered" between its own reviews and un-graduates the scaffold — the suppression oscillates exactly
   at the horizon it exists for. Use the recency-free strength core (`reviewCount ≥ 4 ∧ stability ≥ 14 ∧
   consecFail = 0`), extracted as a shared helper. And once the mode-set reduction retires #2/#4/#5 for
   *existing* words too (see Q6), the 4-rule two-tier map collapses to **one rule**: retire #1 when
   same-word #6 has mastery strength. The rolling 7d tier is then unnecessary (also safer w.r.t. TAP).
4. **Dropping the forced-intake reserve is correct.** The divergence argument is sound; `openSlots`
   self-paces once per-word cost is bounded. No floor mechanism.
5. **Two real interactions found.** (a) *Prereq break*: every #6's `prerequisite_keys = [#2's key]`
   (`projectors/vocab.ts:238`); remove #2 from the snapshot and every not-yet-introduced #6 is permanently
   `missing_prerequisite`-suppressed — prereqs must be rewritten to #1's key (one-off UPDATE + trimmed
   projector emits `[#1]`). (b) *Analytics*: `get_lessons_overview` (`migration.sql:1957-2006`) — retired
   modes must leave the **denominator** (content retirement does this; pure due-suppression does not), and
   a graduated #1 ages out of the mastered **numerator** after 30 days → needs a subsumption clause
   (count #1 mastered when its #6 sibling has strength, recency-free) + parity-test extension. Staging
   gate, sibling-bury, listening filter, distractor seeding, morphology cross-prereqs (they point at #1,
   `affixedCapabilities.ts:49-57`): all verified fine.
6. **Minimality — the draft under-used machinery the codebase already owns.** `retired_at` soft-retirement
   is a complete, documented, reader-filtered, HC14-compliant, reversible retirement mechanism
   (`adapter.ts:178-198`, `migration.sql:3159,4023,1973`). Retiring the dropped modes as *content* (for
   already-introduced words too) is less mechanism than a standing 4-rule build-time filter, fixes the
   analytics denominator for free, and — unlike suppression-only — delivers the **near-term** unclog
   (~40–55% of the sampled due backlog vanishes at once; the draft honestly modeled "3 due today" impact).
   Learner-data safety: FSRS history untouched; the only learner-state write is the documented
   `next_due_at` clear every soft-retire performs (HC14).

**Also flagged (separate issue, pre-existing):** any card whose interval exceeds 30 days flickers out of
`isCapabilityMastered` between reviews — the recency term will eventually misreport mature #3/#6 cards
regardless of this design.
