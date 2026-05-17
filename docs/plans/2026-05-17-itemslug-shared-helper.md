---
status: implementing
implementation: PR #60
merged_at: null
implementation_paths:
  - src/lib/capabilities/itemSlug.ts
  - src/lib/capabilities/__tests__/itemSlug.test.ts
  - scripts/lib/content-pipeline-output.ts
  - scripts/lib/pipeline/capability-stage/adapter.ts
  - scripts/lib/pipeline/capability-stage/projectors/vocab.ts
  - scripts/lib/pipeline/capability-stage/lint/duplicateItems.ts
  - scripts/lib/pipeline/capability-stage/validators/itemSourceRefResolvability.ts
  - scripts/lib/pipeline/capability-stage/__tests__/validators/itemSourceRefResolvability.test.ts
  - scripts/lib/pipeline/capability-stage/runner.ts
  - scripts/check-capability-health.ts
  - scripts/check-supabase-deep.ts
supersedes: []
---

# itemSlug shared helper + three-layer test gates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract one canonical `itemSlug(baseText)` helper, route both the pipeline source_ref generator and the DB normalizer through it, and add unit + validator + health-check gates so the next slug-normalization drift cannot silently break runtime resolution.

**Architecture:** Single helper at `src/lib/capabilities/itemSlug.ts` exporting `itemSlug = (s) => s.toLowerCase().trim()`. All learning-item slug derivations (pipeline catalog snapshot, `source_ref` and `content_unit` generators, DB `normalized_text` writer, lint and projector helpers, audit script) call into it. A new pipeline pre-write validator (`itemSourceRefResolvability`) asserts every emitted item-source-kind cap's `source_ref` resolves against a `learning_items` row in the same staging snapshot, mirroring `validateLessonIdPresence` (Decision 3b PR-1). A new deep health check `HC9` asserts the same invariant against the live DB, mirroring `HC8`. The unit test pins the helper's contract; the validator blocks future pipeline-time pollution; HC9 catches anything that slips through.

**Tech Stack:** TypeScript, Vitest, Supabase (PostgREST + Postgres).

---

## Issue resolved

GitHub issue #59 — `Extract shared itemSlug helper + add three-layer test gates for source_ref resolvability`.

## Required reading (executor must read before starting)

1. `gh issue view 59` — the spec.
2. `scripts/lib/content-pipeline-output.ts:99-130` AND `:493-521` — **the live production source_ref generator has TWO entry points**:
    - `sourceRefForLearningItem` at line 128-130 → used for the `content_units.source_ref` column (line 235, 239 inside `buildContentUnitsFromStaging`).
    - The catalog snapshot at line 493-506, where `id: stableSlug(item.base_text)` (line 495) feeds `projectCapabilities` (line 522), which in turn builds `learning_items/${item.id}` at `src/lib/capabilities/capabilityCatalog.ts:50`. This is the path that produces every `learning_capabilities.source_ref` for item caps in production.
    Both must be routed through `itemSlug` in the same commit — fixing only one leaves the other producing hyphenated slugs that the new validator at Task 5 will throw on. NB: the issue body attributes the broken behaviour to `stableItemId` at `scripts/check-capability-health.ts:274-277`. That function is the health-check's own (parallel) mis-derivation — not load-bearing on production, but should be routed through `itemSlug` for consistency.
3. `scripts/lib/pipeline/capability-stage/adapter.ts:300-325` — the DB-side normalizer (correct: `.toLowerCase().trim()`).
4. `scripts/lib/pipeline/capability-stage/validators/lessonId.ts` — the Decision 3b PR-1 validator. Direct template for the new `itemSourceRefResolvability.ts`.
5. `scripts/lib/pipeline/capability-stage/runner.ts:392-399` — where `validateLessonIdPresence(allCapabilities)` is called. New validator goes adjacent.
6. `scripts/check-supabase-deep.ts:532-561` — HC8. Direct template for HC9.
7. `src/services/capabilityContentService.ts:107-114` — the strict-match resolver that is downstream of the bug (no change here, but tests reference it as the consumer).

## Scope

### In scope

1. New helper file `src/lib/capabilities/itemSlug.ts` exporting `itemSlug(baseText: string): string`.
2. Unit tests `src/lib/capabilities/__tests__/itemSlug.test.ts`.
3. Switch the production source_ref generator — **both entry points in the same file**:
    - `scripts/lib/content-pipeline-output.ts:128-129` (`sourceRefForLearningItem`) — used by `content_units.source_ref`.
    - `scripts/lib/content-pipeline-output.ts:495` (catalog snapshot `id`) — feeds `capabilityCatalog.ts:50` which builds `learning_capabilities.source_ref`. This is the primary production path.
    Keep `stableSlug` in place for grammar (line 132-134) and morphology (line 136-138) source_refs — different namespace.
4. Switch the DB writer: `adapter.ts:304` calls `itemSlug(item.base_text)` instead of inline `.toLowerCase().trim()`.
5. Switch the audit script: `stableItemId` at `scripts/check-capability-health.ts:274-277` delegates to `itemSlug` (preserves index-fallback shape so its single caller at line 328 doesn't break — wrap rather than delete because the function name is exported-looking and there's no harm in keeping the named fallback shape colocated).
6. Route the other slug-of-base_text callsites through the helper for one canonical helper:
    - `scripts/lib/pipeline/capability-stage/projectors/vocab.ts:89, 96, 165, 219` (line 219 builds `key = text.toLowerCase()` after a `.trim()` on line 217 — same family).
    - `scripts/lib/pipeline/capability-stage/lint/duplicateItems.ts:37` (the local `normalize`, called at line 52).
    - `scripts/publish-grammar-candidates.ts:184` (writes `normalized_text` via a separate publish path).
    - `scripts/repair-item-meanings.ts:53` (reads `learning_items` by `normalized_text` for repair).
    - `scripts/reactivate-dialogue-chunks.ts:100` (builds `normalized_text → base_text` map).
    - `scripts/seed-cloze-contexts.ts:84, 91` (items-by-normalized lookup for cloze seeding).
    - `scripts/cleanup-annotations.ts:48-51` (local `normalizeForDb` with explicit comment "Matches publish-approved-content.ts: s.toLowerCase().trim()").
    - `scripts/lib/normalize.ts:37` comment — update to reference `itemSlug` instead of `publish-approved-content.ts:293`.
7. New pipeline validator `scripts/lib/pipeline/capability-stage/validators/itemSourceRefResolvability.ts` modeled on `lessonId.ts`. Signature uses minimal structural types (`{ base_text: string }` for items, `Pick<CapabilityInput, 'sourceKind' | 'sourceRef' | 'canonicalKey'>` for caps) so the runner doesn't need an unsound cast from `LearningItemStagingRow` to `LearningItemInput`. Validates: every `sourceKind === 'item'` capability whose `sourceRef` starts with `learning_items/` has a slug that matches `itemSlug(item.base_text)` for some item in the snapshot. Throws with offending slug + closest match.
8. Validator unit tests at `scripts/lib/pipeline/capability-stage/__tests__/validators/itemSourceRefResolvability.test.ts`. Non-item source-kind tests use real source kinds (`pattern`, `dialogue_line`, `podcast_segment`, `podcast_phrase`, `affixed_form_pair`) — there is no `'grammar'` source kind.
9. Wire validator into `runner.ts` immediately after `validateLessonIdPresence(allCapabilities)`.
10. HC9 in `scripts/check-supabase-deep.ts` modeled on HC8: count non-resolvable item caps, label with explicit note about being intentionally red until issue #58 cleanup completes. Pure PostgREST (no `execute_sql` RPC — it does not exist in this codebase). Paginated fetch via `.range()` so the 2,649-row `learning_capabilities` table isn't truncated at the default 1,000-row cap.
11. Plan frontmatter flip to `status: shipped` at end.

### Optional (gate on diff noise)

- Brand the return type: `type ItemSlug = string & { readonly __brand: 'ItemSlug' }`. If TypeScript noise from threading the brand through `learning_capabilities.source_ref` + `learning_items.normalized_text` type signatures exceeds ~10 LOC of new casts elsewhere, drop the brand. Helper + validator + HC9 are the load-bearing pieces.

### Not in scope

- No DB cleanup / re-publish. That is issue #58 — explicitly blocked by this issue. HC9 going red is the SIGNAL that drives #58.
- No relaxing of `fetchLearningItemsByKey` at `src/services/capabilityContentService.ts:107-114`. The resolver stays strict.
- No DB CHECK / FK constraint on `source_ref`. Issue body explains why.
- No change to `projectors/slugs.ts` cloze-context `candidateSlugs()` — different concept.
- No production runtime code changes — runtime behaviour shifts only when #58's re-publish runs.
- **No update to `scripts/triage-residual-capabilities.ts:56` (`stableSlugForBaseText`).** This function intentionally mirrors the OLD broken `stableSlug` shape so its slug-set matches the historical (hyphenated) `source_ref` values still in the live DB. During the transitional window between #59 landing and #58 cleanup completing, the live DB contains BOTH slug shapes (old hyphenated rows + new space-preserving rows from any re-publish). Issue #58 must update `stableSlugForBaseText` to compute and union BOTH shapes into the slug-set so orphan classification stays accurate during the cleanup. Track this as a known #58 prerequisite.

## Supabase Requirements

### Schema changes
- N/A — no DDL changes. `learning_capabilities.source_ref` and `learning_items.normalized_text` columns and their CHECK constraints are unchanged.

### RLS policies
- N/A — no policy changes.

### Grants
- N/A — no new tables.

### homelab-configs changes
- [ ] PostgREST: no new schema exposure needed.
- [ ] Kong: no new CORS origins.
- [ ] GoTrue: no auth config changes.
- [ ] Storage: no new buckets.

### Health check additions
- HC9 added to `scripts/check-supabase-deep.ts` — see Task 7.
- HC9 is EXPECTED RED until issue #58 cleanup runs. Document this explicitly in the check's failure label so a future operator does not misread it as a regression.

## Decision: brand or no brand?

Default to **no brand** for first cut. Add brand only if reviewers ask for it in PR. Rationale: the validator and HC9 are the live defences; brand is static-type insurance that's nice to have but trades against editing-tax noise in adjacent code.

---

## Task 1 — Helper + unit tests (TDD)

**Files:**
- Create: `src/lib/capabilities/itemSlug.ts`
- Create: `src/lib/capabilities/__tests__/itemSlug.test.ts`

**Step 1: Write the failing tests**

`src/lib/capabilities/__tests__/itemSlug.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { itemSlug } from '../itemSlug'

describe('itemSlug', () => {
  it('lowercases', () => {
    expect(itemSlug('Bandar')).toBe('bandar')
  })

  it('trims leading and trailing whitespace', () => {
    expect(itemSlug('  bandar  ')).toBe('bandar')
  })

  it('preserves internal spaces (does NOT hyphenate)', () => {
    // This is the bug we are fixing — production stableSlug() replaces spaces
    // with hyphens, diverging from the DB normalized_text writer.
    expect(itemSlug('bandar udara')).toBe('bandar udara')
    expect(itemSlug('Selamat Pagi')).toBe('selamat pagi')
  })

  it('preserves Indonesian reduplication hyphens', () => {
    expect(itemSlug('oleh-oleh')).toBe('oleh-oleh')
    expect(itemSlug('baik-baik saja')).toBe('baik-baik saja')
    expect(itemSlug('sama-sama')).toBe('sama-sama')
  })

  it('preserves internal multi-space (no whitespace collapse)', () => {
    // The contract intentionally does NOT collapse internal whitespace —
    // distinct from `ttsNormalize` which does. Pinning this prevents a
    // future maintainer from "normalising" the helper into that family.
    expect(itemSlug('bandar  udara')).toBe('bandar  udara')
  })

  it('preserves accent annotations (parenthetical pronunciation)', () => {
    expect(itemSlug('beres (bèrès)')).toBe('beres (bèrès)')
  })

  it('preserves trailing asterisks (passive marker)', () => {
    expect(itemSlug('dibawa*')).toBe('dibawa*')
  })

  it('is idempotent', () => {
    const inputs = ['Bandar Udara', '  oleh-oleh  ', 'BERES (BÈRÈS)']
    for (const s of inputs) {
      expect(itemSlug(itemSlug(s))).toBe(itemSlug(s))
    }
  })

  it('handles empty string', () => {
    expect(itemSlug('')).toBe('')
  })

  it('handles whitespace-only input', () => {
    expect(itemSlug('   ')).toBe('')
  })

  it('preserves punctuation that is part of the canonical form', () => {
    expect(itemSlug('apa?')).toBe('apa?')
    expect(itemSlug('!')).toBe('!')
  })
})
```

**Step 2: Run tests, confirm they FAIL**

```
bun run test src/lib/capabilities/__tests__/itemSlug.test.ts
```

Expected: red — module not found.

**Step 3: Write the helper**

`src/lib/capabilities/itemSlug.ts`:

```typescript
/**
 * Canonical slug derivation for learning-item base_text.
 *
 * This is the ONE function that decides what a learning_item's slug looks
 * like. Every callsite that builds a slug from base_text (cap source_refs,
 * DB normalized_text, lint deduplication, projector lookups) must route
 * through here. Divergent local implementations historically caused
 * silent runtime mismatches (issue #59: 113 multi-word items unreachable
 * because cap source_refs hyphenated spaces while DB normalized_text
 * preserved them).
 *
 * Convention: `learning_items.normalized_text = itemSlug(base_text)`.
 * Mirrored by `scripts/lib/pipeline/capability-stage/adapter.ts:upsertLearningItem`
 * and `scripts/lib/content-pipeline-output.ts:sourceRefForLearningItem`.
 *
 * Indonesian-specific: internal spaces (multi-word phrases) and hyphens
 * (reduplications like `oleh-oleh`) are preserved; only case + boundary
 * whitespace is normalized. Accent annotations and asterisks are part of
 * the canonical form and pass through unchanged.
 *
 * See also: ADR 0006, issue #59, and the cloze-context cousin helper
 * `projectors/slugs.ts:candidateSlugs` which deals with cloze-specific
 * suffix variants (a different problem).
 */
export function itemSlug(baseText: string): string {
  return baseText.toLowerCase().trim()
}
```

**Step 4: Run tests, confirm GREEN**

```
bun run test src/lib/capabilities/__tests__/itemSlug.test.ts
```

Expected: all pass.

**Step 5: Commit**

```bash
git add src/lib/capabilities/itemSlug.ts src/lib/capabilities/__tests__/itemSlug.test.ts
git commit -m "feat(capabilities): add canonical itemSlug helper (#59)"
```

---

## Task 2 — Switch the production source_ref generators (both entry points)

**Files:**
- Modify: `scripts/lib/content-pipeline-output.ts:128-129` (`sourceRefForLearningItem` — feeds `content_units.source_ref`).
- Modify: `scripts/lib/content-pipeline-output.ts:495` (catalog snapshot `id` — feeds `learning_capabilities.source_ref` via `capabilityCatalog.ts:50`). **This is the load-bearing one.**

**Step 1: Add import**

At top of `scripts/lib/content-pipeline-output.ts`, add:

```typescript
import { itemSlug } from '../../src/lib/capabilities/itemSlug'
```

(Verify the relative path with `tsc --noEmit`. If the project's tsconfig path mapping rejects the cross-directory import, fall back to `../../../src/...` or copy the helper. The `@/` alias maps to `src/` per vite.config.ts but may not be wired into the scripts tsconfig. Pick whichever resolves cleanly; do not introduce a new path alias as part of this PR.)

**Step 2: Swap the two callsites**

Change `sourceRefForLearningItem` (line 128-129) from:

```typescript
function sourceRefForLearningItem(baseText: string): string {
  return `learning_items/${stableSlug(baseText)}`
}
```

to:

```typescript
function sourceRefForLearningItem(baseText: string): string {
  // Per issue #59: must match learning_items.normalized_text exactly so
  // the runtime resolver (capabilityContentService.fetchLearningItemsByKey)
  // can resolve item-source-kind caps. NOT stableSlug — that mangles spaces
  // to hyphens.
  return `learning_items/${itemSlug(baseText)}`
}
```

Change the catalog snapshot at line 495 from:

```typescript
const snapshot = {
  learningItems: learningItems.map(item => ({
    id: stableSlug(item.base_text),
    ...
```

to:

```typescript
const snapshot = {
  learningItems: learningItems.map(item => ({
    // Per issue #59: this id feeds `learning_items/${id}` in capabilityCatalog.ts:50
    // → must match learning_items.normalized_text. stableSlug hyphenates spaces.
    id: itemSlug(item.base_text),
    ...
```

**Leave `stableSlug` in place** for grammar (`grammarSourceRef`, line 132-134) and morphology (`affixedFormPairSourceRef`, line 136-138) source_refs and for `grammarPatterns[].id` (line 508) inside the same snapshot block — different namespace, not subject to the `normalized_text` convention.

**Step 3: Run pipeline-output tests + capability-stage tests**

```
bun run test scripts/lib --run
```

Snapshot tests that assert old hyphenated `learning_items/foo-bar` source_refs (likely in `scripts/lib/pipeline/capability-stage/__tests__/`) need to be updated in this commit — they encode the bug. List each updated fixture in the commit body so the reviewer can verify the change is intentional and not a flake-mask.

**Step 4: Commit**

```bash
git add scripts/lib/content-pipeline-output.ts
git commit -m "fix(pipeline): route content-pipeline-output item slug generators through itemSlug (#59)

The catalog snapshot at line 495 feeds capabilityCatalog.ts:50 which is
the actual source of every learning_capabilities.source_ref for item
caps. Routing sourceRefForLearningItem alone (used for content_units)
is necessary but not sufficient — fix both in the same commit."
```

---

## Task 3 — Switch the DB writer

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/adapter.ts:300-304`

**Step 1: Swap inline normalizer**

Add import at top:

```typescript
import { itemSlug } from '../../../../src/lib/capabilities/itemSlug'
```

(Verify the relative path. The adapter is deeper.)

Change line 304 from:

```typescript
const normalized_text = item.base_text.toLowerCase().trim()
```

to:

```typescript
const normalized_text = itemSlug(item.base_text)
```

**Step 2: Run adapter tests**

```
bun run test scripts/lib/pipeline/capability-stage --run
```

Expected: green.

**Step 3: Commit**

```bash
git add scripts/lib/pipeline/capability-stage/adapter.ts
git commit -m "fix(pipeline): route upsertLearningItem normalizer through itemSlug (#59)"
```

---

## Task 4 — Switch audit + lint + projector + non-pipeline script callsites

**Files:**
- Modify: `scripts/check-capability-health.ts:274-277` (`stableItemId`)
- Modify: `scripts/lib/pipeline/capability-stage/lint/duplicateItems.ts:37-52` (local `normalize`)
- Modify: `scripts/lib/pipeline/capability-stage/projectors/vocab.ts:89, 96, 165, 219`
- Modify: `scripts/publish-grammar-candidates.ts:184`
- Modify: `scripts/repair-item-meanings.ts:53`
- Modify: `scripts/reactivate-dialogue-chunks.ts:100`
- Modify: `scripts/seed-cloze-contexts.ts:84, 91`
- Modify: `scripts/cleanup-annotations.ts:48-51`
- Modify: `scripts/lib/normalize.ts:37` (comment update only — link to `itemSlug`)

**Step 1: check-capability-health.ts**

Add import. Replace `stableItemId` body to delegate but keep the index-fallback signature so its single caller at line 328 doesn't break:

```typescript
import { itemSlug } from '../src/lib/capabilities/itemSlug'

// Kept as a named wrapper (not deleted) because the index-fallback shape
// (`item-${index+1}` when base_text is empty) is specific to the audit
// script's robustness needs — it must not throw on partial staging
// fixtures. The wrapper colocates that fallback with the itemSlug
// delegation so future contributors don't reach for a divergent local
// helper.
function stableItemId(item: { base_text?: string; baseText?: string }, index: number): string {
  const text = item.base_text ?? item.baseText ?? ''
  return itemSlug(text) || `item-${index + 1}`
}
```

This function previously hyphenated spaces; switching it surfaces the bug to the audit output. That is the desired behaviour.

**Step 2: duplicateItems.ts**

Replace the local `normalize` helper (line 37-39) with the shared one. Add import:

```typescript
import { itemSlug } from '../../../../../src/lib/capabilities/itemSlug'
```

Delete `function normalize(s: string): string { ... }`. Replace `normalize(raw)` at line 52 with `itemSlug(raw)`.

**Step 3: vocab.ts**

Add the import:

```typescript
import { itemSlug } from '../../../../../src/lib/capabilities/itemSlug'
```

Replace the four `.toLowerCase().trim()` callsites:
- Line 89: `String(c.learning_item_slug).toLowerCase().trim()` → `itemSlug(String(c.learning_item_slug))`
- Line 96: `String(item.base_text ?? '').toLowerCase().trim()` → `itemSlug(String(item.base_text ?? ''))`
- Line 165: `String(ctx.learning_item_slug ?? '').toLowerCase().trim()` → `itemSlug(String(ctx.learning_item_slug ?? ''))`
- Line 219: `text.toLowerCase()` (paired with `.trim()` on line 217) → `itemSlug(text)` (and remove the `.trim()` on line 217 since `itemSlug` handles it).

**Step 4: Non-pipeline scripts**

For each script below, add the import and replace inline normalizers with `itemSlug(...)`. These scripts are not on the live publish path but they share the contract — leaving them inline is exactly the drift class this plan exists to prevent.

| File:line | Change |
|---|---|
| `scripts/publish-grammar-candidates.ts:184` | `baseText.toLowerCase().trim()` → `itemSlug(baseText)` |
| `scripts/repair-item-meanings.ts:53` | `item.base_text.toLowerCase().trim()` → `itemSlug(item.base_text)` |
| `scripts/reactivate-dialogue-chunks.ts:100` | `c.base_text.toLowerCase().trim()` → `itemSlug(c.base_text)` |
| `scripts/seed-cloze-contexts.ts:84` | `[i.base_text.toLowerCase().trim(), i]` → `[itemSlug(i.base_text), i]` |
| `scripts/seed-cloze-contexts.ts:91` | `ctx.learning_item_slug.toLowerCase().trim()` → `itemSlug(ctx.learning_item_slug)` |
| `scripts/cleanup-annotations.ts:48-51` | Delete the local `normalizeForDb` (only the inline `.toLowerCase().trim()` form, NOT the second form that also collapses whitespace) and replace its single use with `itemSlug(...)`. **Read the file first** to confirm callsite count — if the helper is reused with the whitespace-collapse variant inline, leave that variant alone. |

In `scripts/lib/normalize.ts:37` update the comment:

```typescript
// Matches itemSlug (src/lib/capabilities/itemSlug.ts) — the canonical
// helper for learning_items.normalized_text derivation.
```

**Step 5: Run full test suite**

```
bun run test
```

Expected: all green.

**Step 6: Commit**

```bash
git add scripts/check-capability-health.ts \
        scripts/lib/pipeline/capability-stage/lint/duplicateItems.ts \
        scripts/lib/pipeline/capability-stage/projectors/vocab.ts \
        scripts/publish-grammar-candidates.ts \
        scripts/repair-item-meanings.ts \
        scripts/reactivate-dialogue-chunks.ts \
        scripts/seed-cloze-contexts.ts \
        scripts/cleanup-annotations.ts \
        scripts/lib/normalize.ts
git commit -m "refactor: route remaining slug callsites through itemSlug (#59)"
```

---

## Task 5 — Pipeline validator (TDD)

**Files:**
- Create: `scripts/lib/pipeline/capability-stage/validators/itemSourceRefResolvability.ts`
- Create: `scripts/lib/pipeline/capability-stage/__tests__/validators/itemSourceRefResolvability.test.ts`

**Step 1: Write failing tests**

`scripts/lib/pipeline/capability-stage/__tests__/validators/itemSourceRefResolvability.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateItemSourceRefResolvability } from '../../validators/itemSourceRefResolvability'

type CapStub = {
  canonicalKey: string
  sourceKind: string
  sourceRef: string
}

function cap(overrides: Partial<CapStub>): CapStub {
  return {
    canonicalKey: 'cap:v1:item:learning_items/foo:meaning_recall:id_to_l1:text:nl',
    sourceKind: 'item',
    sourceRef: 'learning_items/foo',
    ...overrides,
  }
}

function item(base_text: string): { base_text: string } {
  return { base_text }
}

describe('validateItemSourceRefResolvability', () => {
  it('passes when every item-cap source_ref matches an item slug', () => {
    expect(() =>
      validateItemSourceRefResolvability(
        [cap({ sourceRef: 'learning_items/bandar udara' })],
        [item('bandar udara')],
      )
    ).not.toThrow()
  })

  it('throws when an item-cap source_ref has no matching item', () => {
    expect(() =>
      validateItemSourceRefResolvability(
        [cap({ sourceRef: 'learning_items/bandar-udara' })],
        [item('bandar udara')],
      )
    ).toThrow(/bandar-udara/)
  })

  it('error message includes the closest item slug as a hint', () => {
    try {
      validateItemSourceRefResolvability(
        [cap({ sourceRef: 'learning_items/bandar-udara' })],
        [item('bandar udara'), item('makan')],
      )
      throw new Error('should have thrown')
    } catch (err) {
      expect((err as Error).message).toMatch(/bandar udara/)
    }
  })

  it('ignores non-item source kinds (pattern, affixed_form_pair)', () => {
    // Real source kinds per capabilityTypes.ts; there is no 'grammar' kind.
    for (const kind of ['pattern', 'affixed_form_pair']) {
      expect(() =>
        validateItemSourceRefResolvability(
          [cap({ sourceKind: kind, sourceRef: 'lesson-1/pattern-foo' })],
          [],
        )
      ).not.toThrow()
    }
  })

  it('ignores podcast source kinds', () => {
    for (const kind of ['podcast_segment', 'podcast_phrase']) {
      expect(() =>
        validateItemSourceRefResolvability(
          [cap({ sourceKind: kind, sourceRef: 'podcasts/foo' })],
          [],
        )
      ).not.toThrow()
    }
  })

  it('ignores dialogue_line caps (they reference lesson sections, not items)', () => {
    expect(() =>
      validateItemSourceRefResolvability(
        [cap({
          sourceKind: 'dialogue_line',
          sourceRef: 'lesson-1/section-1/line-0',
        })],
        [],
      )
    ).not.toThrow()
  })

  it('groups multiple violations into one error', () => {
    expect(() =>
      validateItemSourceRefResolvability(
        [
          cap({ sourceRef: 'learning_items/foo-bar' }),
          cap({ sourceRef: 'learning_items/baz-qux' }),
        ],
        [item('foo bar'), item('baz qux')],
      )
    ).toThrow(/2/)
  })
})
```

**Step 2: Run, confirm RED**

```
bun run test scripts/lib/pipeline/capability-stage/__tests__/validators/itemSourceRefResolvability.test.ts
```

Expected: red — module not found.

**Step 3: Write the validator**

`scripts/lib/pipeline/capability-stage/validators/itemSourceRefResolvability.ts`:

```typescript
/**
 * validators/itemSourceRefResolvability.ts — issue #59.
 *
 * Defensive guard against slug-normalization drift between the cap
 * source_ref generator and the DB learning_items.normalized_text writer.
 * Every item-source-kind capability's source_ref must resolve to a
 * learning_items row in the same staging snapshot, where "resolves" means
 * the slug component matches `itemSlug(item.base_text)` for some item.
 *
 * The runtime resolver (src/services/capabilityContentService.ts:107-114)
 * is strict: a mismatch silently skips the exercise rather than failing
 * loudly. Pre-2026-05-17 the production pipeline used a hyphenating slug
 * generator (scripts/lib/content-pipeline-output.ts:stableSlug) while the
 * DB writer preserved spaces — 113 multi-word items were unreachable.
 *
 * This validator throws synchronously before upsertCapabilities writes
 * to the DB. Mirror of validators/lessonId.ts (Decision 3b PR-1).
 *
 * See ADR 0006 (the validator pattern), issue #59 (the bug), and the
 * `itemSlug` helper at src/lib/capabilities/itemSlug.ts (the canonical
 * slug derivation).
 */

import { itemSlug } from '../../../../../src/lib/capabilities/itemSlug'

// Minimal structural types — keeps the validator decoupled from CapabilityInput
// / LearningItemInput so the runner doesn't need an unsound cast from
// `LearningItemStagingRow` (no `language` / `source_type` fields) to
// `LearningItemInput`.
type CapForValidation = {
  canonicalKey: string
  sourceKind: string
  sourceRef: string
}
type ItemForValidation = { base_text: string }

const ITEM_REF_PREFIX = 'learning_items/'

function extractItemSlug(sourceRef: string): string | null {
  if (!sourceRef.startsWith(ITEM_REF_PREFIX)) return null
  return sourceRef.slice(ITEM_REF_PREFIX.length)
}

function closestSlug(target: string, slugs: string[]): string | null {
  // Tiny Levenshtein. Validator runs once per publish on small lists; the
  // O(n*|target|*|s|) cost is irrelevant. Returns null if no items present.
  if (slugs.length === 0) return null
  let best = slugs[0]
  let bestScore = Number.POSITIVE_INFINITY
  for (const s of slugs) {
    const score = levenshtein(target, s)
    if (score < bestScore) {
      bestScore = score
      best = s
    }
  }
  return best
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  let curr = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

export function validateItemSourceRefResolvability(
  capabilities: ReadonlyArray<CapForValidation>,
  learningItems: ReadonlyArray<ItemForValidation>,
): void {
  const itemSlugs = new Set(learningItems.map((it) => itemSlug(it.base_text)))
  const violations: { sourceRef: string; slug: string; closest: string | null }[] = []
  for (const cap of capabilities) {
    if (cap.sourceKind !== 'item') continue
    const slug = extractItemSlug(cap.sourceRef)
    if (slug == null) continue
    if (itemSlugs.has(slug)) continue
    violations.push({
      sourceRef: cap.sourceRef,
      slug,
      closest: closestSlug(slug, [...itemSlugs]),
    })
  }
  if (violations.length === 0) return
  const sample = violations.slice(0, 5).map((v) =>
    `${v.sourceRef} (closest item: ${v.closest ?? 'none'})`
  ).join('; ')
  throw new Error(
    `[itemSourceRefResolvability validator] ${violations.length} item-source-kind ` +
    `capability/ies have source_ref slugs that do not match any learning_item in ` +
    `the staging snapshot. Sample: ${sample}. ` +
    `Either declare the missing item in learning-items.ts or fix the slug. ` +
    `See issue #59.`,
  )
}
```

**Step 4: Run validator tests, confirm GREEN**

```
bun run test scripts/lib/pipeline/capability-stage/__tests__/validators/itemSourceRefResolvability.test.ts
```

Expected: all pass.

**Step 5: Commit**

```bash
git add scripts/lib/pipeline/capability-stage/validators/itemSourceRefResolvability.ts scripts/lib/pipeline/capability-stage/__tests__/validators/itemSourceRefResolvability.test.ts
git commit -m "feat(pipeline): add itemSourceRefResolvability validator (#59)"
```

---

## Task 6 — Wire validator into runner

**Files:**
- Modify: `scripts/lib/pipeline/capability-stage/runner.ts:396-399`

**Step 1: Add import + call**

Add import (alongside existing `validateLessonIdPresence` import):

```typescript
import { validateItemSourceRefResolvability } from './validators/itemSourceRefResolvability'
```

Right after line 398 (`validateLessonIdPresence(allCapabilities)`) add:

```typescript
  // Issue #59: refuse to write any item-source-kind capability whose
  // source_ref slug does not match a learning_item in this snapshot.
  // Mirrors lessonId validator — see ADR 0006 / issue #59. The validator
  // accepts a minimal structural type ({ base_text: string }) so no cast
  // from staging.learningItems (LearningItemStagingRow[]) is needed —
  // LearningItemStagingRow already extends { base_text: string }.
  validateItemSourceRefResolvability(allCapabilities, staging.learningItems)
```

No new imports needed beyond `validateItemSourceRefResolvability` itself.

**Step 2: Run capability-stage runner tests**

```
bun run test scripts/lib/pipeline/capability-stage --run
```

Expected: green. If a runner integration test sets up a snapshot with a hyphenated slug that no longer resolves, it'll now throw — update the fixture to match the new convention.

**Step 3: Commit**

```bash
git add scripts/lib/pipeline/capability-stage/runner.ts
git commit -m "feat(pipeline): wire itemSourceRefResolvability into runCapabilityStage (#59)"
```

---

## Task 7 — HC9 health check

**Files:**
- Modify: `scripts/check-supabase-deep.ts` (insert near HC8 ~line 561)

**Step 1: Add HC9 (PostgREST only — no `execute_sql` RPC exists in this codebase)**

Confirmed by grep: no `execute_sql` function is defined. HC8 (the template) uses pure `.from().select()`. HC9 follows the same shape and adds explicit pagination because `learning_capabilities` is ~2,649 rows — PostgREST's default cap is 1,000 and a truncated fetch would under-report the offender count.

After the HC8 block, insert:

```typescript
// ── HC9 (issue #59): zero item-source-kind learning_capabilities rows whose
//      source_ref slug does not resolve against learning_items.normalized_text.
//      Sibling to HC8. NOTE: EXPECTED RED until issue #58 cleanup completes —
//      that is the SIGNAL that drives the cleanup. Do not treat as a
//      regression in the interim. Once #58 runs the re-publish + clears
//      orphans, HC9 should turn green and stay green.
//
//      Pagination: learning_capabilities holds ~2,649 rows; PostgREST's
//      default cap is 1,000, so we fetch in chunks via .range() until
//      the page comes back short.
{
  async function fetchAllItemCaps(): Promise<Array<{ canonical_key: string; source_ref: string }>> {
    const pageSize = 1000
    const all: Array<{ canonical_key: string; source_ref: string }> = []
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .schema('indonesian')
        .from('learning_capabilities')
        .select('canonical_key, source_ref')
        .eq('source_kind', 'item')
        .like('source_ref', 'learning_items/%')
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      const rows = (data ?? []) as Array<{ canonical_key: string; source_ref: string }>
      all.push(...rows)
      if (rows.length < pageSize) break
    }
    return all
  }

  async function fetchAllNormalizedTexts(): Promise<Set<string>> {
    const pageSize = 1000
    const slugs = new Set<string>()
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .schema('indonesian')
        .from('learning_items')
        .select('normalized_text')
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      const rows = (data ?? []) as Array<{ normalized_text: string }>
      for (const row of rows) slugs.add(row.normalized_text)
      if (rows.length < pageSize) break
    }
    return slugs
  }

  try {
    const [caps, slugs] = await Promise.all([fetchAllItemCaps(), fetchAllNormalizedTexts()])
    const offenders = caps.filter((c) => !slugs.has(c.source_ref.replace(/^learning_items\//, '')))
    if (offenders.length === 0) {
      pass('HC9 item caps source_ref resolves to learning_items.normalized_text (#59)')
    } else {
      fail(
        'HC9 item caps source_ref resolves to learning_items.normalized_text (#59) — EXPECTED RED until issue #58 cleanup completes',
        `${offenders.length} item-cap(s) with unresolvable source_ref: ` +
        `${offenders.slice(0, 5).map((o) => `${o.source_ref} (${o.canonical_key})`).join(', ')}` +
        `${offenders.length > 5 ? ' …' : ''}\n` +
        `   → Run issue #58 cleanup: re-publish affected lessons after this fix lands.`,
      )
    }
  } catch (err) {
    fail(
      'HC9 item caps source_ref resolves to learning_items.normalized_text (#59)',
      err instanceof Error ? err.message : String(err),
    )
  }
}
```

Implementation note: read `scripts/check-supabase-deep.ts` once at the start of this task — its existing patterns for `fail` / `pass` and `supabase` may vary slightly from this snippet; match the existing patterns exactly.

**Step 2: Run health check locally**

```
make check-supabase-deep
```

Expected: HC9 reported as red (with the "expected red" label) — count should be ~113 matching the audit. All other checks green except the two pre-existing failures noted in the task brief.

**Step 3: Commit**

```bash
git add scripts/check-supabase-deep.ts
git commit -m "feat(health): add HC9 item-cap source_ref resolvability (#59)"
```

---

## Task 8 — Final verification + plan frontmatter flip + PR

**Step 1: Full gauntlet**

```bash
bun run test
bun run lint
bun run build
```

Expected: all green.

**Step 2: Smoke `make pre-deploy` if local DB credentials are present**

```bash
make pre-deploy
```

Expected: green except for the two pre-existing failures (audio_path missing on Les 5/6/7/Batik/Puskesmas; HC4 audio coverage parity 98/707) AND HC9 (intentionally red).

**Step 3: Flip plan frontmatter**

Update the top of `docs/plans/2026-05-17-itemslug-shared-helper.md`:

```yaml
---
status: shipped
implementation: PR #<N>
merged_at: 2026-05-17
implementation_paths:
  - <unchanged list>
supersedes: []
---
```

**Step 4: Open PR**

PR title: `feat: itemSlug shared helper + three-layer test gates (#59)`

PR description must include:

- Summary: extracts canonical `itemSlug` helper, routes 6 callsites through it, adds validator + HC9 gates.
- Acceptance from issue #59 referenced.
- **Explicit note**: "HC9 will fail until issue #58 cleanup completes. This is intentional — HC9 is the signal that drives #58."
- Test plan: unit tests for helper, validator tests, HC9 visible in `make check-supabase-deep`.

**Step 5: Unblock #58**

```bash
gh issue comment 58 --body "Issue #59 has landed (PR #<N>). Phase 1 re-publish can proceed — HC9 in scripts/check-supabase-deep.ts will go green once the orphan cleanup completes."
```

---

## Acceptance gate (from issue #59)

- [x] `src/lib/capabilities/itemSlug.ts` exists with unit tests, all passing
- [x] Production source_ref generator (`sourceRefForLearningItem`) + DB writer (`adapter.ts:304`) + audit (`stableItemId`) all call `itemSlug`
- [x] Pipeline validator added, wired into `runCapabilityStage`, throws on unresolvable item caps
- [x] HC9 added to `check-supabase-deep.ts`, RED against current DB (expected — the signal #58 needs)
- [x] `bun run test` green
- [x] `make pre-deploy` green except known pre-existing failures + intentional HC9 red

## Risk + rollback

- The only runtime-affecting change is that publishes from this branch onward stop emitting hyphenated `source_ref` slugs. Live data isn't touched by this PR; existing rows in `learning_capabilities` are not rewritten — that's #58.
- Rollback: revert the PR. No DB migration to undo. The new validator will stop running; existing source_refs remain (broken) as before.

## Why three layers (executor reminder)

- Unit pins the helper's contract.
- Validator blocks new pollution at publish time.
- HC9 catches anything that survives both.

Removing any one layer reintroduces the silent-failure class. Keep all three.
