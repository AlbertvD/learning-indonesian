---
status: approved
reviewed_by: [architect, data-architect]   # round-2 sign-off 2026-06-18; staff-engineer soundness pass: SOUND
supersedes: []
related:
  - docs/adr/0019-morphology-derivation-is-a-generalized-catalog-recipe-composer.md
  - docs/plans/2026-06-15-morphology-phase-b-implementation-spec.md          # closes its deferred Task 6
  - docs/plans/2026-06-18-morphology-authoring-capability.md                 # the engine + generate-script this extends
  - docs/adr/0018-morphology-application-cap-cross-source-kind-prerequisites.md
  - docs/research/2026-06-15-affix-morphology-module-research.md             # §16/§55/§100 contextual production
  - docs/current-system/modules/capabilities.md
  - docs/current-system/modules/exercise-content.md
closes_task: "Task 6 (confix/double-affix + 2 exercise types) of the phase-b spec"
---

# Morphology — generalised derivation engine + in-context production (design)

> Output of a grill-with-docs session (2026-06-18). Design settled with the author
> question-by-question; this is the spec for review. **Data-model plan → needs
> `architect` + `data-architect` sign-off (plan-review-gate) before `approved`.**

## Grounding (CLAUDE.md plan-grounding rule)

Engine + catalog live in `src/lib/capabilities/` — **LOCKED** in
`docs/target-architecture.md:181` and the *sole* pipeline↔runtime shared seam
(`:1159`). `lib/exercise-content/` is **LOCKED** (fold done 2026-05-21,
`docs/target-architecture.md:1492`). So this plan lands at the existing locked
seams and adds no code to any file slated for a fold — no shallow-module drift.
No constraint in target-architecture blocks the new nullable column or the new
exercise type.

## Goal

Close the phase-b deferred Task 6 by **generalising the derivation engine** to
cover the whole known book-2 affix set (one catalog-recipe composer; reduplication
the lone separate path), and add **in-context production** for affixed forms as a
format of the existing produce cap (option B). L21 (Bab 5, `-kan`) is the first
chapter to exercise it; later chapters bring only content. See **ADR 0019** for
the decision and rationale.

## Design (settled)

1. **Recipe-driven composer.** Each `affixCatalog` entry gains a composition
   recipe `{ prefix?: {nasal|fixed}, suffix?, reduplicate? }`. `deriveAffixedForm`
   reads it instead of branching per affix. Covers every prefix/suffix/confix.
   `DerivedAffixedForm` gains `circumfixLeft`/`circumfixRight`.
2. **`confix` = shape, not atomicity.** New entries `meN-…-kan`, `di-…-kan`
   (L21) + `meN-…-i`, `di-…-i`, `pe-…-an`, `ke-…-an`, `per-…-an`, `memper-…-kan`
   (later chapters). Nasalised left half → `circumfix_left`; `allomorph_class`
   stays null for confixes.
3. **Reduplication separate.** `deriveReduplication` (full `root-root` by rule);
   sound-change forms curated via `IRREGULAR`; affixed reduplication later.
4. **Exercise roster.** `decompose_word_ex` (NEW — segment into morphemes +
   meaning, recognise) · widened `choose_form_ex` (verify already shipped,
   `src/lib/capabilities/renderContracts.ts:76`) · `type_form_ex` (contextualised).
   `build_confix_ex` NOT built. (Full paths: there are 3 `renderContracts.ts` copies
   incl. worktrees; the real seam is `src/lib/capabilities/renderContracts.ts`.)
5. **Option B — in-context production.** A nullable `carrier_text` column;
   `type_form_ex` renders the blanked carrier when present, else the isolated
   prompt; grading unchanged (answer = `derived_text`). **No new cap.**
6. **Carrier harvest.** Deterministic. **Source priority: grammar `examples` >
   story `paragraphs` > exercise `items[].answer`** (the `a./b.` parse extracts the
   FULL carrier sentence, never the bare `"b. membelikan"` fragment); within a
   source, shortest-wins. **Verbatim-gate = raw `sentence.includes(derived_text)`
   (no normalisation/lowercasing on either side)** — the SAME comparison the
   runtime blank-replacement uses, so a validator-pass guarantees a render-match
   (avoids the `root_text`/`normalized_text` zero-row class, OpenBrain a9fdeb91).
   No match in any source → `carrier_text` null → isolated prompt. The fallback is
   "no carrier," never an ugly one.
7. **Per pair (reused, ADR 0018):** 2 caps (`recognise_word_form_link_cap` +
   `produce_derived_form_cap`); both hard-block on the **formation** grammar-pattern
   cap + the **root vocab** cap; `word_form_pair_src` exempt from the phase gate.
   `productive` authored per pair (default true; false skips the produce cap).
   Pairs link to the **formation** rule, not the semantic-reading category.

## Tasks

1. **Catalog** (`src/lib/capabilities/affixCatalog.ts`) — recipe field + the confix
   entries + recipes for existing affixes. **Confirm the reduplication catalog key**
   (the `affix` value reduplication rows carry, e.g. `'reduplication'`) so
   `isCatalogAffix` (defined `src/lib/capabilities/affixCatalog.ts:63`; called by CS12
   `scripts/lib/pipeline/capability-stage/validators/affixedFormPairs.ts:31`) passes
   them and it is not in the `ALLOMORPHIC_AFFIXES`/`ALLOMORPHIC` sets (it is not —
   `meN-`/`peN-` only).
2. **Engine** (`src/lib/capabilities/affixDerivation.ts` + `__tests__/`) — recipe
   composer; `circumfixLeft/Right` output; `deriveReduplication` (full); delete
   stale `deriveAffix` comments (lines 18, 30). **Golden:** reproduce L13 meN- pairs
   byte-identically (regression) + new fixtures `membelikan`/`dibelikan`/`menaikkan`/
   `dinaikkan`/`pendidikan`/`keadilan` + a reduplication fixture.
3. **Migration** (`scripts/migration.sql`) — nullable `carrier_text text` on
   `lesson_section_affixed_pairs` + `affixed_form_pairs` (`ADD COLUMN IF NOT EXISTS`).
   Idempotent — additive nullable, no default.
4. **Generate script** (`scripts/generate-morphology-patterns.ts`) — populate
   `circumfixLeft/Right` from the catalog recipe's prefix/suffix pieces for confix
   entries, and emit them in `GeneratedPair` + `serializePairs` (currently absent);
   add the carrier harvester (design §6: source-priority, full-sentence parse, raw
   `includes` gate).
5. **Thread `carrier_text` through ALL nine hops in one PR** (data-architect SF-1/SF-2
   — the writer→reader→validator triangle; field is `carrier_text` in DB, `carrierText`
   in TS):
   - `projectSections.ts` — `ProjectedAffixedPair` (`:50-64`) + `AffixedPairInput`
     (`:73-93`) + the mapping (`:241-243`)
   - lesson-stage `adapter.ts` — `AffixedPairRowInput` (`:307-325`)
   - lesson-stage `runner.ts` — the row build (`:335-356`)
   - cap-stage `loadFromDb.ts` — `TypedAffixedPair` (`:822-843`) + the SELECT (`:880`)
   - cap-stage `runner.ts` — `AffixedPairSource` map build (`:548-575`)
   - `projectors/morphology.ts` — `AffixedPairSource` (`:35-48`) + `rows.push` (`:147-162`)
   - cap-stage `adapter.ts` — `AffixedFormPairRowInput` (`:440-457`)
   - **reader `byKind/affixedFormPair.ts`** — `AffixedFormPairRow` (`:38-44`) + the
     SELECT (`:57`) + the mapped `input.affixedFormPair` output object (`:113-139`)
   - **the inline resolved `affixedFormPair:` object built in
     `byKind/affixedFormPair.ts:120-127`** (NOT on `AffixedFormPairBucketEntry`,
     which is routing-only) — else `type_form_ex` silently sees null (SF-2).
   (Circumfix plumbing already exists; only `carrier_text` is net-new.)
6. **`decompose_word_ex`** — every compile-time gate in ONE commit (atomic-boot):
   `ExerciseType` union (`src/types/learning.ts:134`), `RENDER_CONTRACTS`
   (`renderContracts.ts:165`), `ContractInputShapes` + `_CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK`
   (`:425-443`), `projectBuilderInput` switch + `never` guard (`:612-654`),
   `BuilderRegistry` (`byType/index.ts:30-47`), **`exerciseSkeletonVariant`
   total-`Record` (`registry.ts:81-94`)**, **`feedbackPropsFor` no-default switch
   (`feedbackMapping.ts:47-259`) — design a real "segment-into-morphemes" feedback
   screen, NOT just a compiler stub**. Plus two RUNTIME (not compile-breaking, but
   ship them in the same commit) entries: `exerciseRegistry` (`registry.ts:59` —
   missing = silent runtime block-skip) and a Dutch `exerciseLabels`
   (`src/lib/session-builder/labels.ts:86` — `Partial` + fallback; missing = ugly
   "decompose word ex" shown to the learner). Then the `implementations/` component
   and the `byType` packager (catalog affix distractors via `distractorAffixes()` +
   item-pool root distractors).
7. **`type_form_ex` carrier rendering** — component shows the carrier with
   `derived_text` blanked (raw replace, matching the harvest gate) when
   `carrierText` is present, else the isolated prompt. Grading unchanged.
8. **Three-layer gate** — Layer 1 engine golden tests; Layer 2 CS12
   (`scripts/lib/pipeline/capability-stage/validators/affixedFormPairs.ts` —
   reduplication shape + **required**
   `carrier_text == null || carrier_text.includes(derived_text)`); Layer 3 HC31
   (`check-supabase-deep.ts` — reduplication shape). **HC31 does NOT re-check the
   carrier** — CS12 closes it pre-write (cheapest mechanism; no redundant HC). The
   "optional" carrier-HC is removed.
9. **L21 pilot** — author `staging/lesson-21/morphology-roots.ts`, generate,
   publish both stages, gate, **render-verify in-app** (per `feedback_answer_log_check`:
   open L21, confirm a confix `decompose_word_ex` and a contextualised
   `type_form_ex` render; check `capability_review_events` after answering).
10. Mark phase-b spec Task 6 done/superseded; bump this plan to `shipped`.

## PR structure

- **PR 1 — Foundation + L21 pilot** (tasks 1–9). The data-model-touching PR.
- **PRs 2..N — per-chapter content** (each: author roots, generate, publish, gate,
  render-verify). No engine/schema change.

## Supabase Requirements

### Schema changes
- Additive nullable `carrier_text text` on `indonesian.lesson_section_affixed_pairs`
  and `indonesian.affixed_form_pairs` (add to `scripts/migration.sql`). No new
  table, no new `source_kind`, no new `capability_type`.
- New `ExerciseType` value `decompose_word_ex` (frontend union only — not a DB enum).
- RLS/grants: additive column covered by existing table policies; verify after migrate.

### homelab-configs changes
- [ ] N/A — no schema exposure / CORS / GoTrue / bucket changes.

### Health check additions
- HC31 (`check-supabase-deep.ts`): reduplication rows shaped correctly. Existing
  confix `circumfix_left/right` + `affix ∈ catalog` + root-resolves checks unchanged.
  **The carrier invariant (`carrier_text` contains `derived_text`) is enforced at
  CS12 pre-write, NOT re-checked in HC31** — cheapest mechanism, no redundant gate.
- Gate before merge: `make migrate-idempotent-check` + `make pre-deploy`.

## Reviews requested
- `architect` — recipe-composer shape; `decompose_word_ex` atomic-boot landing;
  seam placement (engine/catalog stay in `lib/capabilities`); ADR 0019 fit.
- `data-architect` — `carrier_text` writer→reader→validator triangle; `circumfix_left`
  as nasal home with `allomorph_class` null; `productive` skip-produce; HC31.
- `staff-engineer` — soundness/simplicity: is the composer the boring solution; is
  reduplication-now + the harvest scope justified; is holding `build_confix_ex` right.
