# Exercise Audio Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add pre-generated Indonesian TTS audio across all lesson content and exercises, with autoplay on first presentation and tap-to-replay.

**Architecture:** Content-addressable `audio_clips` table maps (normalized_text, voice_id) to storage paths. A post-publish generation script queries the DB for all Indonesian texts, generates MP3s via Google Cloud TTS Chirp3-HD, uploads to Supabase Storage. The frontend batch-fetches audio URLs via an RPC function and renders PlayButton components.

**Tech Stack:** Google Cloud TTS (Chirp3-HD), Supabase Storage + PostgreSQL, React + Mantine, vite-plugin-pwa

**Design doc:** `docs/plans/2026-04-16-exercise-audio-design.md`

---

## Task 1: Schema Migration

**Files:**
- Modify: `scripts/migration.sql` (append new section at end)

**Step 1: Add the audio_clips table, RLS, grants, RPC function, bucket, and lesson columns**

Append to `scripts/migration.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Audio clips (TTS-generated Indonesian pronunciation)
-- ═══════════════════════════════════════════════════════════════════════════

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

ALTER TABLE indonesian.audio_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audio_clips_read" ON indonesian.audio_clips
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "audio_clips_admin_write" ON indonesian.audio_clips
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM indonesian.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

GRANT SELECT ON indonesian.audio_clips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.audio_clips TO service_role;

-- Voice config on lessons
ALTER TABLE indonesian.lessons ADD COLUMN IF NOT EXISTS primary_voice text;
ALTER TABLE indonesian.lessons ADD COLUMN IF NOT EXISTS dialogue_voices jsonb;

-- Batch retrieval RPC
CREATE OR REPLACE FUNCTION indonesian.get_audio_clips(p_texts text[], p_voice_ids text[])
RETURNS TABLE(text_content text, normalized_text text, voice_id text, storage_path text, duration_ms integer)
LANGUAGE sql STABLE SET search_path = indonesian AS $$
  SELECT ac.text_content, ac.normalized_text, ac.voice_id, ac.storage_path, ac.duration_ms
  FROM audio_clips ac
  WHERE ac.normalized_text = ANY(p_texts)
  AND ac.voice_id = ANY(p_voice_ids);
$$;

GRANT EXECUTE ON FUNCTION indonesian.get_audio_clips(text[], text[]) TO authenticated;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('indonesian-tts', 'indonesian-tts', true)
ON CONFLICT (id) DO NOTHING;
```

**Step 2: Run migration**

```bash
make migrate
```

Expected: migration completes successfully, PostgREST schema cache reloaded.

**Step 3: Verify with health check**

```bash
make check-supabase-deep
```

Expected: all checks pass (new table will be picked up by existing schema checks).

**Step 4: Commit**

```bash
git add scripts/migration.sql
git commit -m "feat: add audio_clips table, RPC function, and TTS storage bucket"
```

---

## Task 2: Normalization Function (Shared)

**Files:**
- Create: `scripts/lib/tts-normalize.ts`
- Create: `src/lib/ttsNormalize.ts`
- Create: `src/__tests__/ttsNormalize.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/ttsNormalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeTtsText } from '@/lib/ttsNormalize'

describe('normalizeTtsText', () => {
  it('lowercases text', () => {
    expect(normalizeTtsText('Apa Kabar')).toBe('apa kabar')
  })

  it('trims whitespace', () => {
    expect(normalizeTtsText('  batik  ')).toBe('batik')
  })

  it('collapses multiple spaces', () => {
    expect(normalizeTtsText('apa   kabar')).toBe('apa kabar')
  })

  it('keeps punctuation (TTS prosody depends on it)', () => {
    expect(normalizeTtsText('Apa kabar?')).toBe('apa kabar?')
    expect(normalizeTtsText('Selamat pagi!')).toBe('selamat pagi!')
    expect(normalizeTtsText('Hotel itu, ya.')).toBe('hotel itu, ya.')
  })

  it('handles empty string', () => {
    expect(normalizeTtsText('')).toBe('')
  })

  it('normalizes tabs and newlines to single space', () => {
    expect(normalizeTtsText("apa\tkabar\nbaik")).toBe('apa kabar baik')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
bun run test src/__tests__/ttsNormalize.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write implementation**

```typescript
// src/lib/ttsNormalize.ts
export function normalizeTtsText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ')
}
```

```typescript
// scripts/lib/tts-normalize.ts
export function normalizeTtsText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ')
}
```

**Step 4: Run test to verify it passes**

```bash
bun run test src/__tests__/ttsNormalize.test.ts
```

Expected: all 6 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/ttsNormalize.ts scripts/lib/tts-normalize.ts src/__tests__/ttsNormalize.test.ts
git commit -m "feat: add shared TTS text normalization function"
```

---

## Task 3: TTS Auth Helper

**Files:**
- Create: `scripts/lib/tts-client.ts`

**Step 1: Write the TTS client**

Extract the Google TTS auth + synthesis logic (tested earlier in ad-hoc scripts) into a reusable module. Uses service account JWT auth.

```typescript
// scripts/lib/tts-client.ts
import { readFileSync } from 'fs'
import { createSign } from 'crypto'
import { resolve } from 'path'

const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize'
const KEY_PATH = resolve(process.env.HOME || '~', '.config/gcloud/tts-indonesian.json')

interface ServiceAccountKey {
  client_email: string
  private_key: string
  project_id: string
}

let cachedToken: { token: string; expiresAt: number } | null = null

function loadKey(): ServiceAccountKey {
  return JSON.parse(readFileSync(KEY_PATH, 'utf8'))
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }

  const key = loadKey()
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  function base64url(obj: unknown) {
    return Buffer.from(JSON.stringify(obj)).toString('base64url')
  }

  const signInput = base64url(header) + '.' + base64url(payload)
  const sign = createSign('RSA-SHA256')
  sign.update(signInput)
  const signature = sign.sign(key.private_key, 'base64url')
  const jwt = signInput + '.' + signature

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new Error('Failed to get access token')

  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 }
  return cachedToken.token
}

export async function synthesizeSpeech(text: string, voiceId: string): Promise<Buffer> {
  const token = await getAccessToken()

  const res = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'id-ID', name: voiceId },
      audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000 },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`TTS API error ${res.status}: ${body}`)
  }

  const json = (await res.json()) as { audioContent: string }
  return Buffer.from(json.audioContent, 'base64')
}
```

**Step 2: Smoke test**

```bash
bun -e "
import { synthesizeSpeech } from './scripts/lib/tts-client.ts'
const buf = await synthesizeSpeech('Selamat pagi', 'id-ID-Chirp3-HD-Despina')
console.log('Generated', buf.length, 'bytes')
"
```

Expected: `Generated XXXXX bytes` (no errors).

**Step 3: Commit**

```bash
git add scripts/lib/tts-client.ts
git commit -m "feat: add Google TTS client with service account auth"
```

---

## Task 4: Storage Path Helper

**Files:**
- Create: `scripts/lib/tts-storage.ts`

**Step 1: Write the storage path builder**

```typescript
// scripts/lib/tts-storage.ts
import { createHash } from 'crypto'
import { normalizeTtsText } from './tts-normalize'

const VOICE_SHORT_NAMES: Record<string, string> = {
  'id-ID-Chirp3-HD-Achird': 'achird',
  'id-ID-Chirp3-HD-Algenib': 'algenib',
  'id-ID-Chirp3-HD-Orus': 'orus',
  'id-ID-Chirp3-HD-Despina': 'despina',
  'id-ID-Chirp3-HD-Sulafat': 'sulafat',
  'id-ID-Chirp3-HD-Gacrux': 'gacrux',
}

function slugify(text: string, maxWords: number = 4): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, maxWords)
    .join('-')
    .slice(0, 40)
}

export function buildStoragePath(text: string, voiceId: string): string {
  const normalized = normalizeTtsText(text)
  const voiceShort = VOICE_SHORT_NAMES[voiceId] || voiceId.split('-').pop()!.toLowerCase()
  const hash = createHash('sha256').update(normalized + voiceId).digest('hex').slice(0, 8)
  const slug = slugify(text)
  return `tts/${voiceShort}/${slug}-${hash}.mp3`
}
```

**Step 2: Verify determinism**

```bash
bun -e "
import { buildStoragePath } from './scripts/lib/tts-storage.ts'
const p1 = buildStoragePath('Selamat pagi', 'id-ID-Chirp3-HD-Despina')
const p2 = buildStoragePath('Selamat pagi', 'id-ID-Chirp3-HD-Despina')
const p3 = buildStoragePath('Selamat pagi', 'id-ID-Chirp3-HD-Achird')
console.log(p1)
console.log('Same input same path:', p1 === p2)
console.log('Different voice different path:', p1 !== p3)
"
```

Expected: deterministic path, same inputs produce same output, different voice produces different path.

**Step 3: Commit**

```bash
git add scripts/lib/tts-storage.ts
git commit -m "feat: add deterministic TTS storage path builder"
```

---

## Task 5: Audio Generation Script

**Files:**
- Create: `scripts/generate-exercise-audio.ts`

This is the core generation script. It queries the DB for all Indonesian texts in a lesson, generates audio, uploads to storage, and inserts into `audio_clips`.

**Step 1: Write the script**

The script follows the existing pattern from `scripts/publish-approved-content.ts`:
- Uses `createClient` with `SUPABASE_SERVICE_KEY` from `.env.local`
- Sets `NODE_TLS_REJECT_UNAUTHORIZED=0` for homelab internal CA
- Accepts `<lesson-number> [--dry-run]` as args

Key sections:
1. **Text collection** — queries `learning_items` (via `item_contexts`), `exercise_variants` (payload extraction per design doc table), `lesson_sections` (dialogue lines, grammar examples)
2. **Voice assignment** — reads `lessons.primary_voice` + `dialogue_voices`, assigns voice per text
3. **Dedup check** — queries `audio_clips` for existing `(normalized_text, voice_id)` pairs
4. **Generation** — calls `synthesizeSpeech()` for missing clips
5. **Upload** — uploads MP3 to `indonesian-tts` bucket via Supabase Storage API
6. **Insert** — inserts new rows into `audio_clips`

Exercise payload text extraction per type:
- `cloze_mcq`: `payload.sentence.replace('___', payload.correctOptionId)`, `payload.options[]`
- `contrast_pair`: `payload.options[].text`
- `sentence_transformation`: `payload.sourceSentence`, `payload.acceptableAnswers[]`
- `constrained_translation`: `payload.acceptableAnswers[]`

Lesson section content extraction:
- `dialogue`: `content.lines[].text` (with speaker for voice assignment)
- `vocabulary`, `expressions`: `content.items[].indonesian || content.items[].base_text`
- `numbers`: `content.items[].indonesian || content.items[].text`
- `grammar`: `content.categories[].rules[].example` (where present)
- `pronunciation`: `content.letters[].examples[]`

**Step 2: Run dry-run on lesson 8**

```bash
bun scripts/generate-exercise-audio.ts 8 --dry-run
```

Expected: lists all texts that would be generated, voice assignments, skip count for existing clips.

**Step 3: Commit**

```bash
git add scripts/generate-exercise-audio.ts
git commit -m "feat: add TTS audio generation script"
```

---

## Task 6: Set Voice Config for Lessons

**Files:**
- Create: `scripts/set-lesson-voices.ts`

Script to populate `primary_voice` and `dialogue_voices` on all 8 lessons.

**Step 1: Write the voice assignment script**

Voice rotation: lessons 1-8 cycle through the 6 voices. Dialogue voices are assigned by reading each lesson's dialogue section content and mapping speakers to gendered voices.

```typescript
const VOICE_ROTATION = [
  'id-ID-Chirp3-HD-Despina',   // lesson 1 — female
  'id-ID-Chirp3-HD-Achird',    // lesson 2 — male
  'id-ID-Chirp3-HD-Sulafat',   // lesson 3 — female
  'id-ID-Chirp3-HD-Algenib',   // lesson 4 — male
  'id-ID-Chirp3-HD-Gacrux',    // lesson 5 — female
  'id-ID-Chirp3-HD-Orus',      // lesson 6 — male
  'id-ID-Chirp3-HD-Despina',   // lesson 7 — female (cycle restarts)
  'id-ID-Chirp3-HD-Achird',    // lesson 8 — male
]
```

The script reads dialogue sections from each lesson, extracts unique speaker names, and assigns voices based on speaker gender cues (Indonesian honorifics: Bu/Ibu = female, Mas/Pak/Bapak = male). Outputs the `dialogue_voices` jsonb and updates the DB.

**Step 2: Run**

```bash
bun scripts/set-lesson-voices.ts [--dry-run]
```

Expected: all 8 lessons get `primary_voice` and `dialogue_voices` populated.

**Step 3: Commit**

```bash
git add scripts/set-lesson-voices.ts
git commit -m "feat: add voice assignment script and populate lesson voices"
```

---

## Task 7: Generate Audio for Lesson 8 (Test Run)

**Step 1: Run generation on lesson 8**

```bash
bun scripts/generate-exercise-audio.ts 8
```

Expected: generates ~200 audio clips, uploads to `indonesian-tts` bucket, inserts into `audio_clips`.

**Step 2: Verify in Supabase**

```bash
make check-supabase-deep
```

And manually check a few clips:

```bash
bun -e "
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const { data } = await supabase.schema('indonesian').from('audio_clips')
  .select('text_content, voice_id, storage_path')
  .eq('generated_for_lesson_id', '<lesson-8-uuid>')
  .limit(5)
console.log(data)
"
```

**Step 3: Listen to a sample clip**

Download one clip from the bucket and verify it sounds correct:

```bash
curl -k "https://api.supabase.duin.home/storage/v1/object/public/indonesian-tts/tts/achird/batik-<hash>.mp3" -o /tmp/test-batik.mp3
open /tmp/test-batik.mp3
```

**Step 4: Commit** (no code changes, but document that lesson 8 audio is published)

---

## Task 8: Frontend Audio Service

**Files:**
- Create: `src/services/audioService.ts`
- Create: `src/__tests__/audioService.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/audioService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase')

describe('audioService', () => {
  it('fetches audio map for given texts and voices', async () => {
    vi.mocked(supabase.schema).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          { text_content: 'batik', normalized_text: 'batik', voice_id: 'id-ID-Chirp3-HD-Achird', storage_path: 'tts/achird/batik-abc123.mp3', duration_ms: 1200 },
          { text_content: 'halus', normalized_text: 'halus', voice_id: 'id-ID-Chirp3-HD-Achird', storage_path: 'tts/achird/halus-def456.mp3', duration_ms: 900 },
        ],
        error: null,
      }),
    } as any)

    const { fetchAudioMap } = await import('@/services/audioService')
    const map = await fetchAudioMap(['batik', 'halus'], ['id-ID-Chirp3-HD-Achird'])

    expect(map.get('id-ID-Chirp3-HD-Achird')?.get('batik')).toBe('tts/achird/batik-abc123.mp3')
    expect(map.get('id-ID-Chirp3-HD-Achird')?.get('halus')).toBe('tts/achird/halus-def456.mp3')
  })

  it('returns empty map when no clips found', async () => {
    vi.mocked(supabase.schema).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as any)

    const { fetchAudioMap } = await import('@/services/audioService')
    const map = await fetchAudioMap(['nonexistent'], ['voice'])

    expect(map.size).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
bun run test src/__tests__/audioService.test.ts
```

**Step 3: Write implementation**

```typescript
// src/services/audioService.ts
import { supabase } from '@/lib/supabase'
import { normalizeTtsText } from '@/lib/ttsNormalize'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export type AudioMap = Map<string, Map<string, string>>  // voice_id → normalized_text → storage_path

export async function fetchAudioMap(normalizedTexts: string[], voiceIds: string[]): Promise<AudioMap> {
  if (normalizedTexts.length === 0 || voiceIds.length === 0) return new Map()

  const { data, error } = await supabase
    .schema('indonesian')
    .rpc('get_audio_clips', { p_texts: normalizedTexts, p_voice_ids: voiceIds })

  if (error || !data) return new Map()

  const map: AudioMap = new Map()
  for (const clip of data as Array<{ normalized_text: string; voice_id: string; storage_path: string }>) {
    if (!map.has(clip.voice_id)) map.set(clip.voice_id, new Map())
    map.get(clip.voice_id)!.set(clip.normalized_text, clip.storage_path)
  }
  return map
}

export function resolveAudioUrl(audioMap: AudioMap, text: string, voiceId: string): string | undefined {
  const path = audioMap.get(voiceId)?.get(normalizeTtsText(text))
  return path ? `${SUPABASE_URL}/storage/v1/object/public/indonesian-tts/${path}` : undefined
}
```

**Step 4: Run test to verify it passes**

```bash
bun run test src/__tests__/audioService.test.ts
```

**Step 5: Commit**

```bash
git add src/services/audioService.ts src/__tests__/audioService.test.ts
git commit -m "feat: add audio service with RPC batch fetch and URL resolution"
```

---

## Task 9: PlayButton Component

**Files:**
- Create: `src/components/PlayButton.tsx`
- Create: `src/__tests__/playButton.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/__tests__/playButton.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlayButton } from '@/components/PlayButton'

describe('PlayButton', () => {
  it('renders nothing when no audioUrl is provided', () => {
    const { container } = render(<PlayButton audioUrl={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a button when audioUrl is provided', () => {
    render(<PlayButton audioUrl="https://example.com/audio.mp3" />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
bun run test src/__tests__/playButton.test.tsx
```

**Step 3: Write implementation**

A small ActionIcon that plays/stops audio. Uses the HTML5 Audio API.

```typescript
// src/components/PlayButton.tsx
import { useRef, useState, useEffect } from 'react'
import { ActionIcon } from '@mantine/core'
import { IconVolume, IconPlayerStop } from '@tabler/icons-react'

interface PlayButtonProps {
  audioUrl: string | undefined
  autoPlay?: boolean
  size?: 'xs' | 'sm' | 'md'
}

export function PlayButton({ audioUrl, autoPlay = false, size = 'sm' }: PlayButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!audioUrl) return
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.addEventListener('ended', () => setPlaying(false))

    if (autoPlay) {
      audio.play().catch(() => {})
      setPlaying(true)
    }

    return () => {
      audio.pause()
      audio.removeEventListener('ended', () => setPlaying(false))
    }
  }, [audioUrl, autoPlay])

  if (!audioUrl) return null

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      audio.currentTime = 0
      setPlaying(false)
    } else {
      audio.play().catch(() => {})
      setPlaying(true)
    }
  }

  return (
    <ActionIcon variant="subtle" size={size} onClick={toggle} aria-label="Play audio">
      {playing ? <IconPlayerStop size={16} /> : <IconVolume size={16} />}
    </ActionIcon>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
bun run test src/__tests__/playButton.test.tsx
```

**Step 5: Commit**

```bash
git add src/components/PlayButton.tsx src/__tests__/playButton.test.tsx
git commit -m "feat: add PlayButton component for TTS audio playback"
```

---

## Task 10: Wire Audio into Lesson Interface

**Files:**
- Modify: `src/services/lessonService.ts:4-17` — add `primary_voice` and `dialogue_voices` to `Lesson` interface
- Modify: `src/services/lessonService.ts` — update `select()` calls to include new columns

**Step 1: Add fields to Lesson interface**

```typescript
// Add to Lesson interface in src/services/lessonService.ts
primary_voice: string | null
dialogue_voices: Record<string, string> | null
```

**Step 2: Update select calls**

Any `select('*')` calls already pick up new columns. If there are explicit column lists, add the new columns.

**Step 3: Run existing tests**

```bash
bun run test
```

Expected: all tests pass (new nullable columns don't break anything).

**Step 4: Commit**

```bash
git add src/services/lessonService.ts
git commit -m "feat: add voice config fields to Lesson interface"
```

---

## Task 11: Wire Audio into Exercise Components

**Files:**
- Modify: `src/components/exercises/ExerciseShell.tsx` — fetch audio map at session start, pass to exercise components
- Modify: `src/components/exercises/RecognitionMCQ.tsx` — add PlayButton to prompt and options
- Modify: `src/components/exercises/ContrastPairExercise.tsx` — add PlayButton to options
- Modify: `src/components/exercises/ClozeMcq.tsx` — add PlayButton for full sentence
- Modify: `src/components/exercises/SentenceTransformationExercise.tsx` — add PlayButton for source sentence
- Modify: `src/components/exercises/ConstrainedTranslationExercise.tsx` — add PlayButton for correct answer on reveal
- Modify: `src/components/exercises/CuedRecallExercise.tsx` — add PlayButton for correct answer on reveal
- Modify: `src/components/exercises/MeaningRecall.tsx` — add PlayButton for prompt word
- Modify: `src/components/exercises/TypedRecall.tsx` — add PlayButton for correct answer on reveal

This is the largest task. The pattern is the same for each component:
1. Accept `audioMap` and `voiceId` as props (or via context)
2. Call `resolveAudioUrl(audioMap, indonesianText, voiceId)` for each Indonesian text
3. Render `<PlayButton audioUrl={url} />` next to the text
4. For the first presentation, pass `autoPlay={true}` (controlled by user setting)

The exact wiring depends on how ExerciseShell passes data to child components. Read `ExerciseShell.tsx` to understand the current prop threading pattern and follow it.

**Step 1: Add AudioContext provider or prop threading through ExerciseShell**

**Step 2: Wire PlayButton into each exercise component, one at a time**

**Step 3: Test each component in the browser with lesson 8 (which has audio)**

**Step 4: Commit per component or as a batch**

```bash
git commit -m "feat: wire PlayButton audio into exercise components"
```

---

## Task 12: Wire Audio into Lesson Reader

**Files:**
- Modify: lesson reader components that render dialogue, vocabulary, grammar, and pronunciation sections

Fetch audio map when the lesson reader loads. Add PlayButton next to:
- Each dialogue line (using speaker-to-voice mapping)
- Each vocabulary item
- Each expression
- Each grammar example sentence
- Each pronunciation example

**Step 1: Identify the lesson reader components**

Read the page that renders lesson sections and find where dialogue lines, vocabulary items, and grammar examples are rendered.

**Step 2: Fetch audio map on lesson load**

**Step 3: Wire PlayButton into each section renderer**

**Step 4: Test in browser — navigate to lesson 8 and verify play buttons appear**

**Step 5: Commit**

```bash
git commit -m "feat: wire PlayButton audio into lesson reader sections"
```

---

## Task 13: User Autoplay Setting

**Files:**
- Modify: `src/stores/authStore.ts` or profile settings — add `autoplay_audio` boolean
- Modify: profile/settings page — add toggle
- Modify: PlayButton or audio context — read the setting

**Step 1: Add `autoplay_audio` to user profile (localStorage or Supabase profile)**

Since this is a UI preference, localStorage is simplest (same as dark mode). No schema change needed.

**Step 2: Add toggle to settings page**

**Step 3: Wire into PlayButton's `autoPlay` prop**

**Step 4: Commit**

```bash
git commit -m "feat: add autoplay audio toggle in user settings"
```

---

## Task 14: PWA Caching

**Files:**
- Modify: `vite.config.ts:12-27` — add `workbox.runtimeCaching` to VitePWA config

**Step 1: Add runtime caching for TTS audio**

```typescript
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    runtimeCaching: [{
      urlPattern: /\/storage\/v1\/object\/public\/indonesian-tts\//,
      handler: 'CacheFirst',
      options: {
        cacheName: 'tts-audio',
        expiration: { maxEntries: 500 },
      },
    }],
  },
  manifest: { /* existing manifest */ },
})
```

**Step 2: Build and verify**

```bash
bun run build
```

Check that `dist/sw.js` contains the runtime caching rule.

**Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat: add PWA runtime caching for TTS audio files"
```

---

## Task 15: Generate Audio for Lessons 1-7

**Step 1: Run voice assignment if not already done**

```bash
bun scripts/set-lesson-voices.ts
```

**Step 2: Generate audio for each lesson**

```bash
for i in 1 2 3 4 5 6 7; do
  echo "=== Lesson $i ==="
  bun scripts/generate-exercise-audio.ts $i
done
```

**Step 3: Verify total clip count**

```bash
bun -e "
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const { count } = await supabase.schema('indonesian').from('audio_clips').select('*', { count: 'exact', head: true })
console.log('Total audio clips:', count)
"
```

Expected: ~1,600 clips.

**Step 4: Commit** (no code changes)

---

## Task 16: Health Check Updates

**Files:**
- Modify: `scripts/check-supabase-deep.ts` — add `audio_clips` table check, `get_audio_clips` function check
- Modify: `scripts/check-supabase.ts` — add `indonesian-tts` bucket accessibility check

**Step 1: Add checks**

Follow existing patterns in both scripts for verifying table existence, RLS status, and bucket access.

**Step 2: Run checks**

```bash
make check-supabase
make check-supabase-deep
```

**Step 3: Commit**

```bash
git commit -m "feat: add audio_clips and TTS bucket to health checks"
```

---

## Summary

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Schema migration | None |
| 2 | Normalization function | None |
| 3 | TTS auth helper | None |
| 4 | Storage path helper | Task 2 |
| 5 | Generation script | Tasks 2, 3, 4 |
| 6 | Voice assignment script | Task 1 |
| 7 | Generate lesson 8 audio | Tasks 1, 5, 6 |
| 8 | Frontend audio service | Tasks 1, 2 |
| 9 | PlayButton component | None |
| 10 | Lesson interface update | Task 1 |
| 11 | Wire into exercises | Tasks 7, 8, 9, 10 |
| 12 | Wire into lesson reader | Tasks 7, 8, 9, 10 |
| 13 | Autoplay setting | Task 9 |
| 14 | PWA caching | None |
| 15 | Generate lessons 1-7 | Tasks 5, 6 |
| 16 | Health check updates | Task 1 |

Tasks 1-4 can be parallelized. Tasks 8-10 can be parallelized. Task 11 and 12 are the largest integration work.
