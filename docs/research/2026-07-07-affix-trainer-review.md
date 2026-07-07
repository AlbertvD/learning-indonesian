# Affix Trainer — feature review (2026-07-07)

**Scope.** Full review of the Affix Trainer surface (`/morphology`), its exercise machinery, its content substrate, and its live usage — against the feature's own research base (`docs/research/2026-06-15-affix-morphology-module-research.md`, ADR 0021) and live-DB ground truth (queried 2026-07-07 via direct psql).

**Method.** Every behavioural claim below was verified against the code at the cited `file:line` on main (rev `26e1fa3b`), or against the live DB. Nothing is quoted from memory or from plan prose.

---

## 1. What exists today (verified inventory)

### 1.1 The trainer surface

- **Catalog grid** (`src/pages/AffixTrainer.tsx:61-88` → `src/components/morphology/AffixCatalogGrid.tsx`): all 21 catalog affixes as `LessonCard` tiles in research teaching-rank order, with affix-type gradient banners, CEFR badge, gloss, and the two nested progress bars (% geoefend / % beheerst). Availability mirrors ADR 0006 — a tile unlocks when any introducing lesson is activated (`src/lib/morphology/catalog.ts:106-110`); no separate unlock engine was invented.
- **Affix detail** (`AffixDetailView.tsx`): back link, header with type badge + gloss, **RuleCard** (gloss, CEFR, allomorph-class badges, allomorph-rule prose, 3 worked examples with carrier sentences, link to the introducing lesson — `RuleCard.tsx:11-69`), **WordFamilyExplorer** (the full cross-affix family per root, mastery-dot per form, "you know N of M" badge, root-unknown warning, frozen-form marking — `WordFamilyExplorer.tsx:24-82`), and **one Practice button** that launches a scoped session (`/session?mode=affix_practice&affix=<label>` — `practice.ts:15-18`); the trainer itself hosts no drills.
- **Data layer** (`src/lib/morphology/adapter.ts`): one impure snapshot loader (chunked reads, Kong-URL-length safe), pure folds for catalog/detail/families. Mastery reuses the canonical `labelForCapability`/`weakestLabel` rungs (`catalog.ts:7-13`).

### 1.2 The exercise machinery (what "Practise" actually serves)

Routing is ADR 0021's form-regularity split, encoded at projection time:

| Track | Caps | Exercises (verified builders) |
|---|---|---|
| **Transparent** (invariant prefix/suffix: ber-, di-, se-, ter-, memper-, -an, -kan, -i) | `recognise_meaning_from_text_cap` + carrier-conditional `produce_form_from_context_cap` | Meaning MCQ — "what does *berjalan* mean?" with deterministic distractor cascade root-meaning → family siblings → lesson pool (`byType/recognitionMcq.ts:12-55`, `morphologyDistractors.ts:36-64`); usage cloze in carrier |
| **Allomorphic / confix / reduplication** (meN-, peN-, all confixes, redup) | `recognise_word_form_link_cap` + `produce_derived_form_cap` | Segmentation MCQ — pick the morpheme breakdown, distractors = mechanical boundary shifts (`byType/decomposeWord.ts:54-73`); typed production "Geef de peN-vorm van: …", carrier-blanked when a carrier exists (`byType/typedRecall.ts:20-61`) |

Session integration (`src/lib/session-builder/pedagogy.ts`): in `affix_practice` mode the grammar-pattern prerequisite is deliberately relaxed (:309-319 — the "circular over-strictness that left the trainer with no cards" fix), the **root-vocab prerequisite is kept** (ADR 0018), and the within-pair recognise→produce ladder is enforced via `prerequisiteKeys`, where "satisfied" = active + ≥1 successful review (:527-529).

### 1.3 The content substrate (live DB, 2026-07-07)

- **716 pair rows, 21/21 affixes covered, 100% gloss coverage (NL + EN).**
- Pool sizes: most affixes 15–24 distinct derivations; thin tails are oracle-limited, not config gaps (memper-…-kan 8, ke-…-an-redup 5, redup-an 4 — kaikki attests nothing more for taught roots).
- **Carrier coverage is very uneven**: ber- 44/83, meN-…-kan 20/44, meN- 16/48 … and **zero** for -i (0/18), -kan (0/22), pe-…-an, memper-…-kan, ke-…-an-redup.

## 2. What works well (keep; do not churn)

1. **The architecture is right.** Pure folds over one snapshot; the trainer reuses `LessonCard`, the mastery model, and the session engine instead of hosting parallel drills. The scoped-session launch (`mode=affix_practice`) means every future session-engine improvement accrues to the trainer for free.
2. **The exercise routing is research-aligned and battle-tested.** The "which affix formed *berjalan*?" triviality for transparent prefixes was caught, researched (SLA verification pass, sources [26]–[33]), and fixed with ADR 0021. Meaning/usage for transparent, formation for allomorphic is exactly what the salience/noticing literature prescribes.
3. **WordFamilyExplorer is the product's generative pitch made visible** — "one root → many words," full family with status dots, not owned-only. No competitor surface does this for Indonesian.
4. **Deterministic everything.** Distractor cascades, segmentation distractors, fail-loud on degenerate MCQs (`recognitionMcq.ts:35-42`, `decomposeWord.ts:80-89`). No LLM in the runtime loop.
5. **Honest availability.** Tiles reflect lesson activation (ADR 0006) rather than inventing an unlock system.

## 3. Findings (severity-ordered)

### F1 — CRITICAL (adoption): the production tier has never fired

Live DB: **56 review events total** on `word_form_pair_src` caps, from **1 of 12 users**, 2026-06-21 → 2026-07-06. Breakdown: 46 on `recognise_meaning_from_text_cap`, 10 on `recognise_word_form_link_cap`, and **0 — zero, ever — on `produce_derived_form_cap` and `produce_form_from_context_cap`**, despite hundreds seeded.

The research base is unambiguous that production is the point: "design for generation, not recognition alone" (research §Morphology Pedagogy Findings); production is a distinct, harder skill needing its own deliberate practice [26]. The entire production tier — the FSRS workhorse of the design — is currently dead weight.

Mechanism (verified, not a bug per se): `produce_*` caps prereq on their recognise sibling being active + ≥1 successful review (`pedagogy.ts:317-323,527-529`). With 56 recognition events spread across ~150+ derivations, almost no recognise cap has stabilised, so almost no produce cap has ever been eligible. The ladder is working as designed; the design starves production at current engagement levels.

### F2 — HIGH (structural): mastery on the tiles is structurally ~0%

`rollUpProgress` groups caps per derivation and takes **weakest-wins** (`catalog.ts:67-93`). A derivation whose produce cap has no state gets label `not_assessed` — so a learner who aces every recognition drill still sees **0% beheerst on every tile, forever** (until F1 is solved). The progress display punishes the learner for a gate the system itself imposes. This also nulls the tile's motivational loop: "beheerst" can't move for weeks.

### F3 — HIGH (content): the transparent-suffix production path doesn't exist

ADR 0021's transparent track is meaning MCQ + **carrier-conditional** usage cloze. Live DB: -i has 0/18 carriers, -kan 0/22 — so **no usage caps exist at all** for the transparent suffixes; even for transparent prefixes the usage caps number only 1–11. The "usage-in-carrier" half of the transparent design — the only *productive* exercise those ~150 pairs can ever get — is mostly unrealized. ("Meaning-only for the residual; no synthetic carriers in v1" was the deliberate deferral; v1 has now shipped and the residual turned out to be the majority.)

### F4 — MEDIUM (discoverability): nothing routes learners in

No lesson page deep-links to the trainer (`grep morphology?affix src/pages/lessons/` → zero hits); the only entrances are the LerenNav tab and nothing else. Result: 1 of 12 users has ever practised an affix. The trainer is the app's differentiating feature for Indonesian and it is effectively hidden behind a nav tab labelled with a linguistics term.

### F5 — MEDIUM (modality): the entire morphology experience is silent

No audio anywhere: not in RuleCard examples, not in WordFamilyExplorer forms, not in the drills. This clashes with (a) the app's own dual-coding evidence (`memory/research_audio_sla`: d≈0.4–0.7), and (b) the salience finding the redesign was built on — affixes are *phonologically reduced and hard to perceive* [28], which is an argument for hearing *membelikan* whenever it's drilled. (Prerequisite: derived forms need TTS clips — likely absent; the pipeline synthesizes clips for vocab/dialogue, not for affixed forms.)

### F6 — LOW (roster): the research's two highest-value exercise types beyond the shipped four are still missing

From the Exercise-Type Catalog (research §Exercise-Type Catalog): **same-root contrast pair** (*memukul* hit vs *terpukul* struck — semantic discrimination, reuses the existing `contrast_pair` primitive) and the **-kan vs -i discrimination** (the #1 B1 constraint-mastery item, L24 teaches it in prose but nothing drills it). Both are "new content on existing machinery." The remaining catalog rows (pick-affix-from-meaning, Root Race) are lower value. Given the modest overall effect sizes (d≈0.33 [30]) this is deliberately LOW — a couple of good item types per affix beats an engine — but these two are the *right* couple for B1.

### F7 — LOW (drill quality): decompose distractors can be shallow for short roots

`buildBreakdowns` (`decomposeWord.ts:54-73`) generates the unsegmented word + boundary-shift errors. For a 2-piece pair with a short root (e.g. se- + a 3-letter root) the boundary-shift distractors are visibly malformed strings, making the correct answer findable by elimination without morphological knowledge. Acceptable for v1 (it still forces noticing); worth a second distractor tier (sibling-affix segmentations: *ber-* piece offered for a *ter-* word) if F1/F3 work brings real traffic.

## 4. Improvement proposals (prioritized; minimum mechanism per goal)

### P1 — Split the mastery display into recognition/production (fixes F2, cheap)

Keep weakest-wins for the FSRS truth, but present per-tile progress as what it actually is: **"herkennen: X% · produceren: Y%"** (or: beheerst-bar counts only caps that are *unlockable today*). One pure change in `rollUpProgress` + tile label. No schema, no session change. This makes progress move again for real learners *without* touching the pedagogy.

### P2 — Give scoped affix practice a production fast-path (attacks F1)

In `affix_practice` mode the learner has explicitly chosen focused drilling; the research says receptive and pushed-output practice give **equivalent gains** [26]. Two candidate mechanisms, cheapest first:

1. **Same-session ladder:** when a recognise cap is answered correctly *in this session*, make its produce sibling eligible for introduction in the same session's later slots (the satisfied-keys set is computed once per build — `pedagogy.ts:527`; extend it with in-session successes). One file, no schema.
2. **Session-end CTA:** after an affix session, show "nog N vormen te ontgrendelen — oefen morgen weer" so the ladder is visible instead of silent.

Do **not** drop the root-vocab gate (ADR 0018 stands — single-unknown-card rule).

### P3 — Carrier backfill for the transparent suffixes (fixes F3)

Order of attack: (a) **re-run the deterministic harvest** — L21/L23 have Latihan and story sentences; verify whether the 0/18 and 0/22 are true absences or a harvest that predates the added tiers; (b) where genuinely absent, author a **curated carrier batch** for the ~40 -i/-kan pairs (one sentence each; the linguist agents + a human pass — this is exactly the "genuinely creative work" the LLM fork in CLAUDE.md permits); (c) republish the affected lessons (routine additive publish — carriers ride `affixed_form_pairs`). This unlocks the production tier for the transparent track.

### P4 — Audio for derived forms (fixes F5)

One-off TTS seeding script for the ~450 distinct derived forms + carrier sentences (same pattern as the pronunciation-word seeding); then (a) session drills get audible texts for free via the existing `audibleTexts` path, (b) add `PlayButton`s to RuleCard examples + WordFamilyExplorer forms via the existing `fetchSessionAudioMap` (the pronunciation page shows the exact pattern — `Pronunciation.tsx:37-44`).

### P5 — Route learners in from the lessons (fixes F4)

The chapter rollout just gave every lesson a Grammatica chapter. For the ~16 lessons that introduce an affix, add one line to that chapter: "Oefen ⟨ber-⟩ in de Affix trainer →" (`/morphology?affix=ber-`). The lesson→affix mapping already exists in the DB (`affixed_form_pairs` → cap → lesson_id). Also worth a Dashboard nudge when a newly activated lesson introduces an affix. Zero schema; a few lines per lesson page or one shared component.

### P6 — B1 contrast drills (fixes F6, after P1–P3)

Same-root two-affix contrast pairs, derived deterministically from existing pairs (roots with ≥2 live affixes — the explorer already computes families). Reuses the `contrast_pair` exercise primitive. The -kan/-i discrimination falls out as a special case (roots with both -kan and -i forms). Needs a small projection decision (new cap vs exercise-resolution on existing caps) → architect + data-architect gate.

### What NOT to build

- No ASR/no speech grading anywhere in this loop (ADR 0025's reasoning applies).
- No new capability types for P1/P2/P4/P5 — they are display, session-composition, content, and navigation changes.
- No LLM-generated distractors (deterministic cascades are working and debuggable).
- No unlock/gamification engine beyond the existing activation + ladder.

## 5. Suggested sequencing

| Order | Item | Size | Gate needed |
|---|---|---|---|
| 1 | P1 mastery display split | S | none (display) |
| 2 | P5 lesson→trainer links | S | none |
| 3 | P4 audio seeding + trainer play buttons | M | none (content + UI) |
| 4 | P3 carrier backfill (-i/-kan first) | M | content pipeline only |
| 5 | P2 production fast-path | M | architect (session builder) |
| 6 | P6 contrast drills | L | architect + data-architect |

The theme: **the trainer's foundation is genuinely good — the failure is that its production tier and its audience never arrive.** Fix the funnel (P5), the feedback loop (P1), and the production path (P2/P3) before adding any new machinery.

## Sources

- In-repo: `docs/research/2026-06-15-affix-morphology-module-research.md` (incl. the adversarially-verified SLA update, sources [26]–[33]); ADR 0018, 0019, 0021; `docs/current-system/modules/morphology.md`.
- Live DB queries 2026-07-07 (pool sizes, capability-type mix, carrier/gloss coverage, review events, user count).
- Code: all cites above verified on main rev `26e1fa3b`.
