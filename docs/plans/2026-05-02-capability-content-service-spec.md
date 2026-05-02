# `capabilityContentService` — Spec

**Date:** 2026-05-02
**Status:** Draft v5 — round 5 of architect review loop. v4 round 4 returned APPROVE WITH NOTES; v5 closes the three minor hygiene notes (whitelist derivation, TLS / test-admin credentials, fixture arg list) so the spec ships as APPROVE.
**Source:** Closes the open questions in `docs/plans/2026-05-02-capability-content-service-and-deep-module-gaps.md` (the audit doc). This spec is implementable; the audit doc is historical/discovery context.

### Revision log

**v5 changes (architect-review round 4 → round 5, hygiene polish):**
- `VALID_SOURCE_KINDS` now derives from a new `CAPABILITY_SOURCE_KINDS as const satisfies readonly CapabilitySourceKind[]` export in `capabilityTypes.ts` (mirrors `ARTIFACT_KINDS`). When the union widens, TS flags the array — no silent `malformed` regression.
- §9.3 adds explicit PR-2 acceptance criteria: `NODE_TLS_REJECT_UNAUTHORIZED=0`, test-admin credentials in `.env.local`, idempotent seed step, fail-closed Makefile target.
- §13.4 round-trip test fixture spelled out with full `buildCanonicalKey` arg list.

**v4 changes (architect-review round 3 → round 4):**
- **N-C3 — `onSkip` ↔ public prop contradiction.** Removed `onSkip` from `ExperiencePlayerProps` (§11.1). Skip is internal: `ExperiencePlayer` defines `handleSkip` privately and passes it down to block components. Block components and dispatcher signatures updated explicitly in §11.3.
- **N-I1 — dead `replace(/%3A/g, '%3A')`.** Stripped from decoder (§4.3). Decoder is now `decodeURIComponent(parts[3])` plus a sourceKind whitelist guard.
- **N-I2 — §13.4 fixture mismatch.** Replaced synthetic literal with a real `buildCanonicalKey` round-trip and an additional case where `sourceKind` is invalid → `malformed`.
- **N-I3 — view-RLS smoke test mechanism.** §9.3 now pins a new tier-3 health check `scripts/check-supabase-rls.ts` that signs in as the test user (`testuser@duin.home`) and verifies the deny path. PR-2 ships the script.
- **N-M1 — §4.3 "Defensive note" indecision.** Replaced with a single committed contract ("the decoder is the contract"). Adding `sourceKind` to `SessionBlock` is split out as a separate, optional ticket.
- **N-M2 / N-M3 — block components prop wiring.** §11.3 now declares the new `ReviewBlockProps` shape with `context`, `userLanguage`, `onSkip` explicit.

**v3 changes (architect-review round 2 → round 3):**
- **N-C1 — CHECK constraint mismatch.** Dropped the CHECK on `reason_code` entirely (§9.2). TS union is the authoritative enumeration; matches `review_events.exercise_type` precedent.
- **N-C2 — view RLS bypass.** Added `WITH (security_invoker = true)` to the view (§9.3) so the underlying RLS policy applies to the querying user. PR-2 includes a non-admin smoke test.
- **C2 (still) — prefix parser broken.** Replaced with a canonical-key decoder (§4.3) that reads `sourceKind` from `block.canonicalKeySnapshot` rather than guessing prefixes from `source_ref`. The canonical key is built by `buildCanonicalKey` and contains `sourceKind` as position 2.
- **§4.3 ↔ §6.0 contradiction.** Resolved by the canonical-key decoder — there is no longer a "kind: unknown" path from the source_ref shape; non-item kinds are typed as `CapabilitySourceKind` and routed cleanly to `unsupported_source_kind`.
- **I-1 — capability path doesn't requeue.** Stated explicitly in §11.1.
- **I-2 — ExperiencePlayer prop signature.** Pinned in §11.1.
- **I-3 — see C2 fix above.**
- **I-4 — `block_failed_db_fetch` failure mode.** Documented in §4.1 (cause: FK race or stale planner id) and §13.4 test added.
- **I-6 — cloze marker `[...]` → `___`.** Fixed in §6.2 row.
- **I-7 — §15.4 manual verification.** Replaced with §13.4 service-level test using `buildCanonicalKey` round-trip.

**v2 changes (architect-review round 1 → round 2):**
- **C1 — silent skip strands user.** §9.1 fully rewritten. Introduced `effectiveTotal` derived count that flows into both progress percentage AND `RecapBlock.totalCount` so the "Sessie afronden" gate works. Per-kind splits also corrected.
- **C2 — sourceRef parsing not specified.** New §4.3 with explicit parser. New §6.0 enumerating the 6 source kinds and pinning PR-2 scope to `kind='item'`. Two new reason codes (`unsupported_source_kind`, `sourceref_unparseable`).
- **C3 — runtime cloze_mcq dropped.** §6.2 split into authored + runtime cloze_mcq paths matching legacy `makeClozeMcq` behaviour at `sessionQueue.ts:984-1027`.
- **C4 — `audibleTexts` defined twice.** §8 rewritten: builders own per-block list via shared `audibleTextFieldsOf` helper; `collectAudibleTexts` is union-only.
- **I1 — userLanguage source.** §11.1 explicitly pins `(profile?.language ?? 'nl')` reading in the host, threaded as prop.
- **I2 — normalizedResponse parity.** §11.2 dispatcher now uses extracted `normalizeAnswerResponse` helper (lift from `ExerciseShell.tsx:116`); both paths import the same util.
- **I3 — skip-outcome semantics pinned.** §11.2 documents new `onSkip(blockId)` callback; skip advances queue without FSRS write, matching legacy.
- **I4 — content flags scope.** §10 fully rewritten to acknowledge per-user join complexity; planner-side ticket explicitly carved out as separate work.
- **I5 — audio artifact requirement.** §6.3 + §6.2 listening/dictation rows now explicitly drop the `audio_clip` artifact requirement; runtime audio resolution is via `audio_clips` table only.
- **I6 — missing reason codes.** §4.1 adds three structural failure codes.
- **I7 — PR-1 cascade extraction risks.** §7.2 + §7.4 now spell out the import-shim plan and the `export` additions on helpers.
- **I8 — RLS race tolerance.** §9.5 documents the early-session swallow.
- **I9 — payloadSnapshot size.** §9.5 adds 4 KB cap with truncation helper.
- **M1–M6 — citation cleanups.** Cascade range corrected to `:617-790`; §12.2 view-reload note added; §12.3 view-validation answered before sign-off.

---

## 1. Why this exists

The capability session engine produces a `SessionPlan` whose blocks carry only a render manifest (`ExerciseRenderPlan` at `src/lib/exercises/exerciseRenderPlan.ts:4-11`) — no actual content. Today the UI consumer (`CapabilityExerciseFrame` at `src/components/experience/CapabilityExerciseFrame.tsx:54-79`) renders the manifest's labels plus two self-rate buttons, no real exercise. Result: every capability session card shows "Tekst herkennen" + "Dit wist ik / Nog oefenen" with no Indonesian content.

The 12 capability-aware exercise components at `src/components/exercises/implementations/` already accept the right contract (`ExerciseComponentProps` at `src/components/exercises/registry.ts:45-51`). What's missing is a service that turns each `SessionBlock` into the `ExerciseItem` those components consume.

`capabilityContentService` is that service.

## 2. Scope

**In scope:**
- A read service that resolves `SessionBlock[]` → render-ready `ExerciseItem` per block.
- Distractor selection for runtime-built MCQs (recognition_mcq, cued_recall, **cloze_mcq runtime path**) — full 6-tier cascade preserved.
- Failure logging to a new event log + aggregated view.
- A small audio-text harvest helper extracted from `Session.tsx` and extended.
- Move `pickDistractorCascade` + helpers out of `sessionQueue.ts` into a dedicated module.
- **Source-kind scope:** PR-2 supports `sourceKind === 'item'` only. The other 5 source kinds (`pattern`, `dialogue_line`, `podcast_segment`, `podcast_phrase`, `affixed_form_pair`) emit a diagnostic with `reasonCode: 'unsupported_source_kind'` and the block is silent-skipped. See §6.0 for the rationale and follow-up plan.

**Out of scope:**
- Audio URL resolution (already solved by `audioService` + `SessionAudioContext` — see §6.3).
- Content flag filtering (belongs in `capabilitySessionDataService`, the planner; current scope of that change is non-trivial — see §10).
- Per-item mastery aggregation (Gap #2 in audit doc — separate spec).
- Session-end facts migration (Gap #3 in audit doc — separate spec).
- Admin dashboard UX for the resolution-issues panel (separate UI spec — this spec only delivers the events table, view, and writes).
- Deletion of the legacy `ExerciseShell` / `reviewHandler` chain (q3 follow-up; not blocked by this spec).
- Resolution of `pattern`-anchored grammar capabilities (deferred until pattern-source support lands; see §6.0).

## 3. Architecture

```
SessionPlan (already produced) ─────────────────────────────────────────┐
  blocks: SessionBlock[]                                                │
                                                                        ▼
                                                   capabilityContentService
                                                   .resolveBlocks(blocks)
                                                                        │
                       ┌── parallel reads ──────────────────────────────┤
                       │                                                │
                       ▼                                                ▼
        learning_items, item_meanings,                  capability_resolution_failure_events
        item_contexts, item_answer_variants,            (write-only, fire-and-forget)
        exercise_variants, capability_artifacts,
        same-lesson distractor pool
                       │
                       ▼
          Map<blockId, CapabilityRenderContext>
                       │
                       ▼
                ExperiencePlayer (host)
                       │
                       ▼
        collectAudibleTexts(allContexts)  ──►  fetchSessionAudioMap
                       │                              │
                       └─────────► SessionAudioProvider (existing context)
                                          │
                                          ▼
                                CapabilityExerciseFrame (rewritten)
                                          │
                                          ▼
                          resolveExerciseComponent(exerciseType)
                                          │
                                          ▼
                          One of 12 exercise components in
                          src/components/exercises/implementations/
```

## 4. Public contract

### 4.1 Types

```ts
// src/services/capabilityContentService.ts (new file)
import type { ExerciseItem, ExerciseType } from '@/types/learning'
import type { SessionBlock } from '@/lib/session/sessionPlan'

export type ResolutionReasonCode =
  // Source-ref / capability-shape problems
  | 'unsupported_source_kind'    // capability.source_kind not in PR-2's supported set
  | 'sourceref_unparseable'      // sourceRef format doesn't match expected `<kind>/<uuid>`
  | 'item_not_found'             // sourceRef parsed but DB row missing (FK race or post-delete read)
  | 'item_inactive'              // learning_item.is_active = false
  // Content-data gaps
  | 'no_active_variant'          // exerciseType needs an exercise_variants row, none active
  | 'no_meaning_in_lang'         // user language has no item_meanings row, AND no fallback row exists
  | 'malformed_cloze'            // context_type='cloze' but no [...] marker in source_text
  | 'malformed_payload'          // exercise_variants.payload_json failed schema validation
  | 'no_distractor_candidates'   // cascade returned < 3 — pool is too small
  | 'missing_required_artifact'  // renderPlan.requiredArtifacts not all present (excluding audio_clip — see §6.3)
  // Defensive
  | 'unsupported_exercise_type'  // exerciseType not in registry
  | 'block_failed_db_fetch'      // wave-1 query succeeded but returned no row for this id
                                  // (cause: FK race after a delete, or planner emitted stale id)

export interface ResolutionDiagnostic {
  reasonCode: ResolutionReasonCode
  message: string                // human-readable, for admin dashboard
  capabilityKey: string
  capabilityId: string
  exerciseType: ExerciseType
  blockId: string
  payloadSnapshot?: unknown      // small JSON snapshot for replay; capped at 4 KB serialized (§9.5)
}

export interface CapabilityRenderContext {
  blockId: string
  capabilityId: string
  exerciseItem: ExerciseItem | null   // null when resolution failed
  audibleTexts: string[]              // every Indonesian text on the card, normalized via normalizeTtsText
  diagnostic: ResolutionDiagnostic | null  // populated iff exerciseItem === null
}

export interface CapabilityContentService {
  /**
   * Resolves all blocks in a session plan to render-ready content.
   * Always returns a Map keyed by block.id covering every input block.
   * Failures are represented as { exerciseItem: null, diagnostic: {...} }.
   * Failures are written to the failure event log fire-and-forget.
   */
  resolveBlocks(
    blocks: SessionBlock[],
    options: {
      userId: string
      userLanguage: 'nl' | 'en'
      sessionId: string
    },
  ): Promise<Map<string, CapabilityRenderContext>>
}

export function createCapabilityContentService(client: SupabaseSchemaClient): CapabilityContentService
```

### 4.2 Contract guarantees

1. **Total function over input blocks.** Every input block has a key in the result map. No block is silently dropped at the service boundary. Blocks that can't be resolved have `exerciseItem: null` + diagnostic.
2. **No throws.** Resolution failures are returned, never thrown. Genuine infrastructure errors (Supabase connection drop) bubble up; that's the only way the function rejects.
3. **Side effect: failure log writes.** For every diagnostic, one row is appended to `capability_resolution_failure_events`. Fire-and-forget. Failed log writes never affect the resolution result.
4. **No mutation of input.** `SessionBlock[]` is treated as read-only.
5. **Stable ordering.** `audibleTexts` is deduplicated and sorted lexicographically per block for stable testing.

### 4.3 Source-kind decoding (canonical-key driven, not prefix parsing)

The architect's round-2 review caught that prefix-based parsing of `source_ref` is broken: `src/lib/capabilities/capabilityCatalog.ts:158,178` runs `normalizeLessonSourceRef` (`src/lib/capabilities/canonicalKey.ts:22-27`) on `pattern` and `dialogue_line` refs, producing `lesson-N/<slug>` form — no `patterns/` or `dialogue_lines/` prefix. The earlier prefix-parser would emit `sourceref_unparseable` for every grammar pattern and dialogue capability in production.

**The fix: do not parse `source_ref` for sourceKind. Read it from the canonical key snapshot already on `SessionBlock`.**

`block.canonicalKeySnapshot` is built by `buildCanonicalKey` at `src/lib/capabilities/canonicalKey.ts:29-40` as:
```
cap:v1:<sourceKind>:<encodedSourceRef>:<capabilityType>:<direction>:<modality>:<learnerLanguage>
```
where `<encodedSourceRef>` percent-encodes `:` to `%3A` (preserves `/`). Splitting on `:` yields position 2 as `sourceKind`, position 3 as the encoded sourceRef.

```ts
// src/services/capabilityContentService.internal.ts
import type { CapabilitySourceKind } from '@/lib/capabilities/capabilityTypes'
import { CAPABILITY_SOURCE_KINDS } from '@/lib/capabilities/capabilityTypes'

export type DecodedKey =
  | { kind: 'ok'; sourceKind: CapabilitySourceKind; sourceRef: string }
  | { kind: 'malformed'; raw: string }

const VALID_SOURCE_KINDS: ReadonlySet<CapabilitySourceKind> = new Set(CAPABILITY_SOURCE_KINDS)

export function decodeCanonicalKey(canonicalKeySnapshot: string): DecodedKey {
  const parts = canonicalKeySnapshot.split(':')
  if (parts.length < 4 || parts[0] !== 'cap' || parts[1] !== 'v1') {
    return { kind: 'malformed', raw: canonicalKeySnapshot }
  }
  if (!VALID_SOURCE_KINDS.has(parts[2] as CapabilitySourceKind)) {
    return { kind: 'malformed', raw: canonicalKeySnapshot }
  }
  const sourceKind = parts[2] as CapabilitySourceKind
  const sourceRef = decodeURIComponent(parts[3])  // inverse of encodeSegment at canonicalKey.ts:18-20
  return { kind: 'ok', sourceKind, sourceRef }
}
```

**`CAPABILITY_SOURCE_KINDS` is a new export added in PR-2 to `src/lib/capabilities/capabilityTypes.ts`**, mirroring the existing `ARTIFACT_KINDS` pattern at `src/lib/capabilities/artifactRegistry.ts:14`:

```ts
// src/lib/capabilities/capabilityTypes.ts (additions in PR-2)
export const CAPABILITY_SOURCE_KINDS = [
  'item', 'pattern', 'dialogue_line', 'podcast_segment', 'podcast_phrase', 'affixed_form_pair',
] as const satisfies readonly CapabilitySourceKind[]
```

The `satisfies` clause makes the array type-link to the union: when a 7th source kind is added to `CapabilitySourceKind`, TypeScript flags the array as incomplete at the catalog level, so the decoder's whitelist updates with it. Prevents the silent-`malformed` regression the architect raised.

`encodeSegment` at `src/lib/capabilities/canonicalKey.ts:18-20` only encodes `%` → `%25` and `:` → `%3A`; `decodeURIComponent` is the correct inverse. `/` is not encoded, so a sourceRef of `learning_items/abc-123-def` round-trips literally as `learning_items/abc-123-def` in position 3.

**For item resolution** (the only kind in PR-2 scope): the item id is the segment after `learning_items/` in `sourceRef`. A small `extractItemId(sourceRef)` helper handles the prefix check; on miss, returns null and the builder emits `sourceref_unparseable` with the raw ref in `payloadSnapshot`.

```ts
export function extractItemId(sourceRef: string): string | null {
  const m = /^learning_items\/(.+)$/.exec(sourceRef)
  return m ? m[1] : null
}
```

**Routing:**
- `decodeCanonicalKey` returns `kind: 'malformed'` → emit `sourceref_unparseable`.
- `decodeCanonicalKey` returns `sourceKind !== 'item'` → emit `unsupported_source_kind`. Affects pattern, dialogue_line, podcast_segment, podcast_phrase, affixed_form_pair.
- `decodeCanonicalKey` returns `sourceKind === 'item'` but `extractItemId` returns null → emit `sourceref_unparseable`.

This eliminates the §4.3 ↔ §6.0 contradiction in v2: the source-kind dispatch is now driven by the typed enum from the canonical key, not by guessing prefixes.

**The decoder is the contract.** `SessionBlock` currently has no `sourceKind` field (`src/lib/session/sessionPlan.ts:22-31`); a separate ticket can propose adding one to the planner output, but that's outside this spec's scope and not a precondition. PR-2 ships with the decoder.

## 5. Data flow

### 5.1 Tables read

All in `indonesian` schema. PostgREST exposure already in place per CLAUDE.md.

| Table | Filter | Purpose |
|---|---|---|
| `learning_items` | `id IN (...)` | Base text, item_type, level, pos, has_audio, is_active |
| `item_meanings` | `learning_item_id IN (...)` | Translations (nl/en, is_primary) |
| `item_contexts` | `learning_item_id IN (...)` | Example sentences, dialogue lines, cloze sources |
| `item_answer_variants` | `learning_item_id IN (...)` | Acceptable answers for typed_recall |
| `exercise_variants` | `(learning_item_id, context_id) IN (...) AND is_active = true` | Authored payloads for cloze_mcq, contrast_pair, sentence_transformation, constrained_translation, speaking |
| `capability_artifacts` | `capability_id IN (...) AND quality_status = 'approved'` | Verifies `requiredArtifacts` from `renderPlan` are all present |
| Distractor pool | Same-lesson `learning_items` + `item_meanings` join, filtered by `source_lesson_id = ANY(...)` via `item_contexts` | Candidate pool for `pickDistractorCascade` |

All seven queries are issued in parallel via `Promise.all`. The same-lesson distractor pool is a single query bounded by `lesson_id IN (...)` derived from the blocks' source_refs.

### 5.2 Read order — deterministic, two waves

**Wave 1 (parallel):** all seven queries above, plus `learner_capability_state` if needed for any per-type build that consults state. (Currently none of the type-specific builders need state, so this stays one wave.)

**Wave 2 (synchronous, in-memory):** for each block, run the type-specific builder. Builders never make additional DB calls.

Latency budget: spec does **not** assert a hard target. Architect to require a baseline measurement before sign-off; the implementation includes an opt-in trace log via `performance.mark` so the host page can record p50/p95.

## 6. Type-specific resolution

### 6.0 Source-kind scope

PR-2 supports `sourceKind === 'item'` only. The capability catalog enumerates 6 source kinds (`src/lib/capabilities/capabilityTypes.ts:5-12`):

| Source kind | PR-2 status | Why |
|---|---|---|
| `item` | Supported | Vocabulary + phrases — the bulk of the lesson catalog. |
| `pattern` | Unsupported (diagnostic) | Grammar-anchored exercises. Authored variants live in `exercise_variants` keyed by `grammar_pattern_id`. Resolver is structurally similar but the inputs are different. Follow-up spec. |
| `dialogue_line` | Unsupported (diagnostic) | Has its own table + scoping. Follow-up spec. |
| `podcast_segment`, `podcast_phrase` | Unsupported (diagnostic) | Podcast capabilities require timecodes and a podcast-segment renderer not in the 12 implementations. Follow-up spec. |
| `affixed_form_pair` | Unsupported (diagnostic) | Morphology capabilities. Follow-up spec. |

A block whose capability has an unsupported sourceKind returns `{ exerciseItem: null, diagnostic: { reasonCode: 'unsupported_source_kind', payloadSnapshot: { sourceKind, sourceRef } } }`. The block is silent-skipped per §9.1; the admin dashboard surfaces the diagnostic so unsupported-kind blocks are visible and prioritisable.

**Inventory before PR-2 merges:** run `SELECT source_kind, COUNT(*) FROM learning_capabilities WHERE publication_status='published' GROUP BY 1` against the homelab Supabase. If non-`item` source kinds make up >20% of published capabilities, escalate the follow-up spec ahead of this one. Documented as §15.6.

### 6.1 Builders

One builder per `ExerciseType`. Each lives at `src/lib/exercises/builders/<Type>.ts`. Each accepts:

```ts
interface BuilderInput {
  block: SessionBlock
  learningItem: LearningItem | null   // null only for grammar-anchored exercises
  meanings: ItemMeaning[]              // already filtered to userLanguage as primary, fallback to other
  contexts: ItemContext[]              // all contexts for the item
  answerVariants: ItemAnswerVariant[]  // for typed_recall
  variant: ExerciseVariant | null      // active row from exercise_variants for this (item, context, type)
  artifactsByKind: Map<ArtifactKind, CapabilityArtifact>  // approved artifacts for this capability
  distractorPool: DistractorCandidate[]  // pre-filtered to same-lesson, structurally similar
  userLanguage: 'nl' | 'en'
}
```

Each builder returns either:
```ts
type BuilderResult =
  | { kind: 'ok', exerciseItem: ExerciseItem, audibleTexts: string[] }
  | { kind: 'fail', reasonCode: ResolutionReasonCode, message: string, payloadSnapshot?: unknown }
```

### 6.2 Per-type rules

`distractor source = "runtime cascade"` means the builder calls `pickDistractorCascade(target, distractorPool, 3, targetOption)` from §7. `"authored, in payload"` means options come from `variant.payload_json` (no cascade call). Some types support both paths and try authored first, then fall back to runtime — matching legacy behaviour at `src/lib/sessionQueue.ts:984-1027` (`makeClozeMcq`).

| ExerciseType | Build inputs | Distractor source | Notable failure modes |
|---|---|---|---|
| `recognition_mcq` | learningItem + meanings + distractorPool | runtime cascade | `no_meaning_in_lang`, `no_distractor_candidates` |
| `cued_recall` | learningItem + meanings + distractorPool (option = base_text) | runtime cascade | `no_meaning_in_lang`, `no_distractor_candidates` |
| `typed_recall` | learningItem + meanings + answerVariants | N/A | `no_meaning_in_lang` |
| `meaning_recall` | learningItem + meanings | N/A | `no_meaning_in_lang` |
| `listening_mcq` | learningItem + meanings + distractorPool | runtime cascade | `no_distractor_candidates`. **No artifact requirement** — `has_audio` is advisory only; if no entry exists in `audio_clips` at runtime, the play button is hidden. See §6.3. |
| `dictation` | learningItem + answerVariants | N/A | `no_meaning_in_lang` (for instructions). **No artifact requirement**, same rationale. |
| `cloze` | learningItem + contexts (filtered to `context_type='cloze'` with `___` marker) | N/A | `malformed_cloze`, `no_meaning_in_lang` |
| `cloze_mcq` (authored) | variant.payload_json | authored, in payload | `malformed_payload` (when variant exists but payload invalid) |
| `cloze_mcq` (runtime) | learningItem + contexts (cloze) + distractorPool | runtime cascade — option = base_text | `malformed_cloze`, `no_distractor_candidates`. Tried when no active variant exists. Mirrors `makeClozeMcq` at `src/lib/sessionQueue.ts:984-1027`. |
| `contrast_pair` | variant.payload_json | authored, in payload | `no_active_variant`, `malformed_payload` |
| `sentence_transformation` | variant.payload_json | authored, in payload | `no_active_variant`, `malformed_payload` |
| `constrained_translation` | variant.payload_json | authored, in payload | `no_active_variant`, `malformed_payload` |
| `speaking` | variant.payload_json or contexts | N/A | `no_active_variant` |

For grammar-anchored exercise types (`contrast_pair`, `sentence_transformation`, `constrained_translation`), `learningItem` may be null and `variant.payload_json` is the source of truth. **However, per §6.0 these are sourced from `pattern`-kind capabilities and are out of scope for PR-2.** PR-2's coverage of these types is limited to item-anchored variants where `exercise_variants.learning_item_id` is set. The legacy `makeGrammarExercise` at `src/lib/sessionQueue.ts:230-560` is the **reference for shape mapping** — the new builders mirror that switch's per-type logic but accept the new input signature.

### 6.3 Audio is not a builder concern

No builder fetches audio URLs. **`renderPlan.requiredArtifacts` may include `audio_clip` for capabilities of `capabilityType` like `audio_recognition` or `dictation`** (per `src/lib/capabilities/capabilityTypes.ts:39-61`), but this requirement is satisfied **upstream by the planner** when the capability is published, not at render time by reading `capability_artifacts`. The runtime audio path is text-keyed via `audio_clips` (`migration.sql:1210-1221`) and `SessionAudioContext` — see §8.

The service ignores `audio_clip`/`audio_segment`/`transcript_segment` artifact kinds in its `requiredArtifacts` validation. If the host page's `fetchSessionAudioMap` lookup misses a particular text, the affected exercise component degrades gracefully (play button hidden). This is the same fail-soft posture the legacy session has today.

Each builder's `audibleTexts` output is the union of every Indonesian-language text it places in the resulting `ExerciseItem`:
- `learningItem.base_text`
- `cuedRecallData.options` (all options)
- `clozeMcqData.sentence` filled (correct option substituted into blank)
- `clozeMcqData.options` (all options)
- `clozeContext.sentence` (typed cloze)
- `contrastPairData.options` (both)
- `sentenceTransformationData.sourceSentence` and `acceptableAnswers`
- `constrainedTranslationData.acceptableAnswers` and `targetSentenceWithBlank`
- `speakingData.targetPatternOrScenario`
- All `contexts[].source_text` for every context attached to the ExerciseItem

This intentionally **extends the legacy harvester** at `src/pages/Session.tsx:378-398`, which only covers a subset. See §8 for the shared helper.

## 7. Distractor cascade extraction

### 7.1 Move target

Move the cascade and supporting helpers from `src/lib/sessionQueue.ts:617-790` (helpers from `:617`, `pickDistractorCascade` from `:701`) into a new module:

```
src/lib/distractors/
  cascade.ts             — pickDistractorCascade + DistractorCandidate type
  structuralTypes.ts     — STRUCTURALLY_SIMILAR_TYPES (from sessionQueue.ts:617-622)
  options.ts             — optionComponents + sharesMeaningfulWord (from sessionQueue.ts:645-675)
  semanticGroups.ts      — moved from src/lib/semanticGroups.ts (see §7.4)
  index.ts               — barrel that re-exports the public surface
```

### 7.2 Legacy adaptation

Legacy `sessionQueue.ts` updates **two imports** (cascade + semanticGroups) to point at the new module(s). No logic change. The current local definitions are deleted. All existing tests in `sessionQueue.test.ts` keep passing unchanged. New tests are added under `src/lib/distractors/__tests__/`.

The current helpers `optionComponents` (`sessionQueue.ts:645-651`) and `sharesMeaningfulWord` (`:659`) are not currently exported. PR-1 must add `export` to them in the new module so `cascade.ts` can import them across files. (`pickDistractorCascade` itself is already exported with `@internal exported for tests`.)

### 7.3 No behavioural change

The 6-tier cascade (POS+group → POS+level → POS only → group only → level only → unfiltered), structural-similarity gating, and substring-overlap dedup all move verbatim. No tier added, removed, or reordered.

### 7.4 `semanticGroups.ts` move plan

`src/lib/semanticGroups.ts` is imported elsewhere (e.g. `src/lib/sessionQueue.ts:9` imports `getSemanticGroup`). PR-1 grep-and-list every importer and either:
- (a) update each to import from `'@/lib/distractors'` (or `'@/lib/distractors/semanticGroups'`), or
- (b) leave a 1-line re-export shim at the old path: `export { getSemanticGroup } from './distractors/semanticGroups'`.

**Decision: option (b)** for PR-1. Zero risk of missing a call site, and the shim deletes naturally during q3 cleanup. PR-1 acceptance criterion: `grep -rn "from '@/lib/semanticGroups'"` returns the same hit count before and after, and all hits compile.

## 8. Audio-text harvest helper

### 8.1 Source of truth for `audibleTexts`

Each builder is the authority on what text it places in its `ExerciseItem`. `BuilderResult.audibleTexts` from §6.1 is **the canonical list per block** — not recomputed downstream. The shared helper `collectAudibleTexts(contexts)` only takes the union across blocks.

```ts
// src/lib/session/collectAudibleTexts.ts (new file)
import type { CapabilityRenderContext } from '@/services/capabilityContentService'

/**
 * Union of audibleTexts across resolved blocks. Builders own per-block
 * harvesting (BuilderResult.audibleTexts); this helper just unions and dedups.
 */
export function collectAudibleTexts(contexts: Iterable<CapabilityRenderContext>): string[] {
  const set = new Set<string>()
  for (const ctx of contexts) {
    if (!ctx.exerciseItem) continue
    for (const t of ctx.audibleTexts) set.add(t)
  }
  return [...set]
}
```

### 8.2 Legacy parity helper

For the legacy session path (which has no `CapabilityRenderContext`, only `ExerciseItem` directly), a sibling helper recomputes from an `ExerciseItem`. Both paths share the field-list logic via a single `audibleTextFieldsOf(item)` function so coverage cannot drift:

```ts
// src/lib/session/collectAudibleTexts.ts (continued)
import type { ExerciseItem } from '@/types/learning'
import { normalizeTtsText } from '@/lib/ttsNormalize'

/**
 * Authoritative list of every Indonesian-text field on an ExerciseItem.
 * Used both by capability builders (to populate BuilderResult.audibleTexts)
 * and by the legacy harvester (so legacy gets the §6.3 extension for free).
 */
export function audibleTextFieldsOf(item: ExerciseItem): string[] {
  // Implements §6.3. Returns deduplicated, normalized texts.
}

/** Legacy entry point — replaces Session.tsx:378-398. */
export function collectAudibleTextsFromExerciseItems(items: ExerciseItem[]): string[] {
  const set = new Set<string>()
  for (const item of items) for (const t of audibleTextFieldsOf(item)) set.add(t)
  return [...set]
}
```

### 8.3 Both paths consume it

- Legacy `Session.tsx:378-398` is replaced with a call to `collectAudibleTextsFromExerciseItems(queue.map(q => q.exerciseItem))`.
- The new ExperiencePlayer host calls `collectAudibleTexts(renderContextMap.values())`.
- Capability builders compute their per-block list via `audibleTextFieldsOf(this.builtItem)` and return it as `BuilderResult.audibleTexts`. Spec invariant: every builder uses this helper — no per-builder bespoke harvesting.

### 8.4 Coverage extensions

`audibleTextFieldsOf` covers the fields in §6.3, which is a strict superset of the legacy collector. Legacy gets the extension for free. No behaviour regression possible — only new texts get added to the lookup query.

## 9. Failure handling

### 9.1 In-session behaviour — silent skip without stranding

For every block whose context has `exerciseItem === null`:
- The `CapabilityExerciseFrame` dispatcher renders nothing visible to non-admin users — `return null`.
- The block is **counted as resolved-out**, not pending. The session must complete normally for the user without manual answering of skipped blocks.

**Critical wiring (this is what made v1 broken):**

The legacy v1 spec only flagged the progress percentage at `src/components/experience/ExperiencePlayer.tsx:25`. But `RecapBlock.tsx:21,49-51` gates the "Sessie afronden" button on `answeredCount === totalCount`. With silent skips, `answeredBlocks.size` never reaches `plan.blocks.length`, so the user is **stuck on the recap screen** — they can never complete the session.

**The fix:**

`ExperiencePlayer` introduces a derived `effectiveTotal = plan.blocks.length - skippedCount`, where `skippedCount` is computed from the resolved render-context map (`Array.from(contextMap.values()).filter(c => c.exerciseItem === null).length`). This `effectiveTotal` is used:

1. As the denominator at `:25` (progress percentage).
2. As `totalCount` passed to `RecapBlock` at `:130` so the complete-gate at `RecapBlock.tsx:21` works (`answeredCount === effectiveTotal` when all renderable blocks are answered).
3. In the per-kind splits at `RecapBlock.tsx:33-35` (`{answeredDue} van {dueCount}`, `{answeredNew} van {newCount}`, `{Math.max(totalCount - answeredCount, 0)} niet aangeraakt`) — `dueCount` and `newCount` must also exclude skipped blocks of that kind.

`ExperiencePlayer` recomputes `dueCount` / `newCount` from the resolved-block subset, not from `plan.blocks`. The `kindPill` and `position` indicators on `DueReviewBlock` / `NewIntroductionBlock` already use these counts and follow the same correction.

**Spec invariant:** with all blocks resolved, all denominators equal `plan.blocks.length` (no behaviour change vs. today). With N blocks skipped, all denominators equal `plan.blocks.length - N`. Test: a plan with 3 blocks where 1 fails resolution must allow the user to answer 2 blocks and tap "Sessie afronden" to complete.

**No in-session admin overlay.** Q2 pinned silent-skip-for-everyone. Admin visibility comes via the dashboard panel (§9.4), not in-session UI.

### 9.2 New table

```sql
-- Migration: scripts/migrations/2026-05-XX-capability-resolution-failures.sql
CREATE TABLE indonesian.capability_resolution_failure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id uuid NOT NULL REFERENCES indonesian.learning_capabilities(id) ON DELETE CASCADE,
  capability_key text NOT NULL,
  reason_code text NOT NULL,
  -- No CHECK on reason_code: TS union (§4.1) is the authoritative enumeration.
  -- Adding a new code requires only a TS change; no migration needed. Mirrors
  -- the precedent in indonesian.review_events.exercise_type.
  exercise_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id uuid,                     -- not FK'd; sessions table is legacy
  block_id text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crfe_capability_reason
  ON indonesian.capability_resolution_failure_events (capability_id, reason_code);
CREATE INDEX idx_crfe_created_at
  ON indonesian.capability_resolution_failure_events (created_at DESC);

ALTER TABLE indonesian.capability_resolution_failure_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own failures (write-only)
CREATE POLICY "crfe_insert_own" ON indonesian.capability_resolution_failure_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Admin can read
CREATE POLICY "crfe_admin_read" ON indonesian.capability_resolution_failure_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

GRANT SELECT, INSERT ON indonesian.capability_resolution_failure_events TO authenticated;
```

### 9.3 Aggregated view

```sql
CREATE OR REPLACE VIEW indonesian.capability_resolution_issues
WITH (security_invoker = true) AS
SELECT
  capability_id,
  capability_key,
  reason_code,
  exercise_type,
  COUNT(*)            AS occurrence_count,
  MIN(created_at)     AS first_seen_at,
  MAX(created_at)     AS last_seen_at,
  (array_agg(user_id    ORDER BY created_at DESC))[1] AS last_user_id,
  (array_agg(session_id ORDER BY created_at DESC))[1] AS last_session_id
FROM indonesian.capability_resolution_failure_events
GROUP BY capability_id, capability_key, reason_code, exercise_type;

GRANT SELECT ON indonesian.capability_resolution_issues TO authenticated;
```

**`security_invoker = true` is required** (Postgres ≥ 15). Without it, the view runs with the owner's RLS context and bypasses `crfe_admin_read` from §9.2 — exposing aggregated diagnostics to every authenticated user. With it set, the table's RLS policy applies to the querying user, so only admins can SELECT.

**Smoke test mechanism (pinned for PR-2):**

Add a new test `scripts/check-supabase-rls.ts` that:
1. Signs in via the anon key as the test user `testuser@duin.home` / `TestUser123!` (per `reference_test_user.md` in user memory). This user is NOT in `indonesian.user_roles` with role 'admin'.
2. Inserts one row into `capability_resolution_failure_events` with the test user's `auth.uid()` (proves the per-user INSERT policy works).
3. Runs `SELECT count(*) FROM capability_resolution_failure_events` — expects 0 (admin SELECT policy denies non-admin reads).
4. Runs `SELECT count(*) FROM capability_resolution_issues` — expects 0 (security_invoker delegates to underlying table's deny).
5. Then signs in as the admin user (admin user in `user_roles`) and confirms both queries return ≥ 1.

This is a **new tier-3 health check** complementary to `check-supabase.ts` (anon-only) and `check-supabase-deep.ts` (service-role). Run it locally during PR-2 review and on every migration touching RLS-sensitive surfaces. Both Makefile target `make check-supabase-rls` and CI integration are part of PR-2.

**PR-2 implementation acceptance criteria:**
- Script sets `NODE_TLS_REJECT_UNAUTHORIZED=0` (or imports it from a shared helper) before constructing the Supabase client — required for the homelab's internal Step-CA cert per CLAUDE.md "Supabase Connection" / `publish-approved-content.ts:27` precedent.
- A test admin user (`testadmin@duin.home`) is created in this PR if not already present, with credentials stored in `.env.local` as `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`. Same pattern for `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`. CI reads from secrets, not from memory. The seed step is idempotent (skip if user exists).
- Makefile target reads credentials from env, fails closed with a clear message if any is missing.

### 9.4 Admin surface

- A dashboard panel sits inside `/admin/exercise-coverage`. Reads `capability_resolution_issues`. Click-through to raw events from `capability_resolution_failure_events`.
- **The UX of that panel (filters, columns, drilldown, mark-as-fixed flow, dismissal, export) is specced separately as a follow-up UI ticket.** This spec only delivers the data layer.

### 9.5 Logger client

```ts
// src/services/capabilityContentService.ts (private)
const PAYLOAD_SNAPSHOT_BYTE_LIMIT = 4 * 1024  // 4 KB

function trimPayloadSnapshot(snapshot: unknown): unknown {
  if (snapshot == null) return {}
  let serialized = JSON.stringify(snapshot)
  if (serialized.length <= PAYLOAD_SNAPSHOT_BYTE_LIMIT) return snapshot
  return { _truncated: true, _originalSizeBytes: serialized.length, sample: serialized.slice(0, PAYLOAD_SNAPSHOT_BYTE_LIMIT - 200) + '…' }
}

async function logResolutionFailure(diagnostic: ResolutionDiagnostic, options: { userId: string; sessionId: string }): Promise<void> {
  // Fire-and-forget. Never throws. Mirrors logError pattern from src/lib/logger.ts.
  try {
    await supabase
      .schema('indonesian')
      .from('capability_resolution_failure_events')
      .insert({
        capability_id: diagnostic.capabilityId,
        capability_key: diagnostic.capabilityKey,
        reason_code: diagnostic.reasonCode,
        exercise_type: diagnostic.exerciseType,
        user_id: options.userId,
        session_id: options.sessionId,
        block_id: diagnostic.blockId,
        payload_json: trimPayloadSnapshot(diagnostic.payloadSnapshot),
      })
  } catch {
    // Swallowed. Resolution result is unaffected.
  }
}
```

**Snapshot guards:**
- 4 KB serialized cap. Larger snapshots get replaced by a placeholder with size + truncated sample. Prevents unbounded growth under failure storms.
- **No raw user input** ever lands in `payloadSnapshot`. Only DB-sourced values (variant ids, capability ids, expected/actual artifact kinds, parsed sourceRef parts). Builders construct snapshots explicitly; no spread of caller-controlled blobs.
- **RLS race tolerance:** the table's INSERT policy (§9.2) requires `user_id = auth.uid()`. If the auth context is not yet populated (e.g. cookie not yet decoded on cold start), the insert fails RLS and is swallowed. Acceptable — early-session resolution failures may be silently uninserted. Documented here so the implementer doesn't chase ghosts.

## 10. Content flag handling

Per Q3 — **filtering belongs in the planner (`capabilitySessionDataService`), not here.** The architect raised that this is more involved than originally framed.

### 10.1 Why it's non-trivial

`indonesian.content_flags` is **per-user** — verified at `src/services/contentFlagService.ts:67` (`.eq('user_id', userId)`). A user can flag a learning item or a grammar pattern, scoped to a particular `exercise_type`. The flag table has separate keys: `learning_item_id`, `grammar_pattern_id`, `exercise_variant_id`. Mapping flags onto **capabilities** therefore requires:

1. Joining `learning_capabilities.source_ref` against `content_flags.learning_item_id` (for `sourceKind='item'`) and similar for other kinds.
2. Scoping by `auth.uid()` so admin previews and other users don't accidentally inherit each other's flags.
3. Deciding what "flag" means at capability granularity: an item with one `exercise_type='recognition_mcq'` flag should suppress only recognition_mcq-anchored capabilities for that item, not all capabilities for that item — otherwise a single flag cascades into hiding the whole word.

### 10.2 Decision for this spec

- **`capabilityContentService` does not call `contentFlagService`.** No flag-based reason code in §4.1. If a flagged block reaches `resolveBlocks`, it resolves normally.
- **Adding the filter to `capabilitySessionDataService` is its own ticket**, not folded into PR-2 of this work. The planner change requires:
  - A new join in the plan-construction query, scoped by user.
  - A decision on which flag types map to which capability types (item-flag → item-anchored capabilities; pattern-flag → pattern-anchored capabilities).
  - Tests that cover the per-user scoping (admin's flag does not affect learner's session).
- **Until that ticket lands**, flagged content surfaces in capability sessions. This is a known minor regression vs. legacy session quality (legacy `Session.tsx` invokes the `contentFlagService` filter via runtime checks). Documented as a known limitation in the audit doc; expected to ship within the same release window as PR-3.

### 10.3 Spec note for the planner ticket

When the planner ticket is written, it should match this spec's failure-policy posture: a flagged capability becomes a planner-level diagnostic (`SessionDiagnostic` at `src/lib/session/sessionPlan.ts:33-37`) with `severity: 'warn'` and `reason: 'content_flagged'`, never reaches the block list, and never enters our `resolveBlocks`. No new schema needed — `SessionDiagnostic` already exists.

## 11. Integration points

### 11.1 ExperiencePlayer wiring

**New `ExperiencePlayer` prop signature (PR-3):**

```ts
interface ExperiencePlayerProps {
  plan: SessionPlan
  contexts: Map<string, CapabilityRenderContext>   // keyed by block.id; one entry per plan.blocks
  audioMap: SessionAudioMap                        // already populated by host before mount
  userLanguage: 'en' | 'nl'                        // from (profile?.language ?? 'nl'), see Session.tsx:654
  onAnswer: (event: SessionAnswerEvent) => Promise<void>
  onComplete: () => void
}
```

The host owns the data fetches; ExperiencePlayer is purely presentational. **Skip handling is internal to ExperiencePlayer** (see §11.2) — the host has no involvement and `onSkip` is NOT a public prop.

Responsibilities:
1. Wrap children in `<SessionAudioProvider audioMap={audioMap}>`.
2. Pass each block's `context` (looked up by `block.id`) down to `CapabilityExerciseFrame` via the block components.
3. Compute `effectiveTotal`, `effectiveDueCount`, `effectiveNewCount` locally from `contexts` (see §9.1).
4. Forward `userLanguage` as a prop into the dispatcher.
5. Maintain an internal `handleSkip(blockId)` handler that adds `blockId` to `answeredBlocks` without invoking `props.onAnswer`. Threaded down to `CapabilityExerciseFrame` via the block components as the `onSkip` prop (§11.3).

**`userLanguage` source (pinned):** `(profile?.language ?? 'nl') as 'en' | 'nl'`, matching `src/pages/Session.tsx:654`. The host fetches it once and threads it through; ExperiencePlayer does not call into the auth store directly.

**No requeue on the capability path.** Legacy `Session.tsx:429-435` requeues wrong-answer items into the running queue at `currentIndex + REQUEUE_OFFSET`. ExperiencePlayer at `:55` only adds to `answeredBlocks`; there is no requeue logic and PR-3 does not introduce one. `effectiveTotal` is therefore stable for the lifetime of the session and equals `plan.blocks.length - skippedCount`.

**Decision: `resolveBlocks` is called by the host page, not ExperiencePlayer.**

The host page (`Session.tsx`) fetches render contexts on the capability branch and passes the resolved Map to ExperiencePlayer as a prop. ExperiencePlayer becomes purely presentational — no async work in its body, no useEffect for content fetching. The audio map fetch already happens in the host (`Session.tsx:400`); resolution joins it as a sibling Promise in the same loading phase.

**Race-condition handling:** if `capabilityPlan` changes mid-fetch (re-init, unmount), the host's existing `useEffect` cleanup pattern + AbortController guards apply. ExperiencePlayer mounting with a stale Map is impossible because the host gates on completion.

**Loading state:** while `resolveBlocks` and `fetchSessionAudioMap` are in flight, the host renders the same spinner it currently shows for `loading === true`. ExperiencePlayer never mounts with partial data. The two fetches run in parallel; the gate is `Promise.all([resolveBlocks, fetchSessionAudioMap])`.

### 11.2 CapabilityExerciseFrame rewrite

The current 80-line `CapabilityExerciseFrame.tsx:1-80` (label + self-rate buttons) becomes a thin dispatcher.

**Skip semantics — pinned (architect-review round 2):**

`AnswerOutcome` from `src/components/exercises/registry.ts:35-37` is a discriminated union with `{skipped: true, reviewRecorded: false}` as one branch. Legacy `ExerciseShell` advances the queue without writing FSRS state on skip — see legacy `handleExerciseSkipped` flow at `src/pages/Session.tsx:448-450`. The new dispatcher mirrors this behaviour: skip advances the block, no `AnswerReport` is sent (so no `learner_capability_state` write), and the block is added to `answeredBlocks` so progress + completion advance.

**Skip is internal to ExperiencePlayer** — not exposed in the public prop surface. `ExperiencePlayer` defines a private `handleSkip(blockId)` that calls `setAnsweredBlocks(s => new Set(s).add(blockId))` and threads it down to the block components and dispatcher as `onSkip`. The host (`Session.tsx`) is unaware skip exists.

**Response normalization — pinned:**

Legacy `ExerciseShell.tsx:116` normalizes via `rawResponse?.toLowerCase().trim() ?? null`. The new dispatcher uses the same `normalizeAnswerResponse` helper (extracted to `src/lib/answers/normalizeAnswerResponse.ts` — small standalone util) so both paths produce identical `AnswerReport.normalizedResponse` values. Mirroring raw is rejected as a regression.

```ts
// New CapabilityExerciseFrame.tsx — replaces the placeholder
import { Suspense } from 'react'
import { resolveExerciseComponent, exerciseSkeletonVariant, type AnswerOutcome } from '@/components/exercises/registry'
import { normalizeAnswerResponse } from '@/lib/answers/normalizeAnswerResponse'
import type { CapabilityRenderContext } from '@/services/capabilityContentService'
import type { AnswerReport } from '@/lib/reviews/capabilityReviewProcessor'
import type { SessionBlock } from '@/lib/session/sessionPlan'

interface Props {
  block: SessionBlock
  context: CapabilityRenderContext     // produced by capabilityContentService
  userLanguage: 'nl' | 'en'
  answered: boolean
  submitting: boolean
  onAnswerReport: (report: AnswerReport) => void
  onSkip: (blockId: string) => void
}

export function CapabilityExerciseFrame({ block, context, userLanguage, answered, submitting, onAnswerReport, onSkip }: Props) {
  if (!context.exerciseItem) return null   // silent skip per Q2 / §9.1
  const Component = resolveExerciseComponent(block.renderPlan.exerciseType)
  if (!Component) return null              // unsupported; already logged via diagnostic

  const handleOutcome = (outcome: AnswerOutcome) => {
    if (outcome && 'skipped' in outcome) {
      onSkip(block.id)                     // legacy parity: queue advances, no FSRS write
      return
    }
    onAnswerReport({
      wasCorrect: outcome.wasCorrect,
      hintUsed: false,                     // not surfaced by AnswerOutcome — preserved as legacy default
      isFuzzy: outcome.isFuzzy,
      rawResponse: outcome.rawResponse,
      normalizedResponse: normalizeAnswerResponse(outcome.rawResponse),
      latencyMs: outcome.latencyMs,
    })
  }

  return (
    <Suspense fallback={<ExerciseSkeleton variant={exerciseSkeletonVariant[block.renderPlan.exerciseType]} />}>
      <Component
        exerciseItem={context.exerciseItem}
        userLanguage={userLanguage}
        onAnswer={handleOutcome}
      />
    </Suspense>
  )
}
```

`normalizeAnswerResponse` is a 3-line helper (lowercase + trim + null guard) lifted out of `ExerciseShell.tsx:116`. Legacy `ExerciseShell` updates to import from the new location for parity-by-construction. PR-2 includes both files.

### 11.3 Block components pass context through

`DueReviewBlock`, `NewIntroductionBlock` (`src/components/experience/blocks/`) currently call `<CapabilityExerciseFrame block={block} ... />` with literal copy strings. They get three new props and forward them all to the dispatcher.

Updated prop interface (both blocks share this addition):

```ts
interface ReviewBlockProps {
  block: SessionBlock
  position: number
  total: number
  answered: boolean
  submitting: boolean
  context: CapabilityRenderContext     // NEW — looked up by block.id in ExperiencePlayer
  userLanguage: 'en' | 'nl'            // NEW — threaded from host through ExperiencePlayer
  onAnswerReport: (report: AnswerReport) => void
  onSkip: (blockId: string) => void    // NEW — ExperiencePlayer's internal handleSkip
}
```

The literal copy strings ("Beantwoord deze herhaling…", "Dit wist ik", "Nog oefenen") are no longer used — the real exercise UI replaces them. Block headers and meta text stay.

## 12. Supabase Requirements

### 12.1 Schema changes
- New table `indonesian.capability_resolution_failure_events` (DDL in §9.2).
- New view `indonesian.capability_resolution_issues` (DDL in §9.3).
- Migration file: `scripts/migrations/2026-05-XX-capability-resolution-failures.sql` + matching `.rollback.sql`.
- RLS policies as in §9.2.
- Grants as in §9.2.

### 12.2 homelab-configs changes
- [ ] PostgREST: **no** new schema exposure. `indonesian` is already exposed; the new table inherits.
- [ ] PostgREST schema reload: **required after migration**. New views in already-exposed schemas need a `NOTIFY pgrst, 'reload schema'` so the view becomes addressable. `make migrate` already issues this reload after running the migration script (per CLAUDE.md "Deploying content / migrations" wording — verify in PR-2 that the reload runs for view creation too).
- [ ] Kong: **no** CORS changes — no new endpoints.
- [ ] GoTrue: N/A.
- [ ] Storage: N/A — no new buckets.

### 12.3 Health check additions
- Add `capability_resolution_failure_events` to the `expectedTables` list in `scripts/check-supabase-deep.ts:40`.
- Add `capability_resolution_issues` (the view) to a similar list. **Verified before spec sign-off:** `check-supabase-deep.ts` currently iterates `expectedTables`; views are not separately validated. PR-2 adds the table to `expectedTables` (PostgREST treats views and tables uniformly through the API, so a `select count(*)` smoke test works for both). If a separate `expectedViews` list is preferred for clarity, that's a one-line addition.
- No tier-1 (`scripts/check-supabase.ts`) changes — no new public endpoints.

## 13. Test plan

### 13.1 Unit tests — type-specific builders
For each of the 12 builders under `src/lib/exercises/builders/<Type>.test.ts`:
- Happy path: minimal valid input → expected `ExerciseItem` shape.
- Each failure mode in §6.2: input missing required field → correct `reasonCode` + populated `payloadSnapshot`.
- `audibleTexts` correctness: every Indonesian string field that ends up in the ExerciseItem appears in `audibleTexts`, normalized.
- Dedup: duplicate texts collapse to single entries.
- `userLanguage` handling: `'nl'` and `'en'` produce correct meaning selection.

### 13.2 Unit tests — distractor cascade extraction
- Lift the existing `sessionQueue.test.ts` cascade tests verbatim into `src/lib/distractors/__tests__/cascade.test.ts`.
- Add one new suite asserting that the cascade can be invoked without any session queue context (proves the extraction is clean).

### 13.3 Unit tests — `collectAudibleTexts`
- Per-type tests asserting exhaustive coverage of fields in §6.3.
- Snapshot test capturing the full set of fields harvested from a representative `ExerciseItem` mosaic.

### 13.4 Service-level tests — `capabilityContentService`
Mock the Supabase client.
- Empty input → empty map.
- All blocks resolvable → all contexts populated, no diagnostics.
- Mix of resolvable + unresolvable → all blocks present in map, failures have null exerciseItem + diagnostic.
- Failure log writes are issued for every diagnostic.
- Failure log write that itself fails does not affect the resolution result.
- Wave-1 query failures (DB error on one of the seven reads) bubble up as a real exception.

**Source-kind decoder coverage (closes round-2 I-7):**
- For each of the 6 `CapabilitySourceKind` values, build a real canonical key via `buildCanonicalKey` from `src/lib/capabilities/canonicalKey.ts:29-40`, pass it to `decodeCanonicalKey`, and assert the round-trip yields the same `sourceKind` + `sourceRef`. Using real `buildCanonicalKey` outputs (not synthetic strings) catches divergence between encoder and decoder mechanically.
- `decodeCanonicalKey('garbage')` → `kind: 'malformed'`.
- `decodeCanonicalKey('cap:v1:notakind:foo:bar:baz:qux:quux')` → `kind: 'malformed'` (sourceKind not in `VALID_SOURCE_KINDS`).
- `decodeCanonicalKey(buildCanonicalKey({ sourceKind: 'item', sourceRef: 'learning_items/abc-123', capabilityType: 'text_recognition', direction: 'id_to_l1', modality: 'text', learnerLanguage: 'nl' }))` → `sourceKind === 'item'`, `sourceRef === 'learning_items/abc-123'`. `/` is unencoded by `encodeSegment` (`canonicalKey.ts:18-20`).
- `extractItemId('learning_items/abc-123')` → `'abc-123'`. `extractItemId('lesson-1/some_pattern')` → `null`.
- Block whose canonical key encodes `sourceKind === 'pattern'` produces `unsupported_source_kind` diagnostic, not `sourceref_unparseable`.

**`block_failed_db_fetch` failure mode coverage:**
- Plan contains a block whose `learning_item_id` (post-extract) does not appear in the wave-1 `learning_items` result. Service emits `block_failed_db_fetch` for that block with `payloadSnapshot: { itemId, capabilityId }`. Cause in production: row deleted between planner emission and service execution.

### 13.5 Integration tests — `ExperiencePlayer`
- Plan with 3 blocks, 2 resolve, 1 fails: the player renders 2 cards. Progress denominator is 2.
- Audio map includes texts from all 2 resolved blocks.
- `SessionAudioProvider` is present in the React tree.
- `userLanguage` from the auth profile reaches the rendered exercise component.
- Per-exercise component smoke test: each of the 12 components renders without runtime error when fed a representative `ExerciseItem`.

### 13.6 Coverage targets
- New code in `src/services/capabilityContentService.ts` and `src/lib/exercises/builders/`: ≥ 90% line coverage.
- `src/lib/distractors/`: matches existing coverage from `sessionQueue.test.ts` (no regression).

## 14. PR sequencing

Each PR must pass `bun run lint && bun run test && bun run build` before the next begins.

**PR-1 — Distractor cascade extraction.**
- Move `pickDistractorCascade` + helpers to `src/lib/distractors/`.
- Update legacy `sessionQueue.ts` import.
- Move tests to `src/lib/distractors/__tests__/`.
- **Zero behaviour change.** Legacy still works; capability path still empty (no change to `CapabilityExerciseFrame` yet).
- Acceptance: full test suite green, including legacy `sessionQueue.test.ts` (which now imports from the new home transparently).

**PR-2 — `capabilityContentService` + builders + helper + migration.**
- New module `src/services/capabilityContentService.ts`.
- 12 builders in `src/lib/exercises/builders/`.
- `src/lib/session/collectAudibleTexts.ts` (with legacy `Session.tsx:378-398` updated to call it).
- DB migration applied via `make migrate`.
- Full test suite per §13.
- Verification checkpoint: confirm `capabilitySessionDataService` excludes content-flagged capabilities. If not, add the filter in this PR.
- Acceptance: service tests green; legacy `Session.tsx` still works (now uses shared helper); capability path still empty (no UI change yet).

**PR-3 — `ExperiencePlayer` wiring + `CapabilityExerciseFrame` rewrite.**
- Host page (`Session.tsx`) calls `resolveBlocks` on the capability branch.
- `<SessionAudioProvider>` wraps `ExperiencePlayer`.
- Block components pass `context` prop through.
- `CapabilityExerciseFrame` is replaced with the dispatcher in §11.2.
- Self-rate label-only behaviour deleted.
- Progress denominator adjusted for skipped blocks (per §9.1 action item).
- Acceptance: capability sessions render real exercises end-to-end. Legacy still works (gated behind the migration flag).

**PR-4 — q3 cleanup.** *(scheduled, not blocked by this spec)*
- Delete legacy `ExerciseShell`, `reviewHandler`, `reviewEventService`, the queue-construction half of `sessionQueue.ts`, the legacy branch in `Session.tsx`.
- Capability path becomes the sole runtime.

## 15. Open verification checkpoints

Items 1, 2, 3 from v1 are now closed in-spec (§10, §11.2, §9.1 respectively). Remaining items:

1. **Latency baseline.** PR-2 review records p50/p95 of `resolveBlocks` against the homelab Supabase stack; spec doesn't pin a hard target until measured.
2. **Migration order.** The new table must exist before PR-2 service writes to it. `make migrate` is the standard path; PR-2 must include the migration or be blocked on it.
3. **PostgREST view reload.** Verify `make migrate` issues `NOTIFY pgrst, 'reload schema'` (or the equivalent) after view creation — see §12.2.
4. **`sourceRef` prefix vocabulary.** Run `SELECT DISTINCT split_part(source_ref,'/',1) FROM indonesian.learning_capabilities` on the homelab DB. Compare to the parser switch in §4.3. Adjust if any prefix differs (e.g. `pattern` may serialize as `lessons/pattern/<id>` or similar via `normalizeLessonSourceRef`). Document the actual mapping table in PR-2 source comments.
5. **Source-kind inventory.** Run `SELECT source_kind, COUNT(*) FROM learning_capabilities WHERE publication_status='published' GROUP BY 1`. If non-`item` kinds exceed 20% of published rows, escalate the pattern/dialogue/podcast follow-up spec ahead of PR-3 merge. Otherwise PR-3 can ship with the unsupported-kinds gracefully diagnostic-skipped.
6. **Audio coverage in `audio_clips`.** Inventory query: `SELECT COUNT(DISTINCT li.id) FROM learning_items li WHERE li.has_audio AND NOT EXISTS (SELECT 1 FROM audio_clips ac WHERE ac.normalized_text = li.normalized_text)`. If non-zero, those items will lose their play button on the new path the same way they would on legacy — but it's worth knowing the gap. **No spec-level blocker** since audio is fail-soft (§6.3).
7. **Confirm `capabilitySessionDataService` join surface.** Before the planner-side content-flag ticket lands, confirm the planner can be extended with a per-user join without a major restructure. If it cannot, escalate the planner-flag ticket ahead of PR-3 merge.

## 16. References

- `docs/plans/2026-05-02-capability-content-service-and-deep-module-gaps.md` — the audit doc that scoped this work.
- `docs/plans/2026-05-01-learner-progress-service-spec.md` — v6 surfacing-layer spec; same review process.
- `docs/plans/2026-05-01-capability-analytics-tier-decisions.md` — Forks 2/3 (per-item mastery, session-end facts; out of scope here).
- `docs/plans/2026-04-25-capability-architecture-migration-roadmap.md` — original migration roadmap.
- `docs/plans/2026-04-23-exercise-framework-design.md` — registry + ExerciseShell origin.
- `docs/plans/2026-04-21-session-audio-voice-resolution.md` — `audio_clips` table + RPC rationale.
- `docs/plans/2026-04-17-pos-aware-distractors-design.md` — POS taxonomy + cascade tier 0/1/2 rationale.

## 17. Appendix — file inventory

**New files:**
- `src/services/capabilityContentService.ts`
- `src/lib/exercises/builders/{RecognitionMCQ,CuedRecall,TypedRecall,MeaningRecall,ListeningMCQ,Dictation,Cloze,ClozeMcq,ContrastPair,SentenceTransformation,ConstrainedTranslation,Speaking}.ts` (12 files)
- `src/lib/exercises/builders/index.ts`
- `src/lib/exercises/builders/types.ts` (BuilderInput / BuilderResult)
- `src/lib/distractors/cascade.ts`
- `src/lib/distractors/structuralTypes.ts`
- `src/lib/distractors/options.ts`
- `src/lib/distractors/semanticGroups.ts` (moved from `src/lib/`)
- `src/lib/distractors/index.ts`
- `src/lib/session/collectAudibleTexts.ts`
- `scripts/migrations/2026-05-XX-capability-resolution-failures.sql`
- `scripts/migrations/2026-05-XX-capability-resolution-failures.rollback.sql`
- Tests for all of the above.

**Modified files:**
- `src/lib/sessionQueue.ts` — single import update for cascade; the type-specific `make*` helpers become legacy-only and remain until q3.
- `src/lib/semanticGroups.ts` — re-export shim or delete in favour of new home (decide during PR-1).
- `src/components/experience/ExperiencePlayer.tsx` — receives render contexts as prop, wraps in audio provider.
- `src/components/experience/CapabilityExerciseFrame.tsx` — full rewrite as dispatcher (§11.2).
- `src/components/experience/blocks/{DueReviewBlock,NewIntroductionBlock}.tsx` — forward `context` prop.
- `src/pages/Session.tsx` — calls `resolveBlocks` on capability branch; existing audio-collection block replaced with `collectAudibleTexts` call.
- `scripts/check-supabase-deep.ts` — add the new table to the verified list.

**Files deleted (this spec does not delete; q3 follow-up will):**
- `src/components/exercises/ExerciseShell.tsx`
- `src/lib/reviewHandler.ts`
- `src/services/reviewEventService.ts`
- The queue-construction half of `src/lib/sessionQueue.ts`
- Legacy branch in `src/pages/Session.tsx`

---

**End of v1 draft. Ready for architect review per `feedback_spec_review_loop.md`.**
