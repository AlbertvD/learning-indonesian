---
status: approved
reviewed_by: [staff-engineer, architect]
supersedes: []
---

# Harmonize the Uitspraak trainer onto the page framework + re-produce the pronunciation podcast

## Problem

Two defects on the `/pronunciation` surface (the Leren-tab primer, sibling of the
Affix Trainer):

**A — UI drift.** The page shell is on the framework (`PageContainer`/`PageHeader`),
but every card inside it is off-framework — glaring now that the sibling Affix
Trainer was harmonized in PR #430:

1. Raw Mantine `<Card withBorder radius="md">`: `PitfallCard.tsx:34`,
   `DialogueShadowSection.tsx:23`.
2. Raw nested `<Paper withBorder>` boxes: `MinimalPairPlayer.tsx:34`,
   `EarQuiz.tsx:104` — cards-in-cards with Mantine default chrome, visually
   "outside" the app's card family.
3. Raw Mantine palette names: `c="green"` / `c="red"` (`EarQuiz.tsx:149,154`),
   `color="red"` (`ShadowControl.tsx:51`) — not sourced from the status tokens.
4. Bespoke podcast panel: `Pronunciation.tsx:99-110` — inline-styled `Paper` +
   `Title order={4}` + icon, unrelated to the grammar-podcast card family that
   plays audio everywhere else (`GrammarPodcasts.module.css`).
5. The sound badge (`PitfallCard.tsx:37`, `Badge variant="light"`) rides Mantine's
   default light-variant styling, not the app's tokened pill language.

**B — the podcast sounds robotic.** `scripts/oneoff/pronunciation-podcast.ts`
synthesizes each host line with **old-generation Wavenet voices**
(`nl-NL-Wavenet-D/C`, `en-US` twin equivalent) as isolated plain-text requests and
`Buffer.concat`s the MP3s **with zero pause between turns**. The result is the
"unnatural AI" delivery the owner reports: flat robotic hosts + turns colliding
into each other. Meanwhile the Story podcasts use Chirp3-HD via SSML
(`scripts/podcasts/narrator.ts`) and sound fine. Verified live (2026-07-10,
`voices:list`): Chirp3-HD is available in `nl-NL`, `en-US`, and `id-ID` (30
voices each) — the fix needs no new engine, no new dependency.

## Grounding

- **Target architecture:** no constraint for this presentation surface; UI-only +
  a one-off content producer. Same grounding as the affix harmonization plan
  (`docs/plans/2026-07-10-affix-trainer-harmonization.md` §Grounding).
- **Module spec:** none exists for `components/pronunciation/`; component
  *interfaces* are unchanged (visual re-skin, not a flow refactor), so the
  spec-before-refactor rule does not bite (same reasoning as the affix plan §Docs).
- **Data model:** untouched → no `data-architect` gate. The podcast rerun
  overwrites the same two bucket objects and upserts the same `texts` row —
  content data, rebuild-friendly regime, zero schema change.
- **ADR 0025:** posture unchanged — no ASR, no FSRS, client-only shadowing. This
  plan restyles and re-voices; it adds no mechanism.

## Design principle (the hard constraint — identical to the affix plan)

Everything renders through the **page-framework primitives + design tokens**:
zero raw Mantine `<Card>`/default-chrome `<Paper>` cards, zero raw Mantine
palette names, zero freelance chrome. No new `page/primitives` type — domain
cards live in `components/pronunciation/` and consume tokens, exactly like
`LessonCard` and the harmonized `WordFamilyExplorer`. (`c="dimmed"` and
Mantine layout components remain fine — the ban is on palette *names* and
off-token chrome.)

## Change 1 — extract `MediaPlayerCard`; both podcast surfaces consume it

The pronunciation podcast is the same object as a grammar-podcast row (inline
`<audio>` player, no navigation). The grammar-podcast chrome currently lives as
inline JSX + a `bespoke-css-ok` module (`GrammarPodcasts.tsx:79`,
`GrammarPodcasts.module.css`); copying it would plant a second copy of the same
~14 lines (staff-engineer finding). This is now the **second occurrence of the
shape**, which per the repo rule (CLAUDE.md § Admin design surfaces — the
`MediaShowcaseCard` precedent) means: extract, don't copy.

New `src/components/page/primitives/MediaPlayerCard.tsx` (+`.module.css`) — a
generic inline-media row card, zero domain logic:
`{ medallion: ReactNode; title: string; subtitle?: string; children: ReactNode }`
where `children` is the player element (caller keeps ownership of `<audio>`
props like `preload`/`data-testid`). Chrome = the existing module's exact
tokens: `.card` on `--card-bg`/`--card-border`/`--r-md`, `.head`, `.medallion`
on `--teal-subtle`/`--teal`, full-width player row. This does NOT violate the
"domain cards don't become primitives" rule — there is no domain in it; it is
`ListCard`'s inline-player sibling (the locked ontdek decision only ruled out
`ListCard`'s chevron/nav for this shape, not a shared card). Reuse-first check:
`MediaShowcaseCard` was considered and ruled out — it is a banner-forward,
navigable showcase (`banner` slot + CTA/`to`), not an inline-audio row; no
existing primitive covers this shape.

Consumers:
- `GrammarPodcasts.tsx` — swap inline JSX for the primitive (medallion = the
  `01`-style lesson number); delete `GrammarPodcasts.module.css`. Visual output
  byte-equivalent.
- `Pronunciation.tsx` — podcast panel becomes
  `<MediaPlayerCard medallion={<IconHeadphones/>} title=… subtitle=…>` with
  the existing `<audio>`; drops the bespoke inline-styled `Paper`/`Title` block.
  Heading/blurb copy unchanged (existing i18n keys). The surrounding render
  guard `{!loading && !error && podcastUrl && (…)}` (`Pronunciation.tsx:98`)
  is **preserved as-is** — the card must not be hoisted out of it.

## Change 2 — `PitfallCard` → token domain card

- Root `<Card withBorder>` → `<section>` (or `div`) with co-located
  `PitfallCard.module.css` `.card` — every value a framework token
  (`--card-bg`, `--card-border`, `--r-md`; 14px 16px padding like the family).
- Sound badge → tokened pill: `--accent-primary-subtle` background,
  `--accent-primary` text, `--accent-primary-border` border, `--r-sm` radius,
  `--fw-semibold` — replacing Mantine `Badge variant="light"`.
- Inner layout (examples row, PlayButton, ShadowControl placement) unchanged.

## Change 3 — `MinimalPairPlayer` + `EarQuiz` → tokened inset sub-rows

Both are *rows inside* a PitfallCard, so they get a shared **inset** treatment
(visibly nested, not competing cards): `.subCard { background: var(--bg-surface);
border: 1px solid var(--card-border); border-radius: var(--r-sm); }` via
co-located module.css files.

- `MinimalPairPlayer`: chrome swap only; word/play/compare structure unchanged.
- `EarQuiz`: chrome swap + status colors — `c="green"` → `var(--success)`,
  `c="red"` → `var(--danger)` (inline `style`/module class, not palette names).
  Behavior (answer-lock, timer cleanup, streak) untouched; existing tests must
  stay green unmodified.

## Change 4 — `ShadowControl` recording state

`color="red"` → `var(--danger)` via `style` on the `ActionIcon` (variant stays
`subtle`). Nothing else changes.

## Change 5 — `DialogueShadowSection` → `SettingsCard`

It is precisely a titled panel (title + intro + body rows) →
`<SettingsCard title={…} description={…}>` with the sentence rows as children.
Drops its raw `<Card>`/`Title`/`Text` header entirely. No `aside` needed.

⚠️ Constraint (staff-engineer): `DialogueShadowSection.test.tsx:77` locates a
sentence row via `closest('.mantine-Group-root')` — the sentence rows must stay
Mantine `<Group>` elements; only the outer card shell changes.

## Change 6 — re-produce the podcast on Chirp3-HD with real pauses

`scripts/oneoff/pronunciation-podcast.ts` (+ voice fields in
`pronunciation-podcast-scripts.ts`). The authored script content is good; the
delivery is the defect. Three changes, all inside the existing one-off:

1. **Host voices → Chirp3-HD.** `voiceA`/`voiceB` become
   `nl-NL-Chirp3-HD-Despina` (A — warm guide, mirrors `DEFAULT_STORY_VOICE`) and
   `nl-NL-Chirp3-HD-Orus` (B — curious learner); `en-US` twins for the EN episode.
   Host lines synthesize through `synthesizeSsml` (`<speak>` + XML-escaped text) —
   the proven Story-podcast path; each authored line is already a complete
   conversational turn, so per-line synthesis keeps natural within-turn prosody.
2. **Example voice → Chirp3-HD.** `ID_VOICE` → `id-ID-Chirp3-HD-Despina` through
   the existing `synthesizeSpeech` path, so the documented short-word→Wavenet
   fallback (`effectiveVoiceFor`) still protects ≤2-char/known-bad words — and the
   podcast's example words now match the voice family of the in-app clips.
3. **Real pauses.** Synthesize ONE ~450 ms silence buffer
   (`<speak><break time="450ms"/></speak>`, any host voice) and interleave it
   between every segment in the concat. One mechanism, every gap; no per-segment
   SSML-trailing-break fragility. Naive `Buffer.concat` stays (same engine, same
   encoding — documented adequate for this throwaway).

Both files' header comments (`pronunciation-podcast.ts:5-9`,
`pronunciation-podcast-scripts.ts:6-9`) still describe the Wavenet/plain-text
flow — update them in the same edit (architect note: no doc lag inside the
touched file).

**Operational flow / rollout:** the UI re-skin ships as one PR via the normal
merge → container-recreate path. The podcast re-production is a **separate,
post-merge manual step** (not CI): `--dry-run` → owner spot-listens
`content/podcasts/pronunciation-{nl,en}.mp3` → live run (needs
`SUPABASE_SERVICE_KEY` + the gcloud TTS key) uploads to the SAME bucket paths
(`upsert: true`) + upserts the same `texts` row. Zero app change; listeners get
the new audio on next fetch (public-bucket cache ≤1 h stale is acceptable —
content regime).

**Omission test:** skip (1) and the hosts stay robotic (the core complaint);
skip (3) and turns still collide; skip (2) and example words switch voice family
mid-episode vs the app. No other mechanism added.

## Tests

- Existing `PitfallCard.test.tsx` / `EarQuiz.test.tsx` /
  `DialogueShadowSection.test.tsx` pass unmodified (behavior untouched; the
  `.mantine-Group-root` pin survives per Change 5's constraint).
- New `MediaPlayerCard` case: medallion, title, subtitle, and children render;
  GrammarPodcasts' existing `data-testid="grammar-podcast-player"` assertion
  still passes through the swap.
- No "assert no raw colour props" test (staff-engineer: brittle, near-useless —
  the token swap is verified in code review instead).
- `bun run lint` + `bun run test` green.

## Supabase Requirements

N/A — pure front-end re-skin + re-upload of two existing storage objects and an
upsert of the existing `texts` row via the service key (no schema, RLS, grant,
homelab-config, or health-check change).

## Files

0. New `src/components/page/primitives/MediaPlayerCard.tsx` + `.module.css`
   (+ export in `index.ts`); `src/pages/GrammarPodcasts.tsx` consumes it;
   `GrammarPodcasts.module.css` deleted.
1. `src/pages/Pronunciation.tsx` — podcast panel → `MediaPlayerCard`.
2. `src/components/pronunciation/PitfallCard.tsx` + new `.module.css` — token card + sound pill.
3. `src/components/pronunciation/MinimalPairPlayer.tsx` + new `.module.css` — inset sub-row.
4. `src/components/pronunciation/EarQuiz.tsx` + new `.module.css` — inset sub-row + status tokens.
5. `src/components/pronunciation/ShadowControl.tsx` — `--danger` token.
6. `src/components/pronunciation/DialogueShadowSection.tsx` — `SettingsCard`.
7. `scripts/oneoff/pronunciation-podcast.ts` — SSML host synthesis + silence gaps.
8. `scripts/oneoff/pronunciation-podcast-scripts.ts` — Chirp3-HD voice ids.
9. `docs/current-system/page-framework-status.md` — pronunciation surface joins the framework.

## Out of scope

- Rewriting the podcast's authored dialogue (content is fine; delivery was the bug).
- Any pitfall-catalog/content change; any new exercise mechanism (ADR 0025).
- `PlayButton` (shared, already token-clean, used app-wide).
- A `components/pronunciation/` module spec — same deferred-follow-up posture as
  the affix plan's §Docs note.
