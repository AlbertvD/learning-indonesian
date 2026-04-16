# Exercise Audio Design

## Overview

Add pre-generated Indonesian TTS audio across all lesson content and exercises. Audio is generated using Google Cloud TTS (Chirp3-HD tier), stored in Supabase Storage, and served to the frontend for playback during lesson reading and review sessions.

## Goals

1. **Dual-coding benefit** — learners see AND hear Indonesian text, creating two memory traces (Mayer & Moreno 1998, d = 0.4-0.7)
2. **Audio playback on all existing content** — play button on vocabulary, dialogue, grammar examples, exercise sentences
3. **New exercise types** — listening_mcq (audio-only prompt) and dictation (type what you hear), gated by SRS maturity
4. **Autoplay on first presentation** — tap-to-replay after, with user setting to disable

## Voice Selection

6 Chirp3-HD voices validated by native speaker (2026-04-15):

| Role | Voice | ID |
|------|-------|----|
| Male 1 | Achird | `id-ID-Chirp3-HD-Achird` |
| Male 2 | Algenib | `id-ID-Chirp3-HD-Algenib` |
| Male 3 | Orus | `id-ID-Chirp3-HD-Orus` |
| Female 1 | Despina | `id-ID-Chirp3-HD-Despina` |
| Female 2 | Sulafat | `id-ID-Chirp3-HD-Sulafat` |
| Female 3 | Gacrux | `id-ID-Chirp3-HD-Gacrux` |

### Voice assignment

- Each lesson gets a **primary voice** (rotating through the 6 voices across lessons) for vocabulary, exercises, grammar examples
- Dialogue sections get **voice-cast per speaker** using `lessons.dialogue_voices` mapping
- Unmapped speakers fall back to `primary_voice`

---

## Data Model

### `audio_clips` table

Content-addressable store: given Indonesian text + voice, return the audio file path.

```sql
CREATE TABLE IF NOT EXISTS indonesian.audio_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text_content text NOT NULL,
  normalized_text text NOT NULL,
  voice_id text NOT NULL,
  storage_path text NOT NULL,
  duration_ms integer,
  generated_for_lesson_id uuid REFERENCES indonesian.lessons(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),

  UNIQUE(normalized_text, voice_id)
);
```

No separate index on `normalized_text` — the unique constraint creates a composite B-tree index on `(normalized_text, voice_id)` which covers all queries (leftmost column used for `normalized_text` predicate, then filtered on `voice_id`).

`generated_for_lesson_id` is provenance only — tracks which lesson first triggered generation. `ON DELETE SET NULL` so deleting a lesson does not cascade to audio clips.

### Voice config on `lessons` table

```sql
ALTER TABLE indonesian.lessons
  ADD COLUMN primary_voice text,
  ADD COLUMN dialogue_voices jsonb;
```

`dialogue_voices` uses **exact speaker names** from lesson section content as keys:

```jsonb
{
  "Ibu Yulia": "id-ID-Chirp3-HD-Sulafat",
  "Pekerja": "id-ID-Chirp3-HD-Achird",
  "Titin": "id-ID-Chirp3-HD-Gacrux"
}
```

### RLS and grants

```sql
ALTER TABLE indonesian.audio_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audio_clips_read" ON indonesian.audio_clips
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "audio_clips_admin_write" ON indonesian.audio_clips
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

GRANT SELECT ON indonesian.audio_clips TO authenticated;
```

The generation script uses `service_role` which bypasses RLS. The existing migration has `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA indonesian TO service_role` (line 369) which covers new tables.

---

## Normalization

### Canonical function

One normalization function shared by the generation script and frontend:

```typescript
// scripts/lib/tts-normalize.ts AND src/lib/ttsNormalize.ts (identical logic)
export function normalizeTtsText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ')
}
```

- **Keeps punctuation** — TTS prosody depends on it ("Apa kabar?" vs "Apa kabar" sound different)
- **Lowercases** — case-insensitive dedup
- **Trims + collapses whitespace** — normalizes formatting differences

### Critical invariant

**Never use `learning_items.normalized_text` for audio lookups.** Always normalize from `base_text` using `normalizeTtsText()`.

Reason: lessons 1-3 were seeded via `seed-learning-items.ts` which strips punctuation from `normalized_text` (`"apa kabar?"` → `"apa kabar"`). The TTS normalization keeps punctuation (`"apa kabar?"` → `"apa kabar?"`). Using the wrong normalized form causes silent lookup misses.

The `audio_clips.normalized_text` column is always populated by `normalizeTtsText()` in the generation script, and the frontend always normalizes via the same function before querying.

---

## Batch Retrieval (RPC Function)

PostgREST `.in()` on long text strings hits Kong URL length limits (~20-30 sentences). Use an RPC function that sends the array in the POST body:

```sql
CREATE OR REPLACE FUNCTION indonesian.get_audio_clips(p_texts text[], p_voice_ids text[])
RETURNS TABLE(text_content text, normalized_text text, voice_id text, storage_path text, duration_ms integer)
LANGUAGE sql STABLE SET search_path = indonesian AS $$
  SELECT ac.text_content, ac.normalized_text, ac.voice_id, ac.storage_path, ac.duration_ms
  FROM audio_clips ac
  WHERE ac.normalized_text = ANY(p_texts)
  AND ac.voice_id = ANY(p_voice_ids);
$$;

GRANT EXECUTE ON FUNCTION indonesian.get_audio_clips(text[], text[]) TO authenticated;
```

Uses `SECURITY INVOKER` (default — omitted). RLS on `audio_clips` is enforced. Accepts multiple voice IDs so a single call covers primary voice + dialogue voices.

### Frontend usage

```typescript
import { normalizeTtsText } from '@/lib/ttsNormalize'

// At session start
const lesson = await fetchLesson(lessonId)
const voices = [lesson.primary_voice, ...Object.values(lesson.dialogue_voices || {})]
const texts = collectAllIndonesianTexts(sessionItems).map(normalizeTtsText)

const { data } = await supabase.schema('indonesian')
  .rpc('get_audio_clips', { p_texts: texts, p_voice_ids: voices })

// Build nested lookup: audioMap.get(voiceId)?.get(normalizedText) → storage_path
const audioMap = new Map<string, Map<string, string>>()
for (const clip of data) {
  if (!audioMap.has(clip.voice_id)) audioMap.set(clip.voice_id, new Map())
  audioMap.get(clip.voice_id)!.set(clip.normalized_text, clip.storage_path)
}

// Resolve audio for a text in a given voice
function getAudioUrl(text: string, voiceId: string): string | undefined {
  const path = audioMap.get(voiceId)?.get(normalizeTtsText(text))
  return path ? `${SUPABASE_URL}/storage/v1/object/public/indonesian-tts/${path}` : undefined
}
```

### Voice resolution

```typescript
function getVoiceForSpeaker(lesson: Lesson, speaker: string): string {
  return lesson.dialogue_voices?.[speaker] ?? lesson.primary_voice
}
```

---

## Storage

### Bucket

New `indonesian-tts` bucket (public read). Separate from `indonesian-lessons` (different content type, different lifecycle).

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('indonesian-tts', 'indonesian-tts', true)
ON CONFLICT (id) DO NOTHING;
```

### Path convention

```
tts/{voice_short_name}/{first-4-words-slugified}-{sha256-first-8}.mp3
```

Examples:
- `tts/despina/selamat-pagi-apa-kabar-a3f8b2c1.mp3`
- `tts/achird/tidak-7f2e1d3c.mp3`
- `tts/sulafat/hotel-itu-tidak-begitu-4e9a1b2f.mp3`

Properties:
- **Deterministic** — SHA256 of `normalized_text + voice_id`, same input always produces same path (idempotent re-runs)
- **Human-debuggable** — first 4 words of slug tell you what it is
- **Collision-proof** — SHA256 ensures uniqueness
- **Length-bounded** — slug capped at ~40 chars + 8-char hash

### Cache headers

`Cache-Control: public, max-age=31536000, immutable` — audio clips never change (same text + voice = same audio forever).

---

## Exercise Payload Text Extraction

The generation pipeline extracts Indonesian text from each exercise type's `payload_json` and `answer_key_json`:

| Exercise type | Fields containing Indonesian text |
|---|---|
| `cloze_mcq` | `payload_json.sentence` (with `___` replaced by `correctOptionId`), `payload_json.options[]` |
| `contrast_pair` | `payload_json.options[].text` |
| `sentence_transformation` | `payload_json.sourceSentence`, `payload_json.acceptableAnswers[]` |
| `constrained_translation` | `payload_json.acceptableAnswers[]` |

**Excluded (Dutch text):**
- `contrast_pair.promptText` — Dutch scenario description
- `cloze_mcq.translation` — Dutch translation
- `sentence_transformation.transformationInstruction` — Dutch instruction
- `constrained_translation.sourceLanguageSentence` — Dutch source
- All `explanationText` fields — Dutch explanations

### Cloze sentence reconstruction

For `cloze_mcq`, the audio is the **complete sentence** with the gap filled:

```typescript
const fullSentence = payload.sentence.replace('___', payload.correctOptionId)
// "Hotel itu ___ begitu mahal." + "tidak" → "Hotel itu tidak begitu mahal."
```

This reconstruction happens in the generation script, not in the DB.

---

## Generation Pipeline

Post-publish script: `scripts/generate-exercise-audio.ts`

### Input

Reads from the database after content is published. Requires lesson to be fully published first.

### Steps

1. **Collect all Indonesian texts for a lesson:**
   - `learning_items.base_text` via `item_contexts WHERE source_lesson_id = ?`
   - `exercise_variants.payload_json` fields per extraction table above
   - `lesson_sections.content` — dialogue lines, grammar examples, pronunciation examples, vocabulary items, expression items, number items
2. **Look up lesson's `primary_voice` + `dialogue_voices`**
3. **Assign voice per text:**
   - Vocabulary, exercises, grammar examples, numbers, expressions → `primary_voice`
   - Dialogue lines → voice from `dialogue_voices` by speaker name, fallback to `primary_voice`
4. **For each `(normalizeTtsText(text), voice_id)`:**
   - Check if exists in `audio_clips` (query by unique constraint)
   - If exists → skip (idempotent)
   - If not → generate MP3 via Google TTS API, upload to `indonesian-tts` bucket, insert into `audio_clips`
5. **Report:** count of generated, skipped, and failed clips

### Auth

Service account: `tts-indonesian@hassio-integration-5a907.iam.gserviceaccount.com`
Key file: `~/.config/gcloud/tts-indonesian.json`

### Usage

```bash
bun scripts/generate-exercise-audio.ts <lesson-number> [--dry-run]
```

### Idempotency

Safe to re-run. Existing clips are skipped. New texts (e.g., after adding exercises) get generated. No clips are deleted or modified.

### Regeneration strategy

If switching to a better TTS model or voice in the future: delete rows from `audio_clips` for the target voice, delete files from storage, re-run the script. The `UNIQUE(normalized_text, voice_id)` constraint means new rows are inserted cleanly.

---

## Frontend Behavior

### Playback

- **Autoplay** on first presentation of a word/exercise — the audio plays automatically when the card/exercise appears
- **Tap-to-replay** via speaker icon button — learner can replay at any time
- **User setting** to disable autoplay globally (persisted in user profile) — tap-to-play still available
- **Playback component:** small `<PlayButton>` component that accepts a storage path and renders a speaker icon

### Graceful degradation

If `audio_clips` has no entry for a text, **no play button is rendered**. Audio is purely additive — lessons and exercises are fully functional without it. The TTS pipeline failure never blocks lesson availability.

### Preloading strategy

1. **Eagerly fetch URL map** at session start via RPC call
2. **Preload next 2-3 exercises' audio** while user works on current one using `new Audio(url).preload = 'auto'`
3. Do NOT preload all audio at session start — would add seconds of loading

---

## PWA Offline Caching

Add runtime caching to `vite-plugin-pwa` config for the storage bucket URL pattern:

```typescript
runtimeCaching: [{
  urlPattern: /\/storage\/v1\/object\/public\/indonesian-tts\//,
  handler: 'CacheFirst',
  options: {
    cacheName: 'tts-audio',
    expiration: { maxEntries: 500 },
  },
}]
```

- **CacheFirst** — once cached, never re-fetched (immutable content)
- **Max 500 entries** — prevents unbounded cache growth (~500 x ~50KB avg = ~25MB)
- Audio files are runtime-cached (not precached) — too numerous and large for the precache manifest

---

## New Exercise Types

### listening_mcq

Audio IS the prompt — an Indonesian sentence is played but NOT shown as text. The learner picks the correct Dutch translation from options.

- SRS gate: stage 1+ (learner must have seen the word in text first)
- Uses same `audio_clips` table — the exercise payload contains the Indonesian text, frontend plays audio instead of displaying it
- No schema changes needed — exercise_type = `'listening_mcq'` in `exercise_variants`

### dictation

Audio is played, learner types what they heard. Checked against normalized answer.

- SRS gate: stage 2+ (learner must recognize the word before producing it)
- Uses same `audio_clips` table
- Answer checking uses `normalizeTtsText()` with additional leniency (strip punctuation for comparison)
- No schema changes needed — exercise_type = `'dictation'` in `exercise_variants`

Both types are UI-layer concerns using the same audio infrastructure. They can be implemented independently after the audio pipeline is in place.

---

## Content Coverage

### Lesson reader sections that get audio

| Content type | Count (8 lessons) | Audio |
|---|---|---|
| dialogue | 7 sections | Each speaker line, voice-cast |
| vocabulary | 8 sections | Each Indonesian word (via learning_items) |
| expressions | 4 sections | Each expression (via learning_items) |
| numbers | 4 sections | Each number |
| pronunciation | 1 section | Example words per letter |
| grammar | 24 sections | Example sentences within rules |
| text (culture) | 12 sections | **Skip** — Dutch content |
| exercises | 8 sections | Covered by exercise_variants audio |
| reference_table | 1 section | **Skip** — low priority |

### Learning items

| Item type | Count | Audio |
|---|---|---|
| word | 1,024 | 1 clip per base_text |
| phrase | 168 | 1 clip per base_text |
| sentence | 22 | 1 clip per base_text |
| dialogue_chunk | 47 | 1 clip per base_text, voice-cast |

### Exercise variants

| Exercise type | Count | Clips per exercise |
|---|---|---|
| cloze_mcq | 132 | full sentence + each option |
| contrast_pair | 117 | each option text |
| sentence_transformation | 100 | source + acceptable answers |
| constrained_translation | 101 | acceptable answers |

### Estimated totals

- ~1,600 unique Indonesian text strings
- ~96,000 characters of TTS
- ~$1.50 generation cost (Chirp3-HD pricing)
- Negligible storage cost

---

## Supabase Requirements

### Schema changes
- New `audio_clips` table (see Data Model section)
- `ALTER TABLE indonesian.lessons ADD COLUMN primary_voice text`
- `ALTER TABLE indonesian.lessons ADD COLUMN dialogue_voices jsonb`
- New RPC function `get_audio_clips` with `GRANT EXECUTE`
- RLS policies on `audio_clips` (authenticated read, admin write)

### Storage
- New `indonesian-tts` bucket (public read)

### homelab-configs changes
- [ ] PostgREST: N/A — `indonesian` schema already exposed
- [ ] Kong: N/A — CORS already configured for the app
- [ ] GoTrue: N/A
- [ ] Storage: new `indonesian-tts` bucket (create via migration SQL or Supabase Studio)

### Health check additions
- `check-supabase-deep.ts`: verify `audio_clips` table exists, RLS enabled, `get_audio_clips` function exists
- `check-supabase.ts`: verify `indonesian-tts` bucket is accessible

---

## Implementation Order

1. **Schema migration** — create table, RPC function, bucket, voice columns on lessons
2. **Generation script** — `generate-exercise-audio.ts` with dry-run mode
3. **Generate audio for lesson 8** — test with one lesson
4. **Frontend PlayButton component** — speaker icon, autoplay/tap-to-replay
5. **Wire into vocabulary review** — play audio on card presentation
6. **Wire into exercise components** — play audio on exercise presentation
7. **Wire into lesson reader** — play audio on dialogue/vocabulary/grammar sections
8. **User setting** — autoplay toggle in profile
9. **PWA caching** — add runtime caching config
10. **Generate audio for lessons 1-7** — backfill all content
11. **New exercise types** — listening_mcq and dictation (separate feature)
