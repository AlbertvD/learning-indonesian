---
status: approved
reviewed_by: [staff-engineer, architect]
---
<!-- Review round 2026-07-08: staff-engineer NEEDS-WORK → fixed (LessonCard per-bar
     null "—" mechanism pinned; A2 catalog-key assertion). architect NEEDS-REVISION →
     fixed (A2 source switched roots→patterns files; A3 +AffixDetailView hop +
     sequential fetch; A1 consumer enumeration + morphology.md same-commit note).
     All amendments adopt the reviewers' own prescriptions verbatim; no data-model
     surface → data-architect N/A. C1 still requires its own spec + architect round
     before build (§6). -->


# Affix trainer quick wins — consolidated implementation brief

**Purpose.** Execute proposals P1–P5 of `docs/research/2026-07-07-affix-trainer-review.md` at minimum token cost: every design decision is pinned HERE so build subagents (Sonnet) execute without re-deriving, and any orchestrator (Opus/Fable) only reviews. P6 (contrast drills) is explicitly parked — see §7.

**Target-architecture grounding:** all changes extend the existing `lib/morphology` + `components/morphology` module (spec: `docs/current-system/modules/morphology.md`) and the content pipeline's existing seams. No target-architecture constraints found for these surfaces; no new modules, no schema changes in Batch A/B.

**Build mechanics for subagents (IMPORTANT):** code-editing Sonnet subagents must use the Read → write-full-file-to-scratch → Bash `cp` into place workaround for EXISTING files (the read-before-edit hook blocks the Edit/Write tools in subagents; Bash writes pass — see `memory/project_subagent_edit_hook_transcript_fault`). Brand-new files: plain Write. Always Read the target file fully first. Gates per task: scoped `bunx vitest run <paths>`, `bunx eslint <paths>`, `bunx tsc -b` — all green before reporting.

---

## 1. Task A1 — mastery display split (review P1)

**Files:** `src/lib/morphology/catalog.ts`, `src/lib/morphology/model.ts`, `src/components/morphology/AffixCatalogGrid.tsx`, `src/lib/i18n.ts`, `src/lib/morphology/__tests__/*`.

**Pinned design:**

- Capability-type classes (exhaustive for `word_form_pair_src`):
  - **recognition** = `recognise_meaning_from_text_cap`, `recognise_word_form_link_cap`
  - **production** = `produce_derived_form_cap`, `produce_form_from_context_cap`
- Extend `AffixProgress` (model.ts) with two sub-rolls, keeping ALL existing fields (label/funnel/masteredCount/practisedCount/totalCount stay — the status pill and detail page keep working unchanged):
  ```ts
  recognition: { masteredCount: number; totalCount: number }
  production:  { masteredCount: number; totalCount: number }   // totalCount 0 = tier doesn't exist
  ```
- Computation in `rollUpProgress` (catalog.ts:67-93): tally per **cap** within each class (`labelForCapability` === 'mastered'). Denominators are **content-fixed** (all caps of that class for the affix, regardless of learner unlock state). Invariant: learner actions can only raise the percentages; only decay (at_risk) or new content lowers them.
- Tile bars (`AffixCatalogGrid.tsx:56-57`): replace the current practiced/mastered pair with:
  - bar 1 label `T.morphology.recognitionLabel` — `recognition.masteredCount/totalCount` as %
  - bar 2 label `T.morphology.productionLabel` — `production.masteredCount/totalCount` as %, and **`percent: null` when `production.totalCount === 0`**.
  - ⚠️ **Per-bar null rendering does NOT exist in LessonCard today** (staff-engineer, verified): `Bar` coerces null→"0%" (`LessonCard.tsx:56,63`) and `showBars` (:85) only hides the pair when BOTH are null. **Pinned fix:** extend `Bar` so `percent === null` renders the label + an em-dash "—" with an empty (muted) track instead of "0%" (~3 lines, shared component). Existing callers are unaffected: today null only ever occurs pairwise (unavailable tiles), and the both-null `showBars` hide stays as-is. Also fix the now-inaccurate doc comment at `LessonCard.tsx:47`. Add a LessonCard test for the mixed case (one bar set, one null → "—").
  - `tileStatus` (:23-33) unchanged (still reads funnel/label/practisedCount).
- i18n keys (both languages): `morphology.recognitionLabel` = NL "Herkennen" / EN "Recognition"; `morphology.productionLabel` = NL "Produceren" / EN "Production".
- Tests: update existing catalog tests; add cases — (a) affix with only recognition caps → production.totalCount 0 → bar renders "—" (the new Bar null path); (b) mastered recognition + untouched production → recognition 100%, production 0% (honest: the tier exists, nothing mastered); (c) overall `label` still weakest-wins (unchanged).
- Consumer safety (architect, enumerated): `AffixProgress` is constructed ONLY in `rollUpProgress` (both call sites go through it) and `AffixDetail.progress` is set but never read by any component — the type extension breaks nothing.
- **Same-commit obligation (architect):** update `docs/current-system/modules/morphology.md` §2 (public `AffixProgress` shape) + §3 (per-class tallies alongside weakest-wins) + bump `last_verified_against_code`.

## 2. Task A2 — lesson → trainer deep links (review P5)

**Files:** new `src/components/lessons/AffixTrainerLink.tsx` (+ optional module css), edits to the Grammatica chapter node of each affix-teaching lesson `Page.tsx`.

**Pinned design:**

- **Derive the lesson→affix map from the GENERATED staging, don't invent it:** the source is `scripts/data/staging/lesson-N/morphology-patterns.ts` (the generated files whose entries carry the FULL catalog affix labels). ⚠️ Do NOT use `morphology-roots.ts` — it holds only pre-expansion simple labels (architect, verified: lesson-23 roots say `-i` while its patterns carry `meN-…-i`/`di-…-i`), which would silently skip every confix/reduplication tile and mis-target suffix links. The builder enumerates the patterns files, groups distinct affix labels per lesson, and lists the full map in its report for human review.
- ⚠️ **Catalog-key assertion (staff-engineer):** every affix label harvested from morphology-roots MUST exactly match an `AFFIX_CATALOG` key (`affixCatalogEntry(affix) != null`) — a mismatched label (e.g. `me-` vs `meN-`) produces a link that lands on no tile. The builder asserts this for the full map and fails loud on any mismatch (report it; do not silently skip).
- Component: a small presentational band — `IconAbc` + text `Oefen {affix} in de Affix trainer` (i18n: `lessons.affixTrainerCta` NL "Oefen {affix} in de Affix trainer" / EN "Practise {affix} in the Affix trainer") + `Link to={'/morphology?affix=' + encodeURIComponent(affix)}`. Accepts `affixes: string[]` (a lesson can teach several, e.g. L21/L22/L29 — render one link per affix, comma-compact). Style with existing tokens (match the muted band idiom of `LessonGrammarAudioBand`'s inner width contract: respect `var(--lesson-col)`).
- Placement: **inside the Grammatica chapter node**, after the grammar content (bottom of the chapter, before the chapter's end). Do NOT add to lessons without morphology files.
- Parity tests are content-presence assertions — this additive element does not break them; run each touched lesson's parity test anyway.

## 3. Task A3 — audio in the trainer UI (review P4, UI half)

**Files:** `src/pages/AffixTrainer.tsx`, `src/components/morphology/AffixDetailView.tsx` (the prop hop — architect), `src/components/morphology/RuleCard.tsx`, `src/components/morphology/WordFamilyExplorer.tsx`.

**Pinned design:**

- Follow the Pronunciation page's audio-map idiom (`src/pages/Pronunciation.tsx:37-44`) with ONE difference (architect): the word list derives from the RESULT of `getAffixDetail`, so the audio fetch is **sequenced after detail resolves** (chain inside the same effect), not `Promise.all`-parallel. Fetch `fetchSessionAudioMap` for all `derivedText` values in `detail.families` + `detail.examples`, `voiceId: null`; thread the map `AffixTrainer` → `AffixDetailView` → `RuleCard`/`WordFamilyExplorer` as a prop.
- `RuleCard` examples + `WordFamilyExplorer` form rows get a `PlayButton` (`@/components/PlayButton`, size xs) — **only rendered when the URL resolves** (`resolveSessionAudioUrl(...)` truthy). No dead buttons: until Task B1 seeds clips, most buttons simply won't render; after seeding they appear with zero further code change.
- Catalog grid view: no audio (keep the fetch off the grid — it's per-detail only).

## 4. Task B1 — TTS seeding for derived forms (review P4, content half)

**Files:** new one-off script under `scripts/oneoff/` (find and follow the existing pronunciation-words seeding script there as the reference pattern — same TTS client, same `audio_clips` + bucket write path).

**Pinned design:**

- Input set: all distinct `derived_text` from `indonesian.affixed_form_pairs` (~450) that do NOT already have an `audio_clips` row (idempotent — safe to re-run).
- Voice: the default voice used by the reference script (`voiceId: null` lookup path must resolve). One voice is enough here (this is model audio, not perception training).
- Post-run report: counts seeded/skipped/failed + a 10-word random sample list for a human spot-listen (Chirp3-HD short-word caveat, ADR 0025).
- No runtime code changes in this task.

## 5. Task B2 — carrier-harvest investigation for -i / -kan / -an (review P3a)

**Investigation only — no authoring, no fixes in this task.** Question: live DB shows carrier_text 0/18 for -i and 0/22 for -kan. Determine WHY:

1. Read the harvest implementation (`scripts/generate-morphology-patterns.ts` — the carrier tiers: grammar examples incl. →-RHS, exercise prompts/answers, dialogue lines) and the staging for L21 (-kan), L23 (-i), L10 (-an).
2. Answer: (a) do the derived forms actually occur in any staged sentence tier? (b) if yes, why didn't the harvest match (word-boundary? clitics? tier not read for these lessons? morphology generated before the tier landed)? (c) if no, confirm the residual needs authored carriers.
3. Deliverable: a short findings note appended to this plan (§5-findings) + the smallest-fix recommendation. If the fix is "re-run generate + republish", say exactly which lessons.

## 6. Task C1 — production fast-path (review P2) — GATED, build LAST

Needs its own half-page spec + `architect` review before build (session-engine gating). Pinned direction for that spec: in `affix_practice` mode ONLY, a recognise cap answered correctly earlier in the SAME session adds its canonicalKey to the satisfied set used for produce-sibling introduction eligibility (`pedagogy.ts` satisfiedKeys, :527-529); root-vocab prerequisite stays hard (ADR 0018); standard mode untouched. Alternative if architect prefers: session-end CTA showing locked-production count. Do not start until Batch A is merged.

## 7. Parked — P6 contrast drills

Reopen only when production review events on `word_form_pair_src` exceed ~200 (i.e., the funnel demonstrably works). Full gauntlet then: staff-engineer → architect → data-architect (projection decision: new cap vs exercise-resolution).

## 8. Execution shape

- **Batch A** = A1 + A2 + A3 in parallel (disjoint files), one branch `feat/affix-quick-wins`, one commit per task, one PR, ONE container deploy after merge.
- **Batch B** = B1 + B2 in parallel after (or alongside) Batch A — B1 is DB/bucket-only (no deploy); B2 is read-only.
- **Batch C** = C1 after Batch A ships.
- Orchestrator reviews each subagent report + runs the clean-tree gate check before commit (staging discipline: `git diff --cached --stat` per commit).

## Supabase Requirements

- Schema changes: **none** (Batch A/B/C all ride existing tables; B1 inserts `audio_clips` rows + bucket objects via existing write path).
- homelab-configs: N/A. Health checks: N/A (no new invariants; B1 is idempotent additive content).
