# Listening MCQ — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a new runtime exercise type `listening_mcq` (audio-only Indonesian prompt, user-language MCQ answer), using the existing audio infrastructure and Spec 2's `pickDistractorCascade` helper.

**Design doc:** `docs/plans/2026-04-17-listening-mcq-design.md`

**Dependencies:**
- **Spec 2 impl plan** (`pos-aware-distractors-impl.md`) should land Phase C (`pickDistractorCascade` helper) before this plan's Phase D. If it hasn't, this plan's Phase D inlines a simpler distractor pool (same-level shuffle) as a temporary fallback; Phase D comment notes the TODO.
- **Audio rollout** (`docs/plans/2026-04-16-exercise-audio-design.md`) is already in production — `audio_clips`, `AudioContext`, `PlayButton` all exist.

**Tech stack:** React 19, TypeScript, Vitest, @testing-library/react, @mantine/core.

---

## Phase A — Types, flag, seed

### Task A.1: Add `listening_mcq` to the exerciseType union

**Files:**
- Modify: `src/types/learning.ts`

**Step 1: Add to the exerciseType union**

Find the `exerciseType:` field on `ExerciseItem` in `src/types/learning.ts` and add `'listening_mcq'`:

```ts
exerciseType: 'recognition_mcq' | 'typed_recall' | 'cloze' | 'cloze_mcq'
  | 'cued_recall' | 'meaning_recall' | 'contrast_pair'
  | 'sentence_transformation' | 'constrained_translation' | 'speaking'
  | 'listening_mcq'
```

No new nested payload field — listening_mcq uses the existing `distractors: string[]` like recognition_mcq.

**Step 2: Typecheck**

```bash
bun run build
```

Expected: passes. Any exhaustive switch over exerciseType will now fail to compile — look for `exerciseType` in `src/components/exercises/ExerciseShell.tsx` and related files; if TypeScript flags a missing case, it's the dispatch branch we'll add in Task C.1.

**Step 3: Commit**

```bash
git add src/types/learning.ts
git commit -m "$(cat <<'EOF'
feat: add listening_mcq to ExerciseItem.exerciseType union

No nested payload field — reuses distractors: string[] like recognition_mcq.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A.2: Add feature flag

**Files:**
- Modify: `src/lib/featureFlags.ts`
- Modify: `src/__tests__/exerciseAvailability.test.ts` (likely — verify path)

**Step 1: Write the failing test**

Add to the existing feature-flag test (most likely `src/__tests__/exerciseAvailability.test.ts` — verify via `grep -l featureFlags src/__tests__`). If no test for `isExerciseTypeEnabled` exists, create `src/__tests__/featureFlags.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isExerciseTypeEnabled } from '@/lib/featureFlags'

describe('isExerciseTypeEnabled — listening_mcq', () => {
  it('is enabled by default', () => {
    expect(isExerciseTypeEnabled('listening_mcq')).toBe(true)
  })
  // Env-variable override tests require module reset — optional for v1;
  // add only if the existing file uses this pattern.
})
```

**Step 2: Update featureFlags.ts**

Add to the `FeatureFlags` interface, the `featureFlags` export, and `isExerciseTypeEnabled`:

```ts
interface FeatureFlags {
  // ... existing ...
  listeningMcq: boolean
}

export const featureFlags: FeatureFlags = {
  // ... existing ...
  listeningMcq: parseEnvFlag('VITE_FEATURE_LISTENING_MCQ'),
}

export function isExerciseTypeEnabled(exerciseType: string): boolean {
  switch (exerciseType) {
    // ... existing ...
    case 'listening_mcq':
      return featureFlags.listeningMcq
    // ... existing core types and default ...
  }
}
```

**Step 3: Run tests**

```bash
bun run test src/__tests__/featureFlags.test.ts src/__tests__/exerciseAvailability.test.ts
```

Expected: passes.

**Step 4: Commit**

```bash
git add src/lib/featureFlags.ts src/__tests__/featureFlags.test.ts src/__tests__/exerciseAvailability.test.ts
git commit -m "$(cat <<'EOF'
feat: add VITE_FEATURE_LISTENING_MCQ feature flag

Default true. To disable at deployment: VITE_FEATURE_LISTENING_MCQ=false.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A.3: Seed `exercise_type_availability` row

**Files:**
- Modify: `scripts/migration.sql` (append after the existing seed block starting at line 871)

**Step 1: Append the seed row**

Append to `scripts/migration.sql`:

```sql
-- Listening MCQ (audio-only Indonesian prompt, user-language MCQ answer)
INSERT INTO indonesian.exercise_type_availability
  (exercise_type, session_enabled, authoring_enabled, requires_approved_content, rollout_phase, notes)
VALUES
  ('listening_mcq', true, false, false, 'alpha',
   'Audio-only Indonesian prompt, user-language MCQ. Runtime-built. No authored variants.')
ON CONFLICT (exercise_type) DO NOTHING;
```

Verified: `exercise_type` is PRIMARY KEY at `scripts/migration.sql:803–804`, so `ON CONFLICT (exercise_type) DO NOTHING` is valid and idempotent.

**Step 2: Run migration**

```bash
make migrate
```

Expected: one new row inserted (or zero on re-run due to ON CONFLICT).

**Step 3: Verify**

```bash
make check-supabase-deep
```

If the check script already iterates `exercise_type_availability`, the new row appears in the output. Otherwise add a small assertion:

```sql
SELECT 1 FROM indonesian.exercise_type_availability WHERE exercise_type = 'listening_mcq';
```

**Step 4: Commit**

```bash
git add scripts/migration.sql
git commit -m "$(cat <<'EOF'
feat: seed exercise_type_availability row for listening_mcq

Session-enabled, authoring-disabled, alpha rollout phase.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A.4: Add user-setting plumbing (listening_enabled)

**Files:**
- Create: `src/lib/listeningPreferences.ts`
- Create: `src/contexts/ListeningContext.tsx`
- Create: `src/__tests__/listeningPreferences.test.ts`
- Modify: `src/main.tsx` (wrap the root tree in `ListeningProvider` — verified via `grep -n AutoplayProvider src/main.tsx` that provider wiring lives here, not in `App.tsx`)

**Step 1: Write the failing test for listeningPreferences**

Create `src/__tests__/listeningPreferences.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getListeningEnabled, setListeningEnabled } from '@/lib/listeningPreferences'

describe('listeningPreferences', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to true when unset', () => {
    expect(getListeningEnabled()).toBe(true)
  })

  it('round-trips true', () => {
    setListeningEnabled(true)
    expect(getListeningEnabled()).toBe(true)
  })

  it('round-trips false', () => {
    setListeningEnabled(false)
    expect(getListeningEnabled()).toBe(false)
  })
})
```

**Step 2: Implement listeningPreferences.ts**

```ts
// src/lib/listeningPreferences.ts
const KEY = 'listening_enabled'

export function getListeningEnabled(): boolean {
  const v = localStorage.getItem(KEY)
  return v !== 'false'  // default true
}

export function setListeningEnabled(enabled: boolean): void {
  localStorage.setItem(KEY, enabled ? 'true' : 'false')
}
```

**Step 3: Implement ListeningContext**

```tsx
// src/contexts/ListeningContext.tsx
import { createContext, useContext, useState, useEffect } from 'react'
import { getListeningEnabled, setListeningEnabled } from '@/lib/listeningPreferences'

interface ListeningContextValue {
  listeningEnabled: boolean
  setListeningEnabled: (enabled: boolean) => void
}

const ListeningContext = createContext<ListeningContextValue>({
  listeningEnabled: true,
  setListeningEnabled: () => {},
})

export function ListeningProvider({ children }: { children: React.ReactNode }) {
  const [listeningEnabled, setListeningEnabledState] = useState<boolean>(() => getListeningEnabled())

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'listening_enabled') setListeningEnabledState(e.newValue !== 'false')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function setFromUi(enabled: boolean) {
    setListeningEnabled(enabled)
    setListeningEnabledState(enabled)
  }

  return (
    <ListeningContext.Provider value={{ listeningEnabled, setListeningEnabled: setFromUi }}>
      {children}
    </ListeningContext.Provider>
  )
}

export function useListening(): ListeningContextValue {
  return useContext(ListeningContext)
}
```

Matches the `AutoplayContext` pattern at `src/contexts/AutoplayContext.tsx` exactly.

**Step 4: Wire into main.tsx**

Find the root tree's provider stack in `src/main.tsx` (where `AutoplayProvider` wraps children — verified present at `src/main.tsx:235–237`). Add `ListeningProvider` alongside:

```tsx
<AutoplayProvider>
  <ListeningProvider>
    {/* existing tree */}
  </ListeningProvider>
</AutoplayProvider>
```

**Step 5: Run tests**

```bash
bun run test src/__tests__/listeningPreferences.test.ts
bun run build
```

**Step 6: Commit**

```bash
git add src/lib/listeningPreferences.ts src/contexts/ListeningContext.tsx src/__tests__/listeningPreferences.test.ts src/main.tsx
git commit -m "$(cat <<'EOF'
feat: add listening_enabled user setting + ListeningContext

LocalStorage-backed, default true. Mirrors AutoplayContext pattern.
Shared toggle: controls both listening_mcq (this spec) and dictation
(Spec 4) — single user-level audio-exercise opt-out.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Builder

### Task B.1: Add `makeListeningMcq` + `hasAudioFor` helper

**Files:**
- Modify: `src/lib/sessionQueue.ts`

**Step 0: Confirm test helpers exist**

```bash
grep -n "function makeItem\|function makeMeaning" src/__tests__/sessionQueue.test.ts
```

Expected: both helpers are defined at the top of `src/__tests__/sessionQueue.test.ts` (they are — verified during Spec 2's review). If either is absent, inline fixtures in the new tests instead.

**Step 1: Write the failing test**

Add to `src/__tests__/sessionQueue.test.ts`:

```ts
import { makeListeningMcq, hasAudioFor } from '@/lib/sessionQueue'
// hasAudioFor + makeListeningMcq exported with @internal JSDoc, same pattern
// as the Spec 1/2 impl plans use for makeGrammarExercise, makeClozeMcq, etc.

describe('makeListeningMcq', () => {
  it('builds an ExerciseItem with exerciseType listening_mcq and skillType recognition', () => {
    const item = makeItem('i1')  // existing helper at top of sessionQueue.test.ts
    const meanings = [makeMeaning('i1')]  // existing helper
    const exercise = makeListeningMcq(item, meanings, [], [], 'en', [item], { i1: meanings })
    expect(exercise.exerciseType).toBe('listening_mcq')
    expect(exercise.skillType).toBe('recognition')
  })

  it('uses pickDistractorCascade for distractor selection', () => {
    // Build allItems with 3 same-POS, 3 different-POS candidates.
    // Assert all 3 distractors come from same-POS pool.
  })
})

describe('hasAudioFor', () => {
  it('returns true when audio exists for the target voice', () => {
    const audioMap = new Map([['voice-1', new Map([['apa kabar', 'tts/...'], ])]])
    const item = { ...makeItem('i1'), base_text: 'Apa Kabar' }
    expect(hasAudioFor(item, audioMap, 'voice-1')).toBe(true)  // case-insensitive via normalizeTtsText
  })

  it('returns false when voiceId is null', () => {
    expect(hasAudioFor(makeItem('i1'), new Map(), null)).toBe(false)
  })

  it('returns false when audio is missing', () => {
    expect(hasAudioFor(makeItem('i1'), new Map(), 'voice-1')).toBe(false)
  })
})
```

**Step 2: Implement both helpers**

Add to `src/lib/sessionQueue.ts` (near the other `make*` functions):

```ts
import { normalizeTtsText } from '@/lib/ttsNormalize'
import type { AudioMap } from '@/services/audioService'

/** @internal exported for tests */
export function hasAudioFor(
  item: LearningItem,
  audioMap: AudioMap,
  voiceId: string | null,
): boolean {
  if (!voiceId) return false
  return !!audioMap.get(voiceId)?.get(normalizeTtsText(item.base_text))
}

/** @internal exported for tests */
export function makeListeningMcq(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
  userLanguage: 'en' | 'nl',
  allItems: LearningItem[],
  meaningsByItem: Record<string, ItemMeaning[]>,
): ExerciseItem {
  const primaryMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const correctAnswer = primaryMeaning?.translation_text ?? ''

  // Build distractor pool identically to makeRecognitionMCQ.
  const pool: DistractorCandidate[] = allItems
    .filter(i => i.id !== item.id)
    .flatMap(i => {
      const itemMeanings = meaningsByItem[i.id] ?? []
      const t = (itemMeanings.find(m => m.translation_language === userLanguage && m.is_primary)
        ?? itemMeanings.find(m => m.translation_language === userLanguage))?.translation_text
      if (!t || t === correctAnswer) return []
      return [{
        id: i.id,
        option: t,
        itemType: i.item_type,
        pos: i.pos ?? null,
        level: i.level,
        semanticGroup: getSemanticGroup(t, userLanguage),
      }]
    })

  const target = {
    itemType: item.item_type,
    pos: item.pos ?? null,
    level: item.level,
    semanticGroup: getSemanticGroup(correctAnswer, userLanguage),
  }
  const distractors = pickDistractorCascade(target, pool, 3)

  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'recognition',
    exerciseType: 'listening_mcq',
    distractors,
  }
}
```

**Spec 2 dependency**: if `pickDistractorCascade` is not yet available (Spec 2 Phase C not landed), temporarily inline the same-level random shuffle pattern from the current `makeCuedRecall` and leave a `TODO: switch to pickDistractorCascade when Spec 2 lands`.

**Step 3: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

**Step 4: Commit**

```bash
git add src/lib/sessionQueue.ts src/__tests__/sessionQueue.test.ts
git commit -m "$(cat <<'EOF'
feat: add makeListeningMcq builder and hasAudioFor helper

Builder mirrors makeRecognitionMCQ but keeps distractors as translations
(same skillType=recognition). Dead code until Phase D wires selectExercises
and the session builder plumbs audioMap/voiceId into the selection path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — Component

### Task C.1: Build `ListeningMCQ` component

**Files:**
- Create: `src/components/exercises/ListeningMCQ.tsx`
- Create: `src/__tests__/listeningMcqExercise.test.tsx`
- Modify: `src/components/exercises/ExerciseShell.tsx` (add dispatch branch)

**Step 1: Write the failing tests**

```tsx
// src/__tests__/listeningMcqExercise.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { AudioProvider } from '@/contexts/AudioContext'
import { ListeningMCQ } from '@/components/exercises/ListeningMCQ'
import type { ExerciseItem } from '@/types/learning'

function wrap(ui: React.ReactElement, audioMap = new Map(), voiceId: string | null = 'voice-1') {
  return render(
    <MantineProvider>
      <AudioProvider audioMap={audioMap} voiceId={voiceId}>
        {ui}
      </AudioProvider>
    </MantineProvider>
  )
}

const baseExercise: ExerciseItem = {
  learningItem: {
    id: 'i1', item_type: 'word', base_text: 'makan', normalized_text: 'makan',
    language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null,
    source_card_id: null, notes: null, is_active: true, pos: 'verb',
    created_at: '', updated_at: '',
  },
  meanings: [{
    id: 'm1', learning_item_id: 'i1', translation_language: 'nl',
    translation_text: 'eten', is_primary: true, sense_label: null, usage_note: null,
  }],
  distractors: ['drinken', 'lopen', 'slapen'],
  contexts: [],
  answerVariants: [],
  skillType: 'recognition',
  exerciseType: 'listening_mcq',
}

describe('ListeningMCQ', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not display the Indonesian base_text in the prompt', () => {
    const audioMap = new Map([['voice-1', new Map([['makan', 'tts/voice-1/makan-xyz.mp3']])]])
    wrap(<ListeningMCQ exerciseItem={baseExercise} userLanguage="nl" onAnswer={vi.fn()} />, audioMap)
    expect(screen.queryByText('makan')).toBeNull()
  })

  it('calls onAnswer(true) when correct option clicked', async () => {
    const audioMap = new Map([['voice-1', new Map([['makan', 'tts/voice-1/makan-xyz.mp3']])]])
    const onAnswer = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    wrap(<ListeningMCQ exerciseItem={baseExercise} userLanguage="nl" onAnswer={onAnswer} />, audioMap)
    await user.click(screen.getByRole('button', { name: 'eten' }))
    vi.advanceTimersByTime(2000)
    expect(onAnswer).toHaveBeenCalledWith(true, expect.any(Number))
  })

  it('calls onAnswer(false) on first wrong click (MAX_FAILURES = 0)', async () => {
    const audioMap = new Map([['voice-1', new Map([['makan', 'tts/voice-1/makan-xyz.mp3']])]])
    const onAnswer = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    wrap(<ListeningMCQ exerciseItem={baseExercise} userLanguage="nl" onAnswer={onAnswer} />, audioMap)
    await user.click(screen.getByRole('button', { name: 'drinken' }))
    vi.advanceTimersByTime(100)
    expect(onAnswer).toHaveBeenCalledWith(false, expect.any(Number))
  })

  it('reveals Indonesian base_text in the prompt area after answering', async () => {
    const audioMap = new Map([['voice-1', new Map([['makan', 'tts/voice-1/makan-xyz.mp3']])]])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    wrap(<ListeningMCQ exerciseItem={baseExercise} userLanguage="nl" onAnswer={vi.fn()} />, audioMap)
    await user.click(screen.getByRole('button', { name: 'eten' }))
    vi.advanceTimersByTime(100)  // allow state update
    expect(screen.getByText('makan')).toBeInTheDocument()
  })

  it('renders error state when no audio URL available', () => {
    // No entry in audioMap for 'makan'
    wrap(<ListeningMCQ exerciseItem={baseExercise} userLanguage="nl" onAnswer={vi.fn()} />, new Map())
    // Error message should be rendered; option buttons disabled or absent
    expect(screen.getByText(/niet beschikbaar|not available/i)).toBeInTheDocument()
  })

  it('autoplay-blocked fallback: renders tap-to-play overlay when audio.play() rejects', async () => {
    // Mock HTMLAudioElement.prototype.play to reject
    const originalPlay = HTMLAudioElement.prototype.play
    HTMLAudioElement.prototype.play = vi.fn(() => Promise.reject(new Error('autoplay blocked')))
    try {
      const audioMap = new Map([['voice-1', new Map([['makan', 'tts/voice-1/makan-xyz.mp3']])]])
      wrap(<ListeningMCQ exerciseItem={baseExercise} userLanguage="nl" onAnswer={vi.fn()} />, audioMap)
      // Wait for the reject to propagate and the overlay to render
      await vi.waitFor(() => {
        expect(screen.getByText(/tap to play|klik om af te spelen/i)).toBeInTheDocument()
      })
      // Options should be disabled
      const buttons = screen.getAllByRole('button').filter(b =>
        ['eten', 'drinken', 'lopen', 'slapen'].includes(b.textContent ?? '')
      )
      for (const b of buttons) expect(b).toBeDisabled()
    } finally {
      HTMLAudioElement.prototype.play = originalPlay
    }
  })

  it('autoplay-succeeds path: no overlay, options enabled', async () => {
    const originalPlay = HTMLAudioElement.prototype.play
    HTMLAudioElement.prototype.play = vi.fn(() => Promise.resolve())
    try {
      const audioMap = new Map([['voice-1', new Map([['makan', 'tts/voice-1/makan-xyz.mp3']])]])
      wrap(<ListeningMCQ exerciseItem={baseExercise} userLanguage="nl" onAnswer={vi.fn()} />, audioMap)
      await vi.waitFor(() => {
        expect(screen.queryByText(/tap to play|klik om af te spelen/i)).toBeNull()
      })
      const optionButtons = screen.getAllByRole('button').filter(b =>
        ['eten', 'drinken', 'lopen', 'slapen'].includes(b.textContent ?? '')
      )
      for (const b of optionButtons) expect(b).not.toBeDisabled()
    } finally {
      HTMLAudioElement.prototype.play = originalPlay
    }
  })
})
```

**Step 2: Run tests, confirm failure**

```bash
bun run test src/__tests__/listeningMcqExercise.test.tsx
```

Expected: fails — `ListeningMCQ` doesn't exist yet.

**Step 3: Implement the component**

```tsx
// src/components/exercises/ListeningMCQ.tsx
import { useState, useRef, useEffect } from 'react'
import { Box, Button, Stack, Text, Badge, ActionIcon } from '@mantine/core'
import { IconVolume, IconPlayerPlay } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { translations } from '@/lib/i18n'
import { useAudio } from '@/contexts/AudioContext'
import { resolveAudioUrl } from '@/services/audioService'
import classes from './RecognitionMCQ.module.css'

const MAX_FAILURES = 0

interface ListeningMCQProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}

export function ListeningMCQ({ exerciseItem, userLanguage, onAnswer }: ListeningMCQProps) {
  const t = translations[userLanguage]
  const { learningItem, meanings, distractors } = exerciseItem
  const { audioMap, voiceId } = useAudio()
  const audioUrl = voiceId ? resolveAudioUrl(audioMap, learningItem!.base_text, voiceId) : undefined

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)

  const correctMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const correctAnswer = correctMeaning?.translation_text ?? ''

  const allOptions = [correctAnswer, ...(distractors ?? [])].slice(0, 4)
  const [shuffledOptions] = useState(() => [...allOptions].sort(() => Math.random() - 0.5))

  // Autoplay on mount
  useEffect(() => {
    if (!audioUrl) return
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.play()
      .then(() => setHasPlayedOnce(true))
      .catch(() => setAutoplayBlocked(true))
  }, [audioUrl])

  const tapToPlay = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.play().then(() => {
      setAutoplayBlocked(false)
      setHasPlayedOnce(true)
    }).catch(() => {})
  }

  const replay = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    audio.play().catch(() => {})
  }

  const handleSelectOption = (option: string) => {
    if (isAnswered || !hasPlayedOnce) return
    const isCorrect = option === correctAnswer
    setSelectedOption(option)
    setIsAnswered(true)
    if (isCorrect) {
      setTimeout(() => onAnswer(true, Date.now() - startTime - 1500), 1500)
    } else {
      setTimeout(() => onAnswer(false, Date.now() - startTime), 0)
    }
  }

  if (!audioUrl) {
    return (
      <Box className={classes.container}>
        <Stack gap="xl">
          <Text c="red">
            {userLanguage === 'nl' ? 'Audio niet beschikbaar voor deze oefening.' : 'Audio not available for this exercise.'}
          </Text>
          <Button onClick={() => onAnswer(false, Date.now() - startTime)}>
            {userLanguage === 'nl' ? 'Doorgaan' : 'Continue'}
          </Button>
        </Stack>
      </Box>
    )
  }

  if (autoplayBlocked) {
    return (
      <Box className={classes.container}>
        <Stack gap="xl" align="center">
          <Text size="lg">
            {userLanguage === 'nl' ? 'Klik om af te spelen' : 'Tap to play'}
          </Text>
          <ActionIcon size="xl" onClick={tapToPlay} aria-label="Play audio">
            <IconPlayerPlay size={32} />
          </ActionIcon>
        </Stack>
      </Box>
    )
  }

  const isCorrect = selectedOption === correctAnswer

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        <Box className={classes.wordSection}>
          <Text size="sm" c="dimmed" mb="xs">
            {userLanguage === 'nl' ? 'Luister en kies de juiste vertaling' : 'Listen and choose the correct translation'}
          </Text>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ActionIcon size="lg" onClick={replay} aria-label="Replay audio">
              <IconVolume size={24} />
            </ActionIcon>
            {isAnswered && (
              <Text size="xl" fw={700}>{learningItem!.base_text}</Text>
            )}
          </Box>
        </Box>

        <Stack gap="md">
          {shuffledOptions.map(option => {
            const isSelected = selectedOption === option
            const isCorrectOption = option === correctAnswer
            let statusClass = ''
            if (isAnswered && isSelected) statusClass = isCorrect ? classes.correct : classes.incorrect
            else if (isAnswered && isCorrectOption) statusClass = classes.showCorrect
            return (
              <Button
                key={option}
                onClick={() => handleSelectOption(option)}
                disabled={isAnswered || !hasPlayedOnce}
                className={`${classes.optionButton} ${statusClass}`}
                variant={isSelected ? 'filled' : 'light'}
                fullWidth size="lg"
              >
                {option}
              </Button>
            )
          })}
        </Stack>

        {isAnswered && (
          <Box style={{ textAlign: 'center', marginTop: '32px' }}>
            <Badge color={isCorrect ? 'green' : 'red'} size="xl">
              {isCorrect ? `✓ ${t.session.feedback.correct}` : `✗ ${t.session.feedback.incorrect}`}
            </Badge>
          </Box>
        )}
      </Stack>
    </Box>
  )
}
```

**Step 4: Add ExerciseShell dispatch branch**

In `src/components/exercises/ExerciseShell.tsx`, add a case to the `exerciseNode` switch (alongside the other dispatch branches):

```tsx
case 'listening_mcq':
  return (
    <ListeningMCQ
      key={exerciseKey}
      exerciseItem={exerciseItem}
      userLanguage={userLanguage}
      onAnswer={(wasCorrect, latencyMs) => {
        handleAnswerFromExercise(wasCorrect, false, latencyMs, null)
      }}
    />
  )
```

Import:
```tsx
import { ListeningMCQ } from './ListeningMCQ'
```

**Step 5: Run tests**

```bash
bun run test src/__tests__/listeningMcqExercise.test.tsx
```

**Step 6: Commit**

```bash
git add src/components/exercises/ListeningMCQ.tsx src/components/exercises/ExerciseShell.tsx src/__tests__/listeningMcqExercise.test.tsx
git commit -m "$(cat <<'EOF'
feat: ListeningMCQ component + ExerciseShell dispatch

Audio-only prompt with autoplay + autoplay-blocked fallback + replay.
Options disabled until audio has played once. Indonesian base_text
revealed only after answering. Error state when audio is missing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Session-builder wiring

### Task D.1: Thread audioMap + voiceId into buildSessionQueue and selectExercises

**Files:**
- Modify: `src/lib/sessionQueue.ts` (`SessionBuildInput` interface, `buildSessionQueue` signature, `selectExercises` signature)
- Modify: `src/pages/Session.tsx` (pass audioMap + voiceId)

**Step 1: Extend SessionBuildInput**

```ts
export interface SessionBuildInput {
  // ... existing fields ...
  audioMap?: AudioMap
  voiceId?: string | null
}
```

**Step 2: Pass through buildSessionQueue → selectExercises**

In `buildSessionQueue`, forward `input.audioMap` and `input.voiceId` to `selectExercises`. In `selectExercises`, add them as final optional parameters:

```ts
function selectExercises(
  candidate: CandidateItem,
  meaningsByItem: Record<string, ItemMeaning[]>,
  contextsByItem: Record<string, ItemContext[]>,
  variantsByItem: Record<string, ItemAnswerVariant[]>,
  exerciseVariantsByContext?: Record<string, ExerciseVariant[]>,
  userLanguage: 'en' | 'nl' = 'en',
  allItems: LearningItem[] = [],
  audioMap?: AudioMap,
  voiceId?: string | null,
): ExerciseItem[]
```

**Step 3: Update Session.tsx to pass audioMap + voiceId**

Find where `buildSessionQueue(...)` is called in `src/pages/Session.tsx`. The component already fetches `audioMap` for `AudioContext.Provider`; pass the same values into `buildSessionQueue`:

```tsx
const queue = buildSessionQueue({
  // ... existing fields ...
  audioMap,
  voiceId,
})
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
bun run build
```

Expected: passes. No behavior change — audioMap/voiceId just flow through but aren't used yet.

**Step 5: Commit**

```bash
git add src/lib/sessionQueue.ts src/pages/Session.tsx
git commit -m "$(cat <<'EOF'
feat: thread audioMap + voiceId through buildSessionQueue

Session.tsx already fetches audioMap for AudioContext; forward the same
values into the session builder so selectExercises can check audio
availability (Task D.2).

No behavior change in this commit — plumbing only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task D.2: Add stage-rotation branches + gating for listening_mcq

**Files:**
- Modify: `src/lib/sessionQueue.ts` (selectExercises stage branches)

**Step 1: Write the failing tests**

Add to `src/__tests__/sessionQueue.test.ts`:

```ts
describe('selectExercises — listening_mcq gating', () => {
  it('listening_mcq never scheduled at new stage', () => {
    // Item at stage='new' with audio + canListen; assert never returns listening_mcq
    // across 20 runs.
  })

  it('listening_mcq never scheduled for sentence-type items', () => {
    // Sentence item at anchoring; assert no listening_mcq.
  })

  it('listening_mcq scheduled at anchoring when all gates pass', () => {
    // Word item at anchoring with audio + listening_enabled=true + flag=true.
    // 100-run random sample; assert listening_mcq appears at least once.
  })

  it('listening_mcq not scheduled when audio missing', () => {
    // Same as above but audioMap.get(voiceId)?.get(baseText) is undefined.
    // Assert listening_mcq never appears.
  })

  it('listening_mcq not scheduled when listening_enabled=false', () => {
    // User setting disabled. Assert listening_mcq never appears.
    // Note: listening_enabled is read inside selectExercises either via a
    // function parameter, a global getter, or a new SessionBuildInput field.
    // Use the same approach as featureFlags (read at call-time).
  })
})
```

**Step 2: Update selectExercises**

The simplest approach to passing `listening_enabled` into `selectExercises`: read it via `getListeningEnabled()` from `src/lib/listeningPreferences.ts` at the top of `selectExercises`. The function is already module-coupled to runtime state; localStorage read is cheap. Alternative: add `listeningEnabled: boolean` to `SessionBuildInput` — cleaner, more testable. **Prefer the SessionBuildInput field** for testability.

Add to `SessionBuildInput`:

```ts
listeningEnabled?: boolean   // default true
```

In `selectExercises`, compute the guard once:

```ts
const featureEnabled = isExerciseTypeEnabled('listening_mcq')
const userEnabled = input.listeningEnabled !== false
const canListen =
  featureEnabled && userEnabled &&
  (item.item_type === 'word' || item.item_type === 'phrase') &&
  !isSentenceType &&
  stage !== 'new' &&
  hasAudioFor(item, audioMap ?? new Map(), voiceId ?? null)
```

(Note: `selectExercises` takes `candidate` not `input` — adjust by threading `listeningEnabled` through `buildSessionQueue` to `selectExercises` as another optional parameter, same treatment as `audioMap`/`voiceId`.)

**Anchoring-stage carve** — replace the current roll structure with:

```ts
if (stage === 'anchoring' && !hasAnchorContext) {
  const roll = Math.random()
  if (roll < 0.30) exercises.push(makeCuedRecall(...))
  else if (roll < 0.55) exercises.push(makeMeaningRecall(...))
  else if (canListen && roll < 0.70) exercises.push(makeListeningMcq(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
  else exercises.push(makeRecognitionMCQ(...))
}
```

For the `hasAnchorContext` anchoring branch at `sessionQueue.ts:409–418` — the current rolls are `cued_recall` 25%, `meaning_recall` 25%, `cloze_mcq` 20%, `recognition_mcq` tail 30% (roll ≥ 0.70). Split the recognition_mcq 30% tail 50/50 when `canListen` — the concrete code:

```ts
if (stage === 'anchoring' && hasAnchorContext) {
  const roll = Math.random()
  if (roll < 0.25) exercises.push(makeCuedRecall(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
  else if (roll < 0.50) exercises.push(makeMeaningRecall(item, meanings, contexts, variants))
  else if (roll < 0.70) exercises.push(makeClozeMcq(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
  else if (canListen && roll < 0.85) exercises.push(makeListeningMcq(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
  else exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
}
```

Net when `canListen` is true: 15% listening, 15% recognition — matches the spec table's "~15% anchoring" figure.

**Productive/maintenance word branch** — replace the existing `else` at `sessionQueue.ts:475` with:

```ts
} else {
  // Last slice (roll >= 0.80, which is 20% of productive/maintenance):
  // Split 50/50 between listening_mcq and recognition_mcq when canListen.
  // Net: ~10% listening, ~10% recognition — preserves the 20% recognition-skill
  // budget while adding audio-recognition practice. Matches Spec 3 table.
  if (canListen && Math.random() < 0.5) {
    exercises.push(makeListeningMcq(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
  } else {
    exercises.push(makeRecognitionMCQ(item, meanings, contexts, variants, userLanguage, allItems, meaningsByItem))
  }
}
```

**No carve at retrieving** — per the spec's final selection table, listening_mcq is not scheduled at retrieving. Leave `retrieving` branch unchanged.

**Step 3: Bubble Session.tsx's listening context value into the build**

```tsx
const { listeningEnabled } = useListening()
// ...
buildSessionQueue({ ..., listeningEnabled })
```

**Step 4: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

**Step 5: Run the full regression gate**

```bash
bun run test
```

**Step 6: Commit**

```bash
git add src/lib/sessionQueue.ts src/pages/Session.tsx src/__tests__/sessionQueue.test.ts
git commit -m "$(cat <<'EOF'
feat: schedule listening_mcq at anchoring and productive/maintenance

Carves:
- Anchoring: 15% of the recognition_mcq slice → listening_mcq when canListen
- Productive/maintenance word: 50% of the recognition_mcq tail slice →
  listening_mcq when canListen

Gating: feature flag + listening_enabled user setting + audio present +
word/phrase item + stage ≠ new. Falls back to recognition_mcq if any
gate fails — zero user-visible disruption.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase E — Settings UI

### Task E.1: Profile-page toggle

**Files:**
- Modify: `src/pages/Profile.tsx` — verified via `grep -rln "useAutoplay" src/pages`; the autoplay toggle lives at `src/pages/Profile.tsx:33`. Add the listening toggle alongside it. There is no `Settings.tsx` in the repo; user preferences live on the Profile page.

**Step 1: Add the toggle**

Near the existing autoplay toggle, add:

```tsx
import { useListening } from '@/contexts/ListeningContext'

// Inside the component:
const { listeningEnabled, setListeningEnabled } = useListening()

// In the JSX, near the autoplay Switch:
<Switch
  checked={listeningEnabled}
  onChange={(e) => setListeningEnabled(e.currentTarget.checked)}
  label={userLanguage === 'nl' ? 'Luisteroefeningen inschakelen' : 'Enable listening exercises'}
  description={
    userLanguage === 'nl'
      ? 'Luisteren en dictation. Schakel uit als je geen audio kunt horen.'
      : 'Listening and dictation. Disable if you cannot hear audio.'
  }
/>
```

The Dutch / English labels align with the shared-toggle decision (setting covers both listening_mcq and dictation — see Spec 4).

**Step 2: Manual verify in dev server**

```bash
bun run dev
```

Navigate to Settings, toggle the switch, reload the page, verify persistence via localStorage.

**Step 3: Commit**

```bash
git add src/pages/Profile.tsx
git commit -m "$(cat <<'EOF'
feat: profile page toggle for listening_enabled

Shared toggle controls both listening_mcq (this spec) and dictation
(Spec 4). Disables all audio-prompt exercises for accessibility.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task E.2: Health check additions

**Files:**
- Modify: `scripts/check-supabase-deep.ts`

**Step 0: Add `audio_coverage_report` SQL function to migration.sql**

The existing `check-supabase-deep.ts` (`src/scripts/check-supabase-deep.ts:66, 224`) uses the pattern `supabase.rpc('schema_health')` / `supabase.rpc('get_audio_clips', ...)` — one server-side function invoked, not client-side joins. Follow this idiom.

Append to `scripts/migration.sql`:

```sql
-- Audio coverage report for check-supabase-deep
CREATE OR REPLACE FUNCTION indonesian.audio_coverage_report()
RETURNS TABLE(total_word_phrase bigint, with_audio bigint, without_audio bigint)
LANGUAGE sql STABLE SET search_path = indonesian AS $$
  WITH targets AS (
    SELECT li.id, li.normalized_text
    FROM learning_items li
    WHERE li.item_type IN ('word', 'phrase')
  ),
  covered AS (
    SELECT DISTINCT t.id
    FROM targets t
    JOIN audio_clips ac ON ac.normalized_text = t.normalized_text
  )
  SELECT
    (SELECT count(*) FROM targets) AS total_word_phrase,
    (SELECT count(*) FROM covered) AS with_audio,
    (SELECT count(*) FROM targets) - (SELECT count(*) FROM covered) AS without_audio;
$$;

GRANT EXECUTE ON FUNCTION indonesian.audio_coverage_report() TO authenticated;
```

Run `make migrate` to install. Idempotent via `CREATE OR REPLACE`.

**Step 1: Add two checks in check-supabase-deep.ts**

```ts
// ── exercise_type_availability has listening_mcq ──────────────────────────
const { data: availRow } = await supabase.schema('indonesian')
  .from('exercise_type_availability')
  .select('exercise_type, session_enabled')
  .eq('exercise_type', 'listening_mcq')
  .maybeSingle()

if (!availRow) fail('listening_mcq row missing from exercise_type_availability')
else if (!availRow.session_enabled) fail('listening_mcq is not session_enabled')
else pass('listening_mcq registered and session_enabled')

// ── Audio coverage for word/phrase items ──────────────────────────────
const { data: coverage } = await supabase.schema('indonesian').rpc('audio_coverage_report')
if (coverage?.[0]) {
  const { total_word_phrase, with_audio, without_audio } = coverage[0]
  console.log(`  Audio coverage: ${with_audio}/${total_word_phrase} word/phrase items (${without_audio} missing)`)
  // Informational, not fail/pass — missing audio is expected for lessons
  // that haven't run generate-exercise-audio.ts yet.
}
```

**Step 2: Run check**

```bash
make check-supabase-deep
```

**Step 3: Commit**

```bash
git add scripts/migration.sql scripts/check-supabase-deep.ts
git commit -m "$(cat <<'EOF'
feat: audio_coverage_report RPC + check-supabase-deep integration

Adds a server-side function reporting word/phrase audio coverage in a
single RPC call, following the existing schema_health / get_audio_clips
idiom. check-supabase-deep.ts also verifies the listening_mcq seed row.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification

After all phases are committed:

```bash
bun run test                 # full suite green
bun run lint                 # no new lint errors
bun run build                # production build succeeds
make check-supabase-deep     # seed row + audio coverage
```

Manual smoke test:
- Dev server: `bun run dev`
- Log in. Navigate to a session with anchoring-stage items.
- Verify `listening_mcq` surfaces (it may take a few retries due to the 15% roll). Verify audio autoplays on presentation and that no Indonesian text is visible before answering.
- Toggle listening off in Settings. Start a new session. Verify `listening_mcq` never surfaces.
- Toggle listening on. Open browser devtools → Network tab → simulate offline or throttle to see the "Tap to play" overlay fallback.

---

## Summary

| Task | Phase | Description | Commit | Dependencies |
|---|---|---|---|---|
| A.1 | Types | exerciseType union | feat: add listening_mcq to ExerciseItem.exerciseType union | None |
| A.2 | Flag | Feature flag | feat: add VITE_FEATURE_LISTENING_MCQ feature flag | None |
| A.3 | Seed | Migration seed row | feat: seed exercise_type_availability row for listening_mcq | None |
| A.4 | Setting | listening_enabled + context | feat: add listening_enabled user setting + ListeningContext | None |
| B.1 | Builder | makeListeningMcq + hasAudioFor | feat: add makeListeningMcq builder and hasAudioFor helper | A.1, A.3; soft dep on Spec 2 Phase C |
| C.1 | Component | ListeningMCQ.tsx + shell dispatch | feat: ListeningMCQ component + ExerciseShell dispatch | A.1, B.1 |
| D.1 | Plumbing | audioMap/voiceId threading | feat: thread audioMap + voiceId through buildSessionQueue | None (plumbing) |
| D.2 | Selection | Stage-rotation branches | feat: schedule listening_mcq at anchoring and productive/maintenance | B.1, C.1, D.1 |
| E.1 | UI | Settings toggle | feat: settings page toggle for listening_enabled | A.4 |
| E.2 | Health | Health-check additions | feat: check-supabase-deep covers listening_mcq seed + audio coverage | A.3 |

### Ordering constraints

- Phase A is independent (4 small tasks, can be one session).
- Phase B depends on A.1 (type). Soft dep on Spec 2 Phase C (cascade helper). If Spec 2 Phase C is not yet landed, B.1 inlines a same-level shuffle with a TODO.
- Phase C depends on B.1 (the type exists, the builder exists, dispatch points to the component).
- Phase D is the behavior-changing phase. D.1 is plumbing only; D.2 enables scheduling.
- Phase E.1 depends on A.4; E.2 depends on A.3.

### Estimated session count

- Session 1: Phase A (types, flag, seed, setting context) + Phase B (builder)
- Session 2: Phase C (component) + Phase D (plumbing + scheduling)
- Session 3: Phase E (UI toggle + health checks) + manual smoke test
