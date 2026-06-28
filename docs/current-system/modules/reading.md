---
module: reading
surface: src/lib/reading/
last_verified_against_code: 2026-06-28
status: in-flight          # Phase 1 shipped; Phase 2 (harvest + morphology gloss) designed, not yet built
---

# `lib/reading` — the Lezen (Read) reader domain

The domain module behind the **Lezen** reader (`/lezen`, PRD #299): it turns a stored
**Text** into a silently-readable, per-learner-leveled, tap-to-gloss view-model, and
(Phase 2) lets the learner harvest a tapped word into FSRS. It is a **deep module** — a
three-verb public interface over a deep implementation (gloss cascade, coverage math,
view-model, all I/O).

**Status note.** Phase 1 (silent reading + tap-to-gloss + coverage ordering) is shipped
and live. Phase 2 (morphological glossing, vocab→FSRS harvest, new `texts` content) is
**designed but not built** — see `docs/plans/2026-06-28-reader-phase-2-design.md`.
Lines marked *(P2)* describe the approved-but-unbuilt target; verify against code before
relying on them.

## 1. Public interface

The pages (`pages/Lezen.tsx`, `pages/LezenReader.tsx`) call only `index.ts`:

| Export | Signature | Purpose |
|---|---|---|
| `loadReader` | `(text) → Promise<LoadedReader>` | view-model + a `glossFor(segIdx, token)` resolver for one story (`index.ts:51`) |
| `rankReadableTexts` | `(texts, userId) → Promise<RankedText<T>[]>` | the story list, most-comprehensible-first per learner (`index.ts:77`) |
| `harvestWord` *(P2)* | `(userId, item) → Promise<void>` | write `learner_reading_harvest` membership (the only new public verb) |
| types | `ReadableText`, `ReadingToken`, `GlossResult`, `RankedText`, … | re-exported from internals (`index.ts:22-29`) |

`loadReader` builds the view-model (`toReadableText`), fetches glosses for every content
token **and its affix candidates** (`glossLookupTokens`, `index.ts:32`), and returns a
pure `glossFor` closure (`index.ts:57`). `rankReadableTexts` filters to readable texts
(`isReadable`), computes coverage per text via one RPC each (`coverageOf`,
`index.ts:67`), and orders them (`orderByCoverage`).

## 2. Internal flow (functional, not stepwise)

**Render a story** = `text → toReadableText → ReadableText (segments of tokens)`; the UI
(`components/reading/GlossableText.tsx`) renders tokens, and a tap calls
`glossFor(seg, token)`.

**Resolve a gloss** (`gloss.ts:33` `resolveGloss`) — a pure NL-first cascade:
1. proper noun → no gloss (`name`, `gloss.ts:42`);
2. exact `learning_item` → its `translation_nl`/`_en` (`item`, `gloss.ts:45`);
3. **morphology** — the word has an `item_morphology` row (build-time pre-compute,
   ADR 0024) → show the root's meaning + the exploratory `MorphologyGloss` payload
   (affix + function + root + family + Affix-Trainer link). `affixStrip.ts` is
   **deleted**; the decomposer (`lib/capabilities/affixDecomposition`) is build-time;
4. sentence fallback → the segment's Dutch translation (`sentence`, `gloss.ts:56`).

**Rank texts** = for each readable text, `contentTokens` (non-proper-noun words) →
`fetchCoverageKnownTokens` (the RPC) → `computeCoverage` (token-weighted fraction known,
function words always known, `coverage.ts:17`) → `orderByCoverage` (descending, stable
by title, `coverage.ts:43`).

**Harvest a word** *(P2)* = `harvestWord` writes a `learner_reading_harvest` membership
row. It does **not** mint capability state and does **not** touch `session-builder`;
eligibility + scheduling come from the existing gate-OR + review path (see §5).

## 3. Invariants

1. **No `session-builder` import, no `lib/morphology` import** (target-arch Rule 7).
   Harvest feeds scheduling *indirectly* by writing membership that
   `lib/collections/membership.ts` reads; morphology labels come from the static
   `lib/capabilities/affixCatalog`, not a runtime morphology call (`index.ts:6` states
   the Phase-1 half of this).
2. **Reads live DB only, never staging snapshots** (`adapter.ts:4-5`) — the trap from
   the design grill ([[project_staging_learning_items_drifts_from_db]]).
3. **Coverage is computed server-side** (`get_text_coverage` RPC, `adapter.ts:26`),
   never by shipping rows to the client (ADR 0015).
4. **Morphology surfaced here is gloss-only** — it never mints capabilities; the drilled
   set is `affixed_form_pairs` (ADR 0020/0021), untouched by the reader.
5. **Purity boundary:** `gloss.ts`, `coverage.ts`, `readableText.ts` are pure (deps
   injected); **all I/O is in `adapter.ts`** — the single place this module talks to the
   DB.

## 4. Files

| File | Role |
|---|---|
| `index.ts` | public interface + composition (`loadReader`, `rankReadableTexts`, *(P2)* `harvestWord`) |
| `adapter.ts` | the only I/O — `get_text_coverage` RPC, `learning_items` glosses, `item_morphology` + family reads; *(P3)* `learner_reading_harvest` write |
| `gloss.ts` | the tap-to-gloss cascade incl. the `MorphologyGloss` payload (pure) |
| `coverage.ts` | token-weighted coverage + ordering (pure) |
| `readableText.ts` | the `ReadableText` view-model + tokenization |
| `functionWords.ts` | the ~150-word always-known list |

## 5. Seams to other modules

- **Upstream (texts):** `services/textService` *(P2 rename of `podcastService`)* — stays
  a thin list/get/audio-url service over the `texts` table; **face logic lives here**,
  not in the service (architect M1). "Is a podcast" (`audio_path != null`) is defined
  once, in the service.
- **Sideways (affix labels):** `lib/capabilities/affixCatalog` — shared static catalog,
  safe to import; `index.ts` reads `affixCatalogEntry(affix).glossNl` for the affix
  function. The **Affix-Trainer link** is a plain route string `/morphology?affix=<label>`
  built in the `GlossableText` component (a component→route edge, not a module import),
  so `lib/reading` never imports `lib/morphology` — no `affixPracticePath` relocation was
  needed (the link targets the trainer *detail* view, not the practice session).
- **Downstream (harvest → scheduling):** `lib/collections/membership.ts`
  (`resolveActivatedMemberRefs`) reads `learner_reading_harvest`;
  `lib/session-builder/` reads *that* via the `activatedCollectionRefs` gate-OR
  (`pedagogy.ts:410`). The edge is one-directional: reading writes membership,
  session-builder reads it.
- **DB read model:** `get_text_coverage` RPC — the "reading-coverage known" composite
  predicate (CONTEXT.md → *Reading-coverage known*); parity-tested (ADR 0015).

## 6. Known limitations / what this spec does NOT cover

- The **build-time pre-seed** (bulk vocab caps + `item_morphology` decomposition) is a
  *pipeline* concern, not this runtime module — see the capability-stage spec + the
  Phase-2 plan §5.
- **Scheduling / activation semantics** of a harvested word (gate-OR, FSRS, review
  commit) belong to `lib/session-builder/` + the Review Processor (ADR 0004) — this
  module only writes membership.
- The **drilled morphology** model (`affixed_form_pairs`, Affix Trainer) is
  `docs/current-system/modules/morphology.md`.
