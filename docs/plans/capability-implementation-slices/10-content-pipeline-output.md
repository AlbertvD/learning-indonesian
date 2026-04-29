# Slice 10: Content Pipeline Capability Output and Lesson Blocks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make new or regenerated lesson staging publish content units, capability metadata, contract data, and lesson page blocks.

**Architecture:** Extend the pipeline so source material produces content units, lesson page blocks, capabilities, artifacts, validation reports, and publish payloads.

**Tech Stack:** TypeScript scripts, staging files under `scripts/data/staging`, Vitest.

**Architecture References:**
- `docs/plans/2026-04-25-capability-content-pipeline-and-exercises.md`
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`

---

## Scope

Pipeline/staging only for one lesson first. Existing lessons continue through projection.

## Files

- Create source-of-truth migration SQL: `scripts/migrations/2026-04-25-content-units-lesson-blocks.sql`
- Modify: `scripts/generate-staging-files.ts` to support `--dry-run` after the lesson number.
- Modify: `scripts/lint-staging.ts`
- Modify: `scripts/publish-approved-content.ts`
- Create or generate per lesson: `scripts/data/staging/lesson-N/content-units.ts`
- Create or generate per lesson: `scripts/data/staging/lesson-N/capabilities.ts`
- Create or generate per lesson: `scripts/data/staging/lesson-N/lesson-page-blocks.ts`
- Create or generate per lesson: `scripts/data/staging/lesson-N/exercise-assets.ts`
- Create: `scripts/__tests__/content-units-staging.test.ts`
- Create: `scripts/__tests__/capability-staging.test.ts`
- Create: `scripts/__tests__/lesson-page-blocks.test.ts`

## Staging Additions

```text
content-units.ts
lesson-page-blocks.ts
capabilities.ts
exercise-assets.ts
publish-report.json
```

`content-units.ts` is the source-to-learning bridge. It owns stable unit ids, source refs, section refs, ordering, and relationships needed by lesson page blocks and capability projection.

## Persistence Prerequisite

This slice owns the missing persistence needed by the publish order. Add the following schema-qualified tables before publishing lesson page blocks:

`indonesian.content_units`:

```text
id uuid primary key
source_ref text not null
source_section_ref text not null
unit_kind text not null
unit_slug text not null
display_order integer not null
payload_json jsonb not null default '{}'
source_fingerprint text not null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique(source_ref, source_section_ref, unit_slug)
```

`indonesian.lesson_page_blocks`:

```text
id uuid primary key
block_key text not null unique
source_ref text not null
source_refs text[] not null default '{}'
content_unit_slugs text[] not null default '{}'
block_kind text not null
display_order integer not null
payload_json jsonb not null default '{}'
source_progress_event text
capability_key_refs text[] not null default '{}'
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique(source_ref, block_key)
```

`indonesian.capability_content_units`:

```text
id uuid primary key
capability_id uuid not null references indonesian.learning_capabilities(id)
content_unit_id uuid not null references indonesian.content_units(id)
relationship_kind text not null check relationship_kind in ('introduced_by','practiced_by','assessed_by','referenced_by')
created_at timestamptz not null default now()
unique(capability_id, content_unit_id, relationship_kind)
```

Rules:

- Use the same `indonesian` schema, RLS/grant, and rollback conventions as Slice 05.
- Content unit and lesson block tables are catalog/content tables: authenticated learners may read published content but may not write it.
- Lesson page blocks have independent stable identity. They may reference zero, one, or many content units through `content_unit_slugs`; structural blocks such as hero, goals, and recap must not be forced to attach to one content unit.
- Capability-to-content-unit relationships are stored durably in `indonesian.capability_content_units`; later mastery reads must not infer this relationship from loose source-ref string matching.
- If implementation chooses to map blocks to existing backing records instead of these tables, it must update this slice with the exact table/column mapping before code is written.

## Publish Order

1. Validate source metadata.
2. Validate `content-units.ts` and stable source/section refs.
3. Validate lesson page blocks against content units.
4. Validate canonical keys and capability plan.
5. Validate fact/media artifacts.
6. Validate final capability contracts.
7. Upsert content units.
8. Upsert lesson page block payloads or their backing content records.
9. Upsert capabilities by canonical key.
10. Upsert capability-to-content-unit relationships.
11. Upsert fact and media artifacts.
12. Upsert authored exercise assets.
13. Upsert exercise-asset artifact links.
14. Mark publish state.
15. Run post-publish health audit.

## Lesson Page Block Rules

- Blocks preserve source references.
- Blocks emit source progress events.
- Blocks may reference capability keys for practice bridges.
- Blocks do not activate capabilities.
- Blocks derive their section refs from `content-units.ts`, not ad hoc strings.

## Verification

Run:

```bash
bun run test -- scripts/__tests__/content-units-staging.test.ts scripts/__tests__/capability-staging.test.ts scripts/__tests__/lesson-page-blocks.test.ts
bun scripts/generate-staging-files.ts 1 --dry-run
bun scripts/lint-staging.ts --lesson 1
bun scripts/publish-approved-content.ts 1 --dry-run
bun scripts/check-capability-health.ts
bun run build
```

`generate-staging-files.ts 1 --dry-run` is part of this slice: implement it to validate inputs and print planned generated files without writing.

## Acceptance Criteria

- One lesson produces `content-units.ts`, capability metadata, and lesson page blocks.
- `indonesian.content_units` and `indonesian.lesson_page_blocks` exist, or this spec names the exact existing backing records used instead.
- `indonesian.capability_content_units` exists and links capabilities to content units for Slice 11 mastery reads.
- Publish blocks schedulable-but-unrenderable capabilities.
- Existing lessons still work through projection.
- Source refs and section refs stay stable across regeneration.

## Out Of Scope

- Full drag-and-drop lesson authoring UI.
- Capability session cutover.
- Lesson Reader implementation.
