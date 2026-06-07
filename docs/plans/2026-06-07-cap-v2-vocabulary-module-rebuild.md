---
status: approved
parent: docs/plans/2026-06-06-capability-stage-v2-slice-1-vocabulary.md   # approved spec (the WHAT)
reviewed_by: [architect, data-architect]   # round 2 — both APPROVED 2026-06-07 (3 CRITICALs + warnings resolved)
implementation: null
---

# Cap-v2 Vocabulary Module — Rebuild Implementation Plan (the HOW)

> **For Claude:** REQUIRED SUB-SKILL: execute task-by-task. **MAIN-THREAD ONLY** — do NOT
> delegate code/content edits to subagents: the read-before-edit hook blocks subagent Edits
> (their mid-run Reads don't flush to the transcript the hook inspects). See
> `memory/project_subagent_edit_hook_transcript_fault`. The `executing-plans` skill's
> subagent-driven option is therefore OFF for this plan.

**Goal:** Build the complete `vocabulary/` capability-stage module so it OWNS the item slice
end-to-end (item caps + learning_items + POS + anchor contexts + item content_units + junction +
item `contextual_cloze` + distractors), amputate the runner's item branch in one cutover, and
drive **lesson 11 through it end-to-end** — confirming caps + exercises + distractors land and
render.

**Architecture:** A clean, DB-native, thin-composition module (CLAUDE.md "thin composition of
pure functions > stateful runner"). It REUSES the already-proven pure primitives (the item
projector, the adapter write fns, the done distractor slice) and adds only three genuinely-new
pure pieces (item-cloze cap emitter, item content-units builder, the vocab gate). The runner
LOSES its item branch (deleted, not filtered); the two stages share only the DB tables, never
code (CONTEXT.md "separation stops at the shared capability table"). This is REBUILD, not
"untangle".

**Tech Stack:** TypeScript + Bun + Vitest; Supabase (PostgREST) `indonesian` schema; the existing
`scripts/lib/pipeline/capability-stage/` deep module; `@huggingface/transformers` local embeddings
(already installed).

---

## 0. Grounding (read before reasoning; all verified against code this session)

**Spec (the WHAT):** `docs/plans/2026-06-06-capability-stage-v2-slice-1-vocabulary.md` §1 (scope),
§3 (the 7 capability types), §4/§4a/§4b/§4c/§4d (distractors/cloze/audio/retirement), §5/§5a
(module structure + writer seam), §6a (gate set), §7 (rollout). `status: approved`, reviewed by
architect + data-architect (round 4 strangler-to-prod).

**CONTEXT.md anchors:** *Capability Stage* (DB-authoritative seeder, ADR 0011); *Stage Contract*
(reads only DB, no staging crosses the boundary); *Pipelines are per content origin* ("separation
stops at the shared capability table"); *Learning Item* (item-harvest rule: only word/phrase).

**Target architecture:** `scripts/lib/pipeline/` is LOCKED (Plate IV, `:187`); the only target-arch
constraint touching this work is the retirement of the RUNTIME `src/lib/distractors/` (`:178`,
`:461`, `:507`, `:582-623`, `:1538`) — already handled by the shipped cutover pt1/pt2 (the runtime
reader now reads the `distractors` pointer table). No target-arch constraint on the new
`vocabulary/` sub-module shape beyond "thin composition".

### 0.1 What is already DONE and CORRECT — reuse verbatim (do NOT rebuild)

The **distractor slice** (commits `1f20cd5`→`56865bd`, 102 hermetic tests green, live-populated
5832 rows). It reads item caps **back from the DB** (`vocabulary/store.ts:96`
`fetchItemCapsForLesson` → `learning_capabilities WHERE source_kind='item' AND lesson_id`), so it is
**writer-agnostic** — it works unchanged whether the runner or the new module wrote the caps. Files:
- `vocabulary/selectDistractors.ts`, `planDistractors.ts`, `seedDistractors.ts`, `validateCoverage.ts`, `store.ts`
- `shared/embeddings.ts`
- `orchestrate.ts` — `populateLessonDistractors` (single-lesson Stage-C entry) + `populateAllDistractors`

The runtime reader cutover is also shipped: `byKind/item.ts` reads the `distractors` pointer table;
`recognitionMcq`/`cuedRecall`/`listeningMcq` are wired to it; `src/lib/distractors/` is deleted;
the 3 old distractor tables are dropped in `migration.sql`. **NOT yet deployed** (parked).

### 0.2 Reused pure primitives (shared infra — import, do NOT copy)

These live in `capability-stage/` and are shared infra, not "inherited runner code":
- `projectors/vocab.ts:105` `projectItemsFromTypedRows` — pure item projector → 4 text caps + 2
  audio caps (currently gated on `audioClipsByNormalizedText`) + `learningItemInput` + `anchorContext`.
  **Rebuild change (audio, see §0.8):** the `if (audioMap.has(key))` clip-gate (`:240-283`) becomes
  unconditional — but that change **rides the cutover commit (Task 8)**, not the additive build,
  because it breaks existing green tests (`projectors/vocab.test.ts`, `runner.itemCutover.test.ts`)
  that are rewritten/removed at the cutover anyway (green-suite invariant, spec §7). The "flag if
  missing" half is independent and lands now (CS23, Task 4). **Does NOT emit `contextual_cloze`** —
  that is the one new cap this rebuild adds.
- `adapter.ts`: `upsertLearningItemIdempotent` (insert full / update translations-only — ADR 0011),
  `upsertItemAnchorContext`, `upsertCapabilitiesSkipIfExists` (INSERT … ON CONFLICT DO NOTHING —
  FSRS-safe), `upsertContentUnits` (idempotent on `content_unit_key`), `upsertCapabilityContentUnits`,
  `fetchLearningItemPosByNormalizedText`, `updateLearningItemPos`, `retireOrphanedCapabilities`.
- `enrichPos.ts` `enrichMissingPos` (pure-ish; classifies null-pos word/phrase via Haiku).
- `loadFromDb.ts` `loadFromDb` → `{ items: TypedItemRow[], itemState }` and `fetchDistractorPool`.
- `loader.ts` `loadLesson` → `{ lesson, sections, audioClipsByNormalizedText }`.
- `content-pipeline-output.ts`: `stableSlug`, `sourceRefForLearningItem`, `contentUnitKey`,
  `sourceRefForLesson`, `StagingContentUnit` (the content_unit key formula — one home).

### 0.3 The runner's item branch to AMPUTATE (mapped exactly, `runner.ts`)

| Step | Lines | What | Disposition |
|---|---|---|---|
| 1c | 202–216 | `loadFromDb`, `fetchDistractorPool`, `projectItemsFromTypedRows`, `allItemCaps` | item parts → vocab; `distractorPool` STAYS (pattern path uses it, `:562`) |
| pre-write gate | 228–240 | `learningItems:` item checks (CS4/CS4b/CS19/CS20/CS5) | → vocab gate; runner passes `learningItems: []` |
| `validateItemSourceRefResolvability` | 429–432 | item source_ref check | → vocab (runner has no item caps after amputation) |
| 5b | 452–464 | item `learning_items` + anchor write loop | → vocab |
| 5b+ | 466–522 | DB-native POS backfill | → vocab |
| 5b caps | 524–546 | `upsertCapabilitiesSkipIfExists(allItemCaps)` + merge ids | → vocab |
| 4b content_units | 366–375 | `buildContentUnitsFromDb` (incl. item loop) | item loop → vocab's own builder; runner keeps section/grammar/affixed |
| 6 junction | 617–621 | `...allItemCaps` in `junctionCaps` | → vocab; runner keeps affixed+pattern |
| retire CALL | 589–592 | `retireOrphanedCapabilities` (stays, but item keys leave `emittedKeys`) | **EDIT not amputate** — add `sourceKinds:['dialogue_line','pattern','affixed_form_pair']` (Task 8a) |
| 9 | 760–762 | `publishedItemIds` | → vocab |
| 12 gate inputs | 786–805 | `writtenItems` (CS14), `itemDuplicatesInput` (CS17) | → vocab gate |
| POS coverage | 885–899 | informational POS log | → vocab |

> **Line numbers drift as lines are deleted — navigate by the `---- N.` markers, not the cites above.**
> The retire CALL is the one row that is *edited, not removed*: after amputation its `emittedKeys` no
> longer contain item keys, so without the `sourceKinds` filter it would sweep every live item cap
> (Task 8a). What **stays** in the runner: pattern path (5a-pattern, 5d), affixed (5a-affixed, 7c),
> dialogue cloze (5a-dialogue, 7b), lesson_section content_units, their junctions, and the non-item gate.

### 0.4 The content_units + junction entanglement — RESOLVED by clean split (not "untangle")

`projectors/contentUnits.ts:123` `buildContentUnitsFromDb` builds **four** unit kinds in one call:
`lesson_section` (display 0–N), `learning_item` (1000+), `grammar_pattern` (2000+), `affixed_form_pair`
(3000+), then sorts. The display-order ranges are **disjoint** and the `content_unit_key`s are
**disjoint** → two independent builders writing to the one `content_units` table via the idempotent
`upsertContentUnits` produce a globally-consistent ordering with **zero collision**. So:
- **Extract** the item loop (`contentUnits.ts:151-175`) into a new `vocabulary/contentUnits.ts`
  `buildItemContentUnits(itemRows, lessonNumber)` — byte-identical formula, reusing the same helpers.
- **Remove** the item loop from `buildContentUnitsFromDb` and drop its `itemRows` param (the runner
  no longer needs `itemDbResult` at all after amputation).
- The junction splits the same way: vocab links item caps → item units; runner links affixed/pattern.

This is exactly "each origin owns its own builder" (CONTEXT.md) — NOT "splitting a shared builder for
zero behavior change" (the narrowing that was reversed). CS7 count-parity falls out per-stage: each
stage declares only the units it wrote (this also fixes the long-noted CS7 count-parity bug,
`memory/project_pipeline_followup_bugs`).

### 0.5 The publish blocker — CORRECTED diagnosis (memory was partly wrong; verified in code)

The acceptance publish (lesson 2) hit Stage B `validation_failed`. Re-checked against the validators:
- **CS5 (POS) missing-pos is `warning`-only** (`validators/pos.ts:7`, `gate.ts:149`) — it does **NOT**
  cause `validation_failed` (only `severity==='error'` short-circuits, `runner.ts:242`). The memory's
  "~65 CS5/GT10 POS errors blocking publish" is wrong: those are warnings (→ `status:'partial'`, still
  publishes). The "pre-write checks the null projection" framing is real but **immaterial** — it only
  produces warnings.
- **The real ERROR-class blockers are pure DATA issues in the lesson's own items:**
  - **CS19** (`validators/itemSeparatorConvention.ts:69`, ERROR) — comma-as-OR / `;` in `translation_nl`
    (e.g. `"maar, echter"`, `"rijden, gaan, lopen"`): genuinely mis-encoded alternatives that should be
    `/`-separated (`"maar / echter"`). The grader no longer splits on comma (Decision R), so this is a
    correct flag.
  - **CS4b** (`validators/itemTranslations.ts:47`, ERROR) — null/empty `translation_nl` on a non-dialogue item.
- GT10 is a **Stage A** (lesson-stage) gate; Stage A passed in the acceptance attempt, so GT10 is not
  the Stage B blocker.

**Consequence for the rebuild:**
1. The POS-warning noise is cleaned **by construction** — the vocab gate runs the POS check
   **post-backfill** (CS14 against written rows), not pre-write against the null projection. No
   separate patch; the runner's broken pre-write CS5-on-projection simply leaves with the amputation.
2. CS19/CS4b are **data fixes in the published lesson's staging**, not code changes. For lesson 11:
   grep its `learning-items.ts` for comma/`;`-separated and empty `translation_nl`, fix to `/`-form,
   before the e2e publish. (Scope is the published lesson's own items — the gate validates the
   projection of the lesson being published, not Pool(N).)

### 0.6 Item `contextual_cloze` — net-new (Mode-1, deferred until now)

`generateClozeContexts.ts:13` is Mode-2 (dialogue) only; Mode-1 (item carrier → `item_contexts(cloze)`)
was explicitly deferred. No `contextual_cloze` item cap is emitted anywhere today (grep-confirmed).
Per spec §4b: the carriers are **pre-authored** `item_contexts` rows (`context_type='cloze'`,
seed-once / DB-authoritative, ADR 0011) — authored by `scripts/extract-cloze-items.ts` /
`seed-cloze-contexts.ts`, NOT by the capability stage. The vocab module's job is only to **emit a
`contextual_cloze` cap** for each item that has a cloze carrier in `item_contexts`. **Build-time
verification (Task 9):** confirm lesson 11's cloze carriers are seeded into `item_contexts` before the
e2e publish, or the cloze render path won't fire (acceptance requires it — `feedback_answer_log_check`).

### 0.7 Strangler / cutover ordering (spec §5a/§7 — non-negotiable)

- Build the vocab module **additively** with hermetic/unit tests (Tasks 1–8); it runs in **no live
  publish** yet, so the runner remains the sole item-cap writer during the build.
- **One cutover commit** (Task 9 cutover) flips it: amputate runner item branch + remove item units
  from `buildContentUnitsFromDb` + runner junction + wire `publish-approved-content.ts` to call vocab
  AFTER the runner. No publish ever runs both writers (`UNIQUE(source_ref,capability_type)` is the
  writer-bug backstop, not a coexistence license).
- The 3 old distractor-table drops are already in `migration.sql` (cutover pt2). **Deploy order:**
  merge → ghcr build → recreate homelab container (Portainer env 3) → THEN `make migrate` (drops).
  Never drop-first (PGRST205 / Slice-4a lesson).

### 0.8 Audio capabilities — assume audio exists; flag if missing (operator decision 2026-06-07)

This **overrides spec §4c's** "emit the two audio caps *only when* a clip exists". That silent skip
turns a Lesson-Stage failure (a vocab word that never got voiced) into invisible missing practice —
unacceptable. In the vocab stage:
- **Flag, don't block (lands NOW, Task 4):** the vocab gate raises a **WARNING (CS23)** naming any
  word/phrase item whose `audio_clip` is missing. It surfaces the gap without halting — the proper
  hard enforcement is a Stage-A concern, kept out of this plan to keep the vocab-stage focus.
- **Emit `audio_recognition` + `dictation` for every word/phrase item** (audio is *assumed* to exist —
  `ensureLessonAudio` voices every vocab/expressions/numbers item, `lesson-stage/runner.ts:436`): drop
  the projector's clip-gate. **This rides the cutover commit (Task 8)**, not the additive build,
  because it rewrites green tests that the cutover removes anyway (§0.2). Note: once #165 enforces full
  audio coverage at Stage A, conditional and unconditional emission *converge* (every item has a clip),
  so this is belt-and-suspenders, not load-bearing — the load-bearing half is the CS23 flag above.
- **The proper fix is deferred to #165** — a Lesson Gate (Stage A) ERROR that halts the publish when
  any harvested vocab item lacks audio. That is the architecturally-correct home ("did the Lesson
  Stage do its job?"); this plan does **not** touch Stage A.

---

## Phase 1 — New pure pieces (TDD, hermetic, additive)

### Task 1: Item content-units builder (`vocabulary/contentUnits.ts`)

**Files:**
- Create: `scripts/lib/pipeline/capability-stage/vocabulary/contentUnits.ts`
- Test: `scripts/lib/pipeline/capability-stage/__tests__/vocabulary/contentUnits.test.ts`

**Step 1 — failing test.** Assert `buildItemContentUnits` reproduces `buildContentUnitsFromDb`'s item
rows byte-for-byte for a word and a phrase (same `content_unit_key`, `source_ref`, `unit_slug`
`item-<stableSlug>`, `source_section_ref` `…/section-{dialogue|vocabulary}` from `section_kind`,
`unit_kind:'learning_item'`, `display_order` `1000+i`), and **excludes** `sentence`/`dialogue_chunk`.
Use a fixture of 3 `TypedItemRow`s (word, phrase, sentence).

```ts
import { buildItemContentUnits } from '@/scripts/.../vocabulary/contentUnits' // adjust import style to repo
import { buildContentUnitsFromDb } from '@/scripts/.../projectors/contentUnits'
it('matches the legacy item-unit rows exactly', () => {
  const rows = [wordRow, phraseRow, sentenceRow]
  const mine = buildItemContentUnits(rows, 11)
  const legacyItemUnits = buildContentUnitsFromDb({ lessonNumber: 11, sections: [], itemRows: rows, patternPlans: [], affixedPairs: [] })
    .filter(u => u.unit_kind === 'learning_item')
  expect(mine).toEqual(legacyItemUnits)
})
```

**Step 2 — run, expect fail** (`buildItemContentUnits` not defined).

**Step 3 — implement.** Lift `contentUnits.ts:151-175` verbatim into the new file, reusing
`stableSlug`, `sourceRefForLearningItem`, `contentUnitKey`, `sourceRefForLesson` from
`content-pipeline-output`. Sort by `display_order` then `unit_slug` (matching the parent).

**Step 4 — run, expect pass.** **Step 5 — commit** `feat(cap-v2 #161): vocab item content-units builder`.

### Task 2: Item `contextual_cloze` cap emitter (`vocabulary/projectItemCloze.ts`)

**Files:**
- Create: `scripts/lib/pipeline/capability-stage/vocabulary/projectItemCloze.ts`
- Test: `…/__tests__/vocabulary/projectItemCloze.test.ts`

**Design (pure):** `projectItemClozeCaps({ itemsWithCloze, lessonId }) → CapabilityInput[]` where
`itemsWithCloze: { normalizedText, indonesianText }[]` is the subset of this lesson's items that have
a `context_type='cloze'` carrier in `item_contexts`. One cap per item, **using the verified live
`contextual_cloze` contract** (confirmed against `projectors/dialogueCloze.ts:47-54`, the only live
`contextual_cloze` emitter — the dialogue_line precedent):

```ts
{
  sourceKind: 'item',
  sourceRef: sourceRefForLearningItem(indonesianText),  // learning_items/<normalizedText>
  capabilityType: 'contextual_cloze',
  direction: 'id_to_l1',        // VERIFIED — matches dialogueCloze.ts:51. NOT 'context_or_existing'
  modality: 'text',             //   (that string is not in the CapabilityDirection union,
  learnerLanguage: 'none',      //   capabilityTypes.ts:61-68 — it would mint a non-canonical key).
  lessonId,
  requiredArtifacts: [],        // VERIFIED — RENDER_CONTRACTS.cloze.requiredArtifacts.item:[] (renderContracts.ts:110)
  prerequisiteKeys: [textRecognitionKey],  // not identity-bearing (canonical_key excludes it); ADR 0007 sequencing
  canonicalKey: buildCanonicalKey({ sourceKind:'item', sourceRef, capabilityType:'contextual_cloze', direction:'id_to_l1', modality:'text', learnerLanguage:'none' }),
  projectionVersion: CAPABILITY_PROJECTION_VERSION,
}
```

> **Identity is load-bearing.** `canonical_key` is opaque/deterministic (spec §2;
> `adapter.ts onConflict:'canonical_key'`) and `UNIQUE(source_ref, capability_type)` will NOT catch a
> wrong `direction` (the type matches, the key differs). The values above are the *verified* contract,
> not a TODO — `direction:'id_to_l1'` exactly mirrors the live dialogue `contextual_cloze` cap.
> **No new `CapabilityType` enum value and no `RENDER_CONTRACTS.cloze` addition** are needed —
> `contextual_cloze` is already in `CAPABILITY_TYPES` and `RENDER_CONTRACTS.cloze` serves
> `['item','dialogue_line']` (`renderContracts.ts:107-118`), verified by both reviewers.

**Step 1 — failing test:** given 2 items (one with a carrier, one without), emit exactly 1 cap with
the verified shape + a stable `canonicalKey`. **Step 2** fail. **Step 3** implement.
**Step 4** pass. **Step 5** commit `feat(cap-v2 #161): item contextual_cloze cap emitter`.

### Task 3: Cloze-carrier DB read (`vocabulary/store.ts` extension)

**Files:** Modify `vocabulary/store.ts`; Test `…/__tests__/vocabulary/store.clozeCarriers.test.ts` (or
live-verify per the existing store pattern — thin glue).

Add to `DistractorStore` (or a small separate store fn) a reader:
`fetchItemsWithClozeCarrier(lessonId): Promise<{ normalizedText, indonesianText }[]>` — reads
`item_contexts` `context_type='cloze'` joined to `learning_items` for items introduced by `lessonId`
(via the item caps' `source_ref`, same resolution as `fetchItemCapsForLesson`). Use
paginate-all-then-filter (the gateway-URL-length rule already encoded in `store.ts:30-36`).

> Follow the existing store convention: **no unit test for the thin DB glue; live-verify** at the
> populate/publish pass (orchestration logic is unit-tested behind the interface). Commit with Task 2
> or standalone.

## Phase 2 — The vocab gate (TDD, pure where possible)

### Task 4: Vocab gate (`vocabulary/gate.ts`)

**Files:** Create `vocabulary/gate.ts`; Test `…/__tests__/vocabulary/gate.test.ts`.

Compose the **item-layer** checks the runner gate ran, split into pre/post like `gate.ts`:
- **Pre-write (pure, against the projection):** CS4 `validatePerItemMeaning`, CS4b
  `validateItemTranslations`, CS19 `validateItemSeparatorConvention`, CS20 `validateItemLength`. **Do
  NOT** run CS5 POS here (the projection is null by construction — it only yields noise).
- **Post-write (DB/written-row aware):** CS14 `validateItemPos` against **post-backfill** written rows
  (this is the correct POS gate placement — fixes 0.5), CS15 `validateItemCoverage` /
  `vocabulary/validateCoverage.ts` (distractor coverage = `min(3,|eligible Pool(N)|)`), CS17
  `validateItemDuplicates`. Add the spec §6a HCs that are item-scoped: **cloze out-of-pool** (carrier
  word above the cap's lesson — flag) and **audio coverage** (see §0.8): WARN-level flag naming every
  word/phrase item that lacks an `audio_clip` (audio is assumed; a missing clip is surfaced, not
  blocked — the hard Stage-A error is deferred to **#165**).

> Reuse the existing validators (`validators/perItemMeaning`, `itemTranslations`,
> `itemSeparatorConvention`, `itemLength`, `itemPos`, `itemCoverage`, `itemDuplicates`) — import, don't
> copy. The gate is thin composition.

**Step 1 — failing tests** (one per check: CS19 errors on `"maar, echter"`; CS4b errors on null nl;
CS14 warns on null post-backfill pos; coverage asserts `min(3,|eligible|)`). **Steps 2–4** red→green.
**Step 5** commit `feat(cap-v2 #161): vocab gate (item pre/post-write checks)`.

## Phase 3 — The module entry (composition + live-verify)

### Task 5: `publishVocabulary` entry (`vocabulary/publish.ts` + fold into `orchestrate.ts`)

**Files:** Create `vocabulary/publish.ts`; Modify `orchestrate.ts` (export the entry); Test
`…/__tests__/vocabulary/publish.test.ts` (hermetic, fake supabase + injected embedder/generateFn).

> **DESCOPED per §9a:** steps 3–4's item-cloze emission (`fetchItemsWithClozeCarrier` →
> `projectItemClozeCaps` → `clozeCaps`) is **NOT wired** — the emitter/reader are built + tested but kept
> as unwired scaffolding for #167. `capsToWrite = allItemCaps` only. The steps below are left as the
> original design record; the as-built `publish.ts` omits cloze.

**`publishVocabulary(supabase, { lessonId, lessonNumber, dryRun, regenerate }, hooks) → VocabStageOutput`**
— thin composition (mirror the proven runner sequence, item-only):
1. `loadLesson` (audio map) + `loadFromDb` (items + itemState).
2. `projectItemsFromTypedRows` → `perItemPlans`, `allItemCaps`.
3. `fetchItemsWithClozeCarrier` → `projectItemClozeCaps` → `clozeCaps`.
4. `validateItemSourceRefResolvability(allItemCaps + clozeCaps, items)`.
5. **vocab gate pre-write** → if any `error`, return `validation_failed` (no writes).
6. `dryRun` → return `ok` before writes.
7. Writes (dependency order): `upsertLearningItemIdempotent` + `upsertItemAnchorContext` per plan →
   POS backfill (`fetchLearningItemPosByNormalizedText` + `enrichMissingPos` + `updateLearningItemPos`)
   → `upsertCapabilitiesSkipIfExists(allItemCaps + clozeCaps)` → merge ids with `itemState` existing →
   `buildItemContentUnits` + `upsertContentUnits` → item junction (`upsertCapabilityContentUnits`,
   relationship_kind rule from `runner.ts:633-636`) → `retireOrphanedCapabilities` scoped to item keys
   (**verify scoping** so it never sweeps the runner's non-item caps — Task 8 landmine).
8. **Seed distractors** (this absorbs Stage C): call `populateLessonDistractors(supabase, {lessonId,
   lessonNumber}, { embedder, regenerate })`.
9. **vocab gate post-write** — MUST run AFTER step 8 (the distractor seed) so **CS15 coverage reads the
   seeded `distractors` rows, not zero** (architect WARNING). CS14 POS post-backfill + CS15 coverage +
   CS17 duplicates + cloze/audio HCs; aggregate into `status` (`ok` | `partial` | `validation_failed`).
10. Return counts + findings.

**Tests (hermetic):** a full fake-supabase publish writes N item caps + cloze caps + content_units +
junction; re-run = **zero delta** (idempotent, ADR 0011); a comma-separator item → `validation_failed`.

**Commit** `feat(cap-v2 #161): publishVocabulary module entry (item slice end-to-end)`.

### Task 6: Extend the no-disk gate

**Files:** Modify `__tests__/enforcement/noDiskReads.test.ts` to include the new `vocabulary/*.ts`
(contentUnits, projectItemCloze, publish, gate). **Step:** run it; expect zero disk reads. Commit with
Task 5 or standalone.

### Task 7: Module spec

**Files:** Create `docs/current-system/modules/capability-stage-vocabulary.md` (frontmatter:
`module: capability-stage-vocabulary`, `surface: scripts/lib/pipeline/capability-stage/vocabulary/`,
`status: in-flight`). §5 Seams: upstream = lesson-content tables (Stage Contract); sibling = the
shrunk runner (non-vocab kinds), shared only via `learning_capabilities`; downstream = runtime reader
`byKind/item.ts`. Commit `docs(cap-v2 #161): vocabulary module spec`.

## Phase 4 — Cutover (ONE commit) + lesson 11 acceptance + deploy

### Task 8: Amputate the runner item branch (the cutover — one commit)

**Files:** Modify `runner.ts`, `projectors/contentUnits.ts`, `adapter.ts` (retire signature),
`publish-approved-content.ts`, `src/lib/capabilities/renderContracts.ts`,
`src/lib/exercise-content/byType/clozeMcq.ts`. Modify/remove the now-obsolete item tests in
`__tests__/` (item-projection / item-junction / CS14-17 runner tests — coverage moved to the vocab
module). Everything in this task rides **one commit** (spec §5a/§7 — no coexistence window).

Per the §0.3 map (navigate by the `---- 5b.` / `---- 6.` markers, NOT line numbers — the plan deletes
lines as it goes), delete (not filter) every item-branch part from `runner.ts`; drop the item loop +
`itemRows` param from `buildContentUnitsFromDb`; remove `...allItemCaps` from the runner junction; pass
`learningItems: []` to the runner's pre-write gate; drop the runner's item gate inputs
(`writtenItems`/`itemDuplicatesInput`) and item POS coverage log. Wire the publish:

```ts
const stageA   = await runLessonStage({ lessonNumber, dryRun: false })
const stageB   = await runCapabilityStage({ lessonNumber, lessonId: stageA.lesson.id, dryRun, regenerate }) // non-vocab
const stageVoc = await publishVocabulary(supabase, { lessonId: stageA.lesson.id, lessonNumber, dryRun, regenerate })
```

**8a. `retireOrphanedCapabilities` dual-emit-set fix (highest-risk; signature change — both reviewers CRITICAL/WARNING).**
The live fn (`adapter.ts:179-212`) scopes **only** by `.eq('lesson_id', lessonId)` — NO `source_kind`.
After the split there are two emit sets for one lesson (runner: dialogue_line/pattern/affixed; vocab:
item). Each stage calling with only its own keys would soft-retire the OTHER stage's caps. **Fix (one
fn, two callers, atomic in this commit):**
- Add `sourceKinds?: string[]` to the input type; when present, add `.in('source_kind', sourceKinds)` to
  the fetch query (`adapter.ts:183-188`). Update the PR-1.5 docstring contract.
- Runner caller (`runner.ts:589-592`): pass `sourceKinds: ['dialogue_line','pattern','affixed_form_pair']`.
- Vocab caller (`publishVocabulary` step 7): pass `sourceKinds: ['item']`.
- **Required regression test:** drive BOTH sweeps against the same fake `lessonId` (runner emits
  non-item keys, vocab emits item keys) and assert neither retires the other's caps (disjointness).

**8b. Remove item `contextual_cloze` from the `cloze_mcq` contract (spec §3/§4b/§4d — both reviewers).**
Item cloze is **typed-only** (the `cloze` builder), never `cloze_mcq`. Live code still routes it both
ways: `renderContracts.ts:119-132` lists `cloze_mcq` `capabilityTypes:[...'contextual_cloze'...]` +
`supportedSourceKinds:['item','pattern']`, so `exerciseTypesForCapability('contextual_cloze')` returns
BOTH `cloze` and `cloze_mcq` — an emitted item cloze cap could resolve to an MCQ instead of the typed
exercise (the byKind/item.ts:164-176 item-cloze_mcq distractor path). **Fix, same commit:**
- Remove `'contextual_cloze'` from `RENDER_CONTRACTS.cloze_mcq.capabilityTypes` (`renderContracts.ts:126`)
  and drop `'item'` from its `supportedSourceKinds` if no other type needs it (verify `pattern` usage).
- Delete the `clozeMcq.ts` item path + its dangling `@/lib/distractors` import (`clozeMcq.ts:17`).
- **Grep evidence required:** enumerate every consumer of the item `cloze_mcq` leg before deleting
  (deployment-lesson 238b1b94 class: "remove a source kind from RENDER_CONTRACTS without binding the
  builder-leg deletion to the same commit"). Confirm `assertCapabilityTypesRenderable`
  (`renderContracts.ts:168`) still passes after the edit.

**8c-audio. Audio caps unconditional (§0.8).** Drop the `if (audioMap.has(key))` clip-gate in
`projectItemsFromTypedRows` (`projectors/vocab.ts:240-283`) so audio caps emit for every word/phrase
item. Update `projectors/vocab.test.ts` (the "4 caps when no clip" assertions → 6 caps always). This
rides the cutover because `runner.itemCutover.test.ts` (removed here) also asserts the old conditional
behavior — doing it earlier would red the suite between commits.

**8c. Other amputation points (verify each):**
- **`validateItemSourceRefResolvability`** — moves to vocab (runner has no item caps).
- **`distractorPool`** stays in the runner (pattern path `:562`); confirm no remaining item-only use.
- **CS7 count-parity** — each stage declares only the content_units it wrote (runner: section/grammar/
  affixed; vocab: item). Confirm the runner's `declared.contentUnits` no longer counts item units.
- **Dead adapter writer fns** (`adapter.ts:805-937`, uncalled, reference dropped tables) + stale
  `renderContracts.ts:371/375` comments — clean up here if cheap.

**Run:** full `bun run test` for `capability-stage` + `exercise-content`; `tsc --noEmit`; `eslint`.
**Commit** `feat(cap-v2 #161): cutover — amputate runner item branch, vocab owns the item slice`.

### Task 9: Lesson 11 prerequisites (data)

Task 9 is **not "manual prep for a Lesson-Stage deficiency"** — it is *completing lesson 11's
authoring*, which the Lesson Stage's upstream authoring pipeline (the linguist agents +
`generate-staging-files`) normally owns. Lesson 11 was only ingested through phase 4; the authoring
steps below were never run for it.

1. **Complete grammar authoring** (GOTCHA 3): lesson 11's `lesson.ts` grammar/exercise sections are
   raw `body` blobs because the `linguist-structurer` step was never run. Run it **main-thread** (it's
   hook-blocked in a subagent) so Stage A's Lesson Gate accepts the structured sections. Inputs:
   `pattern-brief.json` (BER- pattern + 8 affixed pairs). This is the standard pipeline, not a patch.
2. **CS19/CS4b data fix — DROPPED (verified non-issue 2026-06-07).** Grepped `staging/lesson-11/
   learning-items.ts`: zero comma-as-OR translations, zero empty `translation_nl`.
   `normaliseDutchTranslation` (in `generate-staging-files.ts`, the authoring side) already emitted
   `/`-form. The CS19/CS4b errors were a stale carryover from the lesson-2 acceptance attempt; they do
   not apply to lesson 11.
3. **Cloze carriers — RESOLVED: item cloze deferred to #167; not needed for L11.** See §9a. Item
   `contextual_cloze` is NOT wired into `publishVocabulary` (the emitter/reader are preserved
   scaffolding). So L11 needs no cloze carriers, and the empty `cloze-contexts.ts` is a non-issue here.

## 9a. Cloze provisioning — RESOLVED (2026-06-07, operator-decided)

Ground-truth from the live DB reframed the cloze scope:
- **No cloze has ever been practised.** `dialogue_line:contextual_cloze` has 85 `ready`/`published` caps
  but **0** review events and **0** `learner_capability_state` — and item cloze has 0 caps. Only the 6
  core item vocab types ever activate. The blocker is a **runtime activation gap (#166)**, not content.
- **Fabricated carriers don't serve the lesson.** Item carriers (hardcoded `extract-cloze-items.ts` /
  `cloze-creator`) are invented sentences the learner never read — a pedagogical defect. First-class item
  cloze must use **real lesson-sentence carriers** (#167).

**Decision:** item `contextual_cloze` is **not emitted by this slice**. The emitter (`projectItemCloze.ts`)
+ reader (`store.fetchItemsWithClozeCarrier`) are **kept as unwired scaffolding** (item cloze is a planned
first-class capability — operator's call, do NOT delete). Cloze stays a `dialogue_line` feature
(runner-owned). Two issues capture the path: **#166** (activation gap — prerequisite for *any* cloze) and
**#167** (item cloze first-class, real-sentence carriers, blocked by #166).

### Task 10: Lesson 11 end-to-end publish + render verification

1. `make migrate-idempotent-check` (the committed drops keep it idempotent) — green.
2. Publish lesson 11 e2e (Stage A → runner non-vocab → `publishVocabulary`). Expect `ok`/`partial`
   (POS warnings acceptable), **no `validation_failed`**, no PGRST205.
3. **Ground-truth DB report** (`feedback_answer_log_check` — data existence ≠ feature works): query
   `learning_capabilities` for lesson 11 (item caps incl. `audio_recognition`),
   `distractors` (≥3 per eligible item cap), `content_units` + junction. (No item `contextual_cloze` — §9a.)
4. **Render + review-event check:** open a session at `indonesian.duin.home` (test user,
   `reference_test_user`), exercise each of the **6 core vocab families** + curated distractors, confirm a
   `capability_review_events` row lands per family — explicitly `recognise_meaning_from_audio` (the
   listening-MCQ curated leg). **Cloze render is out of scope** (deferred to #166/#167). (Requires deploy
   first — Task 11.)

### Task 11: Deploy

`make pre-deploy` → merge `feat/cap-v2-slice1-substrate` → main → GitHub Actions ghcr build → recreate
homelab container (Portainer env 3) → THEN `make migrate` (applies the table drops). **Container
before drops.** Then run Task 10 step 4 (render verification) against the live app.

---

## Risks / open items
- **`retireOrphanedCapabilities` dual-emit-set** (Task 8 landmine #1) — the single most likely
  regression; verify the kind-scoping with a test before the cutover commit.
- **Item `contextual_cloze` contract** (Task 2) — the exact `direction`/`learnerLanguage` must match
  the runtime `cloze` builder; verify against `capabilityCatalog.ts`/`renderContracts.ts`, don't assume.
- **Lesson 11 cloze carriers** (Task 9.3) — if not seedable cleanly, the cloze acceptance leg can't
  fire; surface early.
- **Dead adapter writer fns** (`adapter.ts:805-937`, uncalled, reference dropped tables) + stale
  `renderContracts.ts:371/375` comments — cleanup, not blocking; fold into Task 8 if cheap.

## Supabase Requirements
- **Schema changes:** none new — the `distractors` + `item_embeddings` tables, the capability-table
  fold, `UNIQUE(source_ref, capability_type)`, and the 3 old-table drops are **already committed** in
  `migration.sql` (cutover pt2). Run `make migrate-idempotent-check` before merge; `make migrate`
  applies the drops post-container-recreate.
- **homelab-configs:** N/A (indonesian exposed; pgvector present; the `extensions` grant for the vector
  type already added in the populate pass).
- **Health checks:** the item-scoped HCs (coverage, cloze out-of-pool, audio gating) live in the vocab
  gate (Task 4); no new `check-supabase-deep` structural checks (UNIQUE + FK already guarantee
  uniqueness + distractor existence — spec §6a).
