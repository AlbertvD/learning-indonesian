---
module: lesson-renderer
surface: src/components/lessons/
last_verified_against_code: 2026-05-17
status: stable
---

# Lesson renderer

**Surface:** `src/components/lessons/`

**Files:**
- `LessonReader.tsx` (106 LOC)
- `LessonReader.module.css`
- `blocks/LessonBlockRenderer.tsx` (221 LOC)

**Consumers:**
- `src/pages/Lesson.tsx:226` — production
- `src/pages/LocalPreview.tsx:80` — admin `/preview` surface (renders staging content with no auth/FSRS/progress writes)
- `src/__tests__/LessonReader.test.tsx` — unit tests

**Status (2026-05-14):** stable. All retirements #1–#7 are reflected in the current shape.

---

## 1. Purpose

Render a typed `LessonExperience` (the in-memory shape of a single lesson, materialised from published `lesson_page_blocks`) as a reader page.

The renderer is **pure presentation**: no data fetching, no progress emission, no FSRS interaction, no store reads.

ADR 0005 (`docs/adr/0005-lesson-reader-emits-source-progress-not-fsrs-activation.md`) used to govern the renderer's relationship with progress events. After retirement #6 (`retire-source-progress`, shipped 2026-05-07) even source-progress emission was removed — the renderer is now fully passive. The companion-column footnote at `LessonReader.tsx:98-100` ("Oefenbruggen verwijzen naar vaardigheden, maar activeren FSRS niet direct") communicates this directly to the user.

---

## 2. Public interface

Sole exported function from `LessonReader.tsx:12-18`:

```typescript
export function LessonReader(props: {
  experience: LessonExperience
  actions?: LessonPracticeAction[]
  lessonAudioUrl?: string | null
  lessonDurationSeconds?: number | null
  onBack: () => void
})
```

Notable absences (deliberate, enforced by the test at `__tests__/LessonReader.test.tsx:82-87`):
- No `onProgress` or `onLessonExposureProgress` callback.
- No `progress`, `progressBySourceRef`, or `sourceProgressState` prop.
- No "Markeer als gezien" / "Ik heb dit patroon opgemerkt" buttons anywhere in the rendered output.

These were all stripped by retirement #6.

### Input types

`LessonExperience` — defined at `src/lib/lessons/lessonExperience.ts:24-31`:

```typescript
interface LessonExperience {
  lessonId: string
  sourceRef: string          // canonical lesson source key, e.g. "lesson-1"
  title: string
  level: string              // e.g. "A1"
  blocks: LessonExperienceBlock[]
  sourceRefs: string[]       // union of every block's sourceRefs
}
```

`LessonExperienceBlock` — `lessonExperience.ts:12-22`:

```typescript
interface LessonExperienceBlock {
  id: string
  kind: LessonExperienceBlockKind     // one of 7 values, see §3.2
  title: string
  sourceRef: string
  sourceRefs: string[]
  contentUnitSlugs: string[]
  displayOrder: number
  payload: Record<string, unknown>    // arbitrary, per-kind shape
}
```

`LessonPracticeAction` — `src/lib/lessons/lessonActionModel.ts:9-14`:

```typescript
interface LessonPracticeAction {
  kind: 'practice' | 'review'
  label: string
  href: string                          // e.g. "/session?lesson=lesson-1&mode=lesson_practice"
  priority: 'primary' | 'secondary'
}
```

The renderer treats `actions` as opaque link data and just renders them — it has no knowledge of practice-readiness rules, capability counts, or session URLs. That logic lives in `buildLessonPracticeActions` (`lessonActionModel.ts:16-42`), upstream of the renderer.

---

## 3. Internal flow

### 3.1 LessonReader — three-column shell

`LessonReader.tsx:28-105`:

1. **Progress rail** (left, `LessonReader.tsx:32-47`) — a "Terug" button calling `onBack`, plus a numbered TOC `<ol>`. Each TOC entry is an `<a href="#${block.id}">` that scrolls to the anchor target.
2. **Lesson column** (centre, `LessonReader.tsx:49-55`) — iterates `experience.blocks` in given order, wrapping each in `<div id={block.id}>` and delegating render to `LessonBlockRenderer`.
3. **Companion** (right, `LessonReader.tsx:57-101`) — source kicker, lesson title, level chip; optional `<audio>` element for whole-lesson audio (only if `lessonAudioUrl` is truthy); the practice action links; a `<details>` listing every source-ref in the experience; and the FSRS-passivity footnote.

Lesson duration is converted from seconds to minutes via `Math.max(1, Math.round(secs / 60))` (`LessonReader.tsx:26`) — never displays "0 min".

### 3.2 LessonBlockRenderer — dispatch on `block.kind`

`LessonBlockRenderer.tsx:122-221`. There are 7 block kinds (`lessonExperience.ts:3-10`):

| Kind | Render branch | Where |
|---|---|---|
| `lesson_hero` | `<HeroCard>` with kicker, title, fixed body copy | `LessonBlockRenderer.tsx:128-138` |
| `practice_bridge` | Section with "Oefenbrug" kicker, title, body text (or fallback) | `LessonBlockRenderer.tsx:140-158` |
| `lesson_recap` | Section with "Samenvatting" kicker + fixed copy ("Een korte terugblik...") | `LessonBlockRenderer.tsx:166-183` |
| `vocab_strip` | Default `<section>` branch | `LessonBlockRenderer.tsx:185-220` |
| `reading_section` | Default `<section>` branch | same |
| `dialogue_card` | Default `<section>` branch | same |
| `pattern_callout` | Default `<section>` branch | same |

The default branch is a uniform shape: kicker label (via `labelForKind`, `LessonBlockRenderer.tsx:110-120`), title, optional `<audio>`, optional body text, optional 12-item grid.

### 3.3 Payload extraction (forgiving, per-block)

The renderer never assumes a specific payload shape. It calls three helpers to harvest content opportunistically:

- **`textFromPayload(payload)`** (`LessonBlockRenderer.tsx:12-42`) — concatenates text found in `body`, `intro`, `description`, `label`, `paragraphs[]`, and `categories[].rules + categories[].examples[]`. Deduplicates the parts before joining with `\n\n`. Returns `''` if nothing extractable.
- **`itemsFromPayload(payload)`** (`LessonBlockRenderer.tsx:44-60`) — returns `payload.items` or `payload.lines` if array; otherwise wraps the payload itself as a single item if it has any of `indonesian`, `text`, `baseText`, `base_text`, `name`, `dutch`, `translation`, `translationNl`, `translation_nl`. Returns `[]` otherwise.
- **Per-item text via `primaryItemText` / `secondaryItemText`** (`LessonBlockRenderer.tsx:62-76`) — priority-ordered key lookup: `indonesian → text → baseText → base_text → name` for primary, `dutch → translation → translationNl → translation_nl → description` for secondary.

This forgiveness is why the same renderer handles every payload type the pipeline emits — vocabulary, expressions, numbers, dialogues, reading paragraphs, pattern callouts — without per-kind extraction code.

### 3.4 Per-block audio (default branch only)

`LessonBlockRenderer.tsx:78-108`, applied at the default branch (`LessonBlockRenderer.tsx:191-207`):

- `audioUrlFromPayload(payload)` reads `payload.audioUrl` then `payload.audio_url`.
- Playback position is persisted in `localStorage` under key `lesson-audio-position:${block.sourceRef}:${audioUrl}` (`LessonBlockRenderer.tsx:6, 84-86`).
- `onLoadedMetadata` → `restoreAudioPosition`: reads the stored seconds, ignores values within 2 s of `duration` (so a fully-played track restarts from 0), wraps the assignment in try/catch and clears the key on failure.
- `onTimeUpdate` → `saveAudioPosition`: writes the current rounded second; if `audio.ended`, removes the key instead.
- `onEnded` → clears the key.

Hero, practice-bridge, and recap blocks never render audio — only their dedicated branches are entered, and those branches don't include the `<audio>` element.

---

## 4. Invariants

1. **Pure presentation.** No `useEffect` for data fetching, no service calls, no store reads, no progress writes. The only side effect is `localStorage` for audio resume — UI-local, not domain state.
2. **Block order is the order it gets.** The renderer does NOT re-sort. Sorting by `displayOrder` happens in `buildLessonExperience` at `lessonExperience.ts:101`. The renderer trusts the input.
3. **Audio is per-block-default-branch only.** Hero, practice_bridge, and recap blocks have no audio player by design — their branches don't include the audio surface.
4. **Item rendering is capped at 12.** `items.slice(0, 12)` (`LessonBlockRenderer.tsx:211`). Overflow is silently dropped.
5. **No FSRS-relevant side effects.** Per ADR 0005 and retirement #6, the reader does not activate capabilities, write reviews, or commit progress. The companion footnote tells the user explicitly.
6. **`onBack` is the only required behavioural prop.** Everything else (`actions`, `lessonAudioUrl`, `lessonDurationSeconds`) is optional and defaults to a "don't render" branch.

---

## 5. Seams (to other modules)

### Upstream (data feeds the renderer)

- **`src/lib/lessons/lessonExperience.ts`** — `buildLessonExperience({lesson, pageBlocks})` (`:89-104`) translates DB rows (`Lesson` + `LessonPageBlock[]` from `services/lessonService`) into `LessonExperience`. This is where block-kind classification happens (`blockKindFromPipeline`, `:41-72`) including the legacy 5-value-enum fallback at `:57-71`.
- **`src/lib/lessons/lessonActionModel.ts`** — `buildLessonPracticeActions({lessonId, state})` (`:16-42`) produces the `LessonPracticeAction[]` based on practice-ready and practiced counts.
- **`src/services/lessonService.ts`** — defines the DB row types `Lesson` and `LessonPageBlock`. The renderer never imports from this service directly; `Lesson.tsx` (the page) does the fetch and threads the result through `buildLessonExperience` before passing to the reader.

### Downstream (the renderer consumes these)

- **`src/components/page/primitives/`** — `PageContainer`, `PageBody`, `HeroCard`. The reader composes the page-framework primitives; it is not a standalone island. See `docs/current-system/page-framework-status.md` for the page framework's status.
- **React Router** — `actions` are rendered as `<Link>` elements (`LessonReader.tsx:80-87`) pointing at session-mode URLs (`/session?lesson=...&mode=lesson_practice|lesson_review`). The session engine on the other end reads `mode` from the query string.
- **`localStorage`** — audio position keys under the `lesson-audio-position:` prefix (`LessonBlockRenderer.tsx:6`).

### Sibling (consumed alongside)

- **`src/pages/Lesson.tsx`** owns lesson-activation state (the checkbox at `:215-223`), wraps the reader, and handles navigation. The reader is unaware of activation.
- **`src/pages/LocalPreview.tsx`** renders staging content through the same reader for admin-only visual review — proves the reader is deployable without auth or DB by design.

---

## 6. Known limitations and follow-ups

1. **Legacy block-kind fallback still present.** `lessonExperience.ts:57-71` handles rows authored before the GT2 backfill (5-value enum). A comment at `:43-44` marks the helper for deletion "in the lessons fold PR" — that PR has not yet stripped it. Safe to leave until the last legacy row is republished, but a no-op once all lessons have re-shipped.
2. **TOC keyboard/focus management is browser-default.** Anchor links are plain `<a href="#id">`; no focus-on-jump or skip-link logic. Acceptable for a single-user app, would need attention for accessibility certification.
3. **Practice-bridge and recap copy is hardcoded** (`LessonBlockRenderer.tsx:152-154, 178-180`), not data-driven. If lessons need customised recap text, the renderer needs to look at a payload field — at present it falls back to the fixed string.
4. **Item grid hard-caps at 12.** No "see more" affordance, no scroll. If a vocab strip has 30 items the user sees 12 with no indication that more exist.
5. **No internationalisation.** All UI strings are Dutch hardcodes (`Terug`, `Lesvoortgang`, `Bron`, `Luister naar de les`, the FSRS-passivity footnote, etc.). The `i18n.ts` module is not consulted. Consistent with the current app's NL-only-with-EN-translations model but worth noting for any future locale split.

---

## 7. What this spec does NOT cover

- The `<Lesson>` page's activation checkbox + activation persistence — `src/pages/Lesson.tsx`; the reader is unaware of activation.
- The block-kind classifier upstream — belongs in the `lib/lessons/` module spec.
- The `LessonPageBlock` DB shape and publication path — belongs in the `services/lessonService` + local-pipeline specs.
- The `LessonPracticeAction` business rules — belongs in the `lib/lessons/lessonActionModel` portion of the `lib/lessons/` module spec.
- The session engine that receives the action URLs — belongs in the `lib/session-builder/` and `Session.tsx` specs.
