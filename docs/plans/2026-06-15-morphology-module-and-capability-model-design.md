---
status: shipped
merged_at: 2026-06-19
reviewed_by: []          # never formally reviewed as one plan — decomposed into the plans/ADRs below
supersedes: []
related:
  - docs/research/2026-06-15-affix-morphology-module-research.md
  - docs/current-system/capability-and-exercise-model.md        # §8 target naming, §7 settled level-purity
  - docs/plans/2026-06-13-app-architecture-foundation.md         # reserves lib/morphology/ + Affix trainer surface
---

# Morphology module + capability-model upgrade — design (draft)

> **⚠️ SHIPPED / DECOMPOSED (2026-06-19) — changelog, not forward work.** This program-level
> design was never executed as one plan; its deliverables were decomposed and shipped:
> the 3-tier model + `affixed_form_pairs` extension (affix_type/affix/circumfix/productive/
> grammar_pattern_id) → **`2026-06-15-morphology-phase-b-implementation-spec.md`** + **ADR 0018**;
> the deterministic derivation engine + authoring → **`2026-06-18-morphology-authoring-capability.md`**;
> generalised derivation incl. reduplication + `decompose_word_ex` → **ADR 0019** +
> **`2026-06-19-l22-reduplication-engine-extension.md`**; the `recognise_allomorph_from_root_cap`
> proposed here was built-then-**retired** (`2026-06-17-morphology-nasalization-cap-model-fix.md`);
> `build_confix_ex` was **cut** (ADR 0019); the grammar produce split → **ADR 0017**; the §8 rename →
> **`2026-06-15-capability-naming-rename-plan.md`** (shipped). **Forward tail that remains:** the
> **Affix Trainer** surface (`2026-06-15-affix-trainer-capstone-design.md`, approved, not built) and
> the **book-2 content rollout** (author morphology-roots per chapter on the now-complete engine).
> The prose below is the original draft — read for rationale, not as a build spec.

> **Resume context (2026-06-15).** Output of a long design dialogue. The goal: ingest the
> **follow-up textbook** (Selamat Datang book 2, the `SD_L*` series) "the same way as previous
> chapters," but FIRST ensure the capability/exercise machinery can teach Indonesian affixation
> *well* — not shoehorn it into generic grammar exercises (the Duolingo-Turkish failure mode the
> research warns of). Not yet reviewed; needs architect + data-architect before `approved`.

## 1. Why this exists

The follow-up book's grammar syllabus is **almost entirely the affix/morphology system** (see §3).
If processed through today's pipeline, affix grammar would render as generic `contrast_pair` /
`cloze_mcq` — pedagogically the wrong way to teach morphology. So the machinery must exist before
ingest. Morphology is "the moat" (`memory/project_grammar_table_vocab_harvest_gap.md`).

## 2. ⚠️ Process gotcha — AUDIT THE LIVE DB, NOT STAGING (cost me 5 wrong claims this session)

**`scripts/data/staging/lesson-*/grammar-patterns.ts` is VESTIGIAL** — the capability stage
generates `grammar_patterns` from `lesson.ts` `content.categories`, NOT from that staging file
(see `memory/project_grammar_categories_key_not_grammar_topics`). I repeatedly audited that dead
file and got it wrong (e.g. L11's staging file is `[]`, but the live DB has **3 live BER- patterns**).
Capability content is **DB-authoritative** (ADR 0011). **To inventory what's actually schedulable,
query the live DB**, not staging.

Query recipe (proven 2026-06-15): `supabase-js` createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY)
`.schema('indonesian')`, **with `NODE_TLS_REJECT_UNAUTHORIZED=0`** (homelab Step-CA self-signed cert —
without it every request fails silently). Tables: `learning_capabilities` (source_kind/capability_type/
retired_at), `grammar_patterns` (slug, introduced_by_lesson_id), `affixed_form_pairs`, `lessons`.
(Secondary gotcha if you ever DO read staging: the files mix `"key":"v"` and `key:'v'` quote styles,
so keyword/regex greps false-negative — but don't read staging for this anyway.)

## 3. The follow-up textbook (book 2) grammar syllabus — source TOC

Photographed TOC (HEIC, Bab 1–14). `tata bahasa` = grammar topics:

| Bab | Grammar topic | Maps to |
|---|---|---|
| 1 | Agens, werkwoord + pronoun (active sentence) | meN- active (already in L13!) |
| 1 | Vraag en antwoord | covered (question words) |
| 2 | Passieve zinsconstructies | di- (already in L16) |
| 2 | Sudah–telah, sesudah–setelah | aspect semantics (shallow gap) |
| 3 | Zinsbouw; Reden/oorzaak/gevolg/doel | covered (word order, conjunctions) |
| 4 | **Voorvoegsel PE- + samenstellingen** | NEW (pe-/peN- agent nouns) |
| 5 | **Werkwoordsvorm met -KAN** | NEW (-kan suffix) |
| 6 | Verdubbelingen | reduplication (partly in L1/L12) |
| 7 | **Werkwoordsvorm met -I** | NEW (-i suffix) |
| 8 | **Verhouding -KAN ↔ -I** | NEW — hardest discrimination in the book |
| 9 | **PE-…-AN vormen** | NEW (confix) |
| 10 | **Voorvoegsel TER-** (verbal) | partial (only paling/ter- superlative in L8) |
| 11 | **KE-…-AN** | NEW (confix; incl. adversative *kehujanan*) |
| 13 | **MEMPER- verb forms; PER-…-AN** | NEW (affix stacking + confix) |
| 14 | Nieuwe ontwikkelingen; (scheldwoorden/liefde = vocab) | register/discourse |

The author sequenced it almost exactly as the research recommended (affixes one at a time, `-kan`
before `-i`, a dedicated `-kan`/`-i` contrast chapter). Strong validation.

## 4. TRUE affix/morphology inventory — from the LIVE DB (2026-06-15, service-key query)

Live capabilities by source_kind: **item 8306 · dialogue_line 103 · pattern 194 · affixed_form_pair 4**.
Affix-relevant cap types: `pattern_contrast` 97, `pattern_recognition` 97, `root_derived_recall` 2,
`root_derived_recognition` 2. **grammar_patterns: 97 live.** **affixed_form_pairs: 4 (= 2 pairs ×
2 directions, all L9 meN-).**

Affix-bearing grammar patterns that are **LIVE** (rule tier), by lesson:

| Lesson | LIVE affix grammar patterns | Tier present |
|---|---|---|
| L6 | `-kah` (clitic → grammar) | rule |
| L8 | `ter-` superlative, `se-` equality, `se-…-nya` | rule |
| L9 | (meN- pairs — see application tier) | **APPLICATION: 2 pairs (the ONLY one)** |
| L10 | `-AN` nominalization | rule |
| **L11** | **BER- ×3** (eigenschappen, plaatsing, basiswoord-vijf-woordklassen) — **LIVE** | rule |
| L12 | `BER-` + reduplication | rule |
| L13 | **meN- ×4** (de-me-vorm + nasalization a1/a2/b) | rule |
| L14 | **meN- ×7** (+ word-classes) + **BER↔ME relation ×3** | rule |
| L15 | meN- decompose (basiswoord terugvinden) | rule |
| L16 | **DI- ×4** (passive, word order, oleh, transitivity) | rule |

**Headline findings (DB-grounded):**
- **meN- and BER- are NOT gaps — they're LIVE.** Earlier in-session claims ("meN- is the biggest
  grammar gap"; "L11 has no morphology"; "L1 is affix-introducing") were ALL WRONG — they came from
  reading the vestigial staging files (§2). The live DB is the truth.
- **Rule tier is rich and live**: 97 grammar patterns → 194 scheduled pattern capabilities, with broad
  affix coverage (meN- L13/14/15, BER- L11/12/14, DI- L16, -an L10, ter-/se- L8).
- **Application/generative tier is essentially empty: 4 capabilities = 2 pairs (L9 meN- only).** ⭐
  THIS is the real, confirmed morphology gap. The build = add the application tier on top of the
  already-live rule patterns + the new chapters' rules.

## 5. Locked design decisions (this session)

1. **Ambition = C (full catalog), minus Root Race.** Not gold-plating: each "extra" type is the content
   of a specific follow-up chapter (reduplication=Bab6, -kan/-i contrast=Bab8, confixes=Bab9/11/13).
   Omitting any → that chapter lands generic on ingest. **`produce_word_family_ex` ("Root Race") is CUT**
   (architect WARNING): self-described optional + not chapter-tied → minimum-mechanism says don't carry
   optional scaffolding; defer to its own spec when a chapter needs it.
2. **Capability model = 3-tier hybrid** (research-aligned):
   - **Tier 1 (affix rule)** = a `grammar_pattern` capability (REUSE — the rule tier already exists
     across the corpus). It's the FSRS prerequisite that unlocks its drills (ADR 0006).
   - **Tier 2 (nasalization sub-rules)** = grammar_patterns + an `allomorph_class` column.
   - **Tier 3 (application)** = `affixed_form_pairs`, extended.
3. **Data model: one content table, no new source_kind.** Extend `affixed_form_pairs`
   (`scripts/migration.sql:2954`) — REVISED per data-architect M1/m2/m3:
   - `affix_type text NOT NULL CHECK (affix_type IN ('prefix','suffix','confix','reduplication'))` —
     the discriminator (data-architect M1; the single-table design needs it or confix/reduplication
     rows write fine but render unrenderable).
   - `affix text NOT NULL`, `affix_gloss text` — first-class affix identity for decompose/pick-affix.
   - `allomorph_class text` (nullable; set only for meN-/peN-) — drives `choose_allomorph_ex`.
   - `circumfix_left text`, `circumfix_right text` with
     `CHECK (affix_type != 'confix' OR (circumfix_left IS NOT NULL AND circumfix_right IS NOT NULL))`
     — carries the discontinuous-morpheme boundary so `build_confix_ex`/`decompose_word_ex` can split
     `kehujanan` → ke-/hujan/-an (data-architect M1).
   - `productive bool NOT NULL` (research non-negotiable). **Semantics (was undefined):** `productive=false`
     pairs are display/recognition only — the projector SKIPS the produce cap for them (no drilling a
     learner to "generate" a lexicalised form). The projector branches on it (data-architect i1).
   - `grammar_pattern_id uuid NOT NULL → grammar_patterns(id)` — **NOT NULL** (was nullable; data-architect
     m2: HC asserts non-null, so the DDL must too). Two-step idempotent add (nullable → backfill via
     regen → SET NOT NULL) or rely on truncate-and-regen.
   - **`register` CUT** (architect WARNING + data-architect m3): failed the omission test — no consumer,
     no cap keys on it. Re-add in its own slice if a formal/colloquial drill is ever specified.
   - Reduplication + confixes are `affix_type`-tagged rows in the SAME table. **One** new capability type
     `recognise_allomorph_from_root_cap` (its full triangle is enumerated in §9). ~5 new exercise types
     (Root Race CUT — see Decision 1).
4. **§8 naming rename — SPLIT OUT of this build (REVISED per architect CRITICAL #4).** Originally
   bundled here on a "key-touching forcing function" argument. Rejected on review: (a) the rename's
   premise is STALE — 2 of its 3 cited cross-level offenders are ALREADY fixed in live code
   (`l1_to_id_choice` returns `recognition` `capabilityTypes.ts:245`; the `contextual_cloze`-as-
   `cloze_mcq` render leg was removed `renderContracts.ts:119-131`); (b) adding NEW caps does not
   require REWRITING existing `canonical_key`s — they're separable. **This build adds the new
   morphology caps under the CURRENT naming convention.** The full `_src/_mode/_cap/_ex` rename
   becomes its **own plan/PR**, re-grounded against current code first (the model-doc §8 snapshot is
   `2026-06-06`, now stale on these points). The model-doc's 2026-06-07 "postpone until a real forcing
   function" decision stands.
   - **Level-purity IS adopted (non-negotiable, settled §7)** — independent of the rename: a capability
     is keyed by (source × direction × modality × level); an exercise varies format ONLY within a level.
     This resolves the nasalization-MCQ question: `choose_allomorph_ex` is its OWN recognition-level
     `recognise_allomorph_from_root_cap`, NOT an MCQ skin on the produce cap. The ONE genuine remaining cross-level
     offender (`pattern_recognition` rendered by `sentence_transformation`/`constrained_translation`,
     model §3b) is a small render-restriction fix that can ride its own micro-PR.
5. **Scope of the morphology upgrade** — the refining principle: **"contains a morphological process"
   ≠ "build the generative tier here."** Target only lessons that teach an affix as a *productive
   system* (rule + generative application warranted), NOT early *functional* affix mentions.
   - **Targets** (systematic affix, rule tier LIVE per §4): `meN-` = **L9** (pairs) + **L13/L14/L15**;
     `BER-` = **L11/L12/L14** (L11 has 3 live BER- patterns); `DI-` = **L16**; `-an` = **L10**;
     `ter-`/`se-` = **L8**; + the 14 new chapters. The build adds the **application tier** on top of
     these already-live rule patterns.
   - **NOT targets** (leave as-is; harvest their words as known-root *examples* only): **L1**
     reduplication (A1 plural fact — system = book-2 Bab 6), **L2** `se-`+classifier (A1 counting),
     **L10** `ke-`-ordinal (numbering fact), clitics **L6/L7** (→grammar), affix-free **L3/L4/L5**.
   - Do NOT add morphology drills before an affix is taught as a system (ADR 0006).
6. **"Apply affix to known roots" comes free** — affix-lesson generation READS existing vocab to pull
   known roots into `affixed_form_pairs` (generation-time DB query), NOT a reprocess of early lessons.
7. **Reprocess cost is split:** the §8 rename + level-purity = a CHEAP deterministic capability-stage
   regen across all lessons (recompute keys; build-stage truncation makes it cheap, ADR 0011
   `--regenerate`). The EXPENSIVE creative linguist re-authoring (morphology extraction) hits ONLY the
   affix-introducing lessons + new chapters.

## 6. The C exercise catalog → capability/level map (target §8 names)

| New exercise (`_ex`) | Level | Serves capability (`_cap`) | Reads |
|---|---|---|---|
| `decompose_word_ex` (derived → root+affix+meaning) | recognise | `recognise_word_form_link_cap` | affixed_form_pairs |
| ~~`choose_affix_ex`~~ → `cued_recall` (root+meaning → which affix) | recognise | `recognise_word_form_link_cap` | affixed_form_pairs |
| ~~`choose_allomorph_ex`~~ → `cued_recall` (root → pick meN-/peN- form) | recognise | **`recognise_allomorph_from_root_cap`** (NEW cap; rendered via widened `cued_recall`) | `allomorph_class` |
| `produce_derived_form_ex` (root+affix → type derived) | produce | `produce_derived_form_cap` | affixed_form_pairs |
| `build_confix_ex` (root → type confixed form) | produce | `produce_derived_form_cap` | affixed_form_pairs (confix rows, circumfix_left/right) |
| ~~`produce_word_family_ex` (Root Race)~~ | — | — | **CUT — deferred to its own spec (review)** |

> **Reconciliation with the phase-(b) impl spec (§8-naming alignment, 2026-06-15).** This table is the
> program-level illustration; the authoritative names + structure live in
> `docs/plans/2026-06-15-morphology-phase-b-implementation-spec.md` (now fully in §8 target names). Two
> reconciliations: (1) the new cap is `recognise_allomorph_from_root_cap` (rule-correct
> `operation_object_from_stimulus`), not the earlier `recognise_allomorph_cap` shorthand — fixed above
> and added to model-doc §8; (2) `produce_derived_form_ex` is shown here for symmetry, but the impl spec
> **reuses the existing `type_form_ex`** for plain derived-form production (no new exercise) — so the four
> genuinely-new `_ex` types. **✅ ADOPTED (phase-b revision 2026-06-16): TWO new, not four** —
> `decompose_word_ex` + `build_confix_ex`. The two MCQ caps (`choose_affix_ex`/`choose_allomorph_ex` in
> the table above) are **CUT**; their caps render via the existing `cued_recall` (widened to
> `word_form_pair_src`), distractors catalog-derived (staff-engineer). The table above is the original
> illustration; **phase-b §3 is authoritative** for the exercise roster.

## 7. Where it lives (target architecture)

`lib/morphology/` + `components/morphology/` are already RESERVED + the "Affix trainer" surface
(Leren tab) is reserved in `docs/plans/2026-06-13-app-architecture-foundation.md:81`. This design IS
that deferred spec. Lands on the planned seam, not a bolt-on.

## 8. Open questions / next steps

1. **Architect + data-architect review** — mandatory (data-model plan; enforced by plan-review-gate).
2. ~~Live-cap verification~~ ✅ DONE (§4): live DB confirms 97 grammar_patterns → 194 pattern caps;
   meN-/BER-/DI- rule tier is LIVE; only the application tier (4 caps, L9) is empty.
3. **Root-vocab prerequisite** — ✅ **RESOLVED (2026-06-16): HARD-BLOCK** (application caps don't schedule
   until the root is mastered). Single-unknown-card rule [research Q1]; and — load-bearing — it is the
   **SOLE** enforcement of morphology learning-order, because the receptive-before-productive Phase gate is
   carved out for `affixed_form_pair` (`pedagogy.ts:337-339,361`). Shapes the phase-b projector contract:
   `projectAffixedCapabilities` emits the root-vocab cap's canonical_key as a `prerequisiteKey` (resolved
   via `itemSlug()`). Confirmed in the capstone §7-Q1 + item B; lands in the phase-b re-review.
4. **Modal-verb semantics** (bisa/boleh/harus) — the one residual grammar gap NOT in book 2; small,
   addable. (Aspect sudah/telah IS covered by Bab 2.)
5. **Ingestion order** — sequence the 14 new chapters as new lessons; decide numbering vs the existing 16.
6. **Phasing** — this is a multi-PR program: (a) §8 rename + level-purity migration; (b) morphology
   schema + caps + exercise types + pipeline emission + gates + module spec; (c) re-author affix
   lessons; (d) ingest the 14 chapters. Each phase its own plan/PR.

## Supabase Requirements

### Schema changes
- Extend `indonesian.affixed_form_pairs`: `affix text`, `affix_gloss text`, `allomorph_class text`,
  `productive bool`, `register text`, `grammar_pattern_id uuid REFERENCES grammar_patterns(id)`.
- §8 rename rewrites `learning_capabilities.capability_type` + `canonical_key` (FSRS identity) — a
  migration, not a doc edit; build-stage truncation keeps it cheap.
- New `capability_type` value behind `recognise_allomorph_from_root_cap`; new `ExerciseType` values for the ~6 drills.
- RLS/grants: additive columns are covered by existing table policies; verify after migrate.

### homelab-configs changes
- [ ] N/A — no new schema exposure / CORS / GoTrue / bucket changes.

### Health check additions
- New HC: every `affixed_form_pair` cap has a non-null `grammar_pattern_id` (rule-tier link) and a
  valid `allomorph_class` when `affix IN ('meN-','peN-')`. Mirror the three-layer-gate habit.
- Run `make migrate-idempotent-check` + `make pre-deploy` before merging any migration phase
  (data-architect Q6: additive columns use `ADD COLUMN IF NOT EXISTS`; the NOT-NULL `grammar_pattern_id`
  needs the two-step add or truncate-and-regen path).

---

## 9. Review round 1 — verdicts & resolutions (2026-06-15)

**`architect`: NEEDS-REWORK** (spine sound; rework = unbundle the §8 rename). **`data-architect`:
APPROVE-WITH-CHANGES.** Both lenses mandatory (data-model plan). Resolutions:

**Applied to THIS program doc:**
- §8 rename UNBUNDLED → own plan; stale-premise correction recorded (Decision 4).
- `affix_type` discriminator + `circumfix_left/right` + per-type CHECK added; `register` CUT;
  `grammar_pattern_id` → NOT NULL; `productive` semantics defined; Root Race CUT (Decision 3 + §6 + §1).

**Obligations the phase-(b) IMPLEMENTATION spec MUST carry (flagged not-draft-blocking by both):**
- **`recognise_allomorph_from_root_cap` full triangle, atomic in one PR** (data-architect C1): the 6 corners —
  (1) projector that emits it (`projectors/morphology.ts` / `affixedCapabilities.ts`); (2) `byKind/
  affixedFormPair.ts` SELECT widened to `allomorph_class` + threaded through `AffixedFormPairInput`
  (`renderContracts.ts:303-320`); (3) `RENDER_CONTRACTS` — **widen the existing `cued_recall`** entry to
  serve `recognise_allomorph_from_root_cap` over `word_form_pair_src` (NOT a bespoke `choose_allomorph_ex`;
  cut 2026-06-16) (`renderContracts.ts:56` — module-load guardrail `:167,189` refuses boot if missing); (4)
  `CapabilityType`/`CAPABILITY_TYPES` union (`capabilityTypes.ts:32,46`); (5)
  `deriveSkillTypeFromCapabilityType` case (`:233`); (6) `masteryModel.ts:dimensionForCapability`
  (`:139-170`). Plus `ExerciseType` union + ~5 registry components, and the admin
  `coverageService.ts`/design-lab consumers.
- **ADR 0007 carve-out (architect CRITICAL):** the rule→pair prerequisite is CROSS-source-kind
  (`pattern`→`affixed_form_pair`); current `prerequisiteKeys` only expresses it WITHIN a pair, and
  ADR 0007:44 EXEMPTS `affixed_form_pair` from the staging gate. Phase-(b) must (a) verify
  `prerequisiteKeys` resolves cross-source-kind in projector+planner, (b) carry an ADR addendum/new ADR.
- **Three-layer gate, all three layers** (both): Layer 1 shared validator + unit tests, Layer 2 pre-write
  in `runCapabilityStage` next to `validateAffixedFormPairs` (extend for `allomorph_class`/`grammar_pattern_id`),
  Layer 3 the HC above.
- **§8 rename plan (separate) must enumerate** `masteryModel.ts:dimensionForCapability`, `session-builder/
  labels.ts`, `pedagogy.ts` `startsWith('root_derived_')`, and `affixedCapabilities.ts` string literals —
  grep every `startsWith`/`includes` on capability_type before closing (data-architect M2).

Re-dispatch `architect` + `data-architect` when the phase-(b) implementation spec is drafted (architect's
own instruction). This program doc's direction is settled.
