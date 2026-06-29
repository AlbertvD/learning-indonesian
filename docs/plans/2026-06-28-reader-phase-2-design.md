---
status: implementing
implementation: "Slice 1 (texts) PR #305 · Slice 2 (morphology gloss) PR #306 · Slice 3 (harvest) in flight on feat/reader-p2-harvest · Slice 4 (new content) pending"
reviewed_by: [architect, data-architect]   # staff-engineer (sound-w/-changes) → architect R1 REQUEST-CHANGES → data-architect R1 REQUEST-CHANGES → all folded (harvest reconciled to membership-only) → data-architect R2 APPROVE → architect R2 NEEDS-REVISION (2 seam fixes) → architect R3 APPROVE. Data model touched (texts rename, learner_reading_harvest, item_morphology).
supersedes: []
---

# Lezen reader — Phase 2 design (glossing · harvest · content)

> **One-liner.** Turn the silent Phase-1 reader into a *teaching* surface by adding
> three slices: (1) **morphological glossing** — tap any word for its affix + root +
> family; (2) **vocab→FSRS harvest** — tap to add a word to your spaced-repetition
> queue; (3) **new read-only content** — longer authored stories the podcast surface
> can't carry. The unifying design move: **pre-compute everything at build time so
> runtime is a pure retrieve / activate.** No per-user runtime generation.

Grounded against: `docs/research/2026-06-28-graded-reading-reader-evidence.md`
(Parts 4b/4c/5/6 + the Phase-2 morphological-glossing section), the locked Phase-1
design, ADR 0011/0014/0015/0020/0021/0022, and the target architecture
(`services/podcastService` and `lib/session-builder/` are both **LOCKED** modules
this plan touches — see §Blast radius). Phase 1 shipped + live 2026-06-28 (PRD #299).

---

## 1. Scope (locked with the user, 2026-06-28)

Three slices build today. Two earlier-listed slices changed status:

| Slice | Status | Note |
|---|---|---|
| Morphological glossing | **BUILD** | the feature the user asked for; the moat × reader cross |
| Vocab→FSRS harvest | **BUILD** | the pedagogical payload (reading→SRS) |
| New read-only content + storage | **BUILD** | needs the `texts` storage decision |
| Bundled dictionary | **MOVED** | not a runtime gloss layer — becomes a **build-time gloss source** (kaikki) feeding the pre-seed (§4) and the morphology pre-compute (§5) |
| Read-along player | **CUT** | re-litigates ADR 0022 (Read stays silent; Listen owns audio); evidence says silent beats RWL at A2+ |

## 2. The unifying principle — pre-compute at build, retrieve at runtime

The Phase-1 design left two runtime "creation" temptations: generate a card for a
brand-new tapped word, and parse morphology at tap time. **Both are rejected.** The
project's north-star (`CONTEXT.md` → Story podcast: *content is pre-seeded, never
generated per-user*) and ADR 0011 (the capability stage is the sole seeder, behind
quality gates CS14–17) make runtime content-generation an anti-pattern.

Instead: **a single build-time pass over the corpus vocabulary produces, ahead of
time, (a) the vocab capabilities and (b) the morphological gloss for every word a
learner could tap.** Runtime then only ever *retrieves* (gloss) or *activates*
(harvest) pre-existing rows. This collapses the hard cases:

- Harvest has no "brand-new word" case — every tappable word already has caps.
- Glossing has no parser — every tappable word already has its decomposition stored.

This is cheap because the corpus is **~90–95 % already covered** (A1 90.6 % /
A2 93.3 %, research Q4): the residual to pre-seed is a small batch (~5 % per text),
and stays small as content grows (new A1–A2 content is authored leaning on the
vocab). Small-N means we can afford **full-quality** pre-seeding (curated distractors),
not a degraded scale fallback.

## 3. Storage — the `texts` entity ("Text with N faces")  → **ADR 0023**

**Problem.** A read-only story has no audio, but `podcasts.audio_path` is `NOT NULL`
(`migration.sql:126`). Everything else a read-only text needs already exists on the
table: `transcript_segments` (ID/NL/EN aligned), `attribution`, `level`, `title`.

**Decision.** Generalize to **one store** where audio is optional. A *Text* is a
story + its ID/NL/EN transcript + level + attribution; it can be shown through faces:
🎧 Listen (needs audio), 📖 Read (any text), 🎴 Study (any text). A "podcast" is
*a Text that happens to have a Listen face.*

- **Rename `podcasts` → `texts`; make `audio_path` nullable.** Build-stage (disposable
  data) makes this a clean one-move rebuild, not an additive parity rollout
  (CLAUDE.md: "build the target and delete the old in one move").
- Rejected — **separate `reading_texts` table**: duplicates `transcript_segments` +
  `attribution` + `level`; forces the reader to read two sources that drift; the exact
  durability-gate failure mode (d).
- Rejected — **`audio_path` nullable but keep the name `podcasts`**: lasting naming
  debt (a read-only story in a table called `podcasts` contradicts the glossary).

**ADR-worthy:** hard to reverse, surprising, real trade-off — the research said record
it with the data-architect, not implicitly in a PRD.

## 4. Harvest — membership only, reusing the proven eligibility path (slice 1)

Runtime harvest is **only ever activation** (no creation), because §5's pre-seed
guarantees every tappable word already has capabilities. **Reconciled R1 (architect C1
+ data-architect C1/I1):** the earlier "mint `active` `learner_capability_state`
directly" was wrong on two counts — browser INSERT on that table is revoked
(`migration.sql:1482`), the `activation_source` CHECK rejects a harvest value
(`:1381`), and it violates ADR 0004. The collections feature already solved this exact
problem; harvest reuses it and becomes **membership-only**.

- **Interaction** (research Q5): tap → gloss shows → **explicit "+ leren" confirm**
  (suggest-then-confirm, never auto-add — avoids deck bloat). Only the **exact tapped
  word** is harvested; family members shown in the gloss are *not* harvested unless
  separately tapped.
- **Membership** — confirming inserts into a new per-learner table
  **`learner_reading_harvest`** (`user_id`, `learning_item_id`, `created_at`; PK
  `(user_id, learning_item_id)`). **Owner-RLS, learner-writable directly** — this is a
  plain membership row, *not* `learner_capability_state`, so no security-definer RPC and
  no ADR-0004 concern (data-architect I1: a new table is genuinely required —
  `collection_items` is global with no `user_id` at `migration.sql:3601`, and
  `set_collection_activation` activates whole collections, not single words).
- **Eligibility via the EXISTING gate-OR (architect C1).** Harvested membership feeds
  the *same* `resolveActivatedMemberRefs` → `activatedCollectionRefs` gate-OR the
  collections feature already wired (`lib/collections/membership.ts:15`,
  `pedagogy.ts:410`, `session-builder/adapter.ts:251/270/339`). Extend
  `resolveActivatedMemberRefs(userId)` to UNION the learner's harvested `source_ref`s
  into the set it already returns. **No new eligibility branch; `lib/reading` writes
  membership and `lib/collections/membership.ts` reads it — `lib/reading` does NOT
  import `session-builder` (Rule 7 honored).**
- **Scheduling + state** reuse the **existing** new-introduction + review-commit path:
  an eligible harvested cap is introduced like any other, and first review mints `active`
  state via the existing commit RPC (ADR 0004-compliant). No new activation RPC, no
  `activation_source` CHECK change.
- **Landmine handled by the proven mechanism (not a new one).** The gate-OR *is* the
  fix for the §9 published-but-dead suppression class (it's why collections-PR #246
  built it); budget-starvation is the normal new-card competition. The §9 acceptance
  check stays as a regression guard.
- **Virtuous loop:** a harvested word practised once (`review_count ≥ 1` on
  `recognise_meaning_from_text_cap`) then counts as *reading-coverage known*
  (`get_text_coverage`). A freshly-harvested word (`review_count = 0`) is *not* yet
  known — correct (data-architect m2).
- **Virtuous loop:** a harvested word practised once (`review_count ≥ 1` on
  `recognise_meaning_from_text_cap`) then counts as *reading-coverage known*
  (`get_text_coverage`), so harvesting raises your future reading coverage.

## 5. Pre-seed — the bulk vocab + morphology build pass

**One build-time pass** over the corpus words **not yet in the curriculum** (minus
function words + proper nouns), through the **existing capability stage** via a
Common-Words-style synthetic content unit (`staging/lesson-999` is the precedent the
collections work already used). Two outputs per word:

### 5a. Vocab capabilities (feeds harvest)
- **Reduced suite** — text-only caps (no audio clip ⇒ no audio caps; no carrier ⇒ no
  `produce_form_from_context_cap`): `recognise_meaning_from_text_cap`,
  `recall_meaning_from_text_cap`, `recognise_form_from_meaning_cap`,
  `produce_form_from_meaning_cap`.
- **Curated distractors** via `vocab-exercise-creator` — **load-bearing because the
  harvested word becomes a scheduled choose-from-options MCQ card** (`recognise_form_from_meaning_cap`),
  and that card needs real distractors to be a genuine retrieval rather than a giveaway.
  (Not justified by cost — staff-engineer fix; the small-N just makes it painless.)
- **Glosses** sourced from **kaikki/Wiktextract** (the dictionary, as a build input).
- **Lesson home = the hidden `lesson-999` Common-Words sentinel** (ADR 0006 requires a
  non-null `lesson_id` on every non-podcast cap; `lesson-999` is `is_hidden`,
  `order_index=999`, `migration.sql:3664`). So caps satisfy ADR 0006 yet never leak into
  any *visible* lesson tile's `% mastered`. They *do* count as vocabulary
  (`vocabulary_src`), which is correct — they are vocab the learner studies. (architect
  m2 + data-architect m3: reuse `lesson-999`, do **not** spin a second synthetic unit —
  open Q4 resolved.)
- **Idempotent re-run (staff-engineer fix).** Re-run after every content publish to
  cover new texts, but **seed-once on `normalized_text`** (ADR 0011 additive/skip-if-exists)
  — a re-run only ingests the *new* residual, never re-pays for the existing corpus.
  No full-corpus regeneration.

### 5b. Morphology gloss pre-compute (feeds glossing)  → maybe **ADR 0024**
For **every** corpus word, pre-compute its decomposition `{root, affix, gloss_nl,
gloss_en}` + family at build time.

**The real work is a new build-time decomposition pass — there is no runtime
decomposer to reuse (staff-engineer correction).** Today the `lib/morphology` engine
is entirely *pair-bound*: `family.ts` only knows words already in the drilled
`affixed_form_pairs` set; **nothing** splits an arbitrary surface word like `membaca`
into affix+root except the crude `affixStrip.ts`. So this slice's substance is the
decomposition pass itself (driven by the engine's catalog + kaikki attestation, the
ADR-0020 source).

**Landing RESOLVED (data-architect M2, open Q1 closed): a typed 1:1 satellite table
`item_morphology`** — `learning_item_id` PK/FK, `root`, `affix`, `gloss_nl`,
`gloss_en` (all `NOT NULL`); sparse by construction (only morphologically-complex words
get a row; `dan`/`di` get none). *Not* columns on `learning_items` (ADR 0009: 10+ cols
already; sparse concept) and *not* a `jsonb` blob (admits writer/reader drift). It is a
**publish-time projection** (ADR 0011 regime — regenerable on republish, like the
existing `derived_gloss_nl/_en` on `affixed_form_pairs`, `morphology.md:84`), **read by
`lib/reading` only** (architect M3 placement constraint — not a second decomposition
source `lib/morphology` could also read and drift from).

**`family` is a derived join, NOT a stored column (staff-engineer + data-architect):**
family = the `learning_items` sharing this row's `root`. No blob, no drift.

Loaded alongside the items the reader already fetches per text (no extra round-trip).

**Critical separation — gloss vs drill:**
- This pre-compute is **gloss-only / exploratory** (like the Affix Trainer's
  explanation panel). It mints **no capabilities, no FSRS, no Affix Trainer pairs.**
- The curated `affixed_form_pairs` (the **drilled** set that *does* become capabilities,
  routed by ADR 0021) is **untouched** and stays thin. Flooding it with every corpus
  word would re-introduce exactly the over-generated junk (`membanyaki`, `adaan`) that
  ADR 0020's attestation + frequency-gate + exclude-lists exist to keep out.
- The reader's popover **links** into the Affix Trainer when the word's affix is a
  catalog member *with* curated pairs — glossing every word funnels learners into the
  curated drill without polluting it.

## 6. Morphological glossing — runtime (slice 2)

**Pure retrieve, no runtime `lib/morphology` import (architect M2 — picks model (a),
drops the dual framing).** Tap `membaca` → `lib/reading` loads its `item_morphology`
row (already fetched with the text's items) → the view-model renders the popover:
`meN- + baca (read) → active verb`, the family (the join, §5b), and — when the affix is
a catalog member with curated pairs — an Affix-Trainer link.

- **Affix → function labels** come from the stored `affix` + the static `AFFIX_CATALOG`
  (exported by the **shared** `lib/capabilities/affixCatalog`, safe to import), **not**
  from a runtime call into `lib/morphology`.
- **The Affix-Trainer link is a route string** built from a catalog-membership check.
  **Contradiction fix (architect R2):** the pure route helper `affixPracticePath` +
  `AFFIX_SESSION_MODE` currently live in `lib/morphology/practice.ts` (`practice.ts:12,15`)
  — importing them from `lib/reading` *would* be a `lib/reading → lib/morphology` edge.
  **Relocate the pure route leaf to a shared route helper** (e.g. `lib/routes` or
  alongside `affixCatalog` in `lib/capabilities`) imported by *both* `lib/morphology` and
  `lib/reading`. This keeps the strict "no `lib/morphology` import" invariant **and** one
  definition of the affix-practice URL (no duplicated route string). **Implementing-PR
  note (architect R3):** the relocation also moves the import for the existing consumer
  `components/morphology/AffixDetailView.tsx:10,38` — keep it stable by re-exporting from
  `lib/morphology/index.ts`, or update that one call site.
- **`src/lib/reading/affixStrip.ts` is deleted** — no runtime parsing, no crude
  fallback (the pre-compute covers every word). **Complete consumer enumeration
  (architect m4 — my R1 list was short):** `index.ts` (the `affixCandidates` re-export
  at `index.ts:27` **and** the `glossLookupTokens` affix-expansion at `index.ts:38`,
  both removed — P2 fetches `item_morphology` instead of expanding tokens), the gloss
  cascade's injected `affixCandidates` (`index.ts:62` → `gloss.ts:49`, replaced by the
  morphology lookup), and `affixStrip`'s own tests. Grep-confirm no other importer in the
  implementing PR.

## 7. New read-only content (slice 3)

Authored longer stories (CC-BY **StoryWeaver**, *not* CC-BY-SA — ADR 0022) seeded as
`texts` rows with `audio_path = NULL`, `transcript_segments` ID/NL/EN-aligned,
`attribution` set. Reuses the story-podcast authoring pipeline minus the TTS/narration
step. After seeding new content, re-run §5 to pre-seed any new residual words.

## 8. Blast radius (the `texts` rename)

`podcasts` → `texts` touches: `services/podcastService`, the Podcasts/Listen page,
`scripts/podcasts/run.ts` (story pipeline), seed scripts, RLS policies
(`podcasts_read`/`podcasts_admin_write`), health checks, and `lib/reading/adapter.ts`.
The `podcast_segment_src`/`podcast_phrase_src` source-kinds are dead (0 rows) and
unaffected. No FK references `podcasts`; `get_text_coverage` does not reference it
(data-architect m1). Build-stage ⇒ DROP CASCADE + CREATE (not `ALTER … RENAME`, which
leaves policy names stale and is idempotency-ambiguous — data-architect m1).

**Service stays thin (architect M1).** `podcastService` is a **LOCKED** service
(target-arch:1036) and a rename does **not** promote it to a module. Rename the file to
`textService` for honesty (within-boundary), keep it list/get/audio-url over `texts`,
and put **all face logic in `lib/reading/`** (§10). The Listen page's
`audio_path IS NOT NULL` filter lives in the page/`textService`, **not** duplicated in
`lib/reading` — one definition of "is a podcast."

## 9. Landmine (carry into build, not a design fork)

OpenBrain `b9528f9e` — capability content can be **published-but-dead**: caps can be
**gate-suppressed** (receptive-before-productive `pedagogy.ts`) or **budget-starved** in
`lib/session-builder/`. §4 routes harvested words through the **existing gate-OR** —
the very mechanism collections-PR #246 built to fix the suppression class — so they are
eligible by the proven path, not a new one. Acceptance **verifies** a harvested word
resolves to ≥1 **renderable** cap (check the reduced text-only suite against
`renderContracts.ts` `requiredArtifacts`, architect m3) AND gets a non-zero *scheduled*
count, as a regression guard.

## 10. `lib/reading` — the deep module

Phase 2 lands as the deepening of **one deep module, `src/lib/reading/`** (Ousterhout:
narrow interface over a deep implementation), *not* as scattered additions. Spec:
**`docs/current-system/modules/reading.md`** (created with this plan; updated with the
implementing PR per glossary-matches-code).

**Narrow public interface** (`index.ts`) — three verbs the pages call:
- `loadReader(text) → LoadedReader` — view-model + `glossFor(seg, token)` resolver.
- `rankReadableTexts(texts, userId) → RankedText[]` — coverage-ordered story list.
- `harvestWord(userId, item)` *(new, slice 1)* — write `learner_reading_harvest`
  membership (the only new public verb).

**Deep implementation** (hidden internals): the gloss cascade (`gloss.ts` — Phase 2
inserts the `item_morphology` step ahead of the sentence fallback; `affixStrip.ts`
deleted), coverage math (`coverage.ts`), the view-model (`readableText.ts`), the
function-word list (`functionWords.ts`), and all I/O (`adapter.ts`).

**Seams (the module's only outward edges):**
- **Texts** ← `services/textService` (renamed from `podcastService`, stays thin, §8).
- **I/O** ← `adapter.ts` only: `get_text_coverage` RPC, `learning_items` glosses, the
  new `item_morphology` read, the new `learner_reading_harvest` write. **Live DB only,
  never staging** ([[project_staging_learning_items_drifts_from_db]]).
- **Affix labels** ← `lib/capabilities/affixCatalog` (shared static catalog) — *not*
  a runtime `lib/morphology` call (§6).
- **Harvest → scheduling** → `lib/collections/membership.ts` reads
  `learner_reading_harvest`; `session-builder` reads *that*. **`lib/reading` does NOT
  import `session-builder` or `lib/morphology`** (Rule 7).

**Module invariants:** (i) no `session-builder`/`lib/morphology` import; (ii) coverage +
gloss read live state, never staging; (iii) morphology surfaced here is gloss-only
(never mints caps); (iv) "is a podcast" (`audio_path != null`) is defined once, in the
service, not duplicated here.

## Supabase Requirements

### Schema changes (`scripts/migration.sql` + `scripts/migrate.ts`)
- **`texts`** — DROP `podcasts` CASCADE + CREATE `texts` (build-stage; `audio_path`
  nullable; rename policies → `texts_read`/`texts_admin_write`; re-grant authenticated
  SELECT). Data-architect m1.
- **`learner_reading_harvest`** (per-learner membership) — `user_id`,
  `learning_item_id`, `created_at`; PK `(user_id, learning_item_id)`. **RLS owner-only;
  learner-writable directly** (plain membership row — *not* `learner_capability_state`,
  so no RPC, no ADR-0004 concern). Open Q5 RESOLVED (data-architect I1): a new table is
  required; collections can't do per-learner single-word grain.
- **`item_morphology`** (1:1 satellite, data-architect M2 / open Q1 RESOLVED) —
  `learning_item_id` PK/FK `ON DELETE CASCADE`, `root`/`affix`/`gloss_nl`/`gloss_en`
  `NOT NULL`. Sparse; publish-projection. **RLS authenticated SELECT**; `service_role`
  write; **explicit `revoke insert, update, delete … from authenticated`** (not
  absent-by-omission — data-architect I2, mirrors `migration.sql:1482`). `family` = join
  over shared `root`, not a column.
- **NO** new `activate_reading_harvest` RPC and **NO** `activation_source` CHECK change
  — harvest is membership-only; state is minted by the existing review-commit path (§4,
  reconciled R1). **Confirmed at R2 (data-architect APPROVE):** the commit RPC mints
  `learner_capability_state` with `activation_source='review_processor'`, already within
  the CHECK at `migration.sql:1381` — no widening needed.
- **`resolveActivatedMemberRefs`** (in `lib/collections/membership.ts`) extended to
  UNION the learner's `learner_reading_harvest` refs — feeds the existing
  `activatedCollectionRefs` gate-OR. **`lib/session-builder` itself is untouched.**

### homelab-configs changes
- [ ] PostgREST: none (no new schema exposure — same `indonesian` schema).
- [ ] Kong: none.
- [ ] GoTrue: none.
- [ ] Storage: none new (read-only texts have no audio; `indonesian-podcasts` bucket
      unaffected; the bucket name is *not* renamed with the table).

### Health check additions
- `check-supabase-deep.ts`: RLS/grants on `learner_reading_harvest` (owner-only) and
  `item_morphology` (authenticated SELECT); the `texts` rename's policy parity.
- **Eligibility-path guard (data-architect m4):** an integration test/HC that inserts a
  `learner_reading_harvest` row and asserts the item's `source_ref` is returned by
  `resolveActivatedMemberRefs` — so a future refactor of `membership.ts` can't silently
  drop the UNION (the load-bearing harvest seam).
- Invariant: every `texts` row has `transcript_segments` consistent with the joined
  `transcript_*` columns (carries over the existing podcasts HC).
- Invariant (landmine §9): a harvested word resolves to ≥1 *renderable* cap
  (`renderContracts.ts`).

### Acceptance tests (new)
- Harvest→review→known cycle (data-architect m2): a freshly-harvested word shows
  `review_count = 0` and is **absent** from `get_text_coverage` known-tokens; after one
  review it appears.
- A harvested word is eligible via the gate-OR and reaches a session (non-zero scheduled
  count) — the §9 regression guard.

## ADRs to create on approval
- **0023** — Reading content is one `texts` entity with N faces (audio optional).
- **0024** *(YES — data-architect M2)* — Morphology gloss is a build-time, gloss-only
  pre-compute (`item_morphology`), separate from the drilled `affixed_form_pairs`. One
  paragraph; guards against a later "upgrade" that mints caps and reintroduces ADR-0020
  junk. (Architect m1 leaned fold-into-0020; the data-model owner keeps it standalone.)

## CONTEXT.md updates (land with the implementing PR, per glossary-matches-code)
- Rewrite **Story podcast** → **Text (with N faces)**; Listen/Read/Study faces.
- New term **Reading harvest** (membership-only; `learner_reading_harvest`; rides the
  gate-OR; state via the existing review path).
- New term **Morphology gloss** (exploratory pre-compute vs drilled pairs).
- New deep-module spec **`docs/current-system/modules/reading.md`** (§10).

## Open questions — all R1 questions RESOLVED
- Q1 (morphology landing) → `item_morphology` 1:1 satellite (data-architect M2).
- Q2 (activation RPC) → none; membership-only + existing review path (reconciled R1).
- Q3 (`podcastService`) → rename file `textService`, stays thin service (architect M1).
- Q4 (synthetic unit) → reuse `lesson-999` (architect m2 + data-architect m3).
- Q5 (harvest store) → new `learner_reading_harvest`, fed via the existing gate-OR
  (data-architect I1 + architect C1, reconciled).
