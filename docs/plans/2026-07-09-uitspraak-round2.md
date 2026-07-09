---
status: approved
reviewed_by: []
---
<!-- UP3 + UP6 carry no review gate in the source review's own sequencing table
     (docs/research/2026-07-07-uitspraak-trainer-review.md §5: "none (content)" /
     "none"); designs are pinned here for the build subagent. UP5 carries the
     table's architect gate — its §3 below is the QUESTION for that round, not a
     build task; do not build §3 without the recorded verdict. -->

# Uitspraak round 2 — UP3 multi-voice pairs + UP6 day-one hook (+ UP5 architect question)

**Target-architecture grounding:** same surfaces as `2026-07-08-uitspraak-quick-wins.md` (shipped) — no constraints found for `lib/pronunciation` / `components/pronunciation`; UP6 extends the existing first-run checklist mechanism (`src/lib/firstRun.ts` + `src/components/dashboard/FirstRunChecklist.tsx`), per the check-platform-first rule. ADR 0025 constraints (no ASR, no FSRS, no schema) hold.

**Build mechanics for subagents:** existing files via Read → write-full-to-scratch → Bash `cp`; new files via plain Write. Gates: scoped `bunx vitest run`, `bunx eslint`, `bunx tsc -b`.

## 1. Task R2-A — multi-voice + more pairs (review UP3)

**Files:** `src/lib/pronunciation/pitfallCatalog.ts` (+ test), `src/pages/Pronunciation.tsx`, `src/components/pronunciation/EarQuiz.tsx` (+ test), `scripts/oneoff/seed-pronunciation-audio.ts`.

**Verified plumbing (2026-07-09):** `fetchSessionAudioMap` already supports voice-paired requests via the `get_audio_clips` RPC and keys the map `${normalizedText}|${voiceId}` (`src/services/audioService.ts:16-18,41-67`); `resolveSessionAudioUrl(map, text, voiceId)` resolves per-voice. This task is data + call sites only — no service changes.

### New minimal pairs (content pinned VERBATIM — do not rewrite)

Add to the existing `minimalPairs` arrays (create the array where absent):

- `c-ch` — add:
  ```ts
  { a: 'curang', b: 'kurang',
    contrastNl: "'curang' (vals spelen) begint met de tj-klank; 'kurang' (minder) met een k.",
    contrastEn: "'curang' (to cheat) starts with the 'ch' sound; 'kurang' (less) with a k." },
  ```
- `final-consonants` — add:
  ```ts
  { a: 'tuan', b: 'tuang',
    contrastNl: "'tuan' (meneer) eindigt op -n; 'tuang' (inschenken) op -ng.",
    contrastEn: "'tuan' (sir) ends in -n; 'tuang' (to pour) in -ng." },
  ```
- `hard-g` — add:
  ```ts
  { a: 'bagi', b: 'baki',
    contrastNl: "'bagi' (voor/delen) heeft de harde g; 'baki' (dienblad) een k.",
    contrastEn: "'bagi' (for/to divide) has the hard g; 'baki' (tray) a k." },
  { a: 'garam', b: 'karam',
    contrastNl: "'garam' (zout) begint met de harde g; 'karam' (vergaan/zinken) met een k.",
    contrastEn: "'garam' (salt) starts with the hard g; 'karam' (to sink) with a k." },
  ```
- `tapped-r` — add:
  ```ts
  { a: 'tari', b: 'tali',
    contrastNl: "'tari' (dans) heeft de getikte r; 'tali' (touw) een l.",
    contrastEn: "'tari' (dance) has the tapped r; 'tali' (rope) an l." },
  ```
- `unaspirated-stops` — new array (card had none):
  ```ts
  { a: 'pagi', b: 'bagi',
    contrastNl: "'pagi' (ochtend) begint met een p zonder lucht-pufje; 'bagi' (voor) met een b.",
    contrastEn: "'pagi' (morning) starts with an unaspirated p; 'bagi' (for) with a b — without the puff they're easy to confuse." },
  { a: 'parang', b: 'barang',
    contrastNl: "'parang' (kapmes) met een p; 'barang' (spul) met een b.",
    contrastEn: "'parang' (machete) with a p; 'barang' (goods) with a b." },
  { a: 'tua', b: 'dua',
    contrastNl: "'tua' (oud) begint met een t zonder pufje; 'dua' (twee) met een d.",
    contrastEn: "'tua' (old) starts with an unaspirated t; 'dua' (two) with a d." },
  ```

Totals after: c-ch 2, final-consonants 2, hard-g 3, tapped-r 2, unaspirated-stops 3 (+ the pre-existing makan/makam, cari/kari, gali/kali, rusa/lusa). No pairs added to e-two-sounds (impossible by design), u-oe/ny/w/j/pure-vowels/initial-ng/au-ai/stress (no clean lexical contrast — leave example-based).

### Drill voices

- Export from `pitfallCatalog.ts`:
  ```ts
  /** Voices the perception drills request per pair word (HVPT talker variability).
   *  Achird is also the app-wide default seeding voice. */
  export const PAIR_DRILL_VOICES = [
    'id-ID-Chirp3-HD-Achird',
    'id-ID-Chirp3-HD-Despina',
    'id-ID-Chirp3-HD-Orus',
  ] as const
  ```
- Add helper `allMinimalPairWords(): string[]` (distinct, normalized, pairs only — parallel to `allExampleWords`, which stays as-is and keeps covering pair words too).

### Runtime call sites

- `Pronunciation.tsx` fetch: keep every existing `voiceId: null` request; ADD one voice-paired request per (pair word × `PAIR_DRILL_VOICES` entry) for the current L1's pairs. One `fetchSessionAudioMap` call with the combined list.
- `EarQuiz`: at round start, pick a random voice among the `PAIR_DRILL_VOICES` entries that RESOLVE for the played word (fallback: `null`/default when none do — clips not yet seeded must not break the quiz). Store the chosen voice in the round state; replay uses the same voice. Options/feedback unchanged.
- `MinimalPairPlayer`: UNCHANGED — deliberate. The A/B compare trains the word contrast; holding the talker constant keeps the contrast the only variable. Variability lives in the quiz.
- Tests: catalog test updated for new pair counts + `allMinimalPairWords`; EarQuiz test extended: with only the default-voice entry in the map, the quiz still plays (fallback path).

### Seeding (content half)

- Extend `scripts/oneoff/seed-pronunciation-audio.ts`: after the existing voice-agnostic pass, a second pass seeds (pair word × PAIR_DRILL_VOICES) — idempotency via the `get_audio_clips` RPC (voice-EXACT check, not `get_audio_clip_per_text`); same synthesize/upload/insert flow with the loop's voice instead of `DEFAULT_VOICE`. Report per-voice counts + list generated words.
- Run order: after merge (script imports the catalog). ~19 pair words × 3 voices minus existing Achird clips ≈ 40-45 new clips.

## 2. Task R2-B — day-one hook in the first-run checklist (review UP6)

**Files:** `src/lib/firstRun.ts`, `src/components/dashboard/FirstRunChecklist.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Pronunciation.tsx`, `src/lib/i18n.ts` (+ tests).

- **Mechanism: extend the existing "Aan de slag" checklist** (platform-first; the review's own suggestion) — NOT a new standalone card.
- `firstRun.ts`: add `export const PRONUNCIATION_VISITED_KEY = 'pronunciation_visited'`.
- `Pronunciation.tsx`: `useEffect(() => { setFirstRunFlag(PRONUNCIATION_VISITED_KEY) }, [])` — the exact `Ontdek.tsx:26` pattern.
- `ChecklistSteps` gains `uitspraakVisited: boolean`; `Dashboard.tsx` populates it from the flag (alongside the other two reads, Dashboard.tsx:~128); visibility logic (`!checklist.sessionDone`) UNCHANGED — the account-level gate stays the only visibility driver (its fail-closed rationale in the Dashboard comment holds).
- `FirstRunChecklist.tsx`: insert the uitspraak item at index 2 (after session, before ontdek — front-loaded but below the two core actions), with the ontdek-style action row: `Link to="/pronunciation"` + skip button (skip sets the flag via a new `onSkipUitspraak` prop, mirroring `onSkipOntdek`).
- i18n both languages (new keys, no renumbering of existing):
  - `checklist.stepUitspraakTitle`: NL 'Lees de uitspraakgids (2 minuten)' / EN 'Read the pronunciation guide (2 minutes)'
  - `checklist.stepUitspraakSub`: NL 'De klanken die Nederlandstaligen het vaakst fout doen — één keer lezen scheelt maanden.' / EN 'The sounds English speakers most often get wrong — one early read saves months.'
  - reuse existing `checklist.view`-style action labels where the component already has them (`explore`/`skip`); add `checklist.read` NL 'Lezen' / EN 'Read' for the action link.
- Tests: checklist component test — 4 items render; uitspraak step shows the read+skip actions when current; skip marks it done.

## 3. UP5 — sentence shadowing: ARCHITECT QUESTION (do not build)

Verified 2026-07-09: dialogue lines render in **bespoke per-lesson pages** with a LOCAL `PlayButton` per page (e.g. `src/pages/lessons/lesson-4/Page.tsx:29,165`) — there is no shared dialogue-line component. Wiring `ShadowControl` "beside the existing per-line play buttons" therefore means either (a) a ~30-page sweep adding ShadowControl per bespoke page, (b) extracting a shared dialogue-line primitive first and folding pages onto it, or (c) the review's own cheaper alternative: a small "schaduw de dialoog" section in the pronunciation primer reusing existing dialogue audio — zero lesson-page churn.

**Architect verdict (2026-07-09): SHAPE (c) — build it, sized S, no further review round.** Rationale: (a) multiplies the per-page `PlayButton` duplication the target architecture slates for folding (`docs/target-architecture.md:822-825`) and adds mics to word-level surfaces where sentence-shadowing evidence doesn't apply; (b) is an unrequested cross-cutting refactor gated on the PlayButton-fold decision and fights the deliberately-editorial per-page dialogue rendering (chapter-experience spec §1); (c) lands entirely in the module that already owns `ShadowControl`, rides R2-A's audio plumbing, and its one weakness (discovery) is cancelled by R2-B's day-one hook. Prescription:

- NEW `src/lib/pronunciation/dialogueShadowSet.ts` — curated catalog-as-code constant (mirrors pitfallCatalog): 6–10 full dialogue SENTENCES chosen for prosody value, `{ id, text, lessonRef? }`. Curate for prosody, not coverage.
- NEW `src/components/pronunciation/DialogueShadowSection.tsx` — renders the sentences, each with the EXISTING `<ShadowControl modelUrl={resolvedUrl} word={text} />` (unchanged) + a PlayButton for the model line.
- `src/pages/Pronunciation.tsx` — resolve the sentences through the SAME `fetchSessionAudioMap`/`resolveSessionAudioUrl` path (one combined request, `voiceId: null` — talker variability is a perception-drill concern, not a shadowing one). Section renders below the pitfall cards.
- i18n: section heading + intro (NL/EN).
- Test: section renders sentences; record affordance shows; only sentences whose model URL resolves get controls (U5 guard — never a mic without a model).
- Do NOT touch the 30 bespoke pages, the chapter chrome, or the planned `components/audio/PlayButton.tsx` fold.
- Build-time verification: the curated sentences MUST resolve as `audio_clips` rows by normalized text via the RPC (dialogue audio reaches lesson pages as baked URLs in content.json — text-keyed resolvability is not guaranteed). Pick sentences that resolve, or seed via the existing idempotent seeder path.

**Curated set (content pinned 2026-07-09 — all 10 verified present as sentence clips in the live `audio_clips` table; builder re-verifies each resolves via the voice-agnostic RPC and drops any that don't, floor 6):**

| id | text |
|---|---|
| groet-kabar | Selamat siang, apa kabar? Bapak dari mana? |
| vraag-tinggal | Di mana Bapak tinggal? |
| vraag-harga | Berapa harga mobil ini? |
| uitroep-batik | Wah, batik ini halus sekali! |
| partikel-dong | Lihat dong! Kain ini bagus sekali. |
| partikel-sih | Apa sih? Saya tidak mengerti. |
| dank-kembali | Terima kasih kembali, Bu. |
| afscheid | Sampai bertemu lagi, Pak. |
| uitnodiging | Silakan masuk, Pak, kita berangkat. |
| excuus | Maaf, saya betul-betul lupa. |

i18n keys: `pronunciation.shadowSectionHeading` NL 'Schaduw de dialoog' / EN 'Shadow the dialogue'; `pronunciation.shadowSectionIntro` NL 'Luister naar een zin en zeg hem na — melodie en ritme oefen je op zinsniveau, niet per woord.' / EN 'Listen to a sentence and repeat it — melody and rhythm are trained at sentence level, not per word.'

## Supabase Requirements

- Schema changes: **none**. R2-A seeding inserts `audio_clips` rows + bucket objects via the existing path (additive, idempotent). R2-B is localStorage + UI only.
- homelab-configs: N/A. Health checks: N/A.
