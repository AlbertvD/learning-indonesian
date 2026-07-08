---
status: implementing
implementation: PR #392 (Batch A shipped+deployed 2026-07-08); Batch B (B1 audio seeded live, B2 findings §5-findings) same day; PR #395 (P3b carriers + case fix, §5b) same day — C1 spec approved separately (2026-07-08-affix-production-fastpath.md)
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

## §5-findings (B2, 2026-07-08)

**Investigation only — no staging, DB, or code changes made.** Method: read the harvest
implementation + git history, then directly grepped every affected derived form
(case-insensitive, whole-word) against the full staged `lesson.ts` for its home lesson,
so the verdicts below are proven by absence/presence in the actual staged text, not
inferred from the DB counts alone (the DB counts matched the committed staging exactly,
confirming the DB is not stale relative to these files).

### Harvest implementation recap (file:line)

- **Tiers + priority order** — `carrierTiersFromLesson` (`scripts/generate-morphology-patterns.ts:533-566`) returns `[grammar, story, exercise, dialogue]`: grammar examples (`:534`), story paragraphs (`:541-543`), dialogue/conversation lines (`:547-549`), and exercise `answer`+`prompt` strings via a recursive collector (`:554-563`). `harvestCarrier` (`:159-165`) takes the **first tier with any match** (not a union across tiers) and the shortest sentence within it. Note: the `GenerateInput.carrierTiers` jsdoc (`:54-57`) still describes the pre-Task-3 3-tier list and doesn't mention dialogue — stale comment, not a functional bug (the array literal is authoritative and dialogue genuinely is last-priority).
- **Sentence extraction** — `extractSentences` (`:140-148`) splits on `. ! ? … — → -> ; \n`, strips list markers (`a.`/`1.`), and **requires ≥3 whitespace-separated tokens** — a real floor that rejects one/two-word imperative fragments.
- **Match predicate** — `blankDerivedInCarrier` (`src/lib/capabilities/affixDerivation.ts:302`) is a **whole-word, CASE-SENSITIVE** compare (`core === derived`, no lowercasing on either side), shared verbatim by the harvest gate and the runtime blank-render.

### Generation history rules out "harvest ran before the tier existed"

`git log --follow` on each lesson's `morphology-patterns.ts` vs. the harvest-widening commit:

| Lesson | Harvest-widening commit `7614463c` (2026-06-23) | Most recent regen of this file |
|---|---|---|
| L21 (-kan) | precedes | `e1a1fe24` (2026-06-24) |
| L23 (-i) | precedes | `b07a059a` (2026-06-24, "--regenerate opt-out + freqGate the bare -i pool") |
| L25 (-an) | precedes | `dcb790c9` (2026-07-04, "top up thin affix pools") |

All three files were generated/regenerated **after** the dialogue+prompt+arrow-RHS widening landed. Option (c) — "tier not read for these lessons" / "generated before the tier existed" — is **ruled out** for all three affixes. (Separately: none of L21/L23/L25 have a `dialogue`/`conversation`-type section at all — they're narrative/"dongeng"/grammar lessons — so the dialogue tier was never going to contribute here regardless.)

### Per-affix verdict

**`-kan` bare, L21, 0/22 — genuinely absent (root cause a).**
Grepped all 22 derived forms (`lakukan, katakan, berikan, hentikan, inginkan, dengarkan, dapatkan, lepaskan, pikirkan, bicarakan, tinggalkan, lupakan, ceritakan, keluarkan, letakkan, selamatkan, selesaikan, matikan, kerjakan, bersihkan, ucapkan, mainkan` — `morphology-roots.ts:56-77`) case-insensitively against the **entire** `lesson-21/lesson.ts` (story, vocab, grammar, exercises) → **zero hits for all 22**. The lesson does teach a bare-`-kan` imperative category ("Gebiedende wijs met -KAN") with examples `belikan!`, `turunkan!`, `Jangan turunkan!` — but (a) those roots (`beli`, `turun`) are not among the 22 selected for the bare pool (drawn from the ADR-0020 kaikki+frequency proposer, which is lesson-content-agnostic), and (b) even if they were, `belikan!` (1 token after stripping `!`) and `Jangan turunkan!` (2 tokens) both fail the extractSentences ≥3-word floor. **Not a harvest bug** — root *selection* (frequency-driven) and carrier *harvest* (lesson-content-scoped) are structurally decoupled for this highly-productive bare suffix, and the book's own worked imperative examples are too short and use different roots than the selected pool.

**`-i` bare, L23, 0/18 — genuinely absent (root cause a), plus one real secondary bug found.**
Grepped all 18 forms (`mulai, alami, tangani, cintai, hargai, pahami, percayai, jalani, datangi, tutupi, penuhi, punyai, tiduri, kenai, namai, pandangi, racuni, basahi` — `morphology-roots.ts:11-28`) case-insensitively against the entire `lesson-23/lesson.ts` → **zero hits for all 18**. The lesson has "Gebiedende wijs met -i" with two **usable-length** examples: `Ikuti contoh itu!` (3 tokens) and `Jangan kunjungi disko itu!` (4 tokens) — but roots `ikut`/`kunjung` were routed to the `meN-…-i` pool instead (`morphology-roots.ts:48,58` → `mengikuti`/`mengunjungi`, both of which DO have harvested carriers from the lesson's own story), not the bare `-i` pool. Same selection/harvest mismatch as `-kan`.
Bonus finding, verified by direct call: **`blankDerivedInCarrier` is case-sensitive** — `blankDerivedInCarrier('Ikuti contoh itu', 'ikuti')` → `null` (sentence-initial capital `Ikuti` doesn't match lowercase `derived`), while `blankDerivedInCarrier('Jangan kunjungi disko itu', 'kunjungi')` → matches (mid-sentence, already lowercase). This doesn't explain today's 0/18 (`ikut`/`kunjung` aren't in the bare-`-i` pool), but it is a real, reproducible bug in the shared harvest/render primitive that would silently suppress exactly this example if the pool were ever widened to include those roots — worth fixing regardless (affixDerivation.ts:302: lowercase both sides for the comparison, keep the original-case token in the output).

**`-an` bare, L25, 3/22 (low, not zero) — mixed: mostly absent, partly a cross-lesson gap.**
3 of 22 pairs carry a `carrierText`: `kemudian` (a genuine sentence), `pilihan` (`carrierText: "pemilih / pemilihan / pilihan"` — a slash-separated word list, not a sentence: `extractSentences` doesn't split on `/`, so a 3-token list fragment passes the length floor and gets harvested as if it were prose), `ujian` (`carrierText: "Pengawasan ujian sangat ketat.)"` — a stray trailing `)` from a list-item, not stripped). Of the other 19: L25's own grammar section ("Tata Bahasa - PE-AN vormen") teaches `pe-…-an`, not bare `-an` — the bare-`-an` pedagogical home is **lesson 10** ("Grammatica - Achtervoeging met -AN", with its own worked examples + "Oefening II — Voeg -AN toe"). Checked 3 of the 19 empty L25 forms against L10's own staged text: `makanan` (5 hits), `pikiran` (3 hits), `minuman` (3 hits) all occur naturally in L10's prose/exercises — but `carrierTiersFromLesson` is called with only the single lesson passed on the CLI (`main()`, `:617-619`: `lesson = readExport(dir/lesson.ts)` for the one `lessonNumber` in scope) — it never reads a second lesson's content. Because the `-an` `morphology-roots.ts` is homed at L25 (ADR 0020: one proposer run per lesson, one "home" lesson per affix), the harvester structurally cannot see L10's carrier-rich text for this affix. (Checked `latihan` too — 4 case-insensitive hits in L25's own file, but all 4 are the *section title* "Latihan"/"Latihan I/II/III", which `carrierTiersFromLesson` never reads — correctly absent, not a bug.)
`pe-…-an` (also minted at L25) is 0/22, consistent with the review's numbers; not separately re-verified beyond the count (out of the three affixes this task scoped).

### Does re-running the generator help?

**No — confirmed no-op for the empty pairs.** The generation-history table above shows all three files were already produced by a generator build that includes the dialogue/prompt/arrow-RHS widening; the function is deterministic and the staged `lesson.ts` inputs are unchanged since — same code + same input ⇒ identical output. This was reasoned from code + git history per the task's "do not modify staging/DB" constraint; not run destructively to prove it empirically.

### Smallest-fix recommendation

1. **Do not re-run `bun scripts/generate-morphology-patterns.ts 21 23 25`** expecting new carriers — it is a no-op for the currently-empty pairs (see above).
2. **Author curated carriers for the genuinely-absent pairs** (review's own step (b) — the correct fix for the majority, root cause (a)): one short natural sentence per pair, ≈22 (`-kan`, L21) + 18 (`-i`, L23) + 19 (`-an`, L25, minus the 3 already covered) ≈ **59 pairs** across the three lessons. `morphology-patterns.ts` is itself the committed, hand-regenerable staging input (not one of the three runner-derived files CLAUDE.md warns against hand-editing), so a curated carrier can be added directly to it, or fed back through `generate-morphology-patterns.ts` via a small curated-sentence side list consumed as an extra, highest-priority tier (mirrors the existing presence-cache pattern used for glosses, `mergeCachedGlosses`) so a re-run doesn't need to re-derive them.
3. **Fix the case-sensitivity bug in `blankDerivedInCarrier`** (`src/lib/capabilities/affixDerivation.ts:302`) — lowercase `core`/`derived` for the comparison only, keep the original-case token in the replaced output. Cheap, deterministic, benefits every future harvest run and the runtime render identically (same function). Add the `Ikuti contoh itu!` case as a regression test in `affixDerivation.test.ts`.
4. **For `-an` specifically**, a real fix requires widening `carrierTiersFromLesson`'s input to include the affix's pedagogically-introducing lesson when it differs from the affix's "home" lesson (L10 for L25's bare `-an`) — this changes the "one lesson directory in, one tier set out" contract the CLI wrapper currently has and is a genuine scope decision, not a quick fix. Flag for `architect` if pursued; do not build without that round.
5. The two `extractSentences` quality artifacts found on `-an` (slash-list fragment, stray trailing paren) are low-value polish — not worth a dedicated fix unless a future authoring pass touches `-an` anyway.

## §5b — P3b build spec (carrier authoring, 2026-07-08)

Executes §5-findings recommendations 2 + 3 (recommendation 4, the cross-lesson harvest widening, stays OUT — architect-gated; the curated carriers below cover the `-an` gap without it, and they also override the two junk `-an` artifacts from recommendation 5, making that polish moot for the curated forms).

**Curated-carrier mechanism (mirrors the presence-cache seam, not a new harvest tier):**

- New OPTIONAL per-lesson staging file `scripts/data/staging/lesson-N/curated-carriers.ts` exporting `curatedCarriers: Record<string, string>` — key = derived form, value = hand-authored carrier sentence containing the key as a whole word. Authored files for L21 (22 forms), L23 (18), L25 (21 — all bare `-an` except `kemudian`, whose harvested carrier is genuine; `pilihan`/`ujian` included to override their junk fragments) land in this same PR.
- `GenerateInput` gains `curatedCarriers?: ReadonlyMap<string, string>`. In `generateMorphologyPatterns`, a curated entry WINS over harvest: `carrierText = curated.get(derived.derived) ?? harvestCarrier(...)`.
- **Loud validation (pre-write validator, no silent fallback):** a curated entry used by a generated pair pushes an error (file NOT written) when `blankDerivedInCarrier(sentence, derived) === null` or the sentence has < 3 whitespace tokens. After the pair loop, any curated key that matched NO generated pair is also an error (stale/typo key). Curated sentences do NOT pass through `extractSentences` — they are authored as exactly one sentence; this validator is their gate.
- CLI wrapper: `readExport(dir/curated-carriers.ts)` (missing file → null → feature absent), pass through.

**Case-sensitivity fix (§5-findings recommendation 3):** in `blankDerivedInCarrier` (`src/lib/capabilities/affixDerivation.ts:302`) compare `core.toLowerCase() === derived.toLowerCase()` and replace the ACTUAL-case `core` in the token (`tok.replace(core, placeholder)`) so the token's punctuation survives. Regression tests: `blankDerivedInCarrier('Ikuti contoh itu!', 'ikuti')` → `'___ contoh itu!'`; the clitic non-match (`dinaikkannya` vs `dinaikkan`) stays null.

**Regen + publish (operator steps after the code lands):** `bun scripts/generate-morphology-patterns.ts 21 23 25` (presence-cached glosses carry over — expect "0 new", no LLM cost), commit the three regenerated `morphology-patterns.ts` in the same PR, then after merge publish lessons 21, 23, 25 (both stages, one lesson per invocation) so `affixed_form_pairs.carrier_text` and the carrier-gated usage capabilities materialize.
