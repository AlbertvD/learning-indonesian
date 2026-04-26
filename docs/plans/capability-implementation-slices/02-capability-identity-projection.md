# Slice 02: Capability Identity and Projection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate deterministic capability projections from current content without changing persistence or learner behavior.

**Architecture:** Add a Capability Catalog Module whose Interface hides canonical key construction, source provenance, projection versioning, source-ref normalization, and aliases.

**Tech Stack:** React 19, Vite, TypeScript, Vitest.

**Architecture References:**
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-capability-architecture-migration-roadmap.md`

---

## Scope

Projection only. No database writes. No session behavior changes.

## Files

- Create: `src/lib/capabilities/capabilityTypes.ts`
- Create: `src/lib/capabilities/capabilityCatalog.ts`
- Create: `src/lib/capabilities/canonicalKey.ts`
- Create: `src/__tests__/capabilityCatalog.test.ts`
- Create: `src/__tests__/canonicalKey.test.ts`
- Modify only if needed for shared types: `src/types/learning.ts`

## Interfaces

```ts
export const CAPABILITY_PROJECTION_VERSION = 'capability-v1'

export type CapabilitySourceKind =
  | 'item'
  | 'pattern'
  | 'dialogue_line'
  | 'podcast_segment'
  | 'podcast_phrase'
  | 'affixed_form_pair'

export interface CurrentContentSnapshot {
  learningItems: CurrentLearningItem[]
  grammarPatterns: CurrentGrammarPattern[]
  stagedLessons?: StagedLessonSnapshot[]
}

export interface SourceProgressRequirement {
  kind: 'source_progress'
  sourceRef: string
  requiredState: 'section_exposed' | 'intro_completed' | 'heard_once' | 'pattern_noticing_seen' | 'guided_practice_completed' | 'lesson_completed'
}

export type CapabilitySourceProgressRequirement =
  | SourceProgressRequirement
  | { kind: 'none'; reason: 'not_lesson_sequenced' | 'exposure_only' | 'legacy_projection' }

export interface ProjectedCapability {
  canonicalKey: string
  sourceKind: CapabilitySourceKind
  sourceRef: string
  capabilityType: CapabilityType
  skillType: SkillType
  direction: CapabilityDirection
  modality: CapabilityModality
  learnerLanguage: 'nl' | 'en' | 'none'
  requiredArtifacts: ArtifactKind[]
  requiredSourceProgress?: CapabilitySourceProgressRequirement
  prerequisiteKeys: string[]
  projectionVersion: typeof CAPABILITY_PROJECTION_VERSION
  sourceFingerprint: string
  artifactFingerprint: string
}

export interface CapabilityProjection {
  projectionVersion: string
  capabilities: ProjectedCapability[]
  aliases: CapabilityAlias[]
  diagnostics: ProjectionDiagnostic[]
}

export function projectCapabilities(input: CurrentContentSnapshot): CapabilityProjection
```

## Canonical Key Grammar

```text
cap:v1:<source_kind>:<source_ref>:<capability_type>:<direction>:<modality>:<learner_language_or_none>
```

Rules:

- Percent-encode `:` and `%` inside key segments.
- Use `learning_items/<id>` for existing DB-backed items.
- Use canonical staged lesson refs in the form `lesson-<number>/<unit_slug>` with no zero padding, matching current folders such as `scripts/data/staging/lesson-1`.
- Normalize source lesson inputs before key generation: `lesson-01`, `Lesson 1`, `lesson_1`, and folder name `lesson-1` all become `lesson-1`.
- Same input and projection version must produce the same key order and diff.
- Source refs are part of identity. Changing normalization is a breaking projection-version change unless aliases are emitted.
- Only lesson-sequenced capabilities must declare a concrete source-progress gate. Non-lesson capabilities may omit `requiredSourceProgress` or use `{ kind: 'none' }`; the Capability Catalog must not invent fake lesson gates for podcast, legacy, or exposure-only sources.

## Minimum Capability Types

- `text_recognition`
- `meaning_recall`
- `form_recall`
- `contextual_cloze`
- `audio_recognition`
- `dictation`
- one grammar/pattern recognition or contrast capability

## Test Cases

- Canonical key encoding handles `:` and `%`.
- A vocabulary item with meanings projects text, meaning, and form recall capabilities.
- Audio-bearing content projects audio recognition and dictation candidates; the Capability Contract Module decides whether approved `audio_clip` artifacts make them ready.
- A grammar pattern projects a pattern capability with learner-language explanation and typed `pattern_example` artifact requirements.
- Projection is deterministic for same input.
- `lesson-01`, `Lesson 1`, `lesson_1`, and `lesson-1` produce the same `lesson-1/<unit_slug>` source refs.
- `dialogue_line`, `podcast_segment`, `podcast_phrase`, and `affixed_form_pair` source kinds generate valid canonical keys.

## Verification

Run:

```bash
bun run test -- src/__tests__/canonicalKey.test.ts src/__tests__/capabilityCatalog.test.ts
bun run build
```

## Acceptance Criteria

- Projection can run in memory in tests.
- No existing session path imports the new module yet.
- Projection diagnostics report malformed inputs instead of throwing for normal content gaps.
- Rerunning projection against `scripts/data/staging/lesson-1` produces stable keys.

## Out Of Scope

- Readiness validation.
- DB persistence.
- FSRS state migration.
- UI changes.
