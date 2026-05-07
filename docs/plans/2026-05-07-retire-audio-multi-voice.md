# Retirement #1 — Audio multi-voice path

**Date:** 2026-05-07
**Branch:** `retire/audio-multi-voice`
**Type:** Pure deletion (no replacement infrastructure needed — single-voice path already in place and is the only runtime caller for sessions)
**Tracks:** Phase 1 of the migration in `docs/target-architecture.md` §"Code flagged for deletion" #6 (Audio multi-voice path)

---

## Why this exists

`docs/target-architecture.md` (the locked migration spec) says the multi-voice
audio path must retire. The runtime moved to a single-voice fetcher (`fetchSessionAudioMap`
+ `SessionAudioContext` + `useSessionAudio`) some time ago; the multi-voice
files were never deleted, so they sit as dead code.

The OpenBrain lesson from 2026-05-02 ("when a spec says delete X, enumerate
every codepath that imports X") makes this rigorous: every flagged symbol in
the doc is grep-verified below before deletion.

---

## Files / symbols to delete

### Whole files (delete)

| Path | LOC | Used by (production) | Used by (tests) |
|---|---:|---|---|
| `src/contexts/AudioContext.tsx` | 29 | None | None |
| `src/components/MiniAudioPlayer.tsx` | 86 | None | None |
| `src/components/MiniAudioPlayer.module.css` | — | Only MiniAudioPlayer.tsx (cascading delete) | None |

### Surgical edits (keep file, remove block)

**`src/services/audioService.ts`** — file is split cleanly:

- Lines 6–28: multi-voice block (`AudioMap` type, `fetchAudioMap`, `resolveAudioUrl`) → **DELETE**
- Lines 1–4 + 30–53: single-voice block (`SessionAudioMap`, `fetchSessionAudioMap`, `resolveSessionAudioUrl`) → **KEEP**

**`src/__tests__/audioService.test.ts`** — file is split cleanly:

- Lines 6–45: first `describe('audioService', …)` block testing the multi-voice fetcher → **DELETE**
- Lines 47+: second + third describe blocks testing `fetchSessionAudioMap` and `resolveSessionAudioUrl` → **KEEP**

**`src/__tests__/Lesson.test.tsx`** — dead mock leftover from the multi-voice era:

- Lines 93–96: `vi.mock('@/services/audioService', () => ({ fetchAudioMap: …, resolveAudioUrl: … }))` → **DELETE**
- The rest of `Lesson.test.tsx` does not reference `audioMap`, `fetchAudioMap`, `resolveAudioUrl`, or `audioService` outside this block (verified via grep). `pages/Lesson.tsx` itself does not import from `audioService`, so the mock has nothing to intercept.

### Things that stay

- The single-voice runtime path (everything `Session*`-prefixed): unchanged.
- The `get_audio_clips` Postgres RPC and `audio_clips` table: stay. Used by
  `scripts/generate-exercise-audio.ts:336` (content-pipeline dedup) and
  `scripts/check-supabase-deep.ts:246` (existence probe). Per
  `docs/target-architecture.md` §"Things that explicitly stay".
- The `indonesian-tts` storage bucket: stays.

---

## Grep evidence (zero callers)

Run from `/Users/albert/home/learning-indonesian` on commit `a1b5bfb` of `main`,
captured 2026-05-07. Each grep below uses `rg -n -t ts -g '!node_modules' -g '!dist' -g '!.worktrees'`.

### `AudioContext.tsx` external importers

```
$ rg -n "AudioContext|AudioProvider|\buseAudio\b" -t ts -g '!node_modules' \
    | grep -v 'SessionAudioProvider\|useSessionAudio\|SessionAudioContext'
src/contexts/AudioContext.tsx:4:interface AudioContextValue {
src/contexts/AudioContext.tsx:9:const AudioContext = createContext<AudioContextValue>({
src/contexts/AudioContext.tsx:14:export function AudioProvider({
src/contexts/AudioContext.tsx:20:    <AudioContext.Provider value={{ audioMap, voiceId }}>
src/contexts/AudioContext.tsx:22:    </AudioContext.Provider>
src/contexts/AudioContext.tsx:27:export function useAudio(): AudioContextValue {
src/contexts/AudioContext.tsx:28:  return useContext(AudioContext)
```

Only self-references. **Zero external callers of `AudioContext`, `AudioProvider`, or `useAudio`.**

### `MiniAudioPlayer.tsx` external importers

```
$ rg -n "MiniAudioPlayer" -t ts -g '!node_modules' -g '!dist' -g '!.worktrees'
src/components/MiniAudioPlayer.tsx:3:import classes from './MiniAudioPlayer.module.css'
src/components/MiniAudioPlayer.tsx:9:interface MiniAudioPlayerProps {
src/components/MiniAudioPlayer.tsx:21:export function MiniAudioPlayer({
src/components/MiniAudioPlayer.tsx:31:}: MiniAudioPlayerProps) {
```

Only self-references. **Zero external callers of `MiniAudioPlayer`.**

### Multi-voice symbols in `audioService.ts`

```
$ rg -n '\bfetchAudioMap\b|\bresolveAudioUrl\b|\bAudioMap\b' -t ts -g '!node_modules'
src/services/audioService.ts:6:export type AudioMap = …            # source
src/services/audioService.ts:8:export async function fetchAudioMap …
src/services/audioService.ts:17:  const map: AudioMap = new Map()
src/services/audioService.ts:25:export function resolveAudioUrl …
src/__tests__/audioService.test.ts:22  fetchAudioMap call           # tests retire too
src/__tests__/audioService.test.ts:23  fetchAudioMap call
src/__tests__/audioService.test.ts:34  fetchAudioMap call
src/__tests__/audioService.test.ts:35  fetchAudioMap call
src/__tests__/audioService.test.ts:41  fetchAudioMap call
src/__tests__/audioService.test.ts:42  fetchAudioMap call
src/contexts/AudioContext.tsx:2: import type { AudioMap } …          # AudioContext retires
src/contexts/AudioContext.tsx:5:  audioMap: AudioMap                 # AudioContext retires
src/__tests__/Lesson.test.tsx:94-95                                  # dead mock; retires
```

Every non-self importer is in a file that itself retires (AudioContext) or in
a test mock that has nothing to mock once the underlying export is gone.

### `pages/Lesson.tsx` confirmation (Lesson.test.tsx mock target)

```
$ rg -n "audioService" src/pages/Lesson.tsx
(no output — Lesson.tsx does not import from audioService)
```

The dead mock in `Lesson.test.tsx` is not protecting any production import.

### Single-voice path NOT affected (sanity counter-grep)

```
$ rg -n "useSessionAudio|SessionAudioProvider|fetchSessionAudioMap|resolveSessionAudioUrl|SessionAudioMap" -t ts -g '!node_modules' | wc -l
49
```

49 hits across 30+ files — the runtime audio path is dense and untouched.

---

## Execution plan

Each step is a separate commit on `retire/audio-multi-voice`. **Every commit
must leave the test suite green** (so `git bisect` walks cleanly). The
multi-voice fetcher and the test describe block that exercises it retire
together in commit 3, atomically.

1. `chore: delete dead AudioContext.tsx (multi-voice provider)` — remove
   `src/contexts/AudioContext.tsx`. (Has zero importers; tests stay green.)
2. `chore: delete dead MiniAudioPlayer.tsx + CSS (multi-voice player)` — remove
   `src/components/MiniAudioPlayer.tsx` and `MiniAudioPlayer.module.css`.
   (Zero importers; tests stay green.)
3. `refactor(audio): drop multi-voice fetcher from audioService + its tests` —
   atomic commit:
   - Delete lines 6–28 of `src/services/audioService.ts` (the multi-voice
     `AudioMap` / `fetchAudioMap` / `resolveAudioUrl` block). Lines 1–4
     (imports) and 30–53 (single-voice block) stay.
   - Delete the first `describe('audioService', …)` block in
     `src/__tests__/audioService.test.ts` (lines 6–45). Single-voice describes
     stay.
   - Update `docs/architecture-layers.html` lines 620–625: change `audioService`
     description from "Resolves TTS clip URLs by text and voice." to "Resolves
     session TTS clip URLs by text (single voice)." and remove the stale
     `get_audio_clips` tag (the surviving service only uses
     `get_audio_clip_per_text`).
   - Reason for the atomic bundle: removing the exports without removing the
     dependent tests would leave the test suite red on the intermediate commit
     and break `git bisect`. Boundaries are clean (top-level `vi.mock`
     untouched; describe blocks have independent `beforeEach`).
4. `test: drop dead audioService mock from Lesson.test.tsx` — remove lines
   93–96 of `Lesson.test.tsx`. Verified independently: nothing in
   `pages/Lesson.tsx` or its transitive imports references `audioService`.

After step 4: run `make pre-deploy` (lint + tests + build + check-supabase +
check-supabase-deep). All must pass.

Smoke test: start `bun run dev`, sign in as `testuser@duin.home`, start a
session that includes a listening exercise (e.g. dictation or
`audio_recognition`), confirm audio plays. The single-voice runtime path is the
only audio path now; if it breaks, retirement caused it.

---

## Why this is safe

- **Zero production callers** for every flagged file/symbol (verified via grep above).
- **Test surgery is bounded:** deleting only the describe blocks/mocks that
  exclusively reference the multi-voice exports. The remaining tests cover the
  single-voice path (which stays) and an unrelated Lesson page test that
  doesn't touch audio.
- **No DB migration needed.** The `get_audio_clips` RPC and `audio_clips` table
  stay (used by content-pipeline dedup).
- **No client-API surface change.** Nothing outside the multi-voice files
  imports them; the bundle that ships to users gets strictly smaller.

---

## Constraints honored

- `make pre-deploy` runs locally before opening the PR (CLAUDE.md gate).
- Architect-review-loop applies: 2 rounds (per OpenBrain lesson 2026-05-02
  §spec-review-loop arithmetic) — round 1 reviews this spec, round 2 reviews
  the executed diff.
- Pre-commit hooks run on every commit (lint + type-check + viewport-math).
- No push to remote until PR opening (CLAUDE.md gate).

---

## Out of scope

- Folding the surviving single-voice audio surface into `src/lib/audio.tsx` per
  the target architecture (§"`lib/audio` (single file)"). That happens in
  Phase 2 (module folds), not here. This retirement only deletes dead code.
- Renaming the surviving single-voice exports. The names already work.
