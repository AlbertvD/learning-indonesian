---
status: superseded
superseded_by: docs/plans/2026-07-08-vocab-mode-set-reduction-and-graduation.md
---

> **SUPERSEDED 2026-07-08** by `2026-07-08-vocab-mode-set-reduction-and-graduation.md` after the fresh-context
> review (brief §8): the trigger's reuse of `isCapabilityMastered` oscillates at intervals > 30d (recency term);
> the "analytics unaffected" claim is wrong (`get_lessons_overview` numerator recency + denominator); and the
> 4-rule map collapses to one rule once the mode-set reduction retires #2/#4/#5 as content via `retired_at`.
> Kept for the pedagogical foundation (§Pedagogical foundation), which the successor spec cites.

# Vocabulary mode graduation — retire subsumed retrieval modes after mastery

## Problem

Every vocabulary word is generated as **6 independent FSRS capabilities** ("modes"), arranged as a prerequisite ladder from easy receptive recognition to hard productive recall (verified live 2026-07-08, `indonesian.learning_capabilities`, 2,359 words × 6 = 14,154 vocab caps):

| # | capability_type | direction | modality | role |
|---|---|---|---|---|
| 1 | `recognise_meaning_from_text_cap` | id→l1 | text | receptive recognition (MCQ) — ladder ROOT (no prereq) |
| 2 | `recognise_form_from_meaning_cap` | l1→id | text | productive recognition (MCQ) |
| 3 | `recognise_meaning_from_audio_cap` | audio→l1 | **audio** | **aural** recognition (listening) |
| 4 | `recall_meaning_from_text_cap` | id→l1 | text | receptive recall (typed) |
| 5 | `produce_form_from_audio_cap` | audio→id | audio | dictation (typed) |
| 6 | `produce_form_from_meaning_cap` | l1→id | text | **productive recall (typed) — the frontier** |

Once introduced, **all 6 become lifelong review cards**. A mastered word therefore carries 6 cards in perpetual FSRS rotation. This inflates two things by ~6×: (a) the daily **review load**, and (b) each lesson's **introduction queue** (lesson 1 alone = ~396 vocab caps). Combined with a 25-card session, the review backlog structurally exceeds session size (`openSlots = max(0, size − dueCount) = 0`), so new material stops being introduced (the "frozen frontier" — see `docs/plans/2026-07-05-grammar-exposure-session-quota-design.md` and the live diagnosis in `memory/project_grammar_exposure_session_quota.md`).

**This spec proposes retiring the *subsumed* modes from ongoing review once a word is mastered on the modes that subsume them, dropping a mastered word from 6 lifelong cards to ~2 (the productive frontier + one aural).** It is a scheduling change only — no new content, no schema, no learner-data writes.

## Pedagogical foundation

The design is grounded in the vocabulary-acquisition and retrieval-practice literature (research pass 2026-07-08):

1. **Productive knowledge subsumes receptive.** Receptive and productive vocabulary knowledge sit on a single developmental continuum; productive mastery presupposes the receptive form-meaning link (Melka 1997, in Schmitt & McCarthy; Nation 2001, *learning burden*). If a learner can retrieve and spell the Indonesian form from the Dutch cue (#6), the receptive links (#1, #2) are logically entailed.

2. **Recall subsumes recognition; the transfer is *upward*.** Recall practice improves later recognition, but recognition practice does little for later recall (relational-processing account; Rowland et al.). Karpicke & Roediger (2008, *Science*) is decisive: once an item has been recalled, **repeated *study* adds essentially nothing** to delayed retention, while repeated *testing* drives it — and continued recognition drilling after recall is solid approximates that inert "repeated study" condition.

3. **Retire at criterion; concentrate on the frontier.** *Successive relearning* (Rawson & Dunlosky 2018, 2022) directly warrants dropping a sub-skill once a mastery criterion is met (commonly ~3 successful spaced recalls) and spending the freed effort on the frontier skill, with strongly diminishing returns per extra correct retrieval. A high-stability / long-interval FSRS card *is* an item that has passed successive relearning (cf. SuperMemo/Anki "mature" ≈ interval > 21d).

4. **Two guardrails from the counter-evidence.**
   - **Aural recognition is a *distinct construct*** — phonological and orthographic vocabulary knowledge load on different factors (correlate ~.68) and aural knowledge is the strongest predictor of listening comprehension (Milton & Hopkins 2006; Uchihara et al. 2025). Productive *typing* never trains it. → **Never retire the aural mode.**
   - **Recall subsumes recognition *knowledge* but not recognition *speed/automaticity*** (transfer-appropriate processing; Morris/Bransford; Barenberg & Roelle 2021). → Set the retirement bar at genuine mastery, not first success, so recognition fluency is well-established before its card retires.

5. **Lapses relearn fast (savings).** Forgotten items relearn far faster than first learning (Ebbinghaus; Nelson 1978), so a lapse does not require rebuilding the full ladder — a brief scaffold reactivation suffices, and the *productive* skill is what must be re-criterioned.

## Design

### Retirement map

Two tiers, keyed on the **prerequisite successor** that subsumes each mode. `source_ref` (the word) groups a word's modes; `capabilityPhase()` and the modes' `prerequisite_keys` already encode the ladder.

| Retire this mode | …once this successor is | Rationale |
|---|---|---|
| **#1** `recognise_meaning_from_text` | **#4** `recall_meaning_from_text` is **stable** (rolling) | recall subsumes recognition of meaning |
| **#2** `recognise_form_from_meaning` | **#6** `produce_form_from_meaning` is **stable** (rolling) | production subsumes recognition of form |
| **#4** `recall_meaning_from_text` | **#6** is **mastered** (deep trim) | full productive mastery of the pair |
| **#5** `produce_form_from_audio` | **#6** mastered **and** #3 present | dictation ≈ aural (#3) + spelling (#6) |

**Always maintained (never retired):**
- **#6** `produce_form_from_meaning` — the productive frontier (Karpicke maintenance).
- **#3** `recognise_meaning_from_audio` — the aural construct (Milton & Hopkins).

End state for a fully-mastered word: **2 cards (#6 + #3)** instead of 6.

### Trigger thresholds (tunable)

- **Rolling (tier 1 — retire #1, #2):** successor has `consecutiveFailureCount = 0` **and** `stability ≥ GRADUATION_ROLLING_STABILITY_DAYS` **and** `successfulReviewCount ≥ GRADUATION_ROLLING_SUCCESS_COUNT`. Proposed `= 7` days and `= 3` successes — the successive-relearning count criterion intersected with a "past the acquisition hump" interval.
- **Deep (tier 2 — retire #4, #5):** #6 satisfies the app's existing **`isCapabilityMastered`** (`reviewCount ≥ 4 ∧ stability ≥ 14 ∧ recent ∧ consecutiveFailureCount = 0`, `src/lib/analytics/mastery/mastered.ts`). Reusing this predicate keeps a single, already-parity-tested (ADR 0015) definition of mastery — no new threshold to drift.

Both thresholds are single constants; tune from live retention data.

### Where it lands — a build-time due suppression (the mirror of an existing gate)

This is the **exact mirror** of the existing *receptive-before-productive* introduction gate (`pedagogy.ts` §3.3; session-builder spec invariant, `docs/current-system/modules/session-builder.md:362`), which suppresses *productive* modes for introduction until a same-`source_ref` sibling is stable. Graduation suppresses *subsumed* modes for **review** once their successor is mastered.

- New pure helper (e.g. `suppressGraduatedModes(rows, capabilityOf)`) in `src/lib/session-builder/`, composed into the **due pass** (`builder.ts` Step B) and — critically — into the **`dueCount`** computation the adapter derives via `getDueCapabilitiesFromRows` (`adapter.ts` §3.1). Reducing `dueCount` is what lets `openSlots` open, so the long-term shed eventually feeds new-material introduction.
- Reads only the already-loaded snapshot — `capabilitiesByKey` (type / source_ref / prereq) + `schedulerRows` (stability / successfulReviewCount / consecutiveFailureCount) — exactly the inputs `reserveGrammarDueFloor` and the staging gate already use. **No new query, no RPC change, no schema, no learner-data write.**
- **Scope: `vocabulary_src` only.** Grammar / morphology / cloze / podcast families are untouched (they have their own structures).
- Optionally also suppress *introduction* of a subsumed mode when its successor is already mastered (a word that reaches mastery before its recognition rung was ever introduced should never introduce it) — a one-line addition to the intro `gate`.

### Reversibility / lapse handling (free)

Because the rule is a **stateless read-time predicate**, reversibility is automatic: if a successor later fails (`consecutiveFailureCount > 0` → no longer "stable"/"mastered"), the suppression lifts and the retired rungs re-enter the queue on the next build — the scaffold rebuilds itself. Savings (§foundation 5) means they clear quickly; the productive card must re-earn its criterion before the scaffold retires again. No counter to persist or reset.

## Minimum Mechanism check

| Mechanism | Why it earns its keep |
|---|---|
| New pure suppression helper | The only new code; mirrors `reserveGrammarDueFloor`. |
| Reuse `isCapabilityMastered` | One mastery definition, already SQL-parity-tested. Omitting it → a second, drifting threshold. |
| Reuse `capabilityPhase` + `prerequisite_keys` + `source_ref` grouping | Already present; the ladder is already modelled. |
| **No** schema / migration / RPC / stored "retired" state | A stateless predicate gives reversibility for free; a stored state machine on `learner_capability_state` (precious learner data) would add a gated migration and a lapse-reactivation writer for zero added capability. |

## Modeled impact (live, user `7eaacda5`, 2026-07-08)

Honest and important: **graduation is a long-horizon load reducer, not an immediate backlog unclog.**

- **At full mastery** (retire when #6 `isCapabilityMastered`): **0** words qualify today — no lesson-1–2 word has matured the productive frontier yet (avg productive `reviewCount` ≈ 1.5).
- **Rolling** (retire #1 when #4 stable ≥7d; #2 when #6 stable ≥7d): **~184 active cards (~12% of the 1,505 active vocab caps) become retirable**, but only **3 are due *today*** — retirable cards are *stable*, so they weren't due soon anyway.

Interpretation: graduation stops mature cards from *resurfacing* over the coming weeks/months (compounding as more words mature), which is the durable fix for the steady-state 6× load. It will **not** meaningfully shrink *this week's* due backlog, which is dominated by lesson-1–2 words still in acquisition. **The complementary lever for the immediate backlog is reducing modes-per-word at authoring (e.g. 6→3)** — a Capability-Stage change, specced separately. Recommendation: do both — graduation for the durable steady state, authoring trim for the current logjam.

## Risks & edge cases

- **Retiring too early hurts recognition speed** (TAP). Mitigated by the mastery-level bar (not first-success) and by keeping the aural mode.
- **Word with no productive anchor introduced** (ladder never completed): successor absent → predicate is false → nothing retires (fail-safe).
- **Non-vocab families**: out of scope by the `vocabulary_src` guard.
- **Analytics**: retired cards stay `activation_state='active'` (only *review scheduling* is suppressed at build time), so mastery analytics and counts are unaffected.
- **Determinism / parity**: the rule is pure over the snapshot; add it to the `rpcSnapshotParity` reasoning only if `dueCount` ever moves server-side (today it is client-derived, so no SQL mirror is required).

## Supabase Requirements

- **Schema changes:** N/A — reads existing `learning_capabilities` (type, source_ref, prerequisite_keys) + `learner_capability_state` (stability, review counts) columns; no new tables/columns.
- **RLS / grants:** N/A — no new tables or access patterns; the session-build RPC already returns these rows.
- **homelab-configs changes:** N/A — no PostgREST/Kong/GoTrue/Storage change.
- **Health check additions:** a unit test asserting the suppression predicate (and its reversal on lapse); optionally extend the session-builder parity tests if `dueCount` semantics move. No new live health check required (no schema surface).

## Test scenarios

1. Word with #4 stable ≥7d → #1 suppressed from due list **and** excluded from `dueCount`; #3, #6 retained.
2. Word with #6 `isCapabilityMastered` → #1, #2, #4, #5 suppressed; only #3 + #6 remain.
3. Word with #6 *not* yet stable → nothing suppressed (full ladder in rotation).
4. **Lapse:** previously-graduated word whose #6 now has `consecutiveFailureCount > 0` → suppressed rungs reappear on the next build.
5. Non-vocab family (grammar/morphology) → never suppressed.
6. Word missing the productive anchor → fail-safe, no suppression.
7. `dueCount` reduction flows to `openSlots` (integration: a snapshot where graduation drops `dueCount` below `preferredSessionSize` yields `allowNewCapabilities = true`).

## Review plan

Scheduling-logic change touching the session-builder contract and the learner-state read semantics. Per project process: **staff-engineer first** (soundness / is graduation the right lever vs. the authoring trim), then **architect** (placement in `session-builder`, mirror-of-staging-gate seam) and **data-architect** (the state-read predicate + `dueCount`/`openSlots` interaction; confirm no learner-data write is smuggled in). No `data-architect` schema sign-off is required for a migration (there is none), but the state-read semantics warrant its lens.
