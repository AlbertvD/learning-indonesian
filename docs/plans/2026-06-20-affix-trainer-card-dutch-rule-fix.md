---
status: shipped
reviewed_by: [architect, data-architect, staff-engineer]   # both required lenses signed off 2026-06-21 (schema + writer/reader/validator + module/seam/ADR fit); staff-engineer soundness pass
implementation: PR #270 (fixes 1/2/5) + PR #271 (fix 3)
merged_at: 2026-06-21
implementation_paths:
  - scripts/generate-morphology-patterns.ts          # fix 3 gloss authoring pass
  - scripts/lib/pipeline/lesson-stage/projectSections.ts
  - scripts/lib/pipeline/capability-stage/projectors/morphology.ts
  - scripts/lib/pipeline/capability-stage/validators/affixedFormPairs.ts   # Layer-2 both-or-neither
  - scripts/check-supabase-deep.ts                    # HC33 parity gate
  - src/lib/morphology/family.ts                      # language-resolve derivedMeaning + glossNl/glossEn
  - src/components/morphology/                        # RuleCard + WordFamilyExplorer render
  - src/lib/capabilities/affixCatalog.ts             # glossNl/glossEn (fixes 1/2)
supersedes: []
---

# Affix Trainer detail-card fix — bilingual affix rule + derived-form meanings

> Handoff for a FRESH context window (split from the 2026-06-20 morphology-affix-pool-proposer session). The bulk affix rollout is being done separately; THIS is the learner-facing card-quality fix. Surface: `src/components/morphology/` + `src/lib/morphology/` + (for fix 3) the morphology authoring pipeline. Module spec: `docs/current-system/modules/morphology.md`.
>
> **Grilled + decided 2026-06-21.** This doc records the resolved design, not options. The work is two tiers: **render-side fixes (land now)** and a **derived-gloss pipeline change (specced now, built in a later session)**.

## Why (three confirmed issues, code-grounded)

1. **English leaks into the Dutch UI — on THREE surfaces, not two.** The affix **gloss** is the English catalog string (`affixCatalog.ts`, e.g. `"passive verb-former"`). It renders at the **catalog grid tile** (`AffixCatalogGrid.tsx:52` → `grammarTopics={tile.gloss}` — the first thing the learner sees), the **detail header** (`AffixDetailView.tsx:33`), and the **rule card** (`RuleCard.tsx:21`). `rootMeaning` also EN-falls-back when NL is missing (`family.ts:32`).

2. **The actual grammar rule isn't shown.** `buildAffixDetail` loads `detail.rule.patternName` + `detail.rule.patternExplanation` (`family.ts:140-146`) but `RuleCard` renders neither as rule text — only the terse English gloss. NOTE (verified): the morphology read reads **`grammar_patterns.short_explanation`** (`adapter.ts:283,286` → `family.ts:145`), and that column was *written* from the authored pattern `description` by the capability stage (`capability-stage/adapter.ts:538`) — there is no separate short field, so `patternExplanation` is a full 3–6-sentence teaching paragraph. The "representative" pattern is also semi-arbitrary (`family.ts:104-110` picks lowest-lesson-order, ties by array order, so a narrow sub-rule can win). Dumping it verbatim is long AND can show the wrong pattern.

3. **Examples (and the family explorer) don't show the derived word's meaning.** `RuleCard.tsx:42-50` renders `root → derived` + carrier, no gloss; **`WordFamilyExplorer.tsx:60` has the identical gap** — derived forms render with an affix badge and no meaning, gutting the "one root → many words" payoff. ⚠️ **Data ground-truth (live DB, 2026-06-21):** only **9%** of the 267 derived forms (17% of the lead-3 examples) exist as a `learning_item` with an NL meaning, and **no authoring path writes a derived gloss** (`morphology-roots.ts` authors only `{ root, affix, illustratesCategory }`; the derived form is engine-computed). So a `learning_items` lookup is structurally starved — full coverage requires a new authored/harvested field (fix 3 below).

---

## Fix 1 — Bilingual crisp affix rule via `glossNl` + `glossEn` (render-now)

**The app is bilingual** (`profile.language` 'nl'|'en' is threaded into `getAffixDetail`, `AffixTrainer.tsx:22,39`), so the affix rule needs a **crisp version in BOTH languages**, not a crisp Dutch one beside the existing terse English label.

**Decision:** add **`glossNl` + `glossEn`** to the catalog, each a **crisp one-to-two-sentence rule statement** — e.g. `di-` → NL "Maakt een lijdende (passieve) werkwoordsvorm: de handeling staat centraal, niet wie hem uitvoert." / EN "Forms the passive: the action is foregrounded, not who performs it." 21 affixes × 2 = 42 short authored strings, one-time.

- `affixCatalog.ts`: `AffixCatalogEntry` gains `glossNl: string` + `glossEn: string`. **Keep the terse `gloss`** — it is NOT display-only (architect, verified): it feeds a live pipeline chain `entry.gloss` → `affixDerivation.ts:285` (`affixGloss`) → `generate-morphology-patterns.ts:216,242` (into committed `morphology-patterns.ts`) → `lesson-stage/projectSections.ts:244` → `affixed_form_pairs.affix_gloss`. The UI simply stops reading it. *(Aside, out of scope: `affix_gloss` is dead at the render end — nothing in `src/**` reads `MorphologyPairRow.affixGloss` — so the whole `gloss`→`affix_gloss` chain is a separate pre-existing cleanup candidate; do NOT bundle it into this card fix.)*
- `buildAffixCatalog` / `buildAffixDetail` (`catalog.ts:138` / `family.ts:134`): **language-select** into the rendered field — `language === 'nl' ? glossNl : glossEn` — and keep populating `tile.gloss` / `detail.gloss` (the model field name stays; only its source changes, from `entry.gloss` to the resolved rule string). Components render `*.gloss` unchanged, so grid tile + header + rule card all get the right language for free.
- **No silent cross-language fallback.** Each locale shows its own string. Fix the `rootMeaning` EN-fallback (`family.ts:32`) the same way — `nl → meaningNl`, `en → meaningEn`, never a silent cross-language string.

Why both `glossNl`/`glossEn` AND the rule-body change (fix 2): the pattern explanation can't reach the grid tile or content-thin affixes (most of the 21 today have no pairs/pattern), so the catalog rule strings are the only thing that kills the leak consistently. Different slots, not competitors.

## Fix 2 — Concise rule body (render-now)

**Decision: B (concise).** Render in `RuleCard`: `glossNl` as the rule headline + the representative `patternName` as the specific rule label. **Do NOT render the full `patternExplanation` paragraph** — it is long, the representative pick is semi-arbitrary, and the full treatment is one click away via the existing intro-lesson link (`RuleCard.tsx:56-61`, which already appends `patternName`). This also sidesteps the "verbose grammar explanation" pedagogy problem already on record.

- `RuleCard.tsx`: the headline `<Text>{detail.gloss}</Text>` is now the language-selected rule string (fix 1); show `detail.rule.patternName` as a labelled rule line when present. Keep the allomorph badges, `ruleNote`, examples, and intro-lesson link.
- **Known limitation (accepted):** `patternName` comes from the same semi-arbitrary "representative" pattern pick (`family.ts:103-110`), so for a multi-pattern affix it may name a sub-rule rather than the headline rule. Accepted: a possibly-imperfect *name* is far lower-stakes than a possibly-wrong full *paragraph*, and `glossNl`/`glossEn` carry the authoritative rule. Not worth a "pick the main pattern" mechanism (no `is_main` signal exists).

## Fix 3 — Derived-form meanings via a new `derived_gloss` (PIPELINE CHANGE — spec now, build later)

**Decision: C (author full coverage), single bilingual LLM pass.** The learner needs the derived word's meaning — in BOTH languages — on the rule-card examples AND in the word-family explorer; 9% lookup coverage is unacceptable and there is no authoring source today, so we add one.

*(Decision trail: the original two-tier harvest (coursebook-NL + kaikki-EN→translate) was cut in review. The kaikki tier was over-built — net-new dump re-fetch + extractor + a double-translated thin "passive of X" gloss (staff-engineer, 2026-06-21). The separate deterministic coursebook-harvest tier then stopped earning its keep once **bilingual** was confirmed: the coursebook is Dutch-only, so EN must be LLM-authored for ~every form regardless — and once the LLM runs over everything for EN, a parallel NL-harvest mechanism is redundant. Collapsed to one pass; the coursebook gloss survives as LLM **grounding context**, not a separate harvester.)*

**Storage (data model — needs `data-architect`).** Two new **nullable** columns **`derived_gloss_nl text` + `derived_gloss_en text`** on BOTH `indonesian.affixed_form_pairs` (projection) and `indonesian.lesson_section_affixed_pairs` (source), added additively in `scripts/migration.sql` + `scripts/migrate.ts`, projected exactly like `carrier_text` is (source → projection in the capability stage). **NOT** seeded as `learning_items` rows — that would make affixed forms into scheduled vocab, violating ADR 0009 (typed-table-per-concept) and ADR 0014 (item harvest is word/phrase only). The typed pair table is the correct home.

**Production seam (resolved — authoring-time `generate-morphology-patterns.ts`, NOT a publish-time enricher).** The architect flagged that the draft cited two mutually-exclusive seams ("at authoring time" + "reuse `enrichEnTranslations`"). Only one is structurally consistent: the gloss must originate in the committed `morphology-patterns.ts` staging file (which the lesson-stage runner reads into `lesson_section_affixed_pairs`, `runner.ts:508-515`), and that file is generated at **authoring time** by `generate-morphology-patterns.ts` from `morphology-roots.ts` — exactly where `carrier_text` (`harvestCarrier`) and `affixGloss` already materialize (`generate-morphology-patterns.ts:216,221,242`). `enrichEnTranslations` is the wrong seam: it runs at publish time over `lesson_sections.content`, which affixed pairs are never in. Both seams would land lesson-side, so ADR 0012 (lesson stage owns learner-facing enrichment) is honoured either way — but the seam is `generate-morphology-patterns.ts`.

For each pair, an LLM authors `{ nl, en }` glosses grounded on: the derived form, the root + its meaning, the affix rule (`glossNl`/`glossEn`), the harvested carrier sentence, AND — when present — the coursebook grammar-description snippet mentioning the form (so it adopts tuned phrasing like `"iets neerzetten"` where the book gives one, composes a fresh gloss where it doesn't). The form is already kaikki-*attested* (`propose-morphology-roots.ts`), so the LLM glosses a known real word, it does not invent one — the permitted "creative linguistic work" carve-out (use `lesson-stage/enrichEnTranslations.ts` only as a *prompt/caching pattern reference*, not as the seam).

- **Idempotency (required):** an LLM pass is non-deterministic + costs tokens, but `generate-morphology-patterns.ts` is re-run additively. So gloss **presence-cache**: author only for pairs whose `morphology-patterns.ts` entry lacks a gloss; a re-run never re-LLMs an existing one. Mirrors the additive re-run discipline of `propose-morphology-roots.ts`.
- **Corrections regime (corrected — NOT a DB flag-loop).** `affixed_form_pairs` is a **regenerable lesson-content projection**, deleted + reinserted on every publish (`capability-stage/adapter.ts:461-489`; ADR 0011 lists affixed pairs in the delete+reinsert set). A DB edit to `derived_gloss_*` would be wiped on the next publish. Corrections therefore follow the `carrier_text` regime: **edit the canonical authoring source + regenerate `morphology-patterns.ts` + republish** — NOT the admin flag-loop (the flag tool is for the DB-authoritative *capability* side; applying it here is the "don't cross the two source-of-truth regimes" error). State this in the spec body so ADR 0011's scope isn't re-litigated.

**Read + render — names the FULL writer→reader chain (data-architect):**
- Source/projection schema: add `derived_gloss_nl`/`derived_gloss_en` to both tables (see Supabase Requirements).
- Capability-stage projection: extend `TypedAffixedPair` (`capability-stage/loadFromDb.ts:822`) + the select string (`loadFromDb.ts:881`), and `AffixedPairSource` (`capability-stage/projectors/morphology.ts:35`) + the row-push (`projectors/morphology.ts:163`).
- Lesson-stage writer: carry both fields in the `morphology-patterns.ts` → `lesson_section_affixed_pairs` map (`lesson-stage/runner.ts:336-351`, beside `carrier_text:351`).
- Runtime: `model.ts` adds `derivedMeaning: string | null` to `AffixExample` + `DerivedForm` (language-resolved); `adapter.ts:146,161` selects `derived_gloss_nl, derived_gloss_en` and carries both on `MorphologyPairRow`; `family.ts` **language-selects** (`nl → _nl`, `en → _en`, no cross-fallback) into `examples` (`buildAffixDetail`) + `formsForRoot` (`DerivedForm`); `RuleCard.tsx` + `WordFamilyExplorer.tsx` render the meaning when present, nothing when null.

## Fix 5 — Cross-affix family framing (render-now)

**Decision: A (keep full family; fix framing + orient).** The explorer's cross-affix view is the panel's reason to exist ("one root → many words"); restricting it would gut it. The "why meng-/peng- on the di- page?" report is a **framing** failure, not a content failure.

- Sharpen the panel copy (`i18n.ts` `morphology.familiesSubtitle`, both locales): state plainly that each root takes the current affix, and underneath you see ALL of that root's forms across every affix.
- **Highlight the current affix's form** in each family in `WordFamilyExplorer.tsx` (emphasise the matching affix badge / form) so the learner is anchored to "the affix you're on" vs "its family". Requires passing the current `affix` down to the explorer (it currently receives only `families`).

---

## Supabase Requirements

### Schema changes
- **New columns** `derived_gloss_nl text` + `derived_gloss_en text` (both nullable) on `indonesian.affixed_form_pairs` AND `indonesian.lesson_section_affixed_pairs` → add to `scripts/migration.sql` + `scripts/migrate.ts`. Additive, nullable → `make migrate-idempotent-check` stays green. (Fixes 1, 2, 5 need NO schema change.)
- **RLS / grants:** unchanged — the existing authenticated-read policies on both tables cover the new columns; no new policy or grant.

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (`indonesian` already exposed).
- [ ] Kong CORS — **N/A**.
- [ ] GoTrue — **N/A**.
- [ ] Storage — **N/A**.

### Validators / health checks
- **Required — write a NEW parity gate (the `carrier_text` one does NOT exist; data-architect M1).** The draft said "mirror the parity assertion `carrier_text` already carries" — that gate is imaginary: `check-supabase-deep.ts` never references `lesson_section_affixed_pairs`; HC17/HC31 check projected-table payload invariants only, and `validators/affixedFormPairs.ts:48` is a `carrier_text` *content* check (contains `derived_text`), not a source=projection equality. So the source→projection equality is enforced only by construction today. The new columns need a parity gate built from scratch, as the three-layer pattern:
  - **Layer-1/2** — a presence/equality branch in `affixedPayloadFindings` / `validateAffixedFormPairs` (`validators/affixedFormPairs.ts`): when the sourced pair's gloss is non-null, the projected row's must equal it.
  - **Layer-3** — a NEW health check (e.g. HC32) in `check-supabase-deep.ts` cross-joining `lesson_section_affixed_pairs` ⋈ `affixed_form_pairs` on `source_ref`, asserting `derived_gloss_nl`/`_en` match. **Must be NULL-tolerant** (null-on-both passes — un-glossed pairs are valid during rollout; do NOT red-fail every un-glossed pair).
- **Optional:** a NULL-coverage report (count of `affixed_form_pairs.derived_gloss_nl IS NULL` / `_en IS NULL`) for a rollout coverage signal — defer unless wanted (corrections happen via source-edit + republish, not a live loop).

## Sequencing
- **Now:** fixes 1, 2, 5 + the `rootMeaning` EN-fallback correction — pure `src/components/morphology/` + `src/lib/morphology/` + `affixCatalog.ts` + `i18n.ts`, no schema. Ships independently and improves every affix page at once.
- **Later session:** fix 3 — the `derived_gloss_nl`/`derived_gloss_en` columns + the single bilingual LLM authoring pass in `generate-morphology-patterns.ts` (presence-cached) + the new NULL-tolerant parity gate + the read/render plumbing. (Reviewed + approved with the rest of this plan.)

## Touched files (precise — supersedes the header's broad-strokes list)
- **Render-now:** `src/lib/capabilities/affixCatalog.ts` (glossNl/glossEn), `src/lib/morphology/{catalog.ts,family.ts,model.ts}` (language-select; rootMeaning fix; pass `affix` down), `src/components/morphology/{RuleCard.tsx,WordFamilyExplorer.tsx,AffixDetailView.tsx,AffixCatalogGrid.tsx}`, `src/lib/i18n.ts:17-41` (familiesSubtitle copy, both locales), `src/pages/AffixTrainer.tsx` (already threads `language`; verify it passes through). 
- **Pipeline-later (fix 3):** `scripts/migration.sql` + `scripts/migrate.ts`, `scripts/generate-morphology-patterns.ts`, `scripts/lib/pipeline/lesson-stage/runner.ts`, `scripts/lib/pipeline/capability-stage/{loadFromDb.ts,projectors/morphology.ts,validators/affixedFormPairs.ts}`, `scripts/check-supabase-deep.ts`, plus the runtime read/render files above.

## Notes
- **Module spec sync (`docs/current-system/modules/morphology.md`, same commit as the code):** render-now changes the §2 interface note that `gloss` is a catalog passthrough → it is now a **language-resolved** field (catalog.ts/family.ts resolve glossNl/glossEn). Fix 3 adds `derivedMeaning` to `AffixExample`/`DerivedForm` in the §2 view-model list and the two `derived_gloss_*` columns to the §3 adapter fan-out.
- The affix data rollout (ber-/meN-/peN- live; di-/L23/L25/L26/L27/reduplication in progress) is independent — this card fix improves every affix page at once.
- **No ADR.** The `derived_gloss_*` columns follow the existing `carrier_text` pattern (not surprising), nullable columns are trivially reversible (not hard-to-reverse), so the ADR bar isn't met. But **state in the spec body that `affixed_form_pairs.derived_gloss_*` re-derives from source on every publish** (regenerable projection, not DB-authoritative) — cheap insurance so ADR 0011's scope isn't re-assumed a third time. CONTEXT.md needs no new term until the columns ship.
