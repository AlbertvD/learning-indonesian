---
status: approved   # 2026-06-16 grill-with-docs pass MATERIALLY simplified the architecture (practice =
                   # scoped-session launch, not an in-trainer engine → item F DROPPED → tiny F′; affix =
                   # controlled-vocab catalog member; affix caps in the unified queue; catalog tiles reuse
                   # the analytics funnel + canonical Mastered, no invented vocabulary). Re-reviewed clean:
                   # data-architect APPROVE-WITH-CHANGES (F′ builder-note + m1/m2 folded); architect
                   # APPROVE-WITH-CHANGES → F′ reworked (isScopedMode, 4 call-sites) → architect confirm
                   # round CLEAN APPROVE. Build-ahead capstone; builds LAST per §5.
reviewed_by: [architect, data-architect]
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

> **🔄 RE-GROUNDED 2026-06-19 (verified against current `main`) — this plan is now BUILDABLE.**
> Its blocking prerequisites (§5 steps 1–2) have all shipped since it was written:
> - **§8 rename A–C** shipped 2026-06-16 (commits `50d8b75`/`3ae3a14`/`54429d8`) — the `_src`/`_cap`/`_ex`/`_mode`
>   names the trainer reads are live (`src/types/learning.ts`).
> - **phase-b + substrate A/B/D/E** shipped: the **affix catalog code constant exists** (`src/lib/capabilities/affixCatalog.ts`, with the `affix ∈ catalog` CS12/HC31 gates — item A **DONE**); the **root-vocab hard-prerequisite** shipped via **ADR 0018** (item B **DONE**); affix-filtered cap reads (D) + lesson-activation introduction (E) hold.
> - **Content (§5 step 3):** meN- (L9/L13), peN- (L20), -kan (L21), reduplication (L22) are live — enough for **v1** (catalog + rule card + per-affix funnel tile). The **word-family explorer (§2.2 / v2)** still wants the broader L14–24 + book-2 rollout (ongoing).
>
> **Remaining to build (the actual forward work):**
> 1. The surface — `src/lib/morphology/` + `src/components/morphology/` (do not exist yet).
> 2. **Item C — the 3-way "Morfologie" funnel split is NOT done:** `masteryModel.ts:391` still has
>    `GRAMMAR_SOURCE_KINDS = {grammar_pattern_src, word_form_pair_src}` and `funnelBucket` returns only
>    `vocab|grammar` — `word_form_pair_src` must split into a morphology bucket (+ SQL parity HC27/HC28).
> 3. **Item F′ — the affix SessionMode is NOT added:** `SessionMode = 'standard'|'lesson_practice'|'lesson_review'`
>    (`model.ts:5`); add the source-ref-scoped mode + `isScopedMode` per §4-F′.
>
> **⚠️ Stale references below (correct when building):** §5 step 2 cites `recognise_allomorph_from_root_cap`
> (built then **RETIRED** — `2026-06-17-morphology-nasalization-cap-model-fix.md`) and `build_confix_ex`
> (**CUT** — ADR 0019). The live morphology exercise roster is **`decompose_word_ex` + `type_form_ex`
> (carrier, option B) + `choose_form_ex`** (pick-the-affix). §4-A's "a separate constant in the *spirit* of
> `MORPHOLOGY_PATTERN_SLUGS`" is moot — `affixCatalog.ts` was built. The §0/§1 prose and the Resume-context
> blockquote ("not yet reviewed") predate review + these ships; read for design intent, not current state.

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

**Top level — the Affix Catalog.** A sequenced grid of affixes (the research order). Each tile is the
**per-affix scope of the Morphology funnel** (§4-C) and **reuses the existing analytics + lesson-tile
vocabulary — nothing morphology-specific is invented** (grill, 2026-06-16, grounded in
`CONTEXT.md §"Mastery Model"` + `analytics-mastery.md` + `LessonCard.tsx:15-16`):
- **Beheerst %** (the canonical **Mastered** predicate, `CONTEXT.md:123` / `masteryModel.ts` / the
  SQL-mirrored `_mastery_label`, parity-tested ADR 0015) over **Geoefend %** — the same two nested bars
  `LessonCard` shows, scoped to the affix's derivations.
- a **mini-funnel over the existing rungs** (`introduced → learning → strengthening → mastered`, `at_risk`
  flagged) — *not* a lone number (the redesign deliberately killed single-`%` headlines for the slow axis).
- availability via the **status pill** pattern (the affix's prereqs/activation), not a new "locked" label.

Roll-up is **weakest-wins per derivation** (consistent with `contentUnit`/`pattern`). Tapping opens the
affix. The tile invents no new mastery word, badge, or threshold — it is the Grammar/lesson tile pattern
applied to an affix.

**Affix detail — three panels:**

1. **Rule card** — meaning, formation rule, the allomorph table (me-/mem-/men-/meny-/meng-/menge- with
   triggers), 2–3 worked examples, a link to the introducing lesson. This is **net-new structure** the
   lesson never had — the lesson is static prose + audio (`lesson-N/Page.tsx:152-182,325`). Built from
   the morphology data (`allomorph_class`, the existing `allomorph_rule` prose, `affix_gloss`) + the
   affix catalog metadata (§4-A). No re-authoring of lesson content.
2. **Word-family explorer** — the generative "Root Race" view [research §"Atomic-Unit", "Root Races"].
   **Genuinely new — no existing equivalent in the app to reuse** (confirmed with author 2026-06-16).
   Decisions (grill):
   - **Shows the FULL family, status-marked** ("you know 3 of 8"), not owned-only — seeing the unlearned
     siblings is the "one root → many words" multiplier the module is built around.
   - **Cross-affix per root:** meN-'s page leads with meN- pairs, but each root links to its **full
     cross-affix family** (*ajar* → mengajar [meN-], belajar [ber-], pengajar [peN-], pelajaran
     [peN-…-an]) — so the explorer reads *all* of a root's pairs, not just the current affix's.
   - **Frozen/lexicalized forms shown but MARKED "vocab, not rule-formed"** (driven by phase-b's
     `productive` flag) — research open-Q3: mislabeling lexicalized forms (*jalan-jalan*, *kepala*) as
     rule-generated teaches false over-generalizations.
   - Root meaning + your mastery come from the **root-vocab join** (item B / `itemSlug`); unknown roots
     are shown but flagged and **gate the produce drills** (the hard block, §7-Q1).
   - **Content-dependent:** near-empty today (2 roots, 1 affix); fills in as affix lessons are re-authored
     → explicit "more forms appear as you learn affixes" empty state.
   Group pairs by `root_text` (+ cross-affix by shared root) + join the root to its `learning_items` row.
3. **Practice — ONE "Practise meN-" action that *launches a scoped session*; the trainer hosts no drills.**
   The button opens the **normal session player, filtered to this affix**, reusing the app's existing
   scoped-session mechanism (`SessionMode`'s `lesson_practice`/`lesson_review`, `model.ts:5`; the Session
   page already loads a source-ref scope and runs a filtered session, `Session.tsx:34-46`). An affix is a
   set of `source_ref`s (its pairs), so an **affix scope** is the lesson-scope pattern applied to one
   affix — **one session engine, a new doorway** (alongside Home = unscoped, and per-lesson practice). The
   scoped session blends due reviews + a few new introductions under the *same* gate + budget + spacing as
   Home (readiness-gated, no cramming — handled by the engine, not the trainer). There are **not** separate
   "Learn new" / "Review due" buttons — that new-vs-due blend is internal to the session, invisible.

**Affix caps live in the ONE queue — the trainer is a lens, not a silo.** Affix capabilities are ordinary
scheduled caps: they appear **interleaved in regular Home sessions** when due (gated by readiness — root +
rule known, item B), AND can be focused via the scoped affix session. They are **not** a separate FSRS
pool. This preserves the single-scheduler model (ADR 0003) and the foundation's "drilling happens in the
Home session"; the trainer adds a *doorway* + a *view*, never a parallel track. (The separate morphology
*view* is the §4-C Voortgang axis — practice unified, progress shown apart.)

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
  practice.ts   build an affix's source_ref scope for the scoped-session launch
  adapter.ts    DB reads — hides schema/tables/RPC, maps snake→camel (NOT a thin wrapper)
  index.ts      public surface
  __tests__/
src/components/morphology/   the catalog grid, affix detail, the three panels
```

Conventions per `target-architecture.md` §"Module shape" (drop the folder name from filenames; depth
floor cleared by 4 logic files + a real type model).

**The key move — practice is a SCOPED SESSION LAUNCH, not an in-trainer engine (grill, 2026-06-16).**
`lib/morphology` does not import `session-builder`, and it does **not** render, resolve, gate, or commit
cards. Its only runtime job is **reads** for the catalog / rule card / explorer (its `adapter.ts`).
"Practise this affix" **navigates to the existing Session route with an affix scope** — the same player
Home (unscoped) and per-lesson practice already use. So gating, exercise selection, rendering, budgeting,
spacing, and review-commit all stay where they live (`session-builder` + `exercise-content` + the review
RPC); the trainer reuses them by *launching* them, never by importing them. (No back-edge; the trainer
just routes.)

This needs **one small addition to the EXISTING scoped-session mechanism: an affix scope** — populate
`selectedSourceRefs` from an affix's pairs (mirroring `loadSelectedLessonScope`, `Session.tsx:38-46`)
under a new/generalized `SessionMode`. That is the entire runtime surface for practice. **The earlier
"shared per-cap resolution extraction" (old item F) is therefore DROPPED** — the trainer never resolves a
cap, so there is nothing to extract.

Pin `index.ts`'s exact public surface before build (catalog/detail/explorer reads + the affix-scope launch
helper).

**Flow per surface:** catalog = group pairs by `affix` + fold in cap-mastery + lesson-activation →
`AffixCatalogEntry[]`; detail = the affix's rule/allomorph reference + word-families (group by
`root_text`, join `learning_items`); **practice = build the affix's `source_ref` scope → navigate to the
scoped Session route** (the session engine does the rest).

**Error & empty states** (the trainer is content-thin until §5 steps 1–3 produce data): friendly
notification + `logError` on every read; explicit empties — "introduced after Lesson N", "nothing due —
want extra reps?". Per CLAUDE.md Error Handling, no raw Supabase strings reach the learner.

**Testing:** pure logic (catalog assembly, family grouping, due-filtering, progress computation) is
unit-tested; the panels get RTL tests from the user's perspective.

## 4. Substrate reconciliation punch-list

Designing top-down validates the substrate. **phase-b holds up as the foundation; the capstone mostly
adds work *above* it, not rewrites of it.** The items:

- **A. Affix-level catalog metadata — a code constant that is ALSO the controlled vocabulary for `affix`.**
  The catalog + rule card need per-affix sequence rank, CEFR level, gloss, and the canonical allomorph
  reference (all six meN- classes even before each has example pairs). phase-b stores these *per pair*.
  This is *curated curriculum metadata* — fixed, ~15–20 entries, no per-learner state — so by
  minimum-mechanism it is a **NEW code constant in `lib/capabilities/affixCatalog.ts`** (in the *spirit* of
  the pipeline's `MORPHOLOGY_PATTERN_SLUGS` at `scripts/lib/pipeline/capability-stage/projectors/morphology.ts:20`,
  but a separate constant — not an extension of that pipeline file; staff-engineer DRIFT fix), **not a new
  DB table.** **PLACEMENT corrected (architect CRITICAL, 2026-06-16): it lives in `lib/capabilities/`, NOT
  `lib/morphology`** — the phase-b *pipeline* validator + HC must read it, and the pipeline may import only
  from `lib/capabilities` (target-architecture.md:1159, the sole pipeline↔runtime shared seam); both the
  `cuedRecall.ts` packager and the `lib/morphology` trainer then import it as runtime→runtime. It doubles
  as the **controlled vocabulary for the `affix` column**: an "Affix" (CONTEXT.md glossary) IS a catalog
  member, so phase-b's validator **and** the live-DB HC assert `affix ∈ catalog` (three-layer-gate habit)
  — else the catalog grouping silently splits one affix across spelling variants (`meN-`/`me-`/`meng-`).
  The `affix ∈ catalog` assertion is a phase-b addition → **folded into the phase-b re-review with item B.**
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
- **C. "Morfologie" funnel — a content-type split rendered at two scopes; it IS the catalog tiles' data.**
  A 3-way funnel split: `MasteryFunnels` (`masteryModel.ts:383-404`, currently **2-way** vocab/grammar) →
  3-way, dropping the affix source kind (post-rename **`word_form_pair_src`**, not `affixed_form_pair`)
  from `GRAMMAR_SOURCE_KINDS` (`masteryModel.ts:388,404`) — and from the Weekly-Movement grammar bucket
  (`CONTEXT.md:144`, where `affixed_form_pair` currently rolls up under grammar) — into a new morphology
  bucket. `funnelBucket` is **mirrored in SQL** — the slice must update `get_weekly_movement`
  (`migration.sql:2322-2333`) **and** `get_lessons_overview`, and keep the **HC27/HC28 parity tests** green
  (ADR 0015). **Rendered at two scopes, exactly like the Grammar funnel** (whole-learner + per-pattern):
  whole-learner on a **Voortgang "Morfologie" tab**, and **per-affix as the catalog tile mini-funnel** (§2)
  — so item C and the catalog tiles are *one feature* (the morphology funnel at two scopes), not two. It
  remains its own slice (analytics, parity-tested), independent of the trainer's read/launch code.
  **Co-change (data-architect m2):** grep `masteryModel.ts` for `affixed_form_pair` and update the stale
  text sites atomically with `GRAMMAR_SOURCE_KINDS` — the `WeeklyMovement.advancedGrammar` JSDoc (`:691`)
  and the `:547` comment both still say grammar includes `affixed_form_pair`.
- **D. Affix-filtered cap reads — CONFIRMED feasible.** Caps join to pairs via
  `affixed_form_pairs.capability_id` (exists in live DB today), so "caps for affix X + due state" works
  post-phase-b. Low risk.
- **E. "Learn new" = surface lesson-introduced caps, not a new activation engine.** The trainer reflects
  `learner_lesson_activation` + cap state; it does not introduce caps independently of their lesson
  (respects ADR 0006). A behaviour contract, not a schema change.
- **F. ~~Per-cap "resolve to renderable block" shared extraction~~ — DROPPED (grill, 2026-06-16).** The
  original design had the trainer render/resolve cards itself, which would have needed `resolveCandidate`'s
  per-cap core (`builder.ts:184-212`) extracted to a shared module. The grill replaced in-trainer practice
  with a **scoped-session launch** (§2, §3), so the session engine owns all resolution — **nothing to
  extract.** Replaced by a far smaller, additive item:
- **F′. Add a source-ref-scoped session mode (the affix scope).** Populate `selectedSourceRefs` from an
  affix's pairs (mirror `loadSelectedLessonScope`, `Session.tsx:38-46`). An affix has no single lesson (it
  spans L9/L13/L14/L15…), so it is a **`selectedSourceRefs`-ONLY scope.** The full, code-verified change
  set (architect rounds 2+3 — the earlier "due/practice passes need no change" was WRONG: they gate on
  `isLessonScopedMode` first, so a non-lesson mode would *bypass* scoping and ship the whole global queue +
  out-of-scope new caps + a dead practice-review pass):
  - (a) add a new `SessionMode` value (`model.ts:5`) + `VALID_SESSION_MODES` (`Session.tsx:28`), and an
    `isSourceRefScopedMode` predicate.
  - (b) **introduce `isScopedMode(mode) = isLessonScopedMode(mode) || isSourceRefScopedMode(mode)`** and
    swap the **four "is it scoped at all?" call-sites** from `isLessonScopedMode` → `isScopedMode`:
    `isCapabilityInScope` (`builder.ts:128`, the due **and** practice-review filter), the practice-review
    *enable* ternary (`builder.ts:293`), the new-introduction scope guard (`pedagogy.ts:304-305`), and the
    left operand of the scope-valid check (`builder.ts:119`).
  - (c) keep the **`lessonId` requirement ONLY where a lesson is genuinely needed**: the valid-guard's
    lesson branch (`builder.ts:119` still requires `selectedLessonId` for *lesson* modes; the affix mode is
    valid on `selectedSourceRefs.length > 0` alone) and `isInSelectedLessonScope` (`pedagogy.ts:255-263`)
    drops its `Boolean(selectedLessonId)` requirement so a source-ref-only scope matches.
  Budget: a new mode not in `decideLoadBudget` falls through to `standard` (`maxSourceSwitches: 1`) —
  deliberately **correct** for a cross-lesson affix (the two lesson modes use `0`; do not copy that). Still
  no shared extraction, no `session-builder` import — the trainer sets mode + refs and routes.
  **Tests (architect):** assert (i) due caps filter to the affix's source_refs, (ii) new introductions are
  scoped to the affix, (iii) the practice-review pass surfaces active-but-not-due affix caps, (iv) budget
  fills open slots — the four regressions the round-2/3 finding exposed.

**Net:** the capstone surface itself adds **no schema and no new table**; it needs one phase-b decision
routed through re-review (**B**, + the `affix ∈ catalog` assertion from **A**), one code-level catalog
(**A**), a tiny affix-scope addition to the existing session mode (**F′**, not a shared extraction), and
one separate analytics slice (**C**).

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
   this capstone. **Ship it as a thin first cut, not all at once (staff-engineer):** v1 = the affix
   **catalog + rule card + per-affix funnel tile** (the highest-value, lowest-risk reuse of existing
   patterns); **defer the word-family explorer (§2.2)** — the one genuinely-new, most-complex panel — to a
   v2 once a **second** affix lesson is re-authored, since with one affix it renders "you know N of N" and
   carries near-zero value. This cuts the riskiest panel out of v1 at almost no cost.

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
2. ✅ **RESOLVED (grill, 2026-06-15): affix catalog = code constant, and it is the controlled vocabulary
   for the `affix` column** (phase-b validator + HC assert `affix ∈ catalog`). "Affix" added to the
   CONTEXT.md glossary. Not a table (curated, fixed, no per-learner state).
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
