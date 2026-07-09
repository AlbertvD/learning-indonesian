---
status: shipped
implementation: PR #394 (U-A/U-B/U-C/U-D; U-D's live seeding run 2026-07-08 — 6 clips, all 64 catalog words resolve; deployed + probes verified same day)
merged_at: 2026-07-08
implementation_paths:
  - src/components/pronunciation/
  - src/lib/pronunciation/pitfallCatalog.ts
  - scripts/oneoff/seed-pronunciation-audio.ts
reviewed_by: [staff-engineer]
---
<!-- UP1/UP4 are content + guard fixes the owner pre-approved via the review doc's
     sequencing table (docs/research/2026-07-07-uitspraak-trainer-review.md §4-5);
     UP2 carries the review table's own staff-engineer gate — its verdict is
     recorded in §3. No schema, no pipeline, no data-model surface →
     architect/data-architect N/A (mirrors the affix quick-wins precedent). -->

# Uitspraak trainer quick wins — consolidated implementation brief

**Purpose.** Execute UP1 + UP4 + UP2 of `docs/research/2026-07-07-uitspraak-trainer-review.md` at minimum token cost: every design decision is pinned HERE so build subagents (Sonnet) execute without re-deriving. UP3 (multi-voice), UP5 (sentence shadowing), UP6 (day-one hook) are NOT in this brief.

**Target-architecture grounding:** no mention of `lib/pronunciation` / `components/pronunciation` in `docs/target-architecture.md` or any module spec — no constraints found. Governing doc is ADR 0025; its hard constraints (no ASR, no FSRS, no schema, no per-use COGS) hold for every task below.

**Verified-today deltas vs the review (2026-07-08, main @ 52cdb02a):** `PlayButton` ALREADY hides itself on a missing URL (`src/components/PlayButton.tsx:49` `if (!audioUrl) return null`) — the U5 dead-button half is done; only the ShadowControl guard remains. The `MinimalPairPlayer` compare button is already disabled when either URL is missing (`MinimalPairPlayer.tsx:53`).

**Build mechanics for subagents (IMPORTANT):** code-editing Sonnet subagents must use Read → write-full-file-to-scratch → Bash `cp` into place for EXISTING files (the read-before-edit hook blocks Edit/Write in subagents; Bash writes pass). Brand-new files: plain Write. Always Read the target file fully first. Gates per task: scoped `bunx vitest run <paths>`, `bunx eslint <paths>`, `bunx tsc -b` — all green before reporting.

---

## 1. Task U-A — ShadowControl guard (review UP1, guard half)

**File:** `src/components/pronunciation/PitfallCard.tsx` only.

- Guard in the PARENT, not inside ShadowControl (early-return-before-hooks would violate hook-count stability when the audio map resolves late): at `PitfallCard.tsx:51` render `{url && <ShadowControl word={word} modelUrl={url} />}`.
- Rationale: with no model clip there is nothing to shadow — a mic that records against silence and a compare that plays only your own voice (`ShadowControl.tsx:40` `playSequence([undefined, url])` skips the model silently) are misleading affordances.
- `ShadowControlProps.modelUrl` stays `string | undefined` (other callers may still pass undefined); no change to ShadowControl itself.
- Test: extend the existing pronunciation component tests — pitfall word with no audio-map entry renders NO mic button; word with a URL renders one.

## 2. Task U-B — catalog completion (review UP4)

**File:** `src/lib/pronunciation/pitfallCatalog.ts` (+ its test file).

Insert the four new pitfalls below VERBATIM (content is pinned; do not rewrite copy) and renumber `rank` across the whole catalog to the exact order given. Interface unchanged.

New entries:

```ts
{
  id: 'u-oe',
  sound: 'u',
  l1: ['nl'],
  ruleNl: "De u klinkt altijd als 'oe' (zoals in 'boek'): susu = 'soesoe'.",
  ruleEn: "u always sounds like 'oo' in 'boot'.",
  pitfallNl: "Lees de u nooit als de Nederlandse u van 'muur'. In de oude spelling schreef men zelfs oe: soesoe, Soekarno.",
  pitfallEn: 'Never the Dutch ü-like u.',
  examples: ['susu', 'buku', 'untuk', 'minum'],
  rank: 1,
},
{
  id: 'ny-digraph',
  sound: 'ny',
  l1: ['nl', 'en'],
  ruleNl: "ny is één klank, zoals de 'nj' in 'oranje' of de Spaanse ñ.",
  ruleEn: "ny is a single sound, like the ñ in 'señor' or 'ny' in 'canyon'.",
  pitfallNl: 'Spreek het niet uit als losse n + j.',
  pitfallEn: "Don't split it into n + y.",
  examples: ['nyonya', 'banyak', 'hanya', 'nyaman'],
  rank: 5,
},
{
  id: 'diphthongs-au-ai',
  sound: 'au / ai',
  l1: ['en'],
  ruleNl: "au klinkt als 'auw' (pulau), ai als 'ai' in 'haai' (pantai) — kort en strak.",
  ruleEn: "au sounds like 'ow' in 'now' (pulau); ai like 'eye' (pantai) — quick and tight.",
  pitfallNl: 'Rek de tweeklank niet uit.',
  pitfallEn: "Don't smooth or drawl them into long vowels ('pull-oh', 'pant-ay').",
  examples: ['pulau', 'pantai', 'kalau', 'sampai'],
  rank: 12,
},
{
  id: 'penultimate-stress',
  sound: 'bi-CA-ra',
  l1: ['nl', 'en'],
  ruleNl: 'De klemtoon ligt bijna altijd op de voorlaatste lettergreep: biCAra, seLAmat, keluARga.',
  ruleEn: 'Stress almost always falls on the next-to-last syllable: biCAra, seLAmat, keluARga.',
  pitfallNl: 'Houd de klemtoon licht — Indonesisch kent geen zware klemtoon zoals het Nederlands.',
  pitfallEn: 'Keep the stress light — Indonesian stress is much weaker than in English.',
  examples: ['bicara', 'selamat', 'keluarga', 'bagaimana'],
  rank: 15,
},
```

Full rank order after the edit (unique, 1-based — renumber existing entries to match):

| rank | id | l1 |
|---|---|---|
| 1 | u-oe | nl |
| 2 | e-two-sounds | nl,en |
| 3 | c-ch | nl,en |
| 4 | ng-digraph | nl,en |
| 5 | ny-digraph | nl,en |
| 6 | final-consonants | nl,en |
| 7 | hard-g | nl |
| 8 | w-sound | nl |
| 9 | j-sound | nl |
| 10 | tapped-r | en |
| 11 | pure-vowels | en |
| 12 | diphthongs-au-ai | en |
| 13 | unaspirated-stops | en |
| 14 | initial-ng | en |
| 15 | penultimate-stress | nl,en |

Placement rationale (for the reviewer, not the builder): u-oe first for NL — the #1 Dutch letter-to-sound trap belongs at the top; ny beside its sibling digraph ng; au/ai with the other EN vowel items; stress last — prosody after segmentals, and it's the only card without tappable contrast value.

- Tests: update/extend the catalog test — NL view = 10 pitfalls, EN view = 11; ranks unique + contiguous 1..15; `allExampleWords()` includes the 16 new words.
- No pairs on any new card (penultimate-stress explicitly example-only, honouring the review; ny/u/au-ai pairs can ride UP3 later).

## 3. Task U-C — "Test je oor" identification quiz (review UP2) — staff-engineer verdict recorded here

**Files:** new `src/components/pronunciation/EarQuiz.tsx`, edits to `PitfallCard.tsx`, `src/components/pronunciation/index.ts`, `src/lib/i18n.ts` (+ tests).

**Pinned design (as sent to staff-engineer):**

- Rendered inside `PitfallCard`'s perception section, below the pair list, ONLY when ≥1 of the pitfall's minimal pairs has BOTH urls resolving in the audio map (pass the playable pairs + audioMap down; the quiz never sees dead pairs).
- Idle state: a single `Button` (compact, light) — `T.pronunciation.quizStart`. No quiz chrome until tapped.
- Round loop: pick a random playable pair, then a random member (a or b); play it via a module-scope `new Audio(url)` (reuse `playSequence`'s single-url path); show the two words as two buttons + a replay control (`T.pronunciation.quizReplay`).
- Answer: **correct → brief green feedback + streak+1 + auto-advance to the next round (~800 ms)**; **wrong → red feedback showing the correct word + streak resets + explicit continue button** — matching the app-wide answer-screen convention (correct auto-advances; wrong requires a deliberate continue).
- Streak: session-only `useState`. NO localStorage, NO FSRS, NO schema, no telemetry (revisit only if usage argues otherwise — ADR 0025 posture).
- Voice: whatever the prefetched map resolved (`voiceId: null`) — multi-voice rides UP3's seeding later with zero component change (the map is the seam).
- i18n keys (both languages): `quizHeading` NL 'Test je oor' / EN 'Test your ear'; `quizStart` 'Start' / 'Start'; `quizPrompt` 'Welk woord hoor je?' / 'Which word do you hear?'; `quizCorrect` 'Goed!' / 'Correct!'; `quizWrongWas` 'Het was' / 'It was'; `quizNext` 'Volgende' / 'Next'; `quizReplay` 'Opnieuw' / 'Replay'; `quizStreak` 'Reeks' / 'Streak'.
- Tests: mock Audio; assert (a) no quiz renders when no pair fully resolves, (b) correct tap increments streak and advances, (c) wrong tap shows the correct word and waits for continue, (d) after an answer the option buttons are disabled until the next round.

**Staff-engineer verdict (2026-07-08): NEEDS-WORK → fixed; approved shape with three mandatory pins, all adopted below verbatim.** Per-card placement, session-only streak, and single-pair quizzing were all confirmed correct (a 2-alternative identification task is canonical even with one fixed pair — do NOT add a "≥2 pairs" gate; today every card has ≤1 pair and that gate would render zero quizzes). The three build-breaking pins:

1. **Double-tap lock:** once an answer is tapped, DISABLE both option buttons until the next round starts — otherwise a second tap during the ~800 ms auto-advance double-increments the streak / double-fires the advance.
2. **Timer cleanup:** the auto-advance `setTimeout` id must be cleared in an effect cleanup — an L1/language switch unmounts the card mid-round and a stray timer would fire after unmount.
3. **Round state is state, not render-derived:** hold the selected pair AND which member was played in `useState` set at round start — a language-toggle re-render must never re-randomize which word "was played". The two option buttons are always the selected pair's own a/b (never a cross-pair pool).

## 4. Task U-D — seed the missing clips (review UP1, content half + UP4's new words)

**File:** new `scripts/oneoff/seed-pronunciation-audio.ts`. No runtime code changes.

- Adapt `scripts/oneoff/seed-affix-derived-audio.ts` near-verbatim (same TTS client, same `audio_clips` + `indonesian-tts` bucket write path, same `--dry-run` flag, same idempotency via the `get_audio_clip_per_text` RPC, same `DEFAULT_VOICE`).
- Input set: `allExampleWords()` imported from `@/lib/pronunciation/pitfallCatalog` (scripts already import `@/lib/...` — see `scripts/generate-morphology-patterns.ts:26`). That covers the 5 known-missing words (kari, makam, ngeri, ngantuk, nganga) AND task U-B's 16 new example words in one idempotent run; already-covered lesson vocabulary is skipped by the RPC check.
- `allExampleWords()` returns TTS-normalized text; for these single lowercase words normalized == display form, so use it for both `text_content` and `normalized_text`.
- Post-run report: seeded/skipped/failed counts + list every generated word (the set is small) for the human spot-listen (Chirp3-HD short-word caveat, ADR 0025).
- Run order: AFTER U-B merges to the branch (the catalog must contain the new words when the script imports it). Live run is DB/bucket-only — no deploy needed for it.

## 5. Execution shape

- One branch `feat/uitspraak-quick-wins`; U-A + U-B parallel-safe? **No** — both edit `PitfallCard.tsx`'s test surface and U-A edits PitfallCard itself; run ONE builder for U-A + U-B + U-D sequentially (three commits), then a second builder for U-C after the staff-engineer verdict lands.
- i18n keys for U-C are pre-added by the orchestrator in the main thread if U-C ends up running parallel to anything (cp-clobber race rule); with sequential builders this is moot.
- One PR, one container deploy after merge (U-A/U-B/U-C are runtime code). U-D's live seeding run happens from the merged branch before or after deploy (order-independent: the UI hides words whose clips are missing and lights them up as clips appear).

## Supabase Requirements

- Schema changes: **none**. U-D inserts `audio_clips` rows + `indonesian-tts` bucket objects via the existing write path (service key, additive, idempotent).
- homelab-configs: N/A. Health checks: N/A (no new invariants).
