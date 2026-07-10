---
status: approved
reviewed_by: [staff-engineer, architect, data-architect]
supersedes: []
---

# Affix Trainer — intro text, grammar-podcast, root-lesson hint, cross-affix links

Four additive enhancements to the Affix Trainer, all reading data that already
exists (no schema change).

## Grounding

- **Target architecture:** no constraint for this presentation/read surface
  (morphology appears only at the data layer, `docs/target-architecture.md:1150`).
- **Module spec:** `docs/current-system/modules/morphology.md` is the contract for
  `src/lib/morphology/` (pure data + view-models). This plan extends the adapter
  loads (§3) and two view-model types (§2) — the spec is updated **in the same
  commit** (Change 5). The `components/morphology/` UI is explicitly out of that
  spec's scope.
- **Data model:** unchanged. Grammar podcasts already live on
  `lessons.audio_path` (NL) / `audio_path_en` (EN); the root's introducing lesson
  is derivable from the root vocab caps the adapter already loads
  (`adapter.ts:242` rootCaps carry `lesson_id`). No `scripts/migration.sql` change.
- **Coverage (verified live 2026-07-10):** all **21 taught affixes** have a grammar
  podcast (NL+EN) on their introducing lesson. The `lessons` table has 31 rows —
  30 real numbered chapters (`order_index` 1-30, all with episodes) plus one
  **hidden "Common Words" lesson** (`order_index=999`, `is_hidden=true`, no
  episode) that buckets words taught in no chapter (the collections feature). No
  affix's introducing lesson is that hidden row, so the player always has content.
  **This hidden lesson is load-bearing for Change 3** (see the is_hidden filter).

## Change 1 — Intro text on the catalog view

`src/pages/AffixTrainer.tsx`: under the catalog `PageHeader` (the `!affix` branch),
render a short lead paragraph. Copy lives in `src/lib/i18n.ts` under `morphology`
(NL + EN), NOT hard-coded. Content: what affixes are (word-building prefixes /
suffixes / confixes / reduplication), that a root + affix forms a new word with a
predictable meaning shift, and that the trainer groups each affix's whole word
family so you can master it through recognition + production practice with spaced
repetition. Render as a dim lead `<Text>` (or the existing lead treatment) directly
under the header; detail view unaffected.

## Change 2 — Inline grammar podcast in the rule card

**Adapter** (`src/lib/morphology/adapter.ts`): the lessons load currently selects
`id, order_index` (`:275`). Extend to `id, order_index, is_hidden, audio_path,
audio_path_en` and carry the two paths alongside the order in a `lessonPodcastById`
map (or widen the existing `lessonOrderById` value). **Build `lessonOrderById` from
non-hidden rows only** (`is_hidden !== true`) — see Change 3 for why. Additive; no
other read changes.

**Model** (`src/lib/morphology/model.ts`): `AffixRuleSource` gains
`podcastNl: string | null` and `podcastEn: string | null` — the introducing
lesson's **raw** grammar-podcast bucket paths (null when the lesson/podcast is
absent). These are storage keys, NOT playable URLs (see the resolution note).

**Builder** (`src/lib/morphology/family.ts`): in `buildAffixDetail`, resolve the
representative cap's lesson (`repCap.lessonId`, already used for `lessonNumber`)
to its `audio_path` / `audio_path_en` and set `rule.podcastNl/En` — the raw paths,
unresolved (the pure layer has no storage client).

**UI** (`src/components/morphology/RuleCard.tsx`): directly under the existing
"introLesson N" anchor, render the shared inline player `LessonGrammarAudioBand`.
**Resolve the bucket paths to URLs at this edge** — `lessons.audio_path` is a
storage key, and `LessonGrammarAudioBand` → `LessonAudioPlayer` hands its `src`
straight to a bare `<audio>` (no resolution; the lesson pages only work because
`content.json` bakes a pre-resolved URL). So pass
`nl={rule.podcastNl && lessonService.getAudioUrl(rule.podcastNl)}` /
`en={rule.podcastEn && getAudioUrl(rule.podcastEn)}` — the exact resolution
`GrammarPodcasts.tsx:90` and `Podcast.tsx` already use. Label
`T.morphology.podcastLabel`; token-styled class names via `RuleCard.module.css`
(`.podcastBand` / `.podcastLabel`). No navigation — plays in place.

## Change 3 — "geïntroduceerd in Les N" on an unlearned root

**Model** (`model.ts`): `WordFamily` gains `rootIntroLessonNumber: number | null`.

**Builder** (`family.ts`, `buildWordFamiliesForAffix`): for each family root, find
its vocab cap(s) among the loaded `rootCaps` (match on the root's `itemSlug` /
`source_ref = learning_items/<slug>`), and set `rootIntroLessonNumber` to the
**lowest** `lessonOrderById[lesson_id]` across those caps (the introducing lesson,
matching how the rule card already picks the affix's introducing lesson).

**Hidden-lesson trap (data-architect, CRITICAL):** ~57 of 194 roots (`tiap`, `cara`,
`macam`, `puluh`, `beri`, …) have all their vocab caps on the **hidden "Common
Words" lesson** (`order_index=999`). Because that row is excluded from
`lessonOrderById` (Change 2's adapter change), those caps contribute no order, so
the minimum is taken over an empty set → `rootIntroLessonNumber = null`, and the UI
shows the warning alone — never "Les 999". A root with **no** vocab cap at all
(genuinely out-of-course, e.g. `aman`) is also `null`. Only roots taught in a real
chapter get a number.

**UI** (`src/components/morphology/WordFamilyExplorer.tsx`): in the existing
`!family.rootKnown` warning block ("Stam nog niet geleerd"), when
`rootIntroLessonNumber != null` append "· geïntroduceerd in Les N"
(`T.morphology.rootIntroLesson`). When null, render the warning alone (unchanged).

## Change 4 — Affix pills become cross-affix links

**Builder** (`family.ts` + `model.ts`): `DerivedForm` gains
`affixLinkable: boolean`, set in `buildWordFamiliesForAffix` via
`affixCatalogEntry(form.affix)` (lib/capabilities) — true only when the form's
affix is an actual catalog member with a detail page. The pure layer owns this
membership decision, not the component.

**UI** (`src/components/morphology/WordFamilyExplorer.tsx`): the per-form affix
pill (`.affixPill`) becomes a React Router `<Link to={/morphology?affix=<affix>}>`
(with `encodeURIComponent`, matching `AffixCatalogGrid.tsx:68`) **only when**
`form.affixLinkable && !isCurrent` — so a learner can hop root → affix → affix.
The **current** affix's pill and any non-catalog affix stay a non-link `<span>`
(no click that lands on a not-found page). Add a token-driven hover affordance in
`WordFamilyExplorer.module.css` (`.affixPillLink` — cursor/pointer, subtle hover).
Keep `white-space: nowrap` / no-shrink on all pill variants.

## Change 5 — Module spec

`docs/current-system/modules/morphology.md`: update §2 (add `AffixRuleSource`
podcast fields, `WordFamily.rootIntroLessonNumber`, `DerivedForm.affixLinkable`)
and §3 (adapter now loads `audio_path/_en`), and bump
`last_verified_against_code`. Also correct the `DerivedForm.affix` doc-comment
(`model.ts:70`) — clarify that a form's affix is **not** always a catalog member
(that's exactly what `affixLinkable` now distinguishes).

## Supabase Requirements

N/A — pure front-end read + presentation. No schema, RLS, grants, homelab-config,
or health-check changes. Reads existing columns (`lessons.audio_path`,
`audio_path_en`) and already-loaded root caps.

## Tests

- `src/lib/morphology/__tests__/morphology.test.ts`: extend the fixture so a lesson
  carries `audio_path`; assert `buildAffixDetail(...).rule.podcastNl` resolves (raw
  path). `buildWordFamiliesForAffix` sets `rootIntroLessonNumber` for a
  known-but-unlearned root; `null` for an out-of-course root (no cap); **and `null`
  for a root whose only cap lesson is `is_hidden=true` (the Les-999 trap) — must not
  be the hidden lesson's `order_index`.**
- `src/__tests__/AffixTrainer.test.tsx`: intro text present on the catalog view;
  the rule card renders the podcast player (data-testid) when a lesson podcast
  exists **and renders no band when the intro lesson's podcast is null**; a
  non-current **catalog** affix pill is a link to `/morphology?affix=…`, while
  **both** the current affix's pill **and a non-catalog affix's pill
  (`affixLinkable=false`)** render as non-link `<span>`s (pin the
  graceful-degradation contract).
- `bun run lint` + `bun run test` green.

## Files

1. `src/lib/i18n.ts` — `morphology` copy: intro, podcastLabel, rootIntroLesson (NL+EN).
2. `src/pages/AffixTrainer.tsx` — intro lead on the catalog view.
3. `src/lib/morphology/adapter.ts` — load `is_hidden, audio_path, audio_path_en`; build `lessonOrderById` from non-hidden rows only.
4. `src/lib/morphology/model.ts` — `AffixRuleSource.podcastNl/En`, `WordFamily.rootIntroLessonNumber`, `DerivedForm.affixLinkable`.
5. `src/lib/morphology/family.ts` — set podcast paths + root intro lesson (lowest) + `affixLinkable`.
6. `src/components/morphology/RuleCard.tsx` (+ `.module.css`) — inline `LessonGrammarAudioBand`.
7. `src/components/morphology/WordFamilyExplorer.tsx` (+ `.module.css`) — root-lesson hint + cross-affix pill links.
8. `docs/current-system/modules/morphology.md` — spec update (§2 + §3).
9. Tests as above.
