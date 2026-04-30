# Auto-Fill Capability Artifacts From Legacy DB — Phase 1 Spec

**Date:** 2026-04-30
**Status:** Draft for fresh-context review
**Source:** Schema-scan finding that the legacy `indonesian.*` tables already
hold every concrete payload the post-cutover `capability_artifacts` table
needs, but the published artifacts are still placeholder scaffolds.

## 1. Goal

Take 5,800+ existing `capability_artifacts` rows that are currently
`quality_status = 'draft'` with `payload_json.placeholder = true`, and fill
them with concrete payloads derived from the legacy authored DB content
(`learning_items`, `item_meanings`, `item_answer_variants`, `item_contexts`,
`grammar_patterns`, `morphology-patterns.ts` staging). Flip filled rows to
`quality_status = 'approved'` so the existing `promote-capabilities.ts` can
flip the parent capabilities to `ready/published`.

After this lands and `promote-capabilities` runs for each lesson, the
`/session?lesson=<id>&mode=lesson_practice` route surfaces real exercises
across all 9 lessons.

## 2. Non-Goals

- Capability projection extension (`audio_recognition`, `dictation`,
  `contextual_cloze` are not yet projected — that is Phase 2).
- Hand-authored quality review of payloads. Auto-derived payloads carry a
  `reviewedBy: 'auto-from-legacy-db'` provenance tag and remain replaceable
  by a later reviewed payload.
- Audio file generation, cloze sentence authoring, or any other content
  creation.
- Migrating data into `learning_capabilities` or any other table — only
  `capability_artifacts.payload_json` and `quality_status` are touched.
- Cleanup of orphaned legacy `lesson_page_blocks` rows from prior shapes
  (separate runbook step).

## 3. Current State

After the rich-projection bridge + content rebuild merged on 2026-04-29:

```text
learning_capabilities       2576 rows  (all unknown/draft except 3 akhir promoted)
capability_artifacts        5806 rows  (7 approved, 5799 draft placeholders)

artifact_kind            quality_status   count
accepted_answers:id      draft              646
accepted_answers:l1      draft              646
allomorph_rule           draft                4
base_text                draft             1880
meaning:l1               draft             2526
pattern_example          draft               47
pattern_explanation:l1   draft               47
root_derived_pair        draft                4
```

Capability types currently projected (per `learning_capabilities`):

```text
text_recognition         647
meaning_recall           647
form_recall              647
l1_to_id_choice          588
pattern_recognition       47
root_derived_recognition   2
root_derived_recall        2
```

## 4. Source-Of-Truth Mapping

For each `capability_artifacts` row, the auto-fill resolves the source by
the parent capability's `source_kind` + `source_ref` + `capability_type`,
plus the artifact's `artifact_kind`. The capability's `canonical_key`
encodes all of these (`cap:v1:<source_kind>:<source_ref>:<capability_type>:
<direction>:<modality>:<learner_language>`).

### 4.1 Item-scoped capabilities (source_kind = `item`)

For capabilities whose `source_ref` matches `learning_items/<slug>`, the
`<slug>` is `stableSlug(learning_items.base_text)`. Look up the parent item
by joining on slug equivalence (the `learning_items` table has no slug
column; computing it from `base_text` matches projection).

| `artifact_kind` | Source query | Payload shape |
|---|---|---|
| `base_text` | `learning_items.base_text` | `{ value, reviewedBy, reviewedAt }` |
| `meaning:l1` | `item_meanings` where `learning_item_id` matches and `translation_language='nl'`, `is_primary=true` first; otherwise the first NL row | `{ value, reviewedBy, reviewedAt }` |
| `meaning:nl` | same as `meaning:l1` | `{ value, reviewedBy, reviewedAt }` |
| `meaning:en` | `item_meanings` where `translation_language='en'` | `{ value, reviewedBy, reviewedAt }` |
| `accepted_answers:id` | `[learning_items.base_text]` plus all `item_answer_variants.variant_text` where `language='id'` | `{ values, reviewedBy, reviewedAt }` |
| `accepted_answers:l1` | All `item_meanings.translation_text` where `translation_language='nl'`, plus all `item_answer_variants.variant_text` where `language='nl'`. Split each value by the regex `/\s+\/\s+|\s*;\s*/` to match `appendUniqueDelimited` (`scripts/lib/content-pipeline-output.ts:144-155`) — otherwise auto-filled answers and projection-derived answers diverge. | `{ values, reviewedBy, reviewedAt }` |

**Skip rule for items with no NL data**: per-row, not global. For each
`dialogue_chunk` capability:
1. Try `item_meanings` where `learning_item_id = item.id` and
   `translation_language='nl'`.
2. If no rows, fall back to `item_contexts.translation_text` joined via
   `learning_item_id` where `context_type='dialogue'`.
3. If still no translation, leave the artifact draft + log reason.

Do not fabricate translations. Per-row choice avoids the "if most ..."
ambiguity flagged by review.

**Skip rule for inactive items**: if `learning_items.is_active=false`,
skip every artifact for that capability — do not resurrect deactivated
content.

### 4.2 Pattern-scoped capabilities (source_kind = `pattern`)

For capabilities whose `source_ref` matches `lesson-<N>/pattern-<slug>`,
look up `grammar_patterns` where `slug = <slug>`.

| `artifact_kind` | Source | Payload shape |
|---|---|---|
| `pattern_explanation:l1` | `grammar_patterns.short_explanation`. If length < 20 chars, emit the payload but log a WARNING — short explanations are likely one-liners that a reviewer should expand. **The WARNING is informational and does not block promotion**; `hasConcreteArtifactPayload` (`scripts/lib/content-pipeline-output.ts:457-464`) only checks `nonEmptyString(value)`, no minimum length. The artifact still flips to `approved`. | `{ value, reviewedBy, reviewedAt }` |
| `pattern_example` | **Verified 2026-04-30: `item_context_grammar_patterns` is empty (0 rows) and `grammar_patterns.examples` column does not exist.** Source is `lesson_sections.content->'categories'[*]->'examples'` for the lesson section that introduces the pattern, joined via `grammar_patterns.introduced_by_lesson_id`. **Caveat: pattern↔category is 1:N** (lesson 1 has 7 patterns mapped across 3 categories). Use this fallback chain: (1) **Title match** — pick the category whose `title` matches the pattern's `name` (Dutch) or `slug` (English), case-insensitive, word-boundary substring. (2) **Keyword match within the chosen category, when multiple patterns share that category** — tokenize `pattern.name` (Dutch; strip any Indonesian/parenthetical suffixes, lowercase, drop stopwords like `de/het/een/met/zonder/of`); pick the first example in the category whose `dutch` field contains any pattern.name token as a substring. *Do not derive keywords from the slug — slugs are English and would not match the Dutch example text.* (3) **Lesson-wide fallback** — fires when (a) step 1 found no matching category at all, OR (b) step 1 found a category but step 2 found no keyword match within it. Pick the first non-empty example from any category in the same lesson's grammar section; log WARNING. (4) Leave draft + log if no examples in any category. Format payload as `{ value: '<indonesian> — <dutch>', ... }`. | `{ value, reviewedBy, reviewedAt }` |

### 4.3 Affixed-form-pair capabilities (source_kind = `affixed_form_pair`)

For capabilities whose `source_ref` matches `lesson-<N>/morphology/<slug>`,
look up `scripts/data/staging/lesson-<N>/morphology-patterns.ts`
`affixedFormPairs` array. Match by `pair.id` against the slug.

| `artifact_kind` | Source | Payload shape |
|---|---|---|
| `root_derived_pair` | `pair.root` + `pair.derived` | `{ root, derived, reviewedBy, reviewedAt }` |
| `allomorph_rule` | `pair.allomorphRule` | `{ rule, reviewedBy, reviewedAt }` |

### 4.4 Provenance tag

Every auto-filled payload includes:

```json
{
  "...": "...",
  "reviewedBy": "auto-from-legacy-db",
  "reviewedAt": "2026-04-30",
  "autoFillVersion": "1"
}
```

`reviewedBy: 'auto-from-legacy-db'` distinguishes these from manually
reviewed pilot artifacts (e.g. the akhir pilot's `reviewedBy:
'manual-release-smoke'`). A later reviewed payload can replace these
without conflict; the `quality_status` stays `approved` either way.

`autoFillVersion` allows a future re-fill pass to identify which artifacts
were filled by which version, in case the source-of-truth mapping changes.

## 5. Algorithm

```text
1. Connect with SUPABASE_SERVICE_KEY via the supabase-js service-role
   client. Service-role bypasses RLS by design — there is no WITH CHECK
   policy on capability_artifacts that gates UPDATEs against role.
   Direct UPDATE is safe.
2. Load all draft artifacts + their parent capabilities in a single join:

   select a.id, a.artifact_kind, a.payload_json, a.capability_id,
          c.canonical_key, c.source_kind, c.source_ref, c.capability_type
   from indonesian.capability_artifacts a
   join indonesian.learning_capabilities c on a.capability_id = c.id
   where a.quality_status = 'draft'
     and (a.payload_json->>'placeholder')::boolean = true;

3. **Pre-flight: detect slug collisions.** Run a query that materializes
   `stableSlug(base_text)` per `learning_items` row (732 active rows)
   and lists any slug that occurs more than once across active items
   (e.g., `apa`/`apa?`, `ya`/`ya!`). Use the service-role PostgREST
   client; the result fits within PostgREST's default 1000-row cap.
   Build a colliding-slug set; capabilities whose source_ref slug is in
   this set must be resolved by lesson scope (step 4a below). If any
   colliding capability cannot be unambiguously resolved, log CRITICAL
   and skip — do NOT guess.

4. Group rows by source_ref to amortize legacy lookups.

5. For each source_ref:
   a. If source_kind='item': look up `learning_items` by
      `stableSlug(base_text) = <ref-slug>`. If the slug is in the
      colliding-slug set from step 3, parse the lesson number from the
      capability's `canonical_key` path (e.g.
      `cap:v1:item:learning_items/apa:text_recognition:...` may pair with
      `lesson-3` via the introduction order), then disambiguate by
      joining `item_contexts.source_lesson_id` to the matching lesson.
      If still ambiguous, log CRITICAL for that capability and skip its
      artifacts.
   b. If source_kind='pattern': look up `grammar_patterns` by slug.
   c. If source_kind='affixed_form_pair': read morphology staging file
      and match by `pair.id` against the slug. Pairs whose `id` doesn't
      match any capability are not an error (extra pairs may exist);
      capabilities whose ref doesn't match any pair are skipped + reported.

6. For each draft artifact, compute the payload using §4 mapping. If the
   source data is missing or empty:
     - Leave the artifact at quality_status='draft'.
     - Record an entry in the script's report log with reason.

7. Apply updates in chunks of 50 rows (Kong header buffer limit), each
   chunk wrapped in `BEGIN; ...UPDATEs; COMMIT;` so a mid-run failure
   leaves a consistent state. Use a single Postgres transaction per
   chunk. **Note**: the DB column is `artifact_json` (verified
   2026-04-30 against `\d indonesian.capability_artifacts`); the
   staging file shape uses `payload_json`. The script must map staging
   `payload_json` → DB `artifact_json` when writing.

   ```sql
   begin;
   update indonesian.capability_artifacts
     set artifact_json = $new_payload,
         quality_status = 'approved',
         updated_at = now()
     where id = $artifact_id;
   -- ... up to 50 updates ...
   commit;
   ```

   The unique constraint is `(capability_id, artifact_kind,
   artifact_fingerprint)`. UPDATE-by-id avoids constraint conflicts.

8. After completion, print a JSON report with per-lesson + per-kind
   counts: filled, skipped, error, plus:
     - `slugCollisions`: the colliding-slug set from step 3 with
       resolutions (which slug → which capability via which lesson scope).
     - `dialogueChunkResidual`: per-lesson count of dialogue_chunk
       capabilities that stayed draft because neither `item_meanings`
       nor `item_contexts.translation_text` had Dutch content. Lessons
       5/7/8 are expected to have non-zero residuals here per the
       lesson-content-audio-migration-status doc; surfacing them helps
       the runbook know which lessons still need authoring before all
       capabilities are practiceable.

9. **Write the auto-filled payloads back to staging
   (`scripts/data/staging/lesson-<N>/exercise-assets.ts`)** so a future
   `publish-approved-content.ts` run does not overwrite the auto-filled
   DB state with placeholders. This makes the staging file the source of
   truth (matching the existing pilot pattern from `35139c5`) and avoids
   the need for a guard in publish. Commit the regenerated staging files.

   **Merge with manually-reviewed entries** — the staging regenerator
   must NOT silently overwrite the existing manually-reviewed pilot
   rows (e.g. the 7 akhir entries in
   `scripts/data/staging/lesson-1/exercise-assets.ts:1-60` carrying
   `reviewedBy: 'manual-release-smoke'`). The DB-side filter
   (`payload_json.placeholder=true`) protects manual entries in the
   DB; the staging file needs the equivalent guard. Algorithm:

   ```text
   For each lesson, load existing exercise-assets.ts as an array.
   If the file does not exist, treat as []. Then build merged map
   keyed by asset_key:
     for each existing entry:
       if entry.quality_status == 'approved' AND
          entry.payload_json.reviewedBy != 'auto-from-legacy-db':
         keep entry verbatim — manually reviewed, untouched
       else:
         drop (will be re-emitted by auto-fill if applicable)
     for each auto-filled entry:
       if asset_key not already in merged map (i.e. not protected above):
         add to merged map
   Sort merged map values by asset_key ascending, write to staging.
   ```

   **Determinism**: sort the merged `exerciseAssets` array by
   `asset_key` ascending before serialising. Use stable 2-space JSON
   indentation matching the existing TS-export shape. Re-runs against
   unchanged source data must produce a byte-identical file (asserted
   in tests).

   **Format**: keep TS export (`export const exerciseAssets = [...]`)
   to match the existing pilot. Files will balloon to ~600 KB per lesson
   (~5,800 artifacts × ~12 lines ≈ 70k lines across 9 files). The diff
   is mechanical and committed once. If file size becomes a problem
   later, a follow-up slice can move payloads to a sibling JSON sourced
   by `index.ts`.

10. **Exit code**: the script exits with **non-zero** if any unresolved
    CRITICAL was logged (slug collision that couldn't be disambiguated,
    payload that fails `hasConcreteArtifactPayload`, etc.). This lets
    the runbook + CI catch authoring drift before promotion runs.
```

## 6. Idempotency

- Re-runs are safe: the WHERE clause filters to draft+placeholder only.
  Already-approved artifacts (auto or manual) are not touched.
- If the same `autoFillVersion` runs twice and source data has not
  changed, the second run is a no-op.
- If a manual reviewer later replaces a payload (changing `reviewedBy`),
  re-running this script does not undo their change because the artifact
  is no longer `placeholder=true`.

## 7. Verification

```bash
# Dry-run prints planned updates without writing
npx tsx scripts/auto-fill-capability-artifacts-from-legacy.ts --dry-run

# Apply
npx tsx scripts/auto-fill-capability-artifacts-from-legacy.ts --apply

# Inspect post-apply state
psql ... <<'SQL'
select artifact_kind, quality_status, count(*)
from indonesian.capability_artifacts
group by 1,2 order by 1,2;
SQL

# DB-backed health check between fill and promote — catches contract
# drift before promotion runs (e.g. unexpected payload shape mismatches
# missed by hasConcreteArtifactPayload).
for n in 1 2 3 4 5 6 7 8 9; do
  npx tsx scripts/check-capability-health.ts --lesson $n --strict
done

# Promote per lesson — capabilities with all required artifacts approved flip
for n in 1 2 3 4 5 6 7 8 9; do
  npx tsx scripts/promote-capabilities.ts --lesson $n --apply
done

# Final count
psql ... <<'SQL'
select readiness_status, publication_status, count(*)
from indonesian.learning_capabilities
group by 1,2 order by 1,2;
SQL
```

Expected after both phases:
- `capability_artifacts.quality_status='approved'` count rises from 7 to
  ~5,400 (some intentionally skipped: dialogue chunks lacking translations
  in lessons 7-8).
- `learning_capabilities.readiness_status='ready'` count rises from 3 to
  ~2,300 (text/pattern/morphology capabilities that fully resolve).

## 8. Rollback

Single SQL revert:

```sql
update indonesian.capability_artifacts
set quality_status = 'draft',
    payload_json = jsonb_set(payload_json, '{placeholder}', 'true'::jsonb)
where payload_json->>'reviewedBy' = 'auto-from-legacy-db'
  and payload_json->>'autoFillVersion' = '1';
```

Followed by:

```sql
update indonesian.learning_capabilities
set readiness_status = 'unknown', publication_status = 'draft'
where id in (
  select capability_id from indonesian.capability_artifacts
  where payload_json->>'reviewedBy' = 'auto-from-legacy-db'
);
```

This restores the pre-Phase-1 state for auto-filled capabilities. Manually
reviewed pilot artifacts (e.g. akhir) are untouched because their
`reviewedBy` is different.

## 9. Risks And Mitigations

| Risk | Mitigation |
|---|---|
| Multiple `learning_items` rows match a single capability source_ref slug due to slug collisions (e.g., `apa` vs `apa?`) | Resolve by preferring the row whose lesson scope matches the capability's lesson canonical_key path |
| `item_meanings` has multiple NL rows; auto-fill picks the wrong one | Prefer `is_primary=true`. If multiple primary, prefer the longest non-empty translation. Log warnings. |
| `accepted_answers:l1` ends up over-permissive (every alternative variant accepted) | Acceptable for first-pass quality. A reviewer pass can prune later. |
| Dialogue chunks (lessons 7-8) have empty `item_meanings.translation_text` | Skip rule in §4.1 leaves these draft, capabilities for those items stay unschedulable. Acceptable until human authoring fills the translations. |
| `grammar_patterns.short_explanation` is sometimes a one-liner not suitable as a full pattern explanation | Acceptable for first-pass; explanation can be expanded by a later authoring pass. |
| `pattern_example` has no source for some patterns | Skip; those `pattern_recognition` capabilities stay draft. |
| Direct DB updates bypass Slice 10 staging files | Document in commit message + runbook. The staging files remain truthy for the SHAPE of capabilities; the DB holds the AUTHORITATIVE artifact payloads after this script runs. A future reviewer may re-write staging payloads from DB if needed. |
| Re-running publish from staging would overwrite auto-filled payloads with placeholders | **Write auto-filled payloads back to `scripts/data/staging/lesson-<N>/exercise-assets.ts` (algorithm step 9).** This makes staging the source of truth, mirroring the existing pilot pattern (`35139c5 content: approve lesson 1 pilot artifacts`). Commit the regenerated staging files alongside the script. No guard is needed in publish; future re-publishes simply re-write the same approved payloads. |

This shift means staging files become non-trivially large per lesson
(~600+ KB each for fully-filled `exercise-assets.ts`). The diffs are
mechanical and committed once.

## 10. Files

```text
scripts/auto-fill-capability-artifacts-from-legacy.ts   (new, ~500 LOC)
scripts/__tests__/auto-fill-capability-artifacts.test.ts (new, ~250 LOC)
scripts/data/staging/lesson-<N>/exercise-assets.ts       (regenerated by step 9 of the algorithm; ~9 files)
docs/current-system/capability-release-runbook.md       (append: auto-fill step + health-check between fill and promote)
```

No changes to `publish-approved-content.ts` are required — the staging
write-back in step 9 makes the existing publish flow idempotent against
the auto-filled state.

## 11. Tests

**Test infrastructure**: pure planning-function tests use Vitest with
in-memory fixtures (no Supabase mock). Only the DB-touching adapter
(load draft artifacts + apply chunked updates) is integration-tested
with a fixture-loaded mocked Supabase client. The staging write-back
merge is also pure and can be unit-tested with in-memory fixtures.

The test file should cover the pure planning function (no DB):

- Item with single NL meaning → fills `meaning:l1` / `meaning:nl` / `accepted_answers:l1`.
- Item with both NL and EN meaning → fills all three meaning artifacts.
- Item with `is_primary=true` NL meaning → picks that one.
- Item with multiple NL meanings, none primary → picks the longest non-empty.
- **Item with two `is_primary=true` NL meanings (data anomaly)** →
  picks the longest non-empty + logs a WARNING with both candidates.
- Item with no NL meaning → skips `meaning:l1` and `accepted_answers:l1`,
  records reason in report.
- `accepted_answers:l1` dedupes correctly when split by the regex
  `/\s+\/\s+|\s*;\s*/`.
- Pattern with no `short_explanation` → skips `pattern_explanation:l1`.
- **Pattern with `short_explanation` length < 20 chars** → fills, but
  logs a WARNING that the explanation is likely a one-liner.
- Affixed form pair from staging file → fills `root_derived_pair` and
  `allomorph_rule`.
- **Affixed form pair whose `pair.id` doesn't match any capability** →
  no error (extra pairs are allowed); the unrelated pair is ignored.
- **Capability whose ref doesn't match any affixed form pair** →
  skip + report.
- Already-approved artifact is left untouched.
- **Capability for `learning_items.is_active=false`** → skip every
  artifact and report.
- **Slug collision between two `learning_items` rows** → resolved by
  matching the lesson scope encoded in the capability's canonical key
  via `item_contexts.source_lesson_id`. Test covers both the resolved
  case (matches one item) and the unresolved case (no item_contexts row
  for either lesson — logs CRITICAL and skips).
- **Auto-fill produces a payload that fails `hasConcreteArtifactPayload`**
  (e.g. empty trimmed value) → does not flip to approved; logs CRITICAL.
  This is a defense-in-depth assertion against silent payload-shape drift.
- **Pattern whose lesson has categories but none match by title or by
  keyword** → falls through to the lesson-wide first example with a
  WARNING; capability still becomes promotable. Test asserts the
  fallback fires and the warning is recorded.
- **Step 9 determinism** → re-running the script against unchanged source
  produces a byte-identical `exercise-assets.ts` (sorted by `asset_key`,
  stable indentation). Test runs the regenerator twice and asserts no
  diff between the two outputs.
- **Exit code on unresolved CRITICAL** → script returns non-zero when
  any capability or artifact was skipped due to a CRITICAL condition.
- **Staging merge preserves manually-reviewed entries** → when an
  existing `exercise-assets.ts` has an entry with
  `quality_status='approved'` and `payload_json.reviewedBy !=
  'auto-from-legacy-db'` (e.g. the akhir pilot's
  `reviewedBy: 'manual-release-smoke'`), the regenerated file keeps
  that row verbatim. Auto-derived entries with the same `asset_key`
  are dropped from the auto-fill payload. Test fixture: 1 manual
  + 1 auto-target row, run regenerator, assert manual row
  preserved + auto row replaces only the draft.
- **Pattern keyword tokenization** uses the pattern's Dutch `name`,
  not the slug. Test fixture: pattern with `name='Werkwoord (kata
  kerja)'`, slug `'verb-no-conjugation'` → tokenization yields
  `['werkwoord']` (parenthetical stripped, lowercased, stopwords
  dropped); fallback chain step 2 substring-matches `werkwoord`
  against examples'`dutch` field correctly.

The DB-touching adapter is integration-tested with a fixture-loaded
mocked Supabase client.

## 12. Open Questions

Resolved by the 2026-04-30 architect review:

1. **~~Does `publish-approved-content.ts` need to be patched?~~**
   No. Step 9 of the algorithm writes auto-filled payloads back to
   `staging/lesson-<N>/exercise-assets.ts`, making the staging files the
   source of truth. Future re-publishes are idempotent.

2. **Should auto-filled artifacts use a new `quality_status` tier?** No.
   The existing `draft / approved / blocked / deprecated` tiers stay.
   Provenance is tracked at the payload level via `reviewedBy:
   'auto-from-legacy-db'`. The capability-level `activation_source`
   (which is `review_processor`/`admin_backfill`/`legacy_migration`) is
   orthogonal — it tracks WHO activated, not WHO authored the artifact.
   No redundancy.

3. **What about `l1_to_id_choice` capabilities?** They share the same
   artifact set as `text_recognition` (`meaning:l1` + `base_text`) so
   auto-fill covers them automatically. The test cases in §11 explicitly
   include this.

4. **Audio capabilities and the path to Phase 2.** Today's projection
   (`capabilityCatalog.ts`) does not emit `audio_recognition` or
   `dictation` capabilities, so no `audio_clip` artifacts exist yet. The
   auto-fill script should still implement `audio_clip` mapping (lookup
   `audio_clips.storage_path` by `learning_items.normalized_text`) so
   that when Phase 2 extends projection, no script changes are needed.
   Same for `cloze_context` (look up `item_contexts` where
   `context_type='cloze'` and `learning_item_id` matches).
