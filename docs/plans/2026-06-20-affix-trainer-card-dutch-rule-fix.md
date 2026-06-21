---
status: draft
supersedes: []
---

# Affix Trainer detail-card fix — Dutch-only rule + example meanings

> Handoff for a FRESH context window (split from the 2026-06-20 morphology-affix-pool-proposer session). The bulk affix rollout is being done separately; THIS is the learner-facing card-quality fix. Surface: `src/components/morphology/` + `src/lib/morphology/`. Module spec: `docs/current-system/modules/morphology.md`.

## Three confirmed issues (code-grounded)

1. **English leaks into the Dutch UI.** The affix **gloss** rendered on the detail page is the *English* catalog string (`affixCatalog.ts`, e.g. `"intransitive / stative / possessive verb-former"`), shown at `AffixDetailView.tsx:33` and `RuleCard.tsx:21`. `rootMeaning` also EN-falls-back when NL is missing (`family.ts:32`).

2. **The actual grammar rule isn't shown.** `buildAffixDetail` already loads `detail.rule.patternName` + `detail.rule.patternExplanation` (the Dutch `grammar_patterns.short_explanation`) — `family.ts:140-146` — but `RuleCard` **never renders them**. So the real "what the affix does / how it changes the base word" (Dutch, already in the DB) is computed and dropped; only the terse English gloss shows.

3. **Examples don't show the derived word's meaning.** `RuleCard.tsx:42-50` renders `root → derived` + carrier sentence, no gloss. `AffixExample` (`family.ts:119-121`) carries no meaning. ⚠️ Data gap: the derived form's meaning is **not in the morphology snapshot** (only the *root* meaning is, via `rootItemsBySlug`) — so this needs either a `learning_items` lookup for the derived surface form, or rendering root-meaning + the affix's semantic effect.

## Fixes
- **Dutch rule body**: render `patternName` + `patternExplanation` as the card's rule text (already Dutch, already loaded); drop the English `gloss` from `RuleCard`/`AffixDetailView` (or add a Dutch `glossNl` to `affixCatalog.ts` — but the pattern explanation is richer and free, prefer it).
- **Example meanings**: add a derived-meaning field to `AffixExample` (`family.ts`); source it from `learning_items` where the derived surface form exists as an item, else fall back to root-meaning + gloss. Render it in `RuleCard`.
- **Cross-affix family clutter (the "why meng/peng on the di- page" report)**: the `WordFamilyExplorer` shows each root's FULL cross-affix family by design (`family.ts:buildWordFamiliesForAffix` / `formsForRoot`); it got more visible after meN-/peN- enrichment. **DECISION NEEDED** (user): keep the full family but label the panel clearly as "verwante vormen (alle affixen)", OR restrict each affix page to its own affix's forms with the cross-affix family as a secondary/collapsible view.

## Supabase Requirements
- **N/A** — pure frontend (component render + a read-side meaning lookup). No schema change. If the derived-meaning lookup needs a new query it stays within existing `learning_items` reads.

## Notes
- Keep the module spec `docs/current-system/modules/morphology.md` in sync (it documents the detail-view assembly).
- The affix data rollout (ber-/meN-/peN- live; di-/L23/L25/L26/L27/reduplication in progress) is independent — this card fix improves every affix page at once.
