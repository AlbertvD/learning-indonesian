# Pipeline Quality Gates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add data quality gates at every step of the content creation pipeline so silent failures surface immediately as script errors rather than missing content in sessions.

**Architecture:** Each script gets pre-write validation (catch bad input before touching DB) and post-write verification (query DB to confirm data actually landed). Any mismatch exits non-zero. No new abstractions — targeted additions to existing scripts only.

**Tech Stack:** Bun, TypeScript, Supabase JS v2 (service key), `process.exit(1)` for hard failures

---

## Context: The Pipeline

```
catalog-lesson-sections.ts  →  sections-catalog.json
generate-staging-files.ts   →  lesson.ts, learning-items.ts (staging)
[linguist-creator]          →  grammar-patterns.ts, candidates.ts, cloze-contexts.ts
publish-approved-content.ts →  DB (learning_items, item_meanings, item_contexts, exercise_variants)
```

Legacy scripts (lessons 1-3): `seed-lessons.ts`, `seed-vocabulary.ts`, `seed-learning-items.ts`, `seed-cloze-contexts.ts`, `publish-grammar-candidates.ts`

---

## Task 1: `catalog-lesson-sections.ts` — validate catalog before writing

**File:** `scripts/catalog-lesson-sections.ts`

**Problem:** Claude writes sections-catalog.json with no validation. Items can have empty `dutch` or `indonesian`. Vocabulary sections can have zero items. Dialogue sections can have lines with empty speaker or text.

**Step 1: Find the insertion point**

The write is at line 449 (`fs.writeFileSync(catalogPath, ...)`). The validation function goes between line 443 and line 446 (after `(catalog as any).sourceImages = images.length`, before `fs.mkdirSync`).

**Step 2: Add `validateCatalog` function near the top of the file (before `main`)**

```typescript
function validateCatalog(catalog: SectionsCatalog): { errors: string[], warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  for (const section of catalog.sections) {
    const loc = `Section "${section.title}" (${section.type})`

    if (['vocabulary', 'expressions', 'numbers'].includes(section.type)) {
      const items = section.items ?? []
      if (items.length === 0) {
        errors.push(`${loc}: no items extracted`)
      }
      for (const item of items) {
        if (!item.indonesian?.trim()) errors.push(`${loc}: item missing indonesian text`)
        if (!item.dutch?.trim())      errors.push(`${loc}: item missing dutch translation`)
      }
    }

    if (section.type === 'dialogue') {
      const lines = section.lines ?? []
      if (lines.length === 0) {
        errors.push(`${loc}: no dialogue lines extracted`)
      }
      for (const line of lines) {
        if (!line.speaker?.trim()) errors.push(`${loc}: dialogue line missing speaker`)
        if (!line.text?.trim())    errors.push(`${loc}: dialogue line missing text`)
      }
    }

    if (section.confidence === 'low') {
      warnings.push(`${loc}: low-confidence extraction — review manually before publishing`)
    }
  }

  return { errors, warnings }
}
```

**Step 3: Call it after catalog is built, before writeFileSync (between lines 443 and 446)**

```typescript
const { errors: catalogErrors, warnings: catalogWarnings } = validateCatalog(catalog)
catalogWarnings.forEach(w => console.warn(`  ⚠️  ${w}`))
if (catalogErrors.length > 0) {
  console.error(`\n✗ Catalog validation failed — ${catalogErrors.length} error(s):`)
  catalogErrors.forEach(e => console.error(`  ✗ ${e}`))
  console.error('\nFix the extraction issues above before proceeding to generate-staging-files.ts.')
  process.exit(1)
}
console.log(`\n✓ Catalog validated (${catalog.sections.length} sections, ${catalogWarnings.length} warnings)`)
```

**Step 4: Commit**
```bash
git add scripts/catalog-lesson-sections.ts
git commit -m "feat: validate sections-catalog before writing — catch empty items, missing translations, empty dialogue lines"
```

---

## Task 2: `generate-staging-files.ts` — report dropped catalog items

**File:** `scripts/generate-staging-files.ts`

**Problem:** `generateLearningItemsTs` already filters out items with empty `indonesian` or `dutch` (line 176) but does so silently. The operator has no visibility into how many catalog items were dropped. If ALL items are dropped, the generated file is empty and downstream publish will silently seed nothing.

**Note:** `main()` is synchronous (line 248: `function main()`). All additions here must also be synchronous. Do NOT add `await` inside `main()` without also making it `async`.

**Step 1: Modify `generateLearningItemsTs` to return both the string and a quality report**

Change the function signature and return type, then return a report alongside the file content:

```typescript
interface LearningItemsReport {
  totalGenerated: number
  droppedEmptyIndonesian: number
  droppedEmptyDutch: number
  emptyEnglish: number  // expected but notable
}

function generateLearningItemsTs(catalog: SectionsCatalog): { content: string; report: LearningItemsReport } {
  const items: unknown[] = []
  const report: LearningItemsReport = {
    totalGenerated: 0,
    droppedEmptyIndonesian: 0,
    droppedEmptyDutch: 0,
    emptyEnglish: 0,
  }

  for (const section of catalog.sections) {
    if (['vocabulary', 'expressions', 'numbers'].includes(section.type) && section.items) {
      for (const item of section.items) {
        if (!item.indonesian?.trim()) { report.droppedEmptyIndonesian++; continue }
        if (!item.dutch?.trim())      { report.droppedEmptyDutch++;      continue }
        if (!item.translation_en?.trim()) report.emptyEnglish++
        items.push({
          base_text: item.indonesian.trim(),
          item_type: itemTypeFromSection(section.type as SectionType, item.indonesian),
          context_type: 'vocabulary_list',
          translation_nl: item.dutch.trim(),
          translation_en: '',
          source_page: section.source_pages[0] ?? null,
          review_status: 'pending_review',
        })
      }
    }

    if (section.type === 'dialogue' && section.lines) {
      for (const line of section.lines) {
        if (!line.text?.trim() || line.speaker === 'narrator') continue
        items.push({
          base_text: line.text.trim(),
          item_type: 'dialogue_chunk',
          context_type: 'dialogue',
          translation_nl: '',
          translation_en: '',
          source_page: section.source_pages[0] ?? null,
          review_status: 'pending_review',
        })
      }
    }
  }

  report.totalGenerated = items.length

  const content = `// Generated by generate-staging-files.ts from sections-catalog.json
// Do not edit manually — re-run generate-staging-files.ts to regenerate.
// review_status starts as 'pending_review' — items publish immediately; review happens live in the app.
export const learningItems = ${JSON.stringify(items, null, 2)}
`
  return { content, report }
}
```

**Step 2: Update the call site in `main()` and print the report**

Find the `alwaysWrite(path.join(stagingDir, 'learning-items.ts'), generateLearningItemsTs(catalog), 'learning-items.ts')` call (line 279). Replace it:

```typescript
const { content: learningItemsContent, report: itemsReport } = generateLearningItemsTs(catalog)
alwaysWrite(path.join(stagingDir, 'learning-items.ts'), learningItemsContent, 'learning-items.ts')

// Quality gate: report dropped and missing items
if (itemsReport.droppedEmptyIndonesian > 0) {
  console.warn(`  ⚠️  ${itemsReport.droppedEmptyIndonesian} catalog items dropped — missing indonesian text`)
}
if (itemsReport.droppedEmptyDutch > 0) {
  console.warn(`  ⚠️  ${itemsReport.droppedEmptyDutch} catalog items dropped — missing dutch translation`)
}
if (itemsReport.emptyEnglish > 0) {
  console.warn(`  ⓘ  ${itemsReport.emptyEnglish} items have no translation_en — EN users won't see these until filled in`)
}

const vocabSectionsInCatalog = catalog.sections.filter(s =>
  ['vocabulary', 'expressions', 'numbers'].includes(s.type) && (s.items?.length ?? 0) > 0
)
if (vocabSectionsInCatalog.length > 0 && itemsReport.totalGenerated === 0) {
  console.error(`\n✗ Catalog has ${vocabSectionsInCatalog.length} vocabulary section(s) but 0 learning items were generated.`)
  console.error('  This means all items had empty indonesian or dutch fields. Fix the catalog before proceeding.')
  process.exit(1)
}
```

**Step 3: Commit**
```bash
git add scripts/generate-staging-files.ts
git commit -m "feat: report dropped catalog items in generate-staging-files — catch zero-item generation"
```

---

## Task 3: `publish-approved-content.ts` — fix silent failures and extend verification

**File:** `scripts/publish-approved-content.ts`

**Three separate problems to fix:**

### 3a: Fix silent failure on context upsert in step 3

The context upsert at lines 303–314 is a bare `await` with no error check:
```typescript
// Upsert Context
await supabase.schema('indonesian').from('item_contexts').upsert({...})
```

Replace with:
```typescript
const { error: ctxError } = await supabase
  .schema('indonesian')
  .from('item_contexts')
  .upsert({
    learning_item_id: upsertedItem.id,
    context_type: item.context_type,
    source_text: item.base_text,
    translation_text: item.translation_nl,
    is_anchor_context: true,
    source_lesson_id: lessonId,
  }, { onConflict: 'learning_item_id,source_text' })
if (ctxError) throw ctxError
```

### 3b: Add pre-insert assertions for translation_language and context_type

Add this block immediately before the `meaningInserts` array (after line 292):

```typescript
// Pre-insert assertion: translation_language must be set (regression guard for the original bug)
const VALID_LANGUAGES = new Set(['nl', 'en'])
const VALID_CONTEXT_TYPES = new Set(['example_sentence', 'dialogue', 'cloze', 'lesson_snippet', 'vocabulary_list', 'exercise_prompt'])

// Check context_type before inserting context
if (!VALID_CONTEXT_TYPES.has(item.context_type)) {
  throw new Error(`Invalid context_type "${item.context_type}" for item "${item.base_text}". Must be one of: ${[...VALID_CONTEXT_TYPES].join(', ')}`)
}
```

And add this assertion inside the `meaningInserts` construction (wrap the meaningInserts array building):

```typescript
const meaningInserts = [
  { learning_item_id: upsertedItem.id, translation_language: 'nl', translation_text: item.translation_nl, is_primary: true },
  ...(item.translation_en ? [{ learning_item_id: upsertedItem.id, translation_language: 'en', translation_text: item.translation_en, is_primary: true }] : []),
]
// Assert translation_language values before inserting (regression guard)
for (const m of meaningInserts) {
  if (!VALID_LANGUAGES.has(m.translation_language)) {
    throw new Error(`Invalid translation_language "${m.translation_language}" — must be 'nl' or 'en'`)
  }
  if (!m.translation_text?.trim()) {
    throw new Error(`Empty translation_text for language "${m.translation_language}" on item "${item.base_text}"`)
  }
}
```

### 3c: Revise step 6 to use published item IDs instead of a context query

The current step 6 derives `itemIds` by querying `item_contexts`, which means items with no context would never appear in `itemIds` — making the context check tautological.

Fix: collect the IDs of items actually published during step 3, then verify them in step 6.

**Before step 3's for loop** (before `for (const item of approvedItems)`), add:
```typescript
const publishedItemIds: string[] = []
```

**Inside the step 3 for loop**, after `upsertedItem` is confirmed (after `if (itemError) throw itemError`), add:
```typescript
publishedItemIds.push(upsertedItem.id)
```

**In step 6**, replace the current `itemIds` derivation (the `item_contexts` query) with `publishedItemIds`. Then chunk the `.in()` queries to avoid Kong's URL length limit (same pattern as `getMeaningsBatch`):

```typescript
if (!dryRun && publishedItemIds.length > 0) {
  console.log('\n6. Verifying seed integrity...')
  const CHUNK_SIZE = 50
  const expectedCount = publishedItemIds.length

  // Verify meanings (chunked)
  const nlCovered = new Set<string>()
  const enCovered = new Set<string>()
  for (let i = 0; i < publishedItemIds.length; i += CHUNK_SIZE) {
    const chunk = publishedItemIds.slice(i, i + CHUNK_SIZE)
    const { data: nlData, error: nlErr } = await supabase
      .schema('indonesian').from('item_meanings').select('learning_item_id')
      .in('learning_item_id', chunk).eq('translation_language', 'nl')
    if (nlErr) throw nlErr
    ;(nlData ?? []).forEach((r: any) => nlCovered.add(r.learning_item_id))

    const { data: enData, error: enErr } = await supabase
      .schema('indonesian').from('item_meanings').select('learning_item_id')
      .in('learning_item_id', chunk).eq('translation_language', 'en')
    if (enErr) throw enErr
    ;(enData ?? []).forEach((r: any) => enCovered.add(r.learning_item_id))
  }

  const missingNl = publishedItemIds.filter(id => !nlCovered.has(id))
  const missingEn = publishedItemIds.filter(id => !enCovered.has(id))

  if (missingNl.length > 0) {
    console.error(`   ✗ ${missingNl.length}/${expectedCount} items missing NL meaning`)
    console.error('\n✗ Seed integrity check FAILED — missing NL meanings indicate a silent write error.')
    console.error('  Re-run this script to retry.')
    process.exit(1)
  } else {
    console.log(`   ✓ All ${expectedCount} items have NL meanings`)
  }
  if (missingEn.length > 0) {
    console.warn(`   ⚠️ ${missingEn.length}/${expectedCount} items missing EN meaning (expected if no translation_en in staging)`)
  } else {
    console.log(`   ✓ All ${expectedCount} items have EN meanings`)
  }

  // Verify contexts (chunked) — using publishedItemIds, not item_contexts query
  const ctxCovered = new Set<string>()
  for (let i = 0; i < publishedItemIds.length; i += CHUNK_SIZE) {
    const chunk = publishedItemIds.slice(i, i + CHUNK_SIZE)
    const { data: ctxData, error: ctxErr } = await supabase
      .schema('indonesian').from('item_contexts').select('learning_item_id')
      .in('learning_item_id', chunk)
    if (ctxErr) throw ctxErr
    ;(ctxData ?? []).forEach((r: any) => ctxCovered.add(r.learning_item_id))
  }
  const missingCtx = publishedItemIds.filter(id => !ctxCovered.has(id))
  if (missingCtx.length > 0) {
    console.error(`   ✗ ${missingCtx.length}/${expectedCount} items have no context — they cannot appear in sessions`)
    process.exit(1)
  } else {
    console.log(`   ✓ All ${expectedCount} items have at least one context`)
  }

  // Verify exercise_variants for vocabulary candidates (those with context_id, not lesson_id)
  // Count candidates published this run (vocab type = not in GRAMMAR_EXERCISE_TYPES)
  const vocabCandidateCount = approvedCandidates.filter(
    (c: any) => !GRAMMAR_EXERCISE_TYPES.has(c.exercise_type)
  ).length
  if (vocabCandidateCount > 0) {
    // These were inserted with context_id; verify by querying exercise_variants for this lesson's item contexts
    const { count: variantCount, error: variantErr } = await supabase
      .schema('indonesian').from('exercise_variants')
      .select('*', { count: 'exact', head: true })
      .eq('lesson_id', lessonId)
    if (variantErr) throw variantErr
    if ((variantCount ?? 0) === 0) {
      console.warn(`   ⚠️ ${vocabCandidateCount} vocab candidates were approved but 0 exercise_variants found for this lesson`)
    } else {
      console.log(`   ✓ ${variantCount} exercise_variants present for lesson`)
    }
  }
}
```

**Note:** `GRAMMAR_EXERCISE_TYPES` is defined at line 339, before step 4. Since step 6 code is placed after step 4 in the same function, `GRAMMAR_EXERCISE_TYPES` is already in scope — do not move or redefine it.

**Step 4: Commit**
```bash
git add scripts/publish-approved-content.ts
git commit -m "feat: fix silent context upsert failure + pre-insert assertions + robust step-6 verification"
```

---

## Task 4: `seed-cloze-contexts.ts` — exit non-zero on unresolved slugs and upsert failures

**File:** `scripts/seed-cloze-contexts.ts`

**Problem:** (a) Missing slugs are reported as warnings but script exits 0. (b) Upsert failures (line 114-115) are logged but not counted — `inserted + notFound` could be less than `clozeContexts.length`, silently losing entries.

**Step 1: Add a `failed` counter alongside `inserted` and `notFound`**

Add at line 87 (after `let notFound = 0`):
```typescript
let failed = 0
```

**Step 2: Add `failed++` to the upsert error branch (lines 114-115)**

The existing code already has `inserted++` in the `else` branch. Only add `failed++` to the `if (error)` branch:

```typescript
if (error) {
  console.error(`  ❌ Failed for "${ctx.learning_item_slug}":`, error.message)
  failed++
} else {
  inserted++
}
```

**Step 3: Replace the final summary block (lines 121-124)**

```typescript
const total = clozeContexts.length
console.log(`\nResults: ${inserted} upserted, ${notFound} slugs not found, ${failed} upsert failures (total: ${total})`)

if (notFound > 0) {
  console.error(`✗ ${notFound} cloze context(s) could not be linked — learning item slugs not found in DB.`)
  console.error('  Run publish-approved-content.ts <N> first if items are not yet seeded.')
}
if (failed > 0) {
  console.error(`✗ ${failed} cloze context upsert(s) failed — check errors above.`)
}
if (inserted + notFound + failed !== total) {
  console.error(`✗ Count mismatch: ${inserted} + ${notFound} + ${failed} = ${inserted + notFound + failed} ≠ ${total} total`)
}
if (notFound > 0 || failed > 0) {
  process.exit(1)
}
console.log('✓ All cloze contexts seeded successfully.')
```

**Step 4: Commit**
```bash
git add scripts/seed-cloze-contexts.ts
git commit -m "fix: exit non-zero on unresolved slugs or upsert failures in seed-cloze-contexts.ts"
```

---

## Task 5: `seed-vocabulary.ts` — add post-seed count verification

**File:** `scripts/seed-vocabulary.ts`

**Note:** This script uses top-level `await` (not wrapped in a function) and the `for` loop is at the top level. The `console.log('Done!')` is at line 51.

**Step 1: Capture pre-seed count before the loop**

Add before the `for (const word of vocabulary)` loop:
```typescript
const { count: countBefore } = await supabase
  .schema('indonesian').from('vocabulary').select('*', { count: 'exact', head: true })
const preSeedCount = countBefore ?? 0
```

**Step 2: Replace `console.log('Done!')` at line 51**

```typescript
const { count: countAfter, error: countErr } = await supabase
  .schema('indonesian').from('vocabulary').select('*', { count: 'exact', head: true })
if (countErr) {
  console.error('Failed to verify seed count:', countErr.message)
  process.exit(1)
}
const newRows = (countAfter ?? 0) - preSeedCount
console.log(`\n✓ Done. ${newRows} new rows added (${countAfter} total in vocabulary table).`)
if (newRows < 0) {
  // Shouldn't happen — seed-vocabulary never deletes
  console.error('✗ Row count decreased — unexpected deletion occurred.')
  process.exit(1)
}
```

**Step 3: Commit**
```bash
git add scripts/seed-vocabulary.ts
git commit -m "feat: add pre/post count verification to seed-vocabulary.ts"
```

---

## Task 6: `seed-lessons.ts` — add post-seed count verification

**File:** `scripts/seed-lessons.ts`

**Note:** The `for` loop over `lessons` is at the top level (line 86). `console.log('Done!')` is at line 134.

**Step 1: Track per-lesson success**

Add a counter before the loop:
```typescript
let lessonSuccessCount = 0
let sectionSuccessCount = 0
```

In the loop body, after `console.log('Upserted lesson:', lesson.title, data.id)`, increment:
```typescript
lessonSuccessCount++
```

In the inner section loop, after `console.log('  Upserted section:', section.title)`, increment:
```typescript
sectionSuccessCount++
```

**Step 2: Replace `console.log('Done!')` at line 134**

```typescript
const expectedSections = lessons.reduce((n, l) => n + l.sections.length, 0)
console.log(`\n✓ Done. ${lessonSuccessCount}/${lessons.length} lessons seeded, ${sectionSuccessCount}/${expectedSections} sections seeded.`)
if (lessonSuccessCount < lessons.length) {
  console.error(`✗ ${lessons.length - lessonSuccessCount} lesson(s) failed to seed — check errors above.`)
  process.exit(1)
}
if (sectionSuccessCount < expectedSections) {
  console.error(`✗ ${expectedSections - sectionSuccessCount} section(s) failed to seed — check errors above.`)
  process.exit(1)
}
```

**Note:** This approach counts actual successes per loop iteration rather than comparing against total DB counts, avoiding the false-positive issue where other lessons' rows inflate the DB total.

**Step 3: Commit**
```bash
git add scripts/seed-lessons.ts
git commit -m "feat: add per-iteration success tracking and exit non-zero on partial seed failure in seed-lessons.ts"
```

---

## Task 7: `seed-learning-items.ts` — exit non-zero on meaning failures without creating orphans

**File:** `scripts/seed-learning-items.ts`

**Problem:** EN and NL meaning insert errors are logged but execution continues. The plan must NOT use `continue` after a meaning error, because the delete at lines 92-95 has already cleared the old meanings — a `continue` would leave a `learning_item` with no meanings, variants, or context (an orphan worse than before).

**Step 1: Add a `meaningErrors` counter at line 52 (alongside the existing `skipped` and `created` counters)**

```typescript
let meaningErrors = 0
```

Do NOT reuse the existing `skipped` counter for meaning failures. `skipped` is only for items that were entirely skipped (upsert failed, line 85 — these items never get to the meaning step). Mixing the two would break the `created + skipped === vocabulary.length` invariant and produce misleading summary output.

**Step 2: Replace the EN meaning error handling (lines 107-108)**

```typescript
if (enErr) console.error(`   ⚠️  Meaning (en) for "${vocab.indonesian}":`, enErr.message)
```
With:
```typescript
if (enErr) {
  console.error(`   ❌ Meaning (en) for "${vocab.indonesian}":`, enErr.message)
  meaningErrors++
  // Do NOT `continue` here — the old meanings were already deleted at lines 92-95.
  // Continuing to insert variants and context prevents an orphaned learning_item.
  // The item will be usable for NL users but invisible to EN users until fixed.
}
```

Apply the same pattern to the NL meaning insert (lines 119-121):
```typescript
if (nlErr) {
  console.error(`   ❌ Meaning (nl) for "${vocab.indonesian}":`, nlErr.message)
  meaningErrors++
  // Do NOT `continue` — see comment above.
}
```

**Step 3: Exit non-zero after the loop if any meaning errors occurred**

After the existing `console.log(\`\n✅ Seeding complete: ...\`)` line (line 193), add:
```typescript
if (meaningErrors > 0) {
  console.error(`\n✗ ${meaningErrors} meaning insert(s) failed. Items were seeded but may be missing NL or EN translations.`)
  process.exit(1)
}
```

**Step 3: Commit**
```bash
git add scripts/seed-learning-items.ts
git commit -m "fix: exit non-zero on meaning failures in seed-learning-items without creating orphans"
```

---

## Task 8: `publish-grammar-candidates.ts` — simplify post-publish check

**File:** `scripts/publish-grammar-candidates.ts`

**Problem:** The script already calls `process.exit(1)` on every individual insert error (lines 218, 239, 258, 290). The only silent failure mode is the `existingVariant` skip (line 272–275), which is intentional idempotency. A count-based post-check adds minimal value here. However, the final summary can report `inserted` vs `approved.length - skippedAlreadyPublished` and warn if they diverge unexpectedly.

**Step 1: Find the summary block (lines 326-336)**

After `console.log('  skipped (already published):', skippedAlreadyPublished)`, add:

```typescript
if (!dryRun) {
  const expectedNew = approved.length - skippedAlreadyPublished
  if (inserted !== expectedNew) {
    console.error(`✗ Expected ${expectedNew} new variants inserted but got ${inserted} — check errors above.`)
    process.exit(1)
  }
  console.log(`✓ All ${inserted} expected variants inserted successfully.`)
}
```

**Step 2: Commit**
```bash
git add scripts/publish-grammar-candidates.ts
git commit -m "feat: add inserted-vs-expected check to publish-grammar-candidates.ts"
```

---

## Task 9: `reverse-engineer-staging.ts` — validate output before writing

**File:** `scripts/reverse-engineer-staging.ts`

**Problem:** This script reads from the DB and writes `learning-items.ts`. If the DB items have no NL meanings (e.g., the bug we just fixed), it silently writes items with `translation_nl: ''`. Those items then flow through to `publish-approved-content.ts` and create meanings with empty text (which throws a NOT NULL constraint, silently caught).

**Step 1: After building `learningItems` (line 172), add validation before writing**

```typescript
// Validate before writing
const emptyNl = learningItems.filter((i: any) => !i.translation_nl?.trim())
const emptyBase = learningItems.filter((i: any) => !i.base_text?.trim())

if (emptyBase.length > 0) {
  console.error(`\n✗ ${emptyBase.length} items have empty base_text — DB data may be corrupted.`)
  process.exit(1)
}
if (emptyNl.length > 0) {
  console.warn(`\n⚠️ ${emptyNl.length}/${learningItems.length} items have no NL translation in DB.`)
  console.warn('   These items will be invisible to NL users in sessions.')
  console.warn('   Run repair-item-meanings.ts or re-seed before running linguist-creator.')
  // Warn but don't exit — the operator may want to proceed and fix afterwards
}
if (learningItems.length === 0) {
  console.error(`\n✗ No learning items found for lesson ${lessonNumber} in DB. Ensure publish-approved-content.ts was run first.`)
  process.exit(1)
}
```

**Step 2: Commit**
```bash
git add scripts/reverse-engineer-staging.ts
git commit -m "feat: validate reverse-engineered learning items before writing staging files"
```

---

## Final Verification

After all tasks are committed, run a dry-run on a fully seeded lesson to confirm no false positives:

```bash
bun scripts/publish-approved-content.ts 5 --dry-run
```

Lesson 5 has all items with both NL and EN meanings. If the dry-run completes without errors, the gates work correctly.
