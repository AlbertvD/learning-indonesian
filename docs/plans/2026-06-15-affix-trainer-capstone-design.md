---
status: approved
reviewed_by: [architect, data-architect]   # 2026-06-15: data-architect APPROVE-WITH-CHANGES (M1 itemSlug +
                                           # §4-C SQL-mirror cites + item-B routing — all folded); architect
                                           # round-2 APPROVE (composition seam §3/§4-F verified against code,
                                           # no criticals/warnings). Build-ahead capstone; builds LAST per §5.
supersedes: []
related:
  - docs/plans/2026-06-15-morphology-module-and-capability-model-design.md   # program doc (this is its deferred trainer surface)
  - docs/plans/2026-06-15-morphology-phase-b-implementation-spec.md          # the substrate this reads (must ship first)
  - docs/plans/2026-06-15-capability-naming-rename-plan.md                   # the §8 names this reads (must ship first)
  - docs/plans/2026-06-13-app-architecture-foundation.md                     # reserves lib/morphology/ + the Affix-trainer surface (Rule 10)
  - docs/research/2026-06-15-affix-morphology-module-research.md             # the pedagogy grounding (cites [n])
  - docs/current-system/capability-and-exercise-model.md                     # capability/exercise model + §8 names
  - docs/roadmap.md                                                          # §D item 6 — the moat
---

# Affix Trainer — capstone design (the morphology Study-tab surface)

> **Resume context (2026-06-15).** This is the **capstone** of the morphology program — the
> `lib/morphology/` runtime module + the Leren-tab Affix-trainer surface reserved at
> `app-architecture-foundation.md:81` and described at `roadmap.md:49` (§D, "the moat"). It was
> designed **top-down** (capstone first) in a design dialogue, *after* a live-DB audit established that
> the morphology data the trainer needs does not exist yet. Design order = top-down; **build order =
> bottom-up** (§5). Not yet reviewed; needs `architect` + `data-architect` before `approved`.

## 0. Grounding (plan-grounding rule)

Modules this plan touches, against `docs/target-architecture.md` + the foundation doc + module specs:

- **`lib/morphology/` — RESERVED** (`app-architecture-foundation.md:81`: "affixes + word-families (the
  affix trainer); consumes `capabilities` (`affixed_form_pair`), `allomorph_rule`; **must NOT import
  `session-builder`**; drills feed FSRS via existing/new cap types"). This design IS that reserved
  surface. (Roster-sync follow-up `:86` still owes target-arch:169-188 a RESERVED row — track separately.)
- **`lib/exercise-content/` — LOCKED** runtime reader (`target-architecture.md:432,441-443`): inflates
  one abstract block (`capabilityId + exerciseType`) into a render plan. The trainer **reuses** it for
  rendering — it does not re-implement exercise rendering.
- **`lib/capabilities/` — SHARED** (`target-architecture.md:844`): the trainer consumes cap types + the
  per-cap state contract; it does not duplicate the canonical-key logic.
- **`session-builder` — NOT imported** (`target-architecture.md:388-415`; foundation `:70/:81`):
  session-builder *builds/orders the daily queue*. The trainer does a *filtered read* of cap state, not
  queue-building — so it stays off session-builder (no back-edge).
- **`analytics/mastery` (`masteryModel.ts`)**: the "Morfologie" Voortgang axis (§4-C) is a change here.

No target-architecture constraint is violated: the trainer lands on the reserved seam and composes the
LOCKED reader + the review RPC, exactly as `lib/collections` composes `lib/lessons` (a forward
runtime→runtime edge, foundation `:70`).

## 1. What the trainer is, and what it stands on

The Affix Trainer is an **affix-first lens** over the morphology capabilities phase-b creates. Today
everything is lesson-first, which *scatters* an affix (meN- across L9/L13/L14/L15 + book-2). The
trainer's value is the reorganization: gather each affix's rule + word-family + drills into one place,
sequenced by the research's **frequency × productivity × transparency** order ([research §"Recommended
Affix Sequencing"]: ber- → di- → meN-+nasalization → -an → -kan → -i → ter- → se- → pe-/peN- →
confixes → reduplication).

It **reads** the phase-b `affixed_form_pairs` payload (structured affix data), `grammar_patterns` (the
rule), per-cap FSRS state, and lesson activation. It **writes** review events via the existing review
RPC only.

It does **not** replace the Home session (still does daily spaced scheduling) or the lesson reader (still
the narrative first-encounter — today just grammar prose + audio explanation, no affix structure). It is
the WaniKani/Bunpro-shaped "Lessons + Reviews" pattern, scoped to morphology — see §"Prior art".

## 2. Anatomy

**Top level — the Affix Catalog.** A sequenced grid of affixes (the research order), each tile showing
affix + gloss, a progress state, and counts ("14 forms · 9 mastered"). Tapping opens the affix.

**Affix detail — three panels:**

1. **Rule card** — meaning, formation rule, the allomorph table (me-/mem-/men-/meny-/meng-/menge- with
   triggers), 2–3 worked examples, a link to the introducing lesson. This is **net-new structure** the
   lesson never had — the lesson is static prose + audio (`lesson-N/Page.tsx:152-182,325`). Built from
   the morphology data (`allomorph_class`, the existing `allomorph_rule` prose, `affix_gloss`) + the
   affix catalog metadata (§4-A). No re-authoring of lesson content.
2. **Word-family explorer** — root → all derived forms (*ajar* → mengajar, belajar, pengajar,
   pelajaran): the generative "Root Race" view [research §"Atomic-Unit", "Root Races"]. Group pairs by
   `root_text` + join the root to its `learning_items` row (meaning + mastery for gating).
3. **Practice — two spacing-safe modes:**
   - **"Learn new"** — recognition-level intro drills for not-yet-met derivations of this affix; they
     then **enter the normal spaced queue**. (Research: explicit rule → generate; recognition is the
     easy on-ramp, graduate to production as stability grows.)
   - **"Review this affix"** — this affix's caps that are **actually due today**, from the real schedule.

   Both hand cards to the *same* exercise-content + review-RPC path the Home session uses. Spacing-safe
   by construction: no out-of-schedule cramming is expressible. (An optional no-FSRS-write "extra reps"
   sandbox is the empty-state fallback when nothing is due.)

**Progression is derived, not a new unlock engine.** An affix's state = its introducing lesson's
activation (`learner_lesson_activation`) + its caps' mastery. The trainer *reflects* the lesson-based
introduction model (ADR 0006); it does not invent its own gating.

**Plus the "Morfologie" Voortgang axis** (roadmap item 6's third piece): a 3-way funnel split
(vocab / grammar / morphology). A `masteryModel` change — §4-C.

## 3. Module shape + data flow

```
src/lib/morphology/
  model.ts      AffixCatalogEntry, AffixDetail, WordFamily, AffixProgress, PracticeSet
  catalog.ts    build the sequenced affix list + per-affix progress
  family.ts     root → derived-forms assembly (+ root→learning_items join)
  practice.ts   assemble "Learn new" intro set + "Review due" set for an affix
  adapter.ts    DB reads — hides schema/tables/RPC, maps snake→camel (NOT a thin wrapper)
  index.ts      public surface
  __tests__/
src/components/morphology/   the catalog grid, affix detail, the three panels
```

Conventions per `target-architecture.md` §"Module shape" (drop the folder name from filenames; depth
floor cleared by 4 logic files + a real type model).

**The key move — the trainer reuses, never rebuilds, the runtime.** It does not import
`session-builder`. It *composes* existing pieces via SHARED modules — the exact seams (verified against
code, since `target-architecture.md:448` lags the live API):

1. **Its own filtered read** (`adapter.ts`): "this affix's caps + their FSRS state" from
   `learner_capability_state`, plus pairs/catalog/lesson-activation. A filtered read, not queue-building
   — that's why it doesn't need `session-builder`.
2. **Per-cap resolution via SHARED modules, not session-builder.** For each cap the trainer produces a
   renderable block: `ProjectedCapability` + `CapabilityReadiness` (from `lib/capabilities/`) → exercise
   choice via `lib/exercises/exerciseResolver.resolveExercise` (`exerciseResolver.ts:42`, the SHARED
   selector `session-builder` itself calls, `builder.ts:10`) → a `renderPlan` + an assembled
   `reviewContext`. **Seam to pin (see §4-F):** this exact "resolve one cap → block" logic currently
   lives *inside* `session-builder`'s `resolveCandidate` (`builder.ts:184-212`). The trainer must NOT
   import that — the resolution must be reused from a SHARED primitive (extract `resolveCandidate`'s
   per-cap core to shared) or rebuilt from the shared `capabilities` + `exercises` primitives. This is
   the load-bearing seam; it must not be hand-waved at build.
3. **Content inflation via `lib/exercise-content/`** — the real entry is
   `resolveCapabilityBlocks(blocks: SessionBlock[], options)` where `options = { userId, userLanguage,
   sessionId }` (`exercise-content/index.ts:10`, `resolver.ts:50-54,134`), NOT a per-block `resolveBlock`;
   `SessionBlock` (`session-builder/model.ts:22-31`) carries the `renderPlan` + `reviewContext` from step
   2. The practice surface supplies the three options at build. A forward runtime→runtime edge, no cycle.
4. **The review RPC** to commit a grade — identical to the session's commit path.

Pin `index.ts`'s exact public surface before build (the functions `pages/` calls).

**Flow per surface:** catalog = group pairs by `affix` + fold in cap-mastery + lesson-activation →
`AffixCatalogEntry[]`; detail = the affix's rule/allomorph reference + word-families (group by
`root_text`, join `learning_items`); practice = filtered due/new cap list → exercise-content → review RPC.

**Error & empty states** (the trainer is content-thin until §5 steps 1–3 produce data): friendly
notification + `logError` on every read; explicit empties — "introduced after Lesson N", "nothing due —
want extra reps?". Per CLAUDE.md Error Handling, no raw Supabase strings reach the learner.

**Testing:** pure logic (catalog assembly, family grouping, due-filtering, progress computation) is
unit-tested; the panels get RTL tests from the user's perspective.

## 4. Substrate reconciliation punch-list

Designing top-down validates the substrate. **phase-b holds up as the foundation; the capstone mostly
adds work *above* it, not rewrites of it.** Five items:

- **A. Affix-level catalog metadata — NEW, but a code constant, not a table.** The catalog + rule card
  need per-affix sequence rank, CEFR level, gloss, and the canonical allomorph reference (all six meN-
  classes even before each has example pairs). phase-b stores these *per pair*. This is *curated
  curriculum metadata* — fixed, ~15–20 entries, no per-learner state — so by minimum-mechanism it is a
  **code constant in `lib/morphology`** (extending the existing `MORPHOLOGY_PATTERN_SLUGS` idea,
  `morphology.ts:20`), **not a new DB table.** Capstone-side; no phase-b change.
- **B. Root-vocab prerequisite — the one item that reaches *back* into phase-b.** The explorer + research
  open-Q1 ("don't drill *menulis* until *tulis* is known") need a `root_text` → `learning_items` link.
  The join **MUST use the canonical `itemSlug()` normalizer** (`src/lib/capabilities/itemSlug.ts:23-25`),
  not a bare `.trim()`/lowercase, or it silently misses roots (data-architect M1) — same for the phase-b
  writer resolving the root (`projectors/morphology.ts:114`). The *read-time join* (explorer root meaning)
  needs no schema change. But **gating** (block vs deprioritize) means phase-b's projector
  (`projectAffixedCapabilities`) emits the root-vocab cap's canonical_key as a `prerequisiteKey` — phase-b
  currently emits only `grammar_pattern_id`. Cheap to add while phase-b is unbuilt; expensive to retrofit.
  **This is a data-model change to an ALREADY-`approved` spec, so it must be routed as an explicit phase-b
  re-review (`architect` + `data-architect`) — not silently "landed in the phase-b PR."** Resolves
  research Q1. `approved ≠ immune` (Minimum-Mechanism).
- **C. "Morfologie" Voortgang axis — NEW slice, in no spec.** A 3-way funnel split: `MasteryFunnels`
  (`masteryModel.ts:383-404`, currently **2-way** vocab/grammar) → 3-way, dropping the affix source kind
  (post-rename **`word_form_pair_src`**, not `affixed_form_pair`) from `GRAMMAR_SOURCE_KINDS`
  (`masteryModel.ts:388,404`) into a new morphology bucket. `funnelBucket` is **mirrored in SQL** — the
  slice must update `get_weekly_movement` (`migration.sql:2322-2333`) **and** `get_lessons_overview`, and
  keep the **HC27/HC28 parity tests** green (ADR 0015). Its own slice, independent of the trainer surface.
- **D. Affix-filtered cap reads — CONFIRMED feasible.** Caps join to pairs via
  `affixed_form_pairs.capability_id` (exists in live DB today), so "caps for affix X + due state" works
  post-phase-b. Low risk.
- **E. "Learn new" = surface lesson-introduced caps, not a new activation engine.** The trainer reflects
  `learner_lesson_activation` + cap state; it does not introduce caps independently of their lesson
  (respects ADR 0006). A behaviour contract, not a schema change.
- **F. Per-cap "resolve to renderable block" should be a SHARED primitive (both reviewers).** The practice
  modes need `resolveCandidate`-equivalent resolution (projection → readiness → `resolveExercise` →
  `renderPlan` + `reviewContext`), which today lives *inside* `session-builder` (`builder.ts:184-212`). To
  honour "no `session-builder` import," extract that per-cap core into a SHARED module (consumed by both
  `session-builder` and `lib/morphology`) — or rebuild it from the shared `capabilities` + `exercises`
  primitives. Decide at the trainer build; flagged now (it is the §3 step-2 seam) so it isn't hand-waved.
  **Lean: extract over rebuild** — one implementation of the projection→readiness→resolve chain avoids
  the parallel-resolver drift the three-layer-gate habit exists to prevent.

**Net:** the capstone surface itself adds **no schema and no new table**; it needs one phase-b decision
routed through re-review (**B**), one code-level catalog (**A**), one shared extraction at build (**F**),
and one separate analytics slice (**C**).

## 5. Build order — design top-down, build bottom-up

The trainer is the **top of a dependency stack**. The live-DB audit (2026-06-15) confirms it is
content-empty today: `affixed_form_pairs` = **4 rows / 2 pairs / 1 affix (L9 meN-)**; affix application
caps = 4 live; the rule tier is rich (97 grammar_patterns, 38 affix-bearing) but lesson-scoped prose.
So the trainer cannot render a catalog or explorer until content exists. Build order:

1. **§8 rename** ships (prerequisite of phase-b; the target names the trainer reads only exist post-rename).
2. **phase-b** ships **— with item B folded in via an explicit phase-b re-review** (root-vocab
   prerequisite; `architect` + `data-architect`, since phase-b is already `approved`). Adds the structured
   columns + the new cap (`recognise_allomorph_from_root_cap`) + 4 exercises the trainer reads.
3. **Re-author the affix lessons (L9–16) + ingest book-2's 14 chapters** → populates `affixed_form_pairs`
   broadly across affixes. *This is the trainer's content.*
4. **The trainer surface** (`lib/morphology/` + `components/morphology/`) **+ the Voortgang axis (C)** —
   this capstone.

This design is **design-ahead**: it is written now so steps 1–3 are built *toward* it (esp. item B,
which must be decided before step 2), not toward a guess.

## 6. Decided in design (literature + prior-art grounded)

- **Core job = learn-then-practice surface** (rule recap → word-family explorer → practice), not a bare
  drill arena or read-only reference. Grounds: research "explicit rule → generate"; foundation's
  "open-to-study" classification.
- **Practice respects FSRS via two modes** (Learn-new intro → queue; Review-due lens), never free
  cramming. Grounds: the spacing effect / SRS orthodoxy [research §"How Other Apps", [12]]; and it is how
  the successful precedents actually behave.
- **Rule card = generated structured recap, not a re-teach** (the lesson has no affix structure to
  duplicate; the recap is net-new).
- **Progression derived from lesson activation + mastery** (no new unlock engine).
- **Affix catalog metadata = code constant, not a table** (curated, fixed, no per-learner state).

**Prior art (verified 2026-06-15):** the *mechanics* are proven at scale — **WaniKani** (layered
radical→kanji→vocab SRS with prerequisite-gated unlocks; structurally our root→rule→application layering)
and **Bunpro** (explicit per-point explanation → spaced cloze review; our rule-card → cloze-in-carrier).
Both split "Lessons" (gated intro) from "Reviews" (due-only) — i.e. our two modes. **No flagship affix
trainer exists for an agglutinative-style language** → the *content domain* is the differentiation (the
moat) and the novelty; the *architecture* is battle-tested.

## 7. Open questions for review

1. **Root-vocab prerequisite (item B): block or deprioritize?** Research Q1 leans block (single-unknown
   card). Decide so phase-b's projector can emit it (resolving the root via `itemSlug()`). If block, it
   triggers a **phase-b re-review** (data-model change to an approved spec). (Recommend: block — hard
   prerequisite.)
2. **Affix catalog: code constant (recommended) vs a small `affixes` table?** Lean code constant
   (curated, fixed, no per-learner state) unless a reviewer sees a reason it must be queryable in SQL.
3. **"Morfologie" Voortgang axis (item C): its own slice, or folded into the trainer PR?** Lean its own
   slice (it's an analytics change with a parity test, independent of the surface).
4. **"Learn new" introduction seam:** confirm the trainer only surfaces caps from *activated* lessons
   (no independent introduction). (Recommend: yes — reflect ADR 0006.)

## Supabase Requirements

### Schema changes
- **No new tables from this capstone.** The affix catalog metadata is a code constant (§4-A). The
  word-family + root-meaning come from a **read-time join** `affixed_form_pairs.root_text` →
  `learning_items.normalized_text` (no schema change).
- **One conditional change in phase-b (item B), not here:** if root-vocab gating is "block", phase-b's
  `projectAffixedCapabilities` adds the root-vocab cap's canonical_key to `prerequisiteKeys`, resolving
  the root via `itemSlug()` (`itemSlug.ts:23-25`; data-architect M1). This is a data-model change to an
  `approved` spec → routed through a **phase-b re-review** (`architect` + `data-architect`), not this PR.
  Decided in §7-Q1.
- The "Morfologie" Voortgang axis (§4-C) is a `masteryModel.ts` + funnel change (no schema), its own slice.
- **RLS / grants:** the trainer reads existing tables (`affixed_form_pairs`, `learning_capabilities`,
  `learner_capability_state`, `learning_items`, `learner_lesson_activation`) under their existing
  owner/authenticated policies — **no new policy/grant.** Verify the read paths against existing RLS at
  build time.

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A.**  [ ] Kong CORS — **N/A.**  [ ] GoTrue — **N/A.**
- [ ] Storage — **N/A** (no new buckets).

### Health check additions
- No structural HC from this capstone (it adds no schema). phase-b owns the morphology-data HC (item B
  prerequisite, allomorph_class, confix columns). The Voortgang-axis slice (C) carries the funnel
  parity test (ADR 0015), not this PR.
