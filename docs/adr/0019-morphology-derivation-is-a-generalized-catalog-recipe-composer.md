# ADR 0019 — Morphology derivation is a generalised catalog-recipe composer

- Status: accepted
- Date: 2026-06-18
- Supersedes: none
- Related: ADR 0009 (typed table per content concept), ADR 0011 (capability content DB-authoritative after seeding), ADR 0017 (grammar-pattern production split), ADR 0018 (morphology application-cap cross-source-kind prerequisites)
- Plan: docs/plans/2026-06-18-morphology-generalized-derivation-and-context.md
- Closes: the deferred "Task 6" (confix / double-affix support) of docs/plans/2026-06-15-morphology-phase-b-implementation-spec.md

## Context

Phase-b built the morphology *application tier* (`affixed_form_pairs` + the two
`word_form_pair_src` caps) and shipped a derivation engine
(`src/lib/capabilities/affixDerivation.ts`) that handles **single** affixes —
nasalising prefixes `meN-`/`peN-`, invariant prefixes `ber-`/`di-`, and invariant
suffixes `-an`/`-kan`/`-i` — and **throws `UnsupportedAffixError`** on
`affixType ∈ {confix, reduplication}`. Confix derivation and two confix exercise
types were explicitly deferred "to their book-2 chapters" (phase-b §9 Task 6).

Lesson 21 (Bab 5, `-kan`) is the first of those chapters. It teaches `-kan`
almost always as a **wrap-around**: `me-…-kan` (active, `beli → membelikan`),
`di-…-kan` (passive, `dibelikan`), plus the bare imperative `-kan` (already
engine-supported). The remaining book-2 chapters (Bab 4/6/7/9/11/13) bring
`pe-/peN-`, reduplication, `-i`, `pe-…-an`, `ke-…-an`, `memper-`/`per-…-an` — and
the author will add **all of them within days**, so they are not hypothetical.

Two facts reframe the work:

1. **The data model is already general.** The phase-b schema
   (`affixed_form_pairs` with an `affix_type` discriminator covering
   `prefix|suffix|confix|reduplication`, `circumfix_left/right`, `productive`,
   the controlled `affixCatalog`) was designed against the *whole* book-2
   syllabus. Nothing about the model needs redesigning for confixes.

2. **The "stacked vs atomic" distinction is about meaning, not spelling.**
   `membelikan` decomposes into two independent morphemes (`membeli` and
   `belikan` both exist); `keadilan` is one indivisible morpheme (`*keadil`,
   `*adilan` do not exist). But **both are *spelled* the same way** —
   `prefix-piece(root) + suffix-piece`, the prefix piece either invariant
   (`ke`, `di`, `per`) or nasalising (`me`, `pe`):
   `keadilan = 'ke'+adil+'an'`, `membelikan = nasalise(beli,'me-')+'kan'`,
   `pendidikan = nasalise(didik,'pe-')+'an'`. The atomic-vs-stacked difference
   matters only for how an affix is *grouped and taught*, never for how the
   engine derives the surface form.

The earlier plan would have added confix derivation per chapter, branch by
branch. That is *more* mechanism than necessary — the engine already branches
per single affix and throws on the rest.

## Decision

**Replace the per-affix branching with one catalog-recipe composer, and treat
the whole known affix set as the design target — derivation only; content stays
per-chapter.**

1. **One composer.** `deriveAffixedForm(root, affix)` reads a **composition
   recipe** carried on each `affixCatalog` entry — `{ prefix?: {nasal|fixed},
   suffix?, reduplicate? }` — and applies it: nasalise (reusing `deriveNasalising`)
   or prepend the prefix piece, append the root, append the suffix piece. This
   single function covers **every** prefix/suffix/confix in book-2 (Bab 4/5/7/9/11/13).
   `DerivedAffixedForm` gains `circumfixLeft`/`circumfixRight` (populated for
   confixes, null otherwise).

2. **`confix` is a shape type, not atomicity.** `meN-…-kan`, `di-…-kan`,
   `pe-…-an`, `ke-…-an`, `per-…-an`, `memper-…-kan` are all `affixType: 'confix'`.
   The nasalised left half lives in `circumfix_left`; `allomorph_class` stays
   `null` for confixes (its documented scope is bare `meN-`/`peN-` only). No
   migration for derivation.

3. **Reduplication composes through the same slots as a base modifier.**
   It doubles the root to form a base (`anak-anak`), then *optionally* applies the
   existing fixed-prefix / fixed-suffix slots to that base — so the one composer
   covers full (`anak-anak`), redup+suffix (`sayur-sayuran`), and `ke-…-an`
   reduplication (`kebiru-biruan`), and `ber-…-an` / `se-…-nya` when their chapters
   land. Sound-change forms (`sayur-mayur`), lexicalised forms (`alun-alun`) and
   the asymmetric reciprocal `root-meN(root)` (`sewa-menyewa`) are **not** rule-derived —
   they are frozen vocabulary / recognition-only (deriving them would teach a false
   generalisation; research §25/§106).

   **Amendment (2026-06-19, L22 / Bab 6 *Verdubbelingen*).** This refines the
   original Decision 3, which said reduplication "copies the root rather than
   concatenating slots, so the composer hands off to `deriveReduplication`" — i.e.
   a *terminal separate branch*. Grounding the design against L22's actual grammar
   showed reduplication frequently co-occurs with an affix wrap (`sayur-sayuran`,
   `kebiru-biruan`), which the terminal branch could not express. The fix is the
   base-modifier composition above. Two consequences are load-bearing:
   - **`circumfix_left/right` stay `null` on every reduplication row** (the
     CS12/HC31 invariant is unchanged, no migration): the wrap pieces are
     re-derived from `(root, affix)` at render, not persisted. Each wrapped shape
     is a distinct, reduplication-namespaced catalog affix (`reduplication-an`,
     `ke-…-an-reduplication`) so it never collides with the confix `ke-…-an`.
   - **The decompose split is by reduplication kind:** *wrapped* → `decompose_word_ex`
     renders `[left, root-root, right]`; *full* → `decompose_word_ex` renders the
     easy `[root, root]` "find-the-root" rung (research §100's recognition intro
     step) rather than failing. The resolver stays type-based; no `allowedExercises`
     / `ProjectedCapability` change; no ready-but-unrenderable cap.

4. **Production-in-context via contextualised `type_form_ex`, NOT a cloze
   capability.** The morphology literature ranks *production in a carrier
   sentence* as the top productive format (research §16/§55/§100). But a
   first-class `produce_form_from_context_cap` per pair was deliberately
   won't-built on 2026-06-09 (architecturally "first-class-or-nothing" =
   +1 FSRS card/pair; low yield for vocab). We deliver the same learner screen —
   a blanked carrier the learner types into — as a **format** of the existing
   `produce_derived_form_cap` (`type_form_ex` reads a new nullable `carrier_text`
   column), so it adds **no** new card and does not reopen the won't-build. The
   carrier is **harvested deterministically** from the lesson's own sentences
   (grammar examples + exercise answers + story), verbatim-gated on `derived_text`,
   shortest-wins; null → isolated prompt fallback.

5. **One new exercise type, `decompose_word_ex`** (segment a derived word into
   root + affix pieces + meaning; recognise mode; distractors from the catalog +
   item pool). `build_confix_ex` is **not** built — assembling is weaker than
   typing (generation effect) and `type_form_ex` already covers production.

## Consequences

- **Less code, broader coverage.** One composer replaces N per-affix branches and
  covers the entire remaining rollout; new affixes become one catalog line each.
- **One additive migration** (`carrier_text`), not the "no migration" of the
  narrow confix add — the cost of option B. Justified: it buys literature-grade
  in-context production with no FSRS-card proliferation.
- **The atomic-vs-stacked distinction survives as metadata** (gloss, grouping for
  the Affix trainer), not as a derivation fork. CONTEXT.md records this.
- **Reduplication is honestly bounded** — only the productive (full) case is
  rule-derived; lexicalised forms are recognition-only (`productive=false` skips
  the produce cap) or curated, never fabricated.
- **Reversibility.** The recipe field and `carrier_text` are additive; reverting
  to per-affix branching or to option A (a real cloze cap) is possible but would
  rewrite the engine and re-migrate — hence this ADR.

## Alternatives considered

- **Per-affix confix branches (the literal phase-b Task 6).** Rejected: more
  mechanism than the composer, and re-paid for every chapter.
- **A new `affix_type` for stacked affixes.** Rejected: every consumer keys on
  shape (`circumfix_left/right`), not atomicity — a new enum value buys nothing.
- **Option A — a first-class affix cloze capability.** Deferred (not rejected):
  it reopens the 2026-06-09 won't-build and adds a card per pair. Option B
  delivers the same learner experience first; A stays available if evidence later
  shows context needs its own schedule.
- **`build_confix_ex`.** Held: same cap/level as `type_form_ex`, weaker pedagogy
  (assembly < typing). A clean isolated add later if format variety is wanted.
