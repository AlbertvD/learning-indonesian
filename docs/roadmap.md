# Product Roadmap

> **Status:** living document — the single source of truth for forward product direction.
> **Last updated:** 2026-06-30
> **Companion:** strategic context in `memory/project_monetization_direction.md`. Build-stage operating rules in `CLAUDE.md` (Operating Context).

## North star

Build out the **core learning features** fully **before** monetizing. Then add the monetization layer (it's additive). Two environments at that point: the **homelab stays** the author's personal/dev instance (disposable-data regime persists); a **new cloud instance** serves paying customers (precious-data, live-safety regime). Content flows homelab→cloud by **re-publishing from git staging**, never by data migration; learner data never crosses.

**Product thesis (research-backed):** comprehensible *input* + spaced repetition beats drilling. We already have the SRS (FSRS) and one input channel (podcasts); the roadmap deepens input (reading) and the Indonesian-specific differentiator (affixes).

---

## Status snapshot (2026-06-30)

**Phase-1 pedagogic *functionality* is essentially complete.** Shipped: collections + top-1000 vocab + themepacks (§A), the Lezen graded-reading reader incl. morphological glossing + vocab→FSRS harvest (§B.5), the story-podcast pipeline with 8 leveled A1–B2 episodes live (§B.4), the morphology/affix-trainer moat (§D), two-axis analytics (§E.7) + goal widget (§E.8), and — reframed out of "Deferred" — **pronunciation** (primer + perception drills + shadowing + 2 L1 podcasts, ADR 0025, no ASR/server).

**The last open pedagogic *feature* — grammar exposure (§C) — SHIPPED** as the grammar due-floor (Part A, PR #375, deployed 2026-07-06; spec `docs/plans/2026-07-05-grammar-exposure-session-quota-design.md`). Part B (new-grammar introduction reserve) is deferred under review saturation. **The core pedagogic build is now done.** Everything else outstanding is **content authoring** (more reading stories #304, more/better story episodes #294/#298 — never "done") or **optional pipeline polish** (story-podcast Gemini-TTS bake-off #295–#297). The project is at the **content + Phase-2 monetization** stage.

---

## Phase 1 — Core learning (build before ship)

### Priority order
1. **Top-1000 vocabulary** is the declared first target — the coverage inflection point (~78–86% text coverage for ~365 authored words; the 1000→2000 tail is ~600 words for only ~+6%, so it's deferred).
2. **Collections** is the keystone build — it unblocks bands, thematic packs, and the monetization paywall seam.
3. First gate before authoring: **choose the source word-list/corpus** (PBWL — lemma-aware, CEFR-leveled — recommended over OpenSubtitles). It determines *which* ~1000 words and *which* ~365 to author.

### Execution sequence (set 2026-06-14)
1. **Finish ALL vocab first**, in this order:
   - **(a) Lesson-internal gaps** — the ~98 words the coursebook teaches in *grammar/reference tables* but the harvest never captured (it only reads vocabulary/expressions/numbers sections). Full per-lesson list + glosses in `docs/audits/2026-06-14-grammar-table-vocab-inventory.md`; root cause in `docs/plans/2026-06-14-grammar-table-vocab-harvest.md`. Includes the **chapter-15 re-ingest** (2 unphotographed pages, now captured).
   - **(b) Frequency bands** — author + seed **top-100 → 300 → 500 → 1000** (the original gap-closure program).
2. **THEN revisit grammar & morphology depth** — only after vocab is complete: **§C grammar-pattern deepening** (exposure + variety) and **§D morphology / affix trainer** (the moat, its own topic). The findings justify dedicated tracks; do **not** interleave them with the vocab work.

### A. Content & selection
- **1. Collections feature** 🔑 *keystone* — one unified `collections` / `collection_items` model (build once). Carries **top-X frequency bands** and **thematic packs**. Frequency-band membership is a **generated projection** of `learning_items.frequency_rank ≤ cutoff`; thematic membership is **authored** rows in the same table. Per-user selection via `learner_collection_activation` (mirrors `learner_lesson_activation`). Eligibility gate gains one clause: *lesson activated OR word in an activated collection*. Gap-words (not in any lesson) get a synthetic "Common Words" home-lesson to satisfy the ADR 0006 invariant. **Monetization-ready by design** (collections = SKUs).
- **2. Vocabulary gap-closure** — two distinct sources, do **(a) before (b)**:
  - **(a) Lesson-internal gaps (~98 words) — the cheap, high-value half.** The coursebook already *teaches* these (pronouns dia/ia/anda/kalian, place words, question words, antonyms, the time/calendar system, complex conjunctions, compass directions…) in grammar/reference tables, but they were never harvested into `learning_items`. Glosses already exist in the source tables. Fix = add each to its lesson's **vocabulary section** + republish. Per-lesson inventory: `docs/audits/2026-06-14-grammar-table-vocab-inventory.md`. *Also surfaced a **source-capture gap** (ch15 under-photographed) — distinct, now resolved at source.*
  - **(b) Frequency bands (~365 for top-1000).** Author the missing high-frequency words. A phased *program*: **top-100 → 300 → 500 → 1000** (top-500 ≈ 113, top-1000 ≈ 365, top-2000 ≈ 969 cumulative). Uses the vocab pipeline + gap-word ingestion (resolve-or-create on `normalized_text`, the lesson pipeline's normalization key, so *baca/membaca* don't duplicate).
- **3. Thematic packs** (holiday, food, …) — small, bounded, authored decks; the better *early* monetization unit. Word-lists sourced by editorial curation **or** harvested from input transcripts (see #4/#5).

### B. Comprehensible input (the product thesis)
- **4. Podcast listening experience** — **✅ pipeline + 8 leveled A1–B2 story episodes SHIPPED (ADR 0022, `story-podcast-pipeline` module).** Remaining = *content* (#294/#298 more & better episodes) + optional TTS bake-off polish (#295–#297) + the transcript→vocab harvest "PLUS" (still deferred). Original scope: browse / play / try to understand spoken Indonesian. **Listening only — NOT wired into capabilities/FSRS.** The listen pages, `podcasts` table, bucket, and service already exist; remaining work is content + comprehension aids (transcript / NL translation / playback speed). **PLUS:** podcast transcripts are a **vocab source** — break a transcript into core vocab → normal vocab `learning_items` → normal vocab **capabilities** (recognition/recall/cloze — *practiced* like any vocab) → grouped into a theme deck. The only new sub-step is transcript→core-vocab **extraction** (LLM-assisted + review). *Cleanup:* the unused podcast-*capability* scaffolding (`podcast-stage`, `podcast_segment/phrase/gist` types) is dead — keep suppressed or remove.
- **5. Graded reading / comprehensible-input texts** — the **reading twin of podcasts**. Short leveled passages (A1→B1, reuse CEFR), tap-to-gloss, with core vocab harvested into capabilities + a theme deck (same loop as #4). Highest evidence base of any new idea; no per-use AI cost (LLM only at authoring time); reuses the content pipeline + collections.
  - **✅ PHASE 1 SHIPPED 2026-06-28** (PR/issue #299): the "Lezen" mode — silent, per-learner-coverage-ordered, tap-to-gloss reader over the existing story transcripts, schema-free except a read-only coverage RPC. Design + gate trail in `docs/research/2026-06-28-graded-reading-reader-evidence.md`. **Phase 2** (its own spec): vocab→FSRS harvest, **morphological glossing** (tap → base word + affix + word family + Affix Trainer link — the reader × morphology-moat cross, see §6), new/longer authored content + `texts`/`reading_texts` storage, bundled dictionary, optional read-along player.
  - **✅ PHASE 2 SHIPPED (2026-06-28→30), slices 1–3:** texts entity (#305), morphological glossing (#306), vocab→FSRS harvest (#309/#310). The reader *feature* is built. **Remaining = #304 (author new read-only content) — content, not functionality** (+ an optional read-along player).
  - **We already have a starting corpus** — the existing lesson content is Indonesian text at known CEFR levels with NL/EN translations: lesson **dialogues** (`lesson_dialogue_lines`) and whatever **reading/narrative sections** the lessons carry. Plus simple-story material was already **sourced** for the podcast track (the Wikibooks *dongeng*/folktale candidates in OpenBrain notes) — those double as graded-reading source. So #5 starts well below zero-content.
  - **Two sub-cases:** (a) *existing lesson text* → re-present as a reader with the glossing/translation you already have; its vocab is already captured as capabilities (no harvest needed). (b) *new reading content* (folktales, authored passages) → the harvest-to-vocab-theme loop applies, exactly like podcasts. → The real work is the **reader/glossing UX + leveling/curation**, not authoring a corpus from scratch.

### C. Grammar-pattern depth (post-vocab track)
> **Status 2026-07-06 (updated):** all three problems are SHIPPED (exposure = Part A; Part B deferred).
> **(ii) variety ✅** — 169 patterns now carry 3–5 exercises/type (constrained_translation ~5.0, sentence_transformation ~4.0, contrast_pair ~3.1, cloze_mcq ~3.0). **wiring ✅** — grammar moved off generic `exercise_variants` onto typed per-pattern tables, so the old `grammar_pattern_id = NULL` bug class is gone.
> **(i) exposure ✅ Part A SHIPPED (PR #375, deployed 2026-07-06)** — the session builder now enforces a grammar **due-floor**: a guaranteed minimum share of due-card slots (floor % is a single tunable constant in `src/lib/session-builder/`, no schema change). Spec: **`docs/plans/2026-07-05-grammar-exposure-session-quota-design.md`** (`shipped`); the older `2026-06-30-grammar-exposure.md` is superseded. **Part B (new-grammar introduction reserve) is DEFERRED** — inert under review saturation (`openSlots ≈ 0`); it unblocks once the frozen frontier / backlog clears (separate thread).

- **Grammar-pattern deepening — deepen, don't rebuild.** 262 schedulable `pattern` caps render as 4 exercise types (constrained_translation / sentence_transformation / cloze_mcq / contrast_pair). Two real problems: **(i) exposure** — grammar is only **~4% of schedulable caps** (drowned ~24:1 by vocab; adding §A vocab worsens it) → a **grammar practice mode** or planner re-weighting; **(ii) variety** — only **~1 exercise per type per pattern**, so the learner memorises the sentence not the rule → generate **3–5 varied variants per type**. Also: **all grammar `exercise_variants` have `grammar_pattern_id = NULL`** — trace whether that's a generation gap or a variant→pattern wiring bug.

### D. Morphology — the affix trainer (THE MOAT · the Indonesian differentiator)
> **✅ SHIPPED (2026-06).** Built out since the 2026-06-14 "essentially unbuilt" note below: the `lib/morphology/` module + Affix Trainer surface, the deterministic derivation/decomposition engine (ADRs 0018–0021), form-regularity exercise routing, bilingual derived-form glosses, and the "Morfologie" Voortgang axis. **837 `word_form_pair_src` caps live** (6.0% of the pool). Residual = **content rollout** (more affix pairs L9–16 + book-2) to fill empty Affix-Trainer tiles — *content, not functionality*.
> _(historical)_ Its **own** topic, not folded into grammar — distinct skill (word-*building* via affixes vs word-*combining*), distinct capability family (`affixed_form_pair`), distinct Voortgang axis, and the headline differentiator. Evidence (2026-06-14): essentially **unbuilt** — only **4 `affixed_form_pair` caps** (lesson 9, 2 verbs: baca, tulis); `allomorph_rules`/`morphology_patterns` tables **don't exist**; **0 ever practiced**. Post-vocab track.

- **6. Affix / morphology trainer.** Affixes (meN-/ber-/peN-, k/s/t/p elision, -kan/-i, ke-…-an) are *the* hardest part of Indonesian and where generic apps fail. The ME-/DI-/ber- content *is* in L11/13/14/16, but the morphology projector reads a hand-authored `morphology-patterns.ts` that exists **only for L9** — so it never generated. **Build = author `morphology-patterns.ts` per affix lesson** (from the tables already in those lessons) → the existing projector + `root_derived_recognition/recall` types mint the caps. **No new capability types needed** — richer drills (build-the-word, find-the-root) are exercise *variants*; a new `allomorph_selection` type only if the sound-change schema needs it. **Own "Morfologie" Voortgang axis**: split `funnelBucket` 2-way → 3-way (vocab / grammar / morphology), drop `affixed_form_pair` from `GRAMMAR_SOURCE_KINDS` (`masteryModel.ts:388,400`), parity-tested. **Own module** `lib/morphology/` + Study-tab surface: word-family explorer, build-the-word / find-the-root drills, affix-rule mini-lessons. Deterministic (no AI cost).

### E. Insight
- **7. Analytics expansion (A + B)** —
  - **Learner-facing** (self-insight: their journey + where to improve) — extends the *already-shipped* two-axis Voortgang read-model. Pure phase 1.
  - **Admin-facing** (cross-learner monitoring so the author can see how to improve the app) — a **new surface**: current learner tables are owner-only RLS, so admin cross-user reads + aggregation are new work. ⚠️ Only meaningful with multiple learners → sits at the **phase 1 / phase 2 boundary** (build in 1, pays off with customers in 2).
- **8. Study-plan / progress-to-goal surfacing** — "you're 720/1000 toward your Top-1000 goal, ~N weeks at your pace." Turns FSRS + collection data into motivation. Cheap; pairs with the bands.

### Minor / later
- Temporal analytics sparklines & trends (weekly movement already shipped).
- Daily/weekly goals. PWA reminders/notifications. Step-CA cert lesson; PWA auto-update hardening.

---

## Deferred — NOT in phase 1

- **✅ Speaking / pronunciation — SHIPPED 2026-06-30 (reframed, ADR 0025), NOT as the ASR grader below.** Pulled forward and built as a **pronunciation primer + perception minimal-pairs + shadowing (client-only record/A-B compare) + 2 L1-specific podcasts** — *no ASR, no FSRS, no server-side compute*. The grill concluded an ASR grader is the wrong call for phonetic Indonesian (it would false-reject intelligible speech for near-zero gain). The original deferred analysis is kept below for context:
  - **Speaking / pronunciation** — the only feature that breaks the zero-marginal-cost, frontend-only model: real feedback needs **server-side ASR** (per-use COGS + the first backend; can't expose keys client-side). For Indonesian, only **intelligibility grading** (ASR transcription-match via Google STT `id-ID` / Whisper — Indonesian is phonetic, no tones, so this works) is realistic; **phoneme-level accent scoring** (Azure/Speechace) is English-centric and ~unavailable for Indonesian. → **Monetization-era premium SKU** (the per-use cost justifies charging). Zero-cost stopgaps if ever wanted earlier: self-assessed shadowing, or browser Web Speech API.
- **AI conversation chatbot** — same AI-cost/backend profile → premium, later.
- **Community native-speaker feedback** — needs a community + moderation; heavy ops for a solo build.
- **AR/VR; leaderboards** — off-strategy (leaderboards were deliberately decommissioned).

---

## Phase 2 — Monetization (only after Phase 1 is complete)

- **Entitlements** — gate *activation* by subscription state inside the existing `SECURITY DEFINER` activation RPCs (`set_lesson_activation`, `set_collection_activation`). Collections are the SKUs. Never enforce a paywall client-side.
- **Billing** — Stripe subscriptions + webhooks + customer portal; a `subscriptions`/`entitlements` table the activation RPCs read.
- **Standalone auth** — migrate off the shared family-hub `.duin.home` cookie SSO to public auth (email + OAuth).
- **Cloud instance** — self-hosted Supabase → Supabase Cloud (low-rewrite path); backups/PITR, monitoring. Homelab remains personal/dev.
- **Premium-tier candidates** (need AI/backend or customers): speaking/ASR, AI conversation, admin analytics.

### Scaling notes (worked out 2026-06-13)
Comfortable to ~10k learners as-is (with the named indexes); ops-tuning zone 10k–100k (PgBouncer, partition the event log, server-side RPCs); structural change (API tier + partitioning + caching) approaching 100k–1M. The binding constraint is the single-Postgres / frontend-direct **deployment**, not the capability schema or collections design.

---

## Already shipped (do NOT re-add as future work)
Two-axis learner-progress analytics (#213/#215/#218), Vaardigheden skill-mode (48950fc), two-source lesson status (458c017, `overviewStatus.ts` retired), weekly movement, streak, study tips, at-risk/moeilijk, listening-toggle session filter (PR #244), CEFR rubric (#198/#199), FSRS short-term + sibling-bury fixes (#184/#185).

**Added 2026-06-30 reconciliation:** Collections + top-1000 vocab bands + 7 themepacks (§A, #245–#247), Lezen graded-reading reader Phase 1 + Phase-2 slices 1–3 (§B.5, #299/#305/#306/#309/#310), story-podcast pipeline + 8 A1–B2 episodes (§B.4, ADR 0022), morphology/affix-trainer moat (§D, ADRs 0018–0021), grammar **variety + wiring** (§C — typed per-pattern exercise tables, 3–5/type; ADR 0010/0017), **pronunciation** primer + perception + shadowing + 2 L1 podcasts (ADR 0025, #316/#317/#318), grammar-podcast EN audio (#319). Stale issues closed 2026-06-30: #301, #303, #208–#211, #167.
