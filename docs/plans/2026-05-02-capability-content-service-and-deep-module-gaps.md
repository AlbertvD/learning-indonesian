# Deep-Module Architecture Audit + Capability Content Service Findings

**Date:** 2026-05-02
**Revised:** 2026-05-02 after a code-grounded review found three factual errors and several under-specifications in the original Gap #1 sketch. Diagnosis sections unchanged; Gap #1 design rewritten against the actual code.
**Status:** Findings + design notes captured for handoff. Decisions made in conversation; no spec or implementation yet.
**Source:** 2026-05-02 conversation diagnosing why session cards render empty after the user reads a lesson. Expanded into a sweep of all legacy code that affects deep-module correctness end-to-end. This document is meant to be picked up in a fresh context window.

## Why this document exists

Earlier, we shipped `learnerProgressService` (`docs/plans/2026-05-01-learner-progress-service-spec.md` v6) as the canonical contract for surfacing-layer reads. Six rounds of architect review. PRs 1, 2, 3, 5 landed. Deployed.

The user then hit a different bug: reading a lesson for >2 minutes correctly unlocked 4 capability cards in the session queue, but **every card renders without any actual exercise content** — only labels like "Tekst herkennen" and self-rate buttons. They asked: "I thought we already created the interfaces between the deep modules, was this overlooked?"

The honest answer: yes, the previous spec was scoped narrower than the title suggested. It covered analytics surfaces. The session-rendering deep-module interface was treated as out-of-scope ("session engine already capability-aware") but the engine produces a manifest the UI never resolves. Empty cards followed.

This document captures the full sweep done in the follow-up, the architecture as-is, the three remaining gaps, and design notes for the most blocking one.

## The architecture as it is today

Deep modules grouped by layer. `✅` = working canonically. `⚠` = gap.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  UI                                                                           │
│  Dashboard / Lessons / Lesson / Session / Voortgang                           │
│  ExperiencePlayer + blocks/{Due,New,Recap,WarmInput}                          │
│  CapabilityExerciseFrame  ⚠  no content rendering                             │
│  registry.ts → implementations/<Type>.tsx  (capability-aware components,      │
│                                              currently consumed only by the   │
│                                              legacy ExerciseShell flow)       │
│  LessonReader.tsx + LessonBlockRenderer.tsx  ✅                               │
└───────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  SURFACING / ANALYTICS  ✅ shipped                                            │
│  learnerProgressService   13 methods (today's plan, lapsing, streak,          │
│                            memory health, latency, recall, mastery,           │
│                            forecast, study days, vocab gain, overdue)         │
│  goalService              weekly goals, today plan; uses ↑                    │
│  progressService          Voortgang façade; uses ↑                            │
│  lessonService            lesson list + per-lesson reads (single-RPC          │
│                           overview shipped 2026-05-02)                        │
└───────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  MASTERY / DISPLAY                                                            │
│  masteryModel.ts   per-dimension classifier (introduced/learning/             │
│                    strengthening/mastered/at_risk), confidence                │
│                    ⚠ no per-item aggregation method exposed                   │
└───────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  SESSION ORCHESTRATION  ✅ produces SessionPlan correctly                     │
│  capabilitySessionLoader        entry point                                   │
│  capabilitySessionDataService   assembles SessionPlan from capability rows    │
│  sessionComposer / sessionPolicies / sessionPosture / sessionPlanningSignals  │
│  sessionPlan (types)                                                          │
│  sessionCapabilityDiagnostics                                                 │
│                                                                               │
│  ⚠ MISSING — capabilityContentService                                         │
│     resolves renderPlan.requiredArtifacts → render-ready content              │
│     (this is the bridge between SessionPlan and UI)                           │
└───────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  PEDAGOGY  ✅                                                                 │
│  pedagogyPlanner          load budgets, recent-failure caps, source-switch    │
│  sourceProgressGates      eligibility predicate (mirrors statesSatisfying...) │
│  sourceProgressService    learner_source_progress_state events                │
│  loadBudgets / lessonIntroduction                                             │
└───────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  SCHEDULER (FSRS-aware)  ✅                                                   │
│  fsrs                       pure FSRS calculator                              │
│  capabilityScheduler        dueness predicate                                 │
│  capabilityReviewProcessor  answer → next state                               │
│  capabilityReviewService    RPC wrapper to edge function (writes state)       │
└───────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  CONTENT / CATALOG  ✅                                                        │
│  capabilityService    learning_capabilities CRUD                              │
│  capabilityCatalog    projection: content → capabilities                      │
│  learningItemService  learning_items CRUD                                     │
│  contentFlagService   content quality flags                                   │
└───────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────┐
│  LEGACY (q3-deferred — still in production bundle, gated behind a flag        │
│  whose default is now true → this path is dead-but-shipped)                   │
│  lib/reviewHandler              legacy answer flow, writes to legacy tables   │
│  reviewEventService             review_events writes                          │
│  learnerStateService (writes)   learner_skill_state, learner_item_state,      │
│                                 learner_stage_events writes                   │
│  sessionSummaryService          ⚠ reads legacy tables for end-of-session      │
│                                   facts — empty on capability path            │
│                                                                               │
│  Gate: capabilityMigrationFlags.experiencePlayerV1 (default true since        │
│  the cutover plan).                                                           │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Sweep results — every legacy touch in production

Compiled by `grep -rn "from\('(learner_skill_state|review_events|learner_stage_events|learner_item_state)'\)"` excluding tests.

| File:line | What it reads/writes | Severity for capability flow |
|---|---|---|
| `lib/session.ts:37` | `review_events` (last activity for stale-session sweep) | LOW — operational; capability sessions never get inferred. Small fix: union both tables. |
| `services/learnerStateService.ts:10,20` | `learner_item_state` (getItemStates, getItemState) | MEDIUM — feeds Voortgang Leerpijplijn; permanent 0/0/0/0 post-cutover. |
| `services/learnerStateService.ts:32,45` | `learner_skill_state` (getSkillStates, getSkillStatesBatch) | LOW — only legacy session callers. |
| `services/learnerStateService.ts:55` | `learner_item_state` (upsertItemState — write path) | DEAD with q3 — only reviewHandler calls it. |
| `services/learnerStateService.ts:99` | `learner_stage_events` (logStageEvent — write path) | DEAD with q3. |
| `services/reviewEventService.ts:9,20,32` | `review_events` (writes) | DEAD with q3. |
| `services/sessionSummaryService.ts:92,113` | `review_events` + `learner_stage_events` for session-end facts | MEDIUM — silent on capability path. |
| `services/goalService.ts:523` | comment only (migration marker) | — |

## The three actual gaps for deep-module correctness

### 1. `capabilityContentService` — missing module (BLOCKING)

The session engine outputs a plan whose blocks have a manifest. From `src/lib/exercises/exerciseRenderPlan.ts:4-11`:
```ts
interface ExerciseRenderPlan {
  capabilityKey: string                    // e.g. 'item:akhir:text_recognition:id_to_l1'
  sourceRef: string                        // e.g. 'learning_items/akhir'
  exerciseType: ExerciseType               // e.g. 'recognition_mcq'
  capabilityType: ProjectedCapability['capabilityType']
  skillType: ProjectedCapability['skillType']
  requiredArtifacts: ArtifactKind[]        // e.g. ['base_text', 'meaning:l1']
}
```

The UI consumer (`ExperiencePlayer` → `CapabilityExerciseFrame` at `src/components/experience/CapabilityExerciseFrame.tsx:54-79`) renders only the exercise-type label and 2 self-rate buttons. **It never resolves the manifest into actual content.** The data exists in the DB; no module fetches it on the capability path.

Verified facts (all grounded in the actual code, not memory):
- 12 capability-aware exercise components live at `src/components/exercises/implementations/<Type>.tsx` (RecognitionMCQ, ClozeMcq, CuedRecallExercise, MeaningRecall, TypedRecall, ListeningMCQ, Dictation, ContrastPairExercise, SentenceTransformationExercise, ConstrainedTranslationExercise, SpeakingExercise, Cloze).
- They accept `ExerciseComponentProps` from `src/components/exercises/registry.ts:45-51`: `{ exerciseItem: ExerciseItem, userLanguage: 'en'|'nl', onAnswer, onEvent?, adminOverlay? }`.
- The full `ExerciseItem` shape at `src/types/learning.ts:199-267` is much richer than just `{ learningItem, meanings, distractors }`. It carries seven per-exercise-type config blobs: `clozeContext`, `clozeMcqData`, `cuedRecallData`, `contrastPairData`, `sentenceTransformationData`, `constrainedTranslationData`, `speakingData` — plus `answerVariants` (typed-recall fuzzy match), `contexts` (`ItemContext[]`), `skillType`, `exerciseType`.
- They are consumed only by `ExerciseShell.tsx` (legacy session path) via `registry.ts`. Wired at `registry.ts:62-78`.
- The capability session never enters that path. Its `CapabilityExerciseFrame` renders no content.
- Migration gate is `experiencePlayerV1` in `src/lib/capabilityMigrationFlags.ts`. Default true since the cutover plan, so the legacy `ExerciseShell` path is dead-but-shipped.

Classification: **missing interface, with most of the work already implemented in the legacy path.** `src/lib/sessionQueue.ts:230-560` (the `makeGrammarExercise` switch and the type-specific `make*` helpers from `:760` onward) already does the variant-payload → `ExerciseItem` reshaping for every exercise type, including pulling distractors from a 6-tier cascade. What is missing is a capability-path entry point that feeds the same shaping logic from a `SessionBlock[]` rather than from the legacy queue input. So this is "extract and share," not "design and build new."

#### Proposed shape

The service must produce, for every `SessionBlock`, an object that satisfies the existing `ExerciseItem` contract — anything narrower forces a re-design of the 12 exercise components or silently drops fields the components depend on (e.g. `answerVariants` for typed-recall fuzzy matching, the per-type config blobs for ClozeMcq / CuedRecall / ContrastPair / SentenceTransformation / ConstrainedTranslation / Speaking).

Recommended approach: **return `ExerciseItem` directly, wrapped with diagnostics.** This keeps the contract single-sourced at `src/types/learning.ts:199-267`, lets the 12 implementations stay byte-for-byte unchanged, and makes the q3 deletion of `ExerciseShell` mechanical.

```ts
// src/services/capabilityContentService.ts (new file)
import type { ExerciseItem } from '@/types/learning'
import type { SessionBlock } from '@/lib/session/sessionPlan'

export interface CapabilityRenderContext {
  blockId: string
  capabilityId: string
  exerciseItem: ExerciseItem        // ← the existing contract — no parallel shape
  audioUrl?: string                 // resolved from has_audio + bucket convention
  resolutionWarnings: string[]      // e.g. 'no nl meaning, fell back to en'
}

export interface CapabilityContentService {
  resolveBlocks(blocks: SessionBlock[]): Promise<Map<string, CapabilityRenderContext>>
}
```

Returns a Map keyed by `block.id` → render context. Blocks that fail to resolve (missing variant, missing meaning, no eligible distractor pool, etc.) are still represented in the Map with `resolutionWarnings` populated — the caller decides whether to skip the block or render a degraded view. The architect should pin the policy.

`ExerciseItem` is already capability-shaped enough: `learningItem` is nullable for grammar exercises, `meanings` and `contexts` are arrays, the per-type config blobs are optional. The service does not need to fork the contract.

#### Three implementation decisions

**(a) Where to compute.** Recommendation: **client-side bulk fetch**.

| Option | Pros | Cons |
|---|---|---|
| Server-side SQL function | 1 round trip, UI very simple | Distractor cascade logic (6 tiers — see `sessionQueue.ts:678-790`) is hard to faithfully port to SQL; semantic-group keyword logic lives in `src/lib/semanticGroups.ts` |
| **Client-side bulk** | Fits browser/PostgREST patterns; distractor logic stays in TS and reuses `pickDistractorCascade`; 4–5 round trips at session start | Round-trip overhead at session boot |
| Lazy per-block | Simplest | Round trip per swipe — bad UX |

Bulk approach: at session start, for the N blocks in the plan, fetch in parallel:
1. `learning_items WHERE id IN (...)` — base rows (one row per item-based block).
2. `item_meanings WHERE learning_item_id IN (...)` — translations (carries `is_primary`, language).
3. `item_contexts WHERE learning_item_id IN (...)` — example sentences, dialogue, cloze sources (used by `contexts: ItemContext[]` field).
4. `item_answer_variants WHERE learning_item_id IN (...)` — typed-recall acceptable answers (defined at `migration.sql:129-138`).
5. `exercise_variants WHERE learning_item_id IN (...) AND is_active` — **this is where curated distractors and per-type configs live** (`payload_json` jsonb at `migration.sql:846`; written by `publish-approved-content.ts:799,867`). Same table also carries grammar exercise payloads (cloze_mcq, contrast_pair, sentence_transformation, constrained_translation).
6. Distractor pool query: same-lesson `learning_items` + `item_meanings` join, scoped to the lesson source-refs touched by the block set, used as fallback fuel for the cascade.

> **Correction note:** an earlier draft of this section referenced a `vocab_enrichments` table. That table does not exist. The staging file `vocab-enrichments.ts` (read by `scripts/lint-staging.ts:199`) is published into `exercise_variants.payload_json` per `publish-approved-content.ts:799,867,897`.

Latency target: needs to be measured against the homelab Supabase stack before being committed to. Earlier draft asserted "<250ms" without a baseline — the architect should require an actual measurement (or a budget set with an explicit p50/p95) before accepting the design.

**(b) Distractor sourcing.** The live system uses a **6-tier cascade** at `src/lib/sessionQueue.ts:678-790` (`pickDistractorCascade`). Tiers strict → lenient:

  0. same item_type + same POS + same semantic group
  1. same item_type + same POS + same level
  2. same item_type + same POS (any level, any group)
  3. same item_type + same semantic group (POS relaxed)
  4. same item_type + same level (POS relaxed)
  5. full pool fallback

Plus structural-similarity gating from `STRUCTURALLY_SIMILAR_TYPES` (word↔phrase, sentence↔dialogue_chunk are mixable; short never mixes with long) and substring-overlap dedup via `sharesMeaningfulWord` to prevent visual duplicates like `[omdat, "omdat, de reden is"]`. Curated distractors authored by the `vocab-exercise-creator` agent flow through `exercise_variants.payload_json` and are read directly by the runtime builders for the relevant exercise types — they are not a separate source layered on top of the cascade.

Recommendation for `capabilityContentService`: **extract `pickDistractorCascade` and the supporting helpers (`STRUCTURALLY_SIMILAR_TYPES`, `optionComponents`, `sharesMeaningfulWord`, the semantic-group keyword logic from `src/lib/semanticGroups.ts`) into a shared module under `src/lib/distractors/` and call it from the new service.** Do not collapse to a 3-tier replacement — that is a real semantic regression in MCQ quality and existing tests in `sessionQueue.test.ts` pin the 6-tier behavior.

For exercise types that ship authored payloads (`cloze_mcq`, `contrast_pair`, `sentence_transformation`, `constrained_translation`), distractors are baked into `exercise_variants.payload_json` and the cascade is not invoked — same behavior as `sessionQueue.ts:makeGrammarExercise` at `:236-560`.

The cascade and authored-payload paths are encoded once in the shared distractor module + the new service. UI components never re-implement.

**(c) Adapter to existing exercise components.** Because the new service returns a full `ExerciseItem`, the dispatch site needs no shape translation:

```ts
// inside the new CapabilityExerciseFrame body, after resolveBlocks attaches context
const Component = resolveExerciseComponent(block.renderPlan.exerciseType)
if (!Component) return <DiagnosticCard reason="exercise type not registered" />
if (context.resolutionWarnings.length > 0 && !context.exerciseItem) return <DiagnosticCard ... />
return (
  <Component
    exerciseItem={context.exerciseItem}
    userLanguage="nl"  // pulled from auth/profile in real code
    onAnswer={handleOutcome}
    onEvent={() => {}}
  />
)
```

The legacy `ExerciseShell` does the same dispatch through `resolveExerciseComponent` (`registry.ts:103-105`); the difference here is that `exerciseItem` is built by `capabilityContentService` from a `SessionBlock` rather than from the legacy queue input. The 12 existing components stay byte-for-byte unchanged.

> **Correction note:** an earlier draft of this section showed `contexts: context.clozeContext ? [context.clozeContext] : []`. That conflated two different fields: `ExerciseItem.contexts` is `ItemContext[]` (DB rows from `item_contexts`), while `ExerciseItem.clozeContext` (singular) is the cloze-specific config blob `{ sentence, targetWord, translation }`. Different shapes, different fields, both required. Reusing `ExerciseItem` directly avoids this class of error entirely.

The new service returns `ExerciseItem` populated by reusing the type-specific builders already in `sessionQueue.ts:236-560` (`makeGrammarExercise`, `makeRecognitionMCQ`, `makeCuedRecall`, `makeClozeMcq`, `makeTypedRecall`, `makeMeaningRecall`, `makeListeningMcq`, `makeDictation`, `makeSpeaking`). These need to be moved out of `sessionQueue.ts` (which is part of the legacy queue construction) into a neutral location like `src/lib/exercises/builders/` so both the legacy path (until q3 deletion) and the capability path can call them. Once the legacy path is gone, only the capability path consumes them.

Legacy `ExerciseShell` and the unused half of `sessionQueue.ts` can be deleted post-q3.

#### Net effect of shipping #1

- ExperiencePlayer calls `capabilityContentService.resolveBlocks(plan.blocks)` once at session start.
- Each block now has a `CapabilityRenderContext` (containing a fully populated `ExerciseItem`) attached.
- `CapabilityExerciseFrame` is replaced by a thin dispatcher that calls `resolveExerciseComponent(block.renderPlan.exerciseType)` and forwards `exerciseItem` + `onAnswer`.
- Real exercises render: typed input, MCQ, audio playback, etc.
- Self-rate buttons removed (they were the placeholder, never the design).
- The legacy session path (`ExerciseShell` → `reviewHandler`) becomes safely deletable. Q3 follow-up.

#### Open questions for the architect to pin

These are not decisions in this doc — they are gaps the spec must close before implementation:

1. **Audio resolution.** `LearningItem.has_audio` is a boolean; there is no URL column. Are audio URLs computed from a slug + bucket convention (e.g. `indonesian-lessons/items/<slug>.mp3`)? Are they signed URLs or public-bucket reads? `migration.sql` declares storage buckets `indonesian-lessons` and `indonesian-podcasts` with public read. The spec must either (a) document the convention and put it in the service, or (b) call out that audio is N/A and the listening/dictation exercises will fail-soft until a follow-up PR.
2. **Block-level resolution failure policy.** When a block's variant is missing or no distractors can be built, does the player skip the block, render a diagnostic card, or surface as a soft warning? The doc proposes diagnostics; the spec must pick.
3. **Content flag handling.** `contentFlagService` exists but is not invoked by the capability path today. Should `resolveBlocks` filter blocks whose underlying item or variant has an active flag, or is filtering already done upstream by `capabilitySessionDataService`? Architect to verify.
4. **`userLanguage` source.** The 12 components take a `userLanguage: 'en'|'nl'`. The capability frame currently hardcodes nothing; the new dispatcher will need to pull from the user profile or auth store. Trivial wiring but must not be silently dropped.
5. **Where the type-specific builders live after extraction.** Proposed: `src/lib/exercises/builders/`. Architect to confirm the home and sketch the import graph so we don't create a cycle with `sessionQueue.ts`.

### 2. Per-item mastery aggregation — interface gap (DEGRADED)

`masteryModel.ts:191` has `labelForCapability(evidence, now)` (note: two args, not one) that classifies a single capability into one of `not_assessed | introduced | learning | strengthening | mastered | at_risk`. It also has `weakestLabel(labels)` at `:223` for aggregation. **Both are module-private (no `export`).** Anything aggregating across capabilities from outside the file needs them exported, or the new method must live inside `masteryModel.ts` and use them directly.

The file is **not pure** — it hosts a `createMasteryModel(client)` factory at `:412-507` that already returns three async methods (`getContentUnitMastery`, `getPatternMastery`, `getMasteryOverview`), each of which queries Supabase. So adding a fourth method here is a faithful extension, not architectural drift.

What's missing: a method that aggregates **per-item across all that item's capabilities** to drive the Voortgang Leerpijplijn (5-stage funnel). Today the funnel reads `learner_item_state.stage` (legacy column written only by reviewHandler) — capability-path users see permanent 0/0/0/0.

Proposed addition to `createMasteryModel`:

```ts
async getItemMasteryDistribution(userId: string): Promise<{
  not_assessed: number
  introduced: number
  learning: number
  strengthening: number
  mastered: number
  at_risk: number
}>
```

Implementation walks every capability whose `source_kind === 'item'` and `source_ref` resolves to a `learning_item`, groups capabilities by item, applies `weakestLabel` over the labels of that item's capabilities, and tallies. Plus a per-direction split (Recognition vs Recall) for the analytics-tier-decisions Fork 2 vision.

This is documented in `docs/plans/2026-05-01-capability-analytics-tier-decisions.md` Fork 2 — that decision doc is the right place to evolve from. Spec next.

### 3. Session-end facts — wrong data source (DEGRADED)

`sessionSummaryService.getSessionLocalFacts` at `src/services/sessionSummaryService.ts:90-124` reads `review_events` + `learner_stage_events`. Empty result for capability-session writes (which go to `capability_review_events`).

The module is the right shape. The migration is a swap inside that module — exactly the same kind of change as PR-1/2/3 of the surfacing-layer spec. Could be added as PR-4 of that spec or a small standalone PR.

Documented in `docs/plans/2026-05-01-capability-analytics-tier-decisions.md` Fork 3.

### Summary

| Gap | Classification | Severity | Where it's documented |
|---|---|---|---|
| #1 capabilityContentService | **Missing interface** (logic exists in `sessionQueue.ts`, not reachable from capability path) | **BLOCKING** — empty session cards, no real exercises | THIS doc |
| #2 per-item mastery | Interface gap (extend masteryModel) | DEGRADED — Voortgang funnel stale | analytics-tier-decisions Fork 2 |
| #3 session-end facts | Wrong data source (migrate inside existing) | DEGRADED — silent toast | analytics-tier-decisions Fork 3 |

## Lesson content quality issues (orthogonal to deep modules)

Audit done across all 9 lessons. Captured separately because these need re-running the linguist agents on the source material — not a deep-module concern, but blocks the user experience.

| Issue | Lessons affected | Action |
|---|---|---|
| Vocabulary duplication: every lesson has both `Woordenlijst` (early) AND `Woordenschat` (late) | 1–9 | Merge into one labeled section, or clarify intent (introduce vs recap) |
| Grammar over-split into 4–13 separate cards per lesson | 1–9 | Group consecutive grammar blocks visually (single card with sub-categories), or merge in staging files |
| Placeholder titles visible to users (`cloze`, `lesson snippet`, `example sentence`) | 1, 4, 5 | Re-run `catalog-lesson-sections.ts` or hand-edit staging |
| Lesson 6 missing dialogue / expressions / numbers | 6 | Re-photograph + re-OCR or hand-author |
| Lesson 9 has 4 separate vocabulary blocks | 9 | Consolidate |
| Lesson 1 structurally outlier (Uitspraak block early, Uitspraakoefening later, no Cultuur) | 1 | Restructure to match L2–L9 pattern |
| Inconsistent grammar title format (`Grammatica:` prefix sometimes) | 2, 3, 5 | Standardize |
| Dialogue block sometimes appears twice | 5, 7, 8, 9 | Verify intent — recap vs duplicate |

Suggested approach: address as a separate content-quality PR after the deep-module gaps. The data lives in `scripts/data/staging/lesson-N/lesson-page-blocks.ts`. After edits, re-run `bun scripts/sync-lesson-page-blocks-only.ts` to push to DB.

## Decisions made in this conversation (carry forward)

1. **Bug 1 — empty session cards** root-caused to missing capabilityContentService. Spec next.
2. **Bug 2 — lesson "mark as seen" button silent** was the click-gating + 2-min-timer issue. Fixed in commit `25ca8d3` (passive timer fires automatically; manual click fires immediately and independently).
3. **Bug 3 — lesson_page_blocks empty for all 9 lessons** was missing data sync. Fixed by running `scripts/sync-lesson-page-blocks-only.ts`. 170 blocks across 9 lessons now populated.
4. **Bug 4 — Lessons list page slow** was 18-round-trip fanout. Fixed by `get_lessons_overview(p_user_id)` SQL function in commit `a44e90f`. Single round trip now.
5. **Backfill of legacy → capability state declined** by user ("I don't care about my history"). Existing users start fresh on the new system. Bug 1 ("today's session empty") is therefore not a backfill concern — it was the content-rendering bug captured in this doc.
6. **UI polish ticket** kept local (`docs/plans/2026-05-01-ui-polish-ticket.md` exists in working tree, untracked). Restored from `1a87e9c` after the cleanup commit.

## Recommended next steps

In order of impact:

1. **Spec `capabilityContentService`** following the same six-pass-architect-review process as the surfacing-layer spec. Use this doc as input. The architect should verify:
   - The decision to return `ExerciseItem` directly (vs forking the contract). If forked, every per-type config blob (`clozeContext`, `clozeMcqData`, `cuedRecallData`, `contrastPairData`, `sentenceTransformationData`, `constrainedTranslationData`, `speakingData`, plus `answerVariants` and `contexts`) is faithfully reproduced.
   - Whether moving the type-specific builders out of `sessionQueue.ts` into a shared module is the right factoring, or whether the new service should call into `sessionQueue.ts` directly until q3.
   - That the 6-tier distractor cascade is preserved verbatim (no quiet downgrade to fewer tiers).
   - The five open questions in the "Open questions for the architect to pin" subsection above are each closed with a specific answer.
   - Latency budget is set with a measured baseline, not a hand-waved number.

2. **Implement the spec.** PR-1 = extract type-specific builders + `pickDistractorCascade` into shared modules (no behavior change; legacy path still works). PR-2 = the new `capabilityContentService` + tests. PR-3 = wire `ExperiencePlayer` to it; replace `CapabilityExerciseFrame` body with the dispatcher. PR-4 (q3) = delete legacy `ExerciseShell` + `reviewHandler` chain + the now-unused half of `sessionQueue.ts`.

3. **Address lesson content quality** as a separate content-tier ticket. Prioritize: vocabulary deduplication and Lesson 6 completion (most user-visible).

4. **Resume the analytics-tier work** (Fork 1 retrievability, Fork 2 per-direction mastery funnels, Fork 3 session-end facts) per `docs/plans/2026-05-01-capability-analytics-tier-decisions.md`. Spec exists in decision-log form; needs to be converted to full spec.

## References

- `docs/plans/2026-05-01-learner-progress-service-spec.md` — v6 of the surfacing-layer spec (the analytics-tier deep module). Shipped.
- `docs/plans/2026-05-01-capability-analytics-tier-decisions.md` — design decisions for the analytics-tier upgrade (Forks 1/2/3 covering the headline metric, mastery panel, session-end facts).
- `docs/plans/2026-05-01-commercialization-roadmap.md` — broader commercialization context.
- `docs/plans/2026-04-25-capability-architecture-migration-roadmap.md` — original migration roadmap.
- `docs/plans/2026-04-29-new-app-hard-cutover-implementation-plan.md` — the cutover that flipped `experiencePlayerV1` default to true.
- `docs/current-system/page-framework-status.md` — adoption snapshot of the page framework primitives.

## Files cited in the audit

Capability path:
- `src/components/experience/ExperiencePlayer.tsx`
- `src/components/experience/CapabilityExerciseFrame.tsx:54-79` (the empty-content shell)
- `src/components/experience/blocks/{DueReviewBlock,NewIntroductionBlock,RecapBlock,WarmInputBlock}.tsx`
- `src/lib/session/sessionPlan.ts`
- `src/lib/session/capabilitySessionLoader.ts`
- `src/services/capabilitySessionDataService.ts`
- `src/lib/reviews/capabilityReviewProcessor.ts`
- `src/services/capabilityReviewService.ts`

Exercise components:
- `src/components/exercises/registry.ts`
- `src/components/exercises/implementations/<Type>.tsx` (12 files)
- `src/components/exercises/ExerciseShell.tsx` (legacy consumer)

Surfacing layer (shipped):
- `src/services/learnerProgressService.ts`
- `src/services/goalService.ts`
- `src/services/progressService.ts`
- `src/services/lessonService.ts`
- `src/hooks/useProgressData.ts`

Pedagogy / scheduler:
- `src/lib/fsrs.ts`
- `src/lib/capabilities/capabilityScheduler.ts`
- `src/lib/pedagogy/sourceProgressGates.ts`
- `src/lib/pedagogy/pedagogyPlanner.ts`
- `src/services/sourceProgressService.ts`

Mastery:
- `src/lib/mastery/masteryModel.ts`

Legacy (q3-deferred):
- `src/lib/reviewHandler.ts`
- `src/services/reviewEventService.ts`
- `src/services/learnerStateService.ts` (write methods)
- `src/services/sessionSummaryService.ts`
- `src/lib/session.ts:37` (operational read)
