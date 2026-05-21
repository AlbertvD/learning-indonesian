# Agent 6: Content pipeline

**Date:** 2026-05-20
**Files reviewed:** 47 (lesson-stage, capability-stage, podcast-stage, and orchestrators)

## Files reviewed

Stage A — `scripts/lib/pipeline/lesson-stage/`:
- `index.ts`, `runner.ts`, `adapter.ts`, `model.ts`, `audio.ts`, `classifier.ts`, `stagingWriteback.ts`
- `enrichGrammarTopics.ts`, `enrichDialogueTranslations.ts`
- `validators/{grammarTopics,blockKind,payloadAudio,lessonVoices,sectionType,perItem,grammarTopics}.ts`

Stage B — `scripts/lib/pipeline/capability-stage/`:
- `index.ts`, `runner.ts`, `adapter.ts`, `loader.ts`, `model.ts`, `stagingWriteback.ts`
- `enrichPos.ts`, `enrichEnTranslations.ts`, `enrichLevel.ts`, `propagateDialogueTranslations.ts`
- `validators/{candidatePayload,perItemMeaning,grammarPattern,pos,lessonId,itemSourceRefResolvability}.ts`
- `projectors/{vocab,grammar,cloze,morphology,slugs}.ts`
- `verify/{countParity,contentNonEmpty,seedIntegrity}.ts`
- `lint/duplicateItems.ts`

Podcast-stage — `scripts/lib/pipeline/podcast-stage/podcastProjectionRules.ts`

Shared lib — `scripts/lib/{content-pipeline-output,normalize,affix,staging-utils,validate-pos,text-similarity,ssml-builder,tts-client,tts-normalize,tts-storage}.ts`

Orchestrators — `publish-approved-content.ts`, `run-lesson-stage-only.ts`, `run-capability-release-gate.ts`, `materialize-capabilities.ts`, `promote-capabilities.ts`, `triage-residual-capabilities.ts`, `check-capability-health.ts`, `check-capability-release-readiness.ts`, `dev-stage-force.ts`, `asr-quality-gate.ts`, `generate-spoken-variants.ts`, `spoken-variant-generator/`

Test surfaces — entire `__tests__/` trees under both stage modules + `scripts/lib/__tests__/`.

## Findings

### F6-1: CS8 (contentNonEmpty) silently skips two of its declared checks
- **Severity:** blocker
- **Category:** bug
- **Evidence:**
  - `scripts/lib/pipeline/capability-stage/runner.ts:562-568` — runner invokes `runContentNonEmpty(supabase, { contentUnitIds, capabilityIds, capabilityArtifactIds: [], learningItemIds: publishedItemIds, exerciseVariantIds: [], grammarPatternIds: ... })` — `capabilityArtifactIds` and `exerciseVariantIds` are hardcoded empty arrays.
  - `scripts/lib/pipeline/capability-stage/verify/contentNonEmpty.ts:117-129` — `if (input.capabilityArtifactIds.length > 0) {...}` and `:149-161` — `if (input.exerciseVariantIds.length > 0) {...}`. Both `for`-loops never execute, so `capability_artifacts` (`artifact_kind/artifact_ref/artifact_json`) and `exercise_variants` (`payload_json/answer_key_json`) are NEVER checked for non-emptiness.
  - The contract documented at `contentNonEmpty.ts:8-17` advertises both checks ("capability_artifacts artifact_kind, artifact_ref non-empty + artifact_json != {}" and "exercise_variants payload_json + answer_key_json not {}").
- **Recommendation:** Pipe the upserted IDs through. For `capability_artifacts`, refactor `upsertCapabilityArtifacts` (adapter.ts:204) to return inserted IDs and pass them in. For `exercise_variants`, similarly thread IDs from `insertExerciseVariantGrammar`/`insertExerciseVariantVocab` returns. Without this, the CS8 gate is decoratively present but operationally dead for two of the five tables it claims to cover.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F6-2: Dead projector — `projectors/morphology.ts` has no production caller
- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `scripts/lib/pipeline/capability-stage/projectors/morphology.ts:20-32` exports `MORPHOLOGY_PATTERN_SLUGS` and `lessonIntroducesMorphology()`. The header comment says "Decision 3 stamps `learning_capabilities.lesson_id` on every morphology row at publish time" and "The hardcoded slug set below (fold §11 #1) gates whether the stamping applies".
  - `grep -rn "lessonIntroducesMorphology\|MORPHOLOGY_PATTERN_SLUGS"` shows ONLY `__tests__/projectors/morphology.test.ts` consuming it — no production caller in `runner.ts` or anywhere else.
  - The runner already stamps `lessonId` unconditionally for every staged capability at `runner.ts:383` (`lessonId: input.lessonId`) and `validateLessonIdPresence` (line 399) defends the invariant. The morphology gate is redundant since Decision 3b (ADR 0006) extended `lesson_id` to ALL non-podcast caps.
- **Recommendation:** Delete `projectors/morphology.ts` and its test, OR add a one-paragraph note in the file explaining it's preserved for documentation / future re-introduction. Right now the file misleadingly suggests a per-lesson gate that no longer exists.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F6-3: Duplicate symbol `writeLessonWithEnrichedSections` in capability-stage/stagingWriteback.ts
- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `scripts/lib/pipeline/capability-stage/stagingWriteback.ts:128-136` defines `writeLessonWithEnrichedSections(stagingDir, lesson)`.
  - `grep -rn "writeLessonWithEnrichedSections"` returns only the lesson-stage definition (`lesson-stage/stagingWriteback.ts:14`) and its caller (`lesson-stage/runner.ts:149`). The capability-stage copy has no caller.
  - It's also wrong-stage: lesson.ts is Stage A's territory; Stage B should never write it.
- **Recommendation:** Delete capability-stage's copy.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F6-4: GT7 gate is declared in the type union but no validator emits it
- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `scripts/lib/pipeline/lesson-stage/model.ts:36` — `gate: 'GT1' | 'GT2' | 'GT3' | 'GT4' | 'GT5' | 'GT6' | 'GT7'`.
  - `grep -rn "gate: 'GT7'" scripts/` finds zero emitters — neither `validators/lessonAudio.ts` (doesn't exist) nor anything else writes `GT7`.
  - `runner.ts:158` says explicitly "GT7 (grammar pattern shape) remains in capability-stage (CS6)" — the gate was MOVED but the type union wasn't pruned.
- **Recommendation:** Drop `'GT7'` from the union in `lesson-stage/model.ts:36`.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F6-5: CS1 gate listed in `CAPABILITY_GATES` but never emitted
- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `scripts/lib/pipeline/capability-stage/model.ts:9` — `'CS1', // grammar topics (moved from lesson-stage GT1)` — listed in the gate enum.
  - `grep -rn "'CS1'" scripts/` returns ONLY the model.ts declaration. The comment in `runner.ts:74-79` confirms "CS1 (grammar_topics) moved back to lesson-stage (GT1)".
- **Recommendation:** Remove `'CS1'` from `CAPABILITY_GATES` (line 9) so consumers can't generate the type for an unreachable gate.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F6-6: Spec-vs-code drift — `docs/process/content-pipeline.md` claims GT7 = "lessonAudio"
- **Severity:** cleanup
- **Category:** spec-drift
- **Evidence:**
  - `docs/process/content-pipeline.md:85` says "Validate (GT1–GT7, `validators/`):" and `:92` lists "GT7 `lessonAudio` — top-level lesson audio config is sane."
  - In the code there is NO `lessonAudio.ts` validator file (`ls scripts/lib/pipeline/lesson-stage/validators/`), and per F6-4 no validator emits `GT7`. The frontmatter says `last_verified_against_code: 2026-05-14`.
- **Recommendation:** Either implement the lessonAudio validator or remove the claim from the doc. CLAUDE.md elevates spec drift as a code regression; this is exactly the failure mode the rule guards against.
- **Estimated effort:** trivial
- **Cross-slice dependency:** agent-9 (docs)

### F6-7: Bypassed barrel — `lint-staging.ts` imports stage-internal lint helper
- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** bypassed-barrel
- **Evidence:**
  - `scripts/lint-staging.ts:40` — `import { findDuplicateItems } from './lib/pipeline/capability-stage/lint/duplicateItems'`.
  - `scripts/lib/pipeline/capability-stage/index.ts:11-20` exports only `runCapabilityStage`, types, and `buildLintStagingCommand`. No re-export of `findDuplicateItems`.
- **Recommendation:** Re-export `findDuplicateItems` from `capability-stage/index.ts` so consumers go through the barrel. The lint helper is part of the stage's public surface even if `runCapabilityStage` does not call it directly.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F6-8: Pipeline → top-level-script inverse import
- **Severity:** cleanup
- **Category:** architecture-violation
- **Subtype:** bypassed-barrel
- **Evidence:**
  - `scripts/lib/pipeline/capability-stage/runner.ts:108` — `import { loadPromotionPlan, applyPromotionPlan } from '../../../promote-capabilities'`.
  - `promote-capabilities.ts` is a top-level CLI script under `scripts/`, not a library module. Treating the pipeline as a library and a top-level script as a dependency inverts the usual dependency direction (CLIs depend on libs, not the other way around).
- **Recommendation:** Lift the promotion logic into `scripts/lib/pipeline/capability-stage/promote.ts` (or `scripts/lib/capabilities/promotion.ts` shared with the CLI). Keep `scripts/promote-capabilities.ts` as a thin CLI wrapper. Mirrors how the lint command is wrapped (`buildLintStagingCommand` in capability-stage/index.ts).
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F6-9: `validateCandidatePayload` validates ALL candidates, not just published ones
- **Severity:** cleanup
- **Category:** bug
- **Evidence:**
  - `scripts/lib/pipeline/capability-stage/runner.ts:291` — `findings.push(...validateCandidatePayload(staging.candidates as Array<{...}>))` — passes the whole `staging.candidates` list.
  - `scripts/lib/pipeline/capability-stage/projectors/grammar.ts:71-73` — only `'pending_review' | 'approved'` candidates are projected, so a rejected/published candidate that fails CS3 fails the entire publish even though it would never be written. The validator function (validators/candidatePayload.ts:40-82) has no review_status filter.
- **Recommendation:** Filter to `'pending_review' | 'approved'` candidates before calling the validator (match the projector's filter). Otherwise an old rejected candidate with a now-deprecated `exercise_type` blocks future publishes for unrelated reasons.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F6-10: `staging-utils.readStagingFile` returns `Promise<any>` (type hole)
- **Severity:** cleanup
- **Category:** type-hole
- **Evidence:**
  - `scripts/lib/staging-utils.ts:46-51` — `export async function readStagingFile(filePath: string): Promise<any>` and `return values.length > 0 ? values[0] : null`.
  - All callers (`build-sections.ts`, `generate-exercises.ts`, etc.) get `any` propagated into their staging-file logic.
- **Recommendation:** Make it generic: `export async function readStagingFile<T>(filePath: string): Promise<T | null>`. Mirrors `capability-stage/loader.ts:143-149` which already does the right thing.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F6-11: `scripts/lib/ssml-builder.ts` duplicates inline copy in `generate-section-audio.ts`
- **Severity:** cleanup
- **Category:** duplication
- **Evidence:**
  - `scripts/lib/ssml-builder.ts:36-64` `buildSSML(lines, variant, speed)` and `:73-97` `generateSrt(lines, speed, durationPerLineMs)` — exported library version.
  - `scripts/generate-section-audio.ts:247-272` defines `buildSSML(lines, variant, speed)` inline (identical body), `:287-309` `generateSrt(lines, speed)` (same shape minus the optional `durationPerLineMs`), `:274-281` defines `escapeXml` again.
  - Tests at `src/__tests__/ssmlBuilder.test.ts` cover the library version only. The script's inline copy is untested.
- **Recommendation:** Delete the inline copies from `generate-section-audio.ts` and import from `./lib/ssml-builder`.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F6-12: Levenshtein implementation duplicated 3× across pipeline-owned files
- **Severity:** cleanup
- **Category:** duplication
- **Evidence:**
  - `scripts/asr-quality-gate.ts:142` — `export function levenshteinDistance(a: string, b: string): number`.
  - `scripts/lib/text-similarity.ts:31` — same name, same algorithm.
  - `scripts/lib/pipeline/capability-stage/validators/itemSourceRefResolvability.ts:43` — `function levenshtein(a: string, b: string): number` (slightly different style, same algorithm).
  - `src/lib/answerNormalization.ts:22` also defines a fourth copy (outside the agent slice but referenced for completeness).
- **Recommendation:** Consolidate on `scripts/lib/text-similarity.levenshteinDistance` (already exported and tested). The validator's `closestSlug` belongs in the same library helper. Reduces 3 implementations to 1.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F6-13: Audio-budget exception text references `audioBudget.maxNewSyntheses` field user doesn't see
- **Severity:** nice-to-have
- **Category:** error-handling
- **Evidence:**
  - `scripts/lib/pipeline/lesson-stage/audio.ts:104-108` — throws "Audio budget exceeded: lesson ${lessonId} would synthesise ${toGenerate.length} clips but the budget is ${audioBudget}. Raise audioBudget.maxNewSyntheses or split the lesson."
  - The `LessonStageInput` exposes `audioBudget?: { maxNewSyntheses: number }` (`lesson-stage/model.ts:19`) but `publish-approved-content.ts` (the canonical CLI) never sets it — it defaults to 500 via `runner.ts:235`. So the user-facing message points at a config knob with no CLI flag to actually raise it.
- **Recommendation:** Either expose a `--audio-budget <n>` CLI flag in `publish-approved-content.ts` or change the message to "rerun manually or split the lesson" so the user is not chasing a config they can't reach.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F6-14: `runner.ts:296` no `validation_failed` short-circuit after lint/`validateItemSourceRefResolvability` throws
- **Severity:** nice-to-have
- **Category:** inconsistency
- **Evidence:**
  - `scripts/lib/pipeline/capability-stage/runner.ts:399, :404-407` — `validateLessonIdPresence(allCapabilities)` and `validateItemSourceRefResolvability(...)` THROW synchronously instead of pushing findings.
  - The rest of the pre-write validators (CS3/CS4/CS5/CS6) push findings to the array and short-circuit cleanly at `runner.ts:296-303` with `status: 'validation_failed'`.
  - Result: a Decision 3b violation aborts with `throw new Error('[lessonId validator] ...')` (validators/lessonId.ts:26-30) instead of emitting `status: 'validation_failed'` with a structured finding the caller can inspect.
- **Recommendation:** Convert both validators to the same `findings.push(...)` shape, or document why these two are uniquely fatal. Inconsistent error channels make the `CapabilityStageOutput.findings` contract leaky.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F6-15: Test gap — no colocated tests for capability-stage projectors/grammar.ts and projectors/cloze.ts
- **Severity:** cleanup
- **Category:** test-gap
- **Evidence:**
  - `scripts/lib/pipeline/capability-stage/projectors/grammar.ts` (`projectGrammar`, 109 lines, GRAMMAR_EXERCISE_TYPES routing rule, vocab fallback over three field names) — no `__tests__/projectors/grammar.test.ts`.
  - `scripts/lib/pipeline/capability-stage/projectors/cloze.ts` (`projectCloze`) — no `__tests__/projectors/cloze.test.ts`.
  - Other projectors (`vocab.ts`, `slugs.ts`, `morphology.ts`) DO have colocated tests, so the convention is established.
- **Recommendation:** Add minimal tests for both. `projectGrammar` is especially worth covering — three different `sourceText` field name fallbacks at lines 89-95 are a clear regression risk.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F6-16: Test gap — no colocated tests for capability-stage validators (candidatePayload, perItemMeaning, pos)
- **Severity:** cleanup
- **Category:** test-gap
- **Evidence:**
  - `validators/candidatePayload.ts` (CS3) — no test file.
  - `validators/perItemMeaning.ts` (CS4) — no test file.
  - `validators/pos.ts` (CS5) — no test file (validate-pos.ts itself has no test either).
  - `validators/lessonId.ts` — no dedicated test (covered tangentially via `__tests__/projectors/lessonId.test.ts`).
  - `grammarPattern.ts` (CS6) and `itemSourceRefResolvability.ts` DO have tests, so the convention is established here too.
- **Recommendation:** Add unit tests. Validators are pure functions; tests are cheap and load-bearing for the publish gate.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F6-17: Test gap — enrichers and adapter have no colocated tests
- **Severity:** cleanup
- **Category:** test-gap
- **Evidence:**
  - `capability-stage/enrichPos.ts`, `enrichEnTranslations.ts` (LLM-driven) — no tests. Pure functions like `enrichLevel.ts` also lack a test.
  - `capability-stage/adapter.ts` — every DB write goes through it; no test. (`lesson-stage/adapter.ts` has a test.)
  - `capability-stage/loader.ts`, `capability-stage/stagingWriteback.ts` — no tests.
- **Recommendation:** At minimum add tests for `enrichLevel` (pure, deterministic) and `loader.loadLessonForDryRun`. LLM-driven enrichers can mock the Anthropic client as `runner.test.ts` already does.
- **Estimated effort:** medium
- **Cross-slice dependency:** null

### F6-18: `runner.ts` has 11 `as never` casts hiding type drift between stage seams
- **Severity:** cleanup
- **Category:** type-hole
- **Evidence:**
  - `scripts/lib/pipeline/capability-stage/runner.ts:324-333` — `learningItems: staging.learningItems as never`, `clozeContexts: staging.clozeContexts as never`, `grammarPatterns: staging.grammarPatterns as never`, `candidates: staging.candidates as never`, `clozeContexts: staging.clozeContexts as never` (twice).
  - `loader.ts` types every staging file as `Array<Record<string, unknown>>` (lines 53-61). The runner widens to `as never` because the loader's loose shape doesn't match the projector input types.
- **Recommendation:** Tighten `LoadedStaging` to use the projector input types directly (`VocabStagingItem[]`, `VocabStagingClozeContext[]`, `GrammarStagingPattern[]`, etc.). Eliminates the `as never` casts and gives the loader real validation of staging-file shapes.
- **Estimated effort:** medium
- **Cross-slice dependency:** null

### F6-19: `audio.ts` dedup duplicates `fetchExistingAudioClips` (in adapter.ts) inline
- **Severity:** nice-to-have
- **Category:** duplication
- **Evidence:**
  - `scripts/lib/pipeline/lesson-stage/adapter.ts:156-175` — `fetchExistingAudioClips(supabase, pairs)` builds a `Set<"${normalized_text}|${voice_id}">` via the `get_audio_clips` RPC, "exposed here for direct access from the runner / tests".
  - `scripts/lib/pipeline/lesson-stage/audio.ts:82-92` — inlines the exact same query against `get_audio_clips` and builds the same set rather than calling `fetchExistingAudioClips`.
- **Recommendation:** Have `audio.ts:82-92` call `fetchExistingAudioClips`. Removes 10 lines of duplication and keeps the RPC call in one place.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F6-20: `findLearningItemBySlug` ilike-prefix fallback can return wrong item
- **Severity:** nice-to-have
- **Category:** bug
- **Evidence:**
  - `scripts/lib/pipeline/capability-stage/adapter.ts:441-454` — when no exact `normalized_text` match exists, falls back to `ilike(normalized_text, '${prefix}%').limit(1).maybeSingle()`.
  - The comment example says `'beres' → 'beres (bèrès)'`, which is fine. But a 3-letter prefix like `'apa'` would match `apa`, `apakah`, `apartemen`, etc., depending on row order. No tie-break, no warning.
- **Recommendation:** Either bound the fallback to require the full slug as a word boundary (`prefix` followed by `(` / `*` / end), or log a warning when it fires so the caller can inspect ambiguous matches.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F6-21: Per-row upsert loops issue N round-trips when batch upserts would work
- **Severity:** nice-to-have
- **Category:** inefficiency
- **Evidence:**
  - `scripts/lib/pipeline/capability-stage/adapter.ts:66-86` (`upsertContentUnits` — for-loop, one upsert per unit), `:125-158` (`upsertCapabilities`), `:175-188` (`upsertCapabilityContentUnits`), `:208-225` (`upsertCapabilityArtifacts`), `:246-267` (`upsertGrammarPatterns`).
  - Same pattern in `lesson-stage/adapter.ts:96-114` (`upsertLessonSections`), `:126-148` (`upsertLessonPageBlocks`).
  - Supabase JS supports array `.upsert([row1, row2, ...])` with the same `onConflict` semantics — usually one HTTP round-trip per ~1000 rows.
- **Recommendation:** Batch the upserts. For a typical lesson (~30 items + ~10 grammar patterns + ~50 capabilities) this is ~150 round-trips → ~5. Especially noticeable when re-publishing all 9 lessons.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F6-22: `triage-residual-capabilities.ts` carries a stale `stableSlugForBaseText` copy
- **Severity:** nice-to-have
- **Category:** duplication
- **Evidence:**
  - `scripts/triage-residual-capabilities.ts:56-63` — `stableSlugForBaseText` mirrors the OLD `stableSlug` from `content-pipeline-output.ts:110-117` (the hyphenating slug).
  - But issue #59 (referenced by `validators/itemSourceRefResolvability.ts`) standardised on `itemSlug(baseText)` from `src/lib/capabilities/itemSlug.ts` — which DOES NOT hyphenate spaces. Per the comment at `content-pipeline-output.ts:140-143`, "stableSlug mangles spaces to hyphens".
  - The triage script's slug set therefore won't match learning_items written with the new slug rule. The script's "orphan" detection will misclassify multi-word items as orphans.
- **Recommendation:** Switch `triage-residual-capabilities.ts` to import `itemSlug` from the shared helper. Same source-of-truth rule as `itemSourceRefResolvability` and `duplicateItems`.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F6-23: `runner.test.ts` covers the happy path but not the staging-snapshot-regeneration writeback
- **Severity:** nice-to-have
- **Category:** test-gap
- **Evidence:**
  - `scripts/lib/pipeline/capability-stage/runner.ts:268-285` writes back four files (`content-units.ts`, `capabilities.ts`, `exercise-assets.ts`, `lesson-page-blocks.ts`) to disk on every non-dryRun.
  - The runner test (`runner.test.ts`) does not assert this behaviour. A bug where one of the writes silently fails would not be caught. The runner.ts comment at lines 220-227 acknowledges this is a critical correctness invariant.
- **Recommendation:** Add an assertion that the four files are written (or that the writeback is called exactly the expected number of times) in `runner.test.ts`.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F6-24: `ssml-builder.ts` `<prosody>` wrapper carries no `xml:lang` — TTS may mispronounce mixed content
- **Severity:** nice-to-have
- **Category:** bug
- **Evidence:**
  - `scripts/lib/ssml-builder.ts:44-46` — `parts.push(`<prosody rate="${rate}">`)` wraps everything in one prosody block. The `SpeakableLine` interface (line 8-12) supports `language: 'id' | 'nl'` but the builder never emits `<lang>` or `xml:lang="id-ID"` / `xml:lang="nl-NL"` markers.
  - Google Cloud TTS uses the voice's locale, but if a single SSML mixes Indonesian and Dutch lines (the type allows it), neither will be pronounced correctly.
- **Recommendation:** Either wrap each line in `<lang xml:lang="...">` based on `line.language`, or document that mixed-language SSML isn't supported and tighten the type to single-language batches.
- **Estimated effort:** small
- **Cross-slice dependency:** null

## Open questions for orchestrator

1. **Is `scripts/materialize-capabilities.ts` still relevant?** Its CLI is reachable (line 293) and there are tests, but no production code imports `buildMaterializationPlanFromStaging` — the publish path (`publish-approved-content.ts → runCapabilityStage`) doesn't go through it. Could be a legacy backfill tool worth retiring, or a still-needed admin escape hatch. Worth a direct call with the author.

2. **Should `triage-residual-capabilities.ts` be reflected in the doc as a "production" tool?** It does invasive DB rewrites and is part of the Decision 3b rollout. `docs/process/content-pipeline.md` doesn't mention it. If still needed, document; if shipped-and-done, archive.

3. **`runner.ts:608-636` capability-promotion try/catch swallows failures into a warning** — promotion ends with `status: 'partial'` and a CS9 finding. Is silently promoting some capabilities while leaving others draft really the desired UX? Per the comment at line 625-633, partial promotion is "non-fatal", but downstream the user gets no clear "fix this" affordance.

## Coverage notes

- Stage boundary discipline is **clean**: no Stage A code writes capability tables; no Stage B code writes `lessons`/`lesson_sections` (the duplicate `writeLessonWithEnrichedSections` in F6-3 is dead, not active).
- `quality_status: 'approved'` is consistently emitted (no drift); confirmed at `scripts/lib/content-pipeline-output.ts:502` and tests.
- Three-layer gate pattern is **followed** for the two top invariants:
  - `lesson_id` invariant: helper (validator) + DB CHECK (`migration.sql:2052`) + health check (`check-supabase-deep.ts:534-557`).
  - `itemSlug` invariant: helper (`src/lib/capabilities/itemSlug.ts` shared) + pipeline validator (`itemSourceRefResolvability.ts`) + health check (`check-supabase-deep.ts:564-609`).
- Project memory `project_pipeline_followup_bugs` says CS7 count-parity + projectVocab review_status filter are fixed on `fix/cs7-count-parity-via-junction`. Verified merged: `verify/countParity.ts:36, 64-99` carries the junction-based parity check; `projectors/vocab.ts:113-118` includes `'published'` in the approved filter. Both fixes are live on `main`.
- No `TODO/FIXME/XXX/HACK` in pipeline-owned files. No `: any` in pipeline runners or adapter (only test scaffolding and `staging-utils.ts:46`).
- Derived-file hand-edit risk is mitigated by the runner doing the regen unconditionally (`runner.ts:246-285`), but the test gap noted in F6-23 means a silent regression wouldn't be caught.
