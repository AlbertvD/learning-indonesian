---
status: shipped
merged_at: 2026-07-09
implementation_paths:
  - src/lib/capabilities/vocabModeSet.ts
  - scripts/lib/pipeline/capability-stage/projectors/vocab.ts
  - scripts/unretire-vocab-mode.ts
  - src/lib/session-builder/graduation.ts
  - src/components/exercises/implementations/MeaningRecallFromAudio.tsx
  - src/lib/capabilities/renderContracts.ts
  - scripts/migration.sql
  - scripts/verify-lessons-overview-rls.ts
implementation: PR-A #401, PR-B #403, PR-C #404
reviewed_by:
  - staff-engineer (2026-07-09 — PASS after corrections; confirmed the #3′∨#6 OR trigger, PR sequencing, gist split, MeaningRecall-grading replication; carried the §2.5 OR-parity requirement)
  - architect (2026-07-09 — PASS after corrections; new-ExerciseType gate enumeration incl. the NOT-tsc-caught needsPrimaryMeaning set, resolver pin test, ADR 0027 body edits, three module specs)
  - data-architect (2026-07-09 — PASS after corrections; capabilityCatalog #2 block + exact-match guard, step-1 single UPDATE, practiced-count note; ratified next_due_at=now() restore)
amends: docs/adr/0027-vocabulary-mode-set-bounded.md
relates_to: docs/plans/2026-07-08-vocab-mode-set-reduction-and-graduation.md (shipped)
---

# Vocab four-card ladder — MCQ scaffolds per direction, uncued typed cards forever

Owner-decided 2026-07-09 after the mode-set reduction shipped (ADR 0027, PRs #397–#400) and a design
dialogue on uncued retrieval. **Decision: ship the 4-card model now; empirical checkpoint ~2026-07-23;
pre-agreed reversal = re-retire #2 if acquisition proves too heavy** (owner explicitly chose this over the
3-card ship-then-add-#2-on-evidence variant; both directions are one flag-flip apart).

## 1. The model

| | learn (MCQ, graduates) | know (typed recall, uncued, forever) |
|---|---|---|
| **comprehension** | #1 `recognise_meaning_from_text_cap` — see *besar* (+ audio autoplay) → pick "groot" | **#3′** `recognise_meaning_from_audio_cap` — hear *besar* ONLY → **type** `groot` |
| **production** | #2 `recognise_form_from_meaning_cap` — see "groot" → pick *besar* | #6 `produce_form_from_meaning_cap` — see "groot" → **type** *besar* |

- Each direction starts with multiple choice and ends typed; options fall away per lane.
- Graduation: **#1 retires when EITHER typed card (#3′ OR #6) has mastery strength; #2 retires when #6
  has mastery strength** (`hasMasteryStrength`, recency-free — same predicate/machinery as shipped).
  The OR on #1 is load-bearing (staff-engineer, 2026-07-09): listening-disabled users have #3′ stripped
  from the snapshot (`listeningFilter`), so a lane-pure #3′-only trigger would leave #1 — a cued MCQ —
  as their lifelong card, contradicting the model's thesis. With the OR, their #1 graduates via #6 and
  their set is {#1, #2 scaffolds} → {#6} forever.
- Acquisition = 4 cards/word (vs live 3: ~+33% intro load — the accepted cost); at rest = 2 uncued cards.
  Maintenance ceiling unchanged (~10–13/day at corpus maturity) — convergence intact.

**Why (pedagogy, from the dialogue + brief §3):** every lifelong card must be uncued (MCQ is guessable —
options cue retrieval); listening must be guarded by an audio-ONLY card (text present → eyes answer,
ear untested; subtitle effect); #4/#5 stay retired (see besar→type groot duplicates the link #6 maintains,
in the weaker direction; dictation ≈ #3′+#6). #1 is the dual-cue gentlest first exposure
(RecognitionMCQ.tsx:87 autoplays audio) and stays the prereq root.

## 2. Changes (all seams verified in the 2026-07-08 spec; only deltas listed)

### 2.1 Mode-set + projector (content)
- `src/lib/capabilities/vocabModeSet.ts`: `KEPT_VOCAB_CAP_TYPES` = {#1, #2, #3, #6};
  `DROPPED_VOCAB_CAP_TYPES` = {#4, #5}. HC42/HC43 + projector invariant guard follow automatically —
  true only because the constant edit and the projector's #2 re-emit are the SAME commit (the vocab.ts
  `:244-249` guard makes them atomic-or-throw; architect note).
- **ADR 0027 body amendment (architect C3 — not just the frontmatter pointer):** title/Decision
  "3 introduced modes" → 4; move #2 out of the DROPPED list (`0027:57-61`) into kept WITH the new
  rationale (production MCQ on-ramp per direction, graduates at #6 strength — owner decision 2026-07-09
  with 2-week checkpoint; supersedes the Karpicke "inert" argument FOR THE ACQUISITION PHASE only);
  refresh the maintenance-ceiling math (`0027:111-117` — at-rest unchanged, acquisition 4);
  fix the now-false "no code removal in RENDER_CONTRACTS" consequence (`0027:186-188` — there is now a
  split + a new ExerciseType).
- `projectors/vocab.ts`: emit #2 again (prereq `[#1 key]`, as it was). **#6's prereq stays `[#1 key]`** —
  do NOT rewrite back to #2: the staging gate (stable same-ref sibling for phase ≥3) plus
  `prioritizeCandidates`' within-word phase order (#1 P1 → #3′ P2 → #2 P3 → #6 P4) already sequences
  #2-before-#6, and this avoids a second 2,359-row content UPDATE.
- **`capabilityCatalog.ts` mirror (data-architect MAJOR — under-specified before):** its per-item loop has
  NO #2 code path today, and its guard (`:103-112`) is subset-only (throws on extra types, never on
  missing ones) — unlike the live projector's exact-match guard, it will NOT force the builder to add #2.
  Required, same PR: (a) add the `recognise_form_from_meaning_cap` block to the loop (direction `l1_to_id`,
  modality `text`, prereq `[#1 key]`, matching vocab.ts); (b) strengthen the guard to exact-match by
  copying `vocab.ts:244-249` verbatim.
- `capabilityPhase(recognise_meaning_from_audio_cap)`: 1 → **2** (it is now receptive *recall*; matches
  the retired `recall_meaning_from_text_cap` precedent and yields the clean within-word intro ladder
  above). Phase 1/2 both pass the staging gate — no unlock behaviour change.

### 2.2 Un-retire #2 — one-off gated script (`scripts/unretire-vocab-mode.ts`)
Same operational shape as `retire-dropped-vocab-modes.ts` (dry-run default / `--apply` owner-gated /
**`.order('id')` on any paginated fetch** — the PR #400 lesson), but do NOT over-replicate its machinery
(data-architect m1): step 1 is a single two-predicate filtered UPDATE (`source_kind` + `capability_type`)
— one round trip, no id-fetch-then-chunk loop. Reserve id-chunking for step 2 only (the
`learner_capability_state` update genuinely needs a capability-id list).
1. `retired_at = NULL` for all `vocabulary_src` / `recognise_form_from_meaning_cap` rows.
2. Reanimation fix (shipped spec §6 quirk): for those caps' `learner_capability_state` rows with
   `review_count > 0 AND next_due_at IS NULL`, set `next_due_at = now()` (soft-retire cleared it; without
   this the ~145 previously-practiced #2 cards would never come due again). All-at-once due is acceptable
   (staff-engineer): N≈145, single-user-scale, capped by the session-size cut, and the §2.4 rule
   immediately due-suppresses any reanimated #2 whose #6 already has strength. No stagger needed.
Live-run gate: same as before — backup checkpoint, dry-run report, `--apply` by owner/main thread,
`make check-supabase-deep` after.
Gap-word note (architect): a word first seeded AFTER the #2 retirement (PRs #397–#400) and BEFORE this
un-retire has no #2 row at all; the script only flips existing rows — such words get their #2 on the next
re-publish via the projector re-emit. Likely an empty set today; the dry-run report should print the count
of #6-words lacking any #2 row so it's visible.

### 2.3 #3 exercise conversion (in place — no new capability type, no seeding)
`recognise_meaning_from_audio_cap` renders as **ear-only typed meaning recall**: compose the existing
audio-prompt shell (`Dictation.tsx`) with the existing typed-Dutch grading — **replicate `MeaningRecall`'s
grading exactly as it works today** (its `langMeanings` accepted-answer path, `MeaningRecall.tsx:27-31` —
NOT a hand-rolled `translation_nl` + variants lookup; staff-engineer correction, the builder must copy the
live seam, not this spec's paraphrase). Render-contract update + implementation + registry + labels;
**no text of the Indonesian word anywhere in the prompt**.
**Render-contract split (staff-engineer correction):** `recognise_meaning_from_audio_cap` currently
SHARES its contract row with `recognise_gist_from_audio_cap` (`renderContracts.ts:118`). The conversion
must split that entry — gist (podcast) keeps its MCQ contract; only the vocab meaning-from-audio type
moves to typed. A shared-row edit would silently break the podcast gist card.

**The split forces a NEW `ExerciseType` (architect C1 — all compile-forced gates land in ONE commit,
`tsc -b` is the gate; OpenBrain lesson 44223b06):**
- `ExerciseType` union — `src/types/learning.ts:115`
- `RENDER_CONTRACTS` total map — `renderContracts.ts:185`
- `ContractInputShapes` — `renderContracts.ts:466` + `:484`
- `projectBuilderInput` never-default — `renderContracts.ts:659` + `:704` (real item case: `learningItem`
  + `primaryMeaning` non-null, mirror the `type_meaning_ex` narrowing at `:697-699`)
- byType `BUILDERS` map + new packager — `src/lib/exercise-content/byType/index.ts:31-49` (+ new
  `byType/*.ts`); the packager MUST populate `audibleTexts` via `audibleTextFieldsOf` or the card
  preloads no audio
- `exerciseSkeletonVariant` (`'audio'`) — `registry.ts:82`
- `feedbackPropsFor` no-default switch — `feedbackMapping.ts:47` (real audio→L1-typed case, mirror
  `choose_meaning_from_audio_ex` at `:136-149` with `role:'typed'`)
- `exerciseRegistry` — `registry.ts:58`
- ⚠️ **`needsPrimaryMeaning` set — `renderContracts.ts:573-575` — NOT tsc-caught** (architect round 2):
  `primaryMeaning!` compiles whether or not the type is in this set. Omitting it means the
  `no_meaning_in_lang` fail-loud guard (`:585-592`) never fires for the new type, and a vocab word
  lacking an NL meaning silently renders an ungradeable lifelong audio card (empty accepted-answer set →
  every typed answer marked wrong). Mirror `type_meaning_ex`'s membership.

**Resolver assertion (architect C2):** post-split, `exerciseTypesForCapability('recognise_meaning_from_audio_cap')`
(`exerciseResolver.ts:38` first-compatible) must return ONLY the new typed type — the old
`choose_meaning_from_audio_ex` row drops this cap while gist keeps it; add a unit test pinning this.
FSRS state preserved (same canonical keys). Named transitional cost: matured listening cards will lapse
more as MCQ-earned stability meets the typed format — transient, truthful correction.
Naming drift accepted: type says "recognise", exercise is recall — add to the gated capability-naming
rename backlog (`project_capability_naming_rename_phaseA`), do NOT rename now.

### 2.4 Graduation map (`src/lib/session-builder/graduation.ts`)
Generalize the shipped single rule to `{#1 ← (#3′ ∨ #6), #2 ← #6}` (scaffold suppressed from due when a
qualifying typed successor has `hasMasteryStrength`; the OR per §1). Same composition point, same
fail-safes; tests extended (both lanes, lapse reversal per lane, listening-disabled user gets #1 ← #6).
Update the function's own doc comment (`graduation.ts:9-12` still says "3 introduced capabilities …
2 lifelong") in the same change (architect note).
**Sequencing constraint (staff-engineer):** the #1-trigger change ships in/with **PR-B**, not PR-A —
repointing #1 at #3′ while #3′ is still the old MCQ would graduate #1 on MCQ-earned strength, then
flicker when PR-B hardens the format. PR-A adds only the format-independent `#2 ← #6` rule (shipped
`#1 ← #6` stays as-is until PR-B).

### 2.5 Analytics (migration.sql — full gate chain + both sign-offs, as Slice 3)
`get_lessons_overview` mastered-numerator subsumption pairs become `(#1 ← #3′ ∨ #6)` and `(#2 ← #6)`
(extending the shipped `(#1 ← #6)`), same lesson-scoped CTE join shape. Ships in **PR-C, after PR-B**
(same sequencing logic as §2.4). Post-`--apply`, `practiced_capability_count` also jumps (previously-reviewed
#2 rows re-enter the same CTE — expected, not a bug; data-architect m2, note for the checkpoint review).
The function's `RETURNS TABLE` shape is UNCHANGED (numerator logic only),
so in-place `CREATE OR REPLACE` via the existing drop+create idiom is safe — no CASCADE. Gates: `make
migrate-idempotent-check` → `make migrate` → `make pre-deploy`, parity-test extension, AND
`make verify-lessons-overview-rls` updated to exercise **each new correlated sibling read** (#3′∨#6 for #1,
#6 for #2) under the authenticated role — the SECURITY-INVOKER silent-empty class applies per new read,
a re-run of the old scenario is not sufficient (architect warning). Parity test + the live
authenticated-role RLS verify (`make verify-lessons-overview-rls`) updated/re-run. Stability-scaled
recency window: unchanged. Denominator effect of #2's return: +1 card/word (mastery % dips until #2s are
learned/graduated — named, accepted).

### 2.6 Listening-disabled users
`listeningFilter` strips audio modality → their acquisition set = {#1, #2, #6}; both scaffolds graduate
via #6 (the §1 OR), so forever = {#6}. No listeningFilter change needed — the OR in §2.4 carries it.

## 3. Review checkpoint (~2026-07-23)
Metrics: new-word introduction throughput (words/week), first-attempt #6 accuracy (grader now fair),
#3′ lapse spike decay, owner's subjective load. Pre-agreed lever: **re-retire #2** (script from PR #398,
one flag) if the frontier is too slow; the rest of the model stands on its own.

## 4. Supabase Requirements
- **Schema:** N/A (`capability_type` is bare text — no CHECK; no new tables/columns).
- **RLS / grants / homelab-configs:** N/A.
- **Health checks:** HC42/43 follow the shared constant (no live #4/#5; #6 prereq shape unchanged);
  parity + RLS verify updates per §2.5.

## 5. Slices (Sonnet builds, in order)
- **PR-A** — mode-set constant + projector + catalog + phase change + un-retire script + the `#2 ← #6`
  graduation rule ONLY (shipped `#1 ← #6` untouched) + tests + module specs (capability-stage-vocabulary,
  session-builder) + ADR 0027 amendment.
- **PR-B** — #3′ exercise conversion (render-contract SPLIT from gist + the full new-ExerciseType gate
  list per §2.3, implementation, registry, labels, tests) + the `#1 ← (#3′ ∨ #6)` graduation repoint
  (§2.4 sequencing) + **all three** exercise-framework module specs (architect C4):
  `docs/current-system/modules/exercises.md`, `exercise-content.md`, `capabilities.md`.
- **PR-C** — analytics SQL + parity + RLS verify (migrate gates main-thread).
- Owner-gated: `unretire-vocab-mode.ts --apply` after PR-A merges.
