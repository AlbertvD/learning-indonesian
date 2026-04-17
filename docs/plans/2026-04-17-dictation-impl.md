# Dictation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the `dictation` exercise type — audio-only Indonesian prompt, typed free-text Indonesian answer. Highest-impact exercise in the SLA literature (Elgort 2011). Runtime-built, no content authoring, reuses existing audio infrastructure, `checkAnswer` grading, and the `listening_enabled` user setting from Spec 3.

**Design doc:** `docs/plans/2026-04-17-dictation-design.md`

**Dependencies:**
- **Spec 3 impl plan** (`listening-mcq-impl.md`) should land Phase A (types, feature flag, seed), Phase A.4 (`listening_enabled` + `ListeningContext`), and Phase D.1 (`audioMap`/`voiceId` threading into `buildSessionQueue`). Spec 4 extends all three rather than duplicating them.
- **Spec 2 impl plan** (`pos-aware-distractors-impl.md`) Phase C is not required — dictation has no distractors.

**Tech stack:** React 19, TypeScript, Vitest, @testing-library/react, @mantine/core.

---

## Phase A — Types, flag, seed

### Task A.1: Add `dictation` to the exerciseType union

**Files:**
- Modify: `src/types/learning.ts`

**Step 1: Extend the exerciseType union**

```ts
exerciseType: ... | 'listening_mcq' | 'dictation'
```

No nested payload field — dictation uses `learningItem.base_text` and `answerVariants` like `typed_recall`.

**Step 2: Typecheck**

```bash
bun run build
```

Expected: passes. The `ExerciseShell.tsx` switch has a `default:` case returning "Unsupported exercise type", so TypeScript does **not** flag the missing `dictation` branch at build time — the safety net is runtime-only. The Task C.1 dispatch addition is required but is not enforced by the compiler.

**Step 3: Commit**

```bash
git add src/types/learning.ts
git commit -m "$(cat <<'EOF'
feat: add dictation to ExerciseItem.exerciseType union

Reuses learningItem + answerVariants shape — same as typed_recall.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A.2: Add feature flag

**Files:**
- Modify: `src/lib/featureFlags.ts`
- Modify: existing feature-flag test file (path confirmed in Spec 3 Task A.2)

**Step 1: Write the failing test**

Add to the same test file used in Spec 3 Task A.2:

```ts
describe('isExerciseTypeEnabled — dictation', () => {
  it('is enabled by default', () => {
    expect(isExerciseTypeEnabled('dictation')).toBe(true)
  })
})
```

**Step 2: Update featureFlags.ts**

Add to the `FeatureFlags` interface, the `featureFlags` export, and `isExerciseTypeEnabled`:

```ts
interface FeatureFlags {
  // ... existing ...
  dictation: boolean
}

export const featureFlags: FeatureFlags = {
  // ... existing ...
  dictation: parseEnvFlag('VITE_FEATURE_DICTATION'),
}

export function isExerciseTypeEnabled(exerciseType: string): boolean {
  switch (exerciseType) {
    // ... existing ...
    case 'dictation':
      return featureFlags.dictation
    // ... existing core types and default ...
  }
}
```

**Step 3: Run tests**

```bash
bun run test src/__tests__/featureFlags.test.ts
```

**Step 4: Commit**

```bash
git add src/lib/featureFlags.ts src/__tests__/featureFlags.test.ts
git commit -m "$(cat <<'EOF'
feat: add VITE_FEATURE_DICTATION feature flag

Default true. To disable at deployment: VITE_FEATURE_DICTATION=false.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A.3: Seed `exercise_type_availability` row

**Files:**
- Modify: `scripts/migration.sql` (append after the Spec 3 listening_mcq seed row)

**Step 1: Append the seed row**

```sql
INSERT INTO indonesian.exercise_type_availability
  (exercise_type, session_enabled, authoring_enabled, requires_approved_content, rollout_phase, notes)
VALUES
  ('dictation', true, false, false, 'alpha',
   'Audio-only Indonesian prompt, typed Indonesian answer. Runtime-built. Free text with fuzzy grading.')
ON CONFLICT (exercise_type) DO NOTHING;
```

`exercise_type` is PRIMARY KEY (verified in Spec 3) — `ON CONFLICT` is valid.

**Step 2: Run migration**

```bash
make migrate
```

**Step 3: Commit**

```bash
git add scripts/migration.sql
git commit -m "$(cat <<'EOF'
feat: seed exercise_type_availability row for dictation

Session-enabled, authoring-disabled, alpha rollout phase.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Builder

### Task B.1: Add `makeDictation` builder

**Files:**
- Modify: `src/lib/sessionQueue.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/sessionQueue.test.ts`:

```ts
import { makeDictation } from '@/lib/sessionQueue'

describe('makeDictation', () => {
  it('builds an ExerciseItem with exerciseType dictation and skillType form_recall', () => {
    const item = makeItem('i1')
    const meanings = [makeMeaning('i1')]
    const exercise = makeDictation(item, meanings, [], [])
    expect(exercise.exerciseType).toBe('dictation')
    expect(exercise.skillType).toBe('form_recall')
    expect(exercise.learningItem).toBe(item)
  })
})
```

**Step 2: Implement**

```ts
/** @internal exported for tests */
export function makeDictation(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
): ExerciseItem {
  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'form_recall',
    exerciseType: 'dictation',
  }
}
```

Structurally identical to `makeTypedRecall` at `src/lib/sessionQueue.ts:603` — only `exerciseType` differs.

**Step 3: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts
```

**Step 4: Commit**

```bash
git add src/lib/sessionQueue.ts src/__tests__/sessionQueue.test.ts
git commit -m "$(cat <<'EOF'
feat: add makeDictation builder

Dead code until Phase C wires the component and Phase D wires
selectExercises.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — Component

### Task C.1: Build `Dictation` component + dispatch

**Files:**
- Create: `src/components/exercises/Dictation.tsx`
- Create: `src/__tests__/dictationExercise.test.tsx`
- Modify: `src/components/exercises/ExerciseShell.tsx` (add dispatch case)

**Step 1: Write the failing tests**

```tsx
// src/__tests__/dictationExercise.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { AudioProvider } from '@/contexts/AudioContext'
import { Dictation } from '@/components/exercises/Dictation'
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
    id: 'i1', item_type: 'word', base_text: 'Apa kabar?', normalized_text: 'apa kabar',
    language: 'id', level: 'A1', source_type: 'lesson', source_vocabulary_id: null,
    source_card_id: null, notes: null, is_active: true, pos: 'greeting',
    created_at: '', updated_at: '',
  },
  meanings: [{
    id: 'm1', learning_item_id: 'i1', translation_language: 'nl',
    translation_text: 'Hoe gaat het?', is_primary: true, sense_label: null, usage_note: null,
  }],
  contexts: [],
  answerVariants: [],
  skillType: 'form_recall',
  exerciseType: 'dictation',
}

describe('Dictation', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not display the Indonesian base_text before answering', () => {
    const audioMap = new Map([['voice-1', new Map([['apa kabar?', 'tts/voice-1/apa-xyz.mp3']])]])
    wrap(<Dictation exerciseItem={baseExercise} userLanguage="nl" onAnswer={vi.fn()} />, audioMap)
    expect(screen.queryByText('Apa kabar?')).toBeNull()
  })

  it('calls onAnswer(true, false, ...) on exact typed match', async () => {
    const audioMap = new Map([['voice-1', new Map([['apa kabar?', 'tts/voice-1/apa-xyz.mp3']])]])
    const onAnswer = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    // Mock autoplay success so input becomes enabled
    HTMLAudioElement.prototype.play = vi.fn(() => Promise.resolve())
    wrap(<Dictation exerciseItem={baseExercise} userLanguage="nl" onAnswer={onAnswer} />, audioMap)
    await vi.waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled())
    await user.type(screen.getByRole('textbox'), 'Apa kabar?')
    await user.click(screen.getByRole('button', { name: /check|controleer/i }))
    vi.advanceTimersByTime(2000)
    expect(onAnswer).toHaveBeenCalledWith(true, false, expect.any(Number), 'Apa kabar?')
  })

  it('punctuation-insensitive: "apa kabar" matches "Apa kabar?" as exact (non-fuzzy)', async () => {
    const audioMap = new Map([['voice-1', new Map([['apa kabar?', 'tts/voice-1/apa-xyz.mp3']])]])
    const onAnswer = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    HTMLAudioElement.prototype.play = vi.fn(() => Promise.resolve())
    wrap(<Dictation exerciseItem={baseExercise} userLanguage="nl" onAnswer={onAnswer} />, audioMap)
    await vi.waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled())
    await user.type(screen.getByRole('textbox'), 'apa kabar')
    await user.keyboard('{Enter}')
    vi.advanceTimersByTime(2000)
    expect(onAnswer).toHaveBeenCalledWith(true, false, expect.any(Number), 'apa kabar')
  })

  it('fuzzy match (insertion) fires isFuzzy=true', async () => {
    const audioMap = new Map([['voice-1', new Map([['apa kabar?', 'tts/voice-1/apa-xyz.mp3']])]])
    const onAnswer = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    HTMLAudioElement.prototype.play = vi.fn(() => Promise.resolve())
    wrap(<Dictation exerciseItem={baseExercise} userLanguage="nl" onAnswer={onAnswer} />, audioMap)
    await vi.waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled())
    await user.type(screen.getByRole('textbox'), 'apa kabarr')  // extra r, insertion
    await user.keyboard('{Enter}')
    vi.advanceTimersByTime(2000)
    expect(onAnswer).toHaveBeenCalledWith(true, true, expect.any(Number), 'apa kabarr')
  })

  it('wrong answer calls onAnswer(false, false, ..., response)', async () => {
    const audioMap = new Map([['voice-1', new Map([['apa kabar?', 'tts/voice-1/apa-xyz.mp3']])]])
    const onAnswer = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    HTMLAudioElement.prototype.play = vi.fn(() => Promise.resolve())
    wrap(<Dictation exerciseItem={baseExercise} userLanguage="nl" onAnswer={onAnswer} />, audioMap)
    await vi.waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled())
    await user.type(screen.getByRole('textbox'), 'selamat pagi')
    await user.keyboard('{Enter}')
    vi.advanceTimersByTime(100)
    expect(onAnswer).toHaveBeenCalledWith(false, false, expect.any(Number), 'selamat pagi')
  })

  it('renders error state when audio missing', () => {
    wrap(<Dictation exerciseItem={baseExercise} userLanguage="nl" onAnswer={vi.fn()} />, new Map())
    expect(screen.getByText(/niet beschikbaar|not available/i)).toBeInTheDocument()
  })

  it('autoplay-blocked: tap-to-play overlay renders, input disabled', async () => {
    HTMLAudioElement.prototype.play = vi.fn(() => Promise.reject(new Error('blocked')))
    const audioMap = new Map([['voice-1', new Map([['apa kabar?', 'tts/voice-1/apa-xyz.mp3']])]])
    wrap(<Dictation exerciseItem={baseExercise} userLanguage="nl" onAnswer={vi.fn()} />, audioMap)
    await vi.waitFor(() => expect(screen.getByText(/tap to play|klik om af te spelen/i)).toBeInTheDocument())
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('autoplay-succeeds: input enabled and focused', async () => {
    HTMLAudioElement.prototype.play = vi.fn(() => Promise.resolve())
    const audioMap = new Map([['voice-1', new Map([['apa kabar?', 'tts/voice-1/apa-xyz.mp3']])]])
    wrap(<Dictation exerciseItem={baseExercise} userLanguage="nl" onAnswer={vi.fn()} />, audioMap)
    await vi.waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled())
  })

  it('empty-submit does nothing', async () => {
    const audioMap = new Map([['voice-1', new Map([['apa kabar?', 'tts/voice-1/apa-xyz.mp3']])]])
    const onAnswer = vi.fn()
    HTMLAudioElement.prototype.play = vi.fn(() => Promise.resolve())
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    wrap(<Dictation exerciseItem={baseExercise} userLanguage="nl" onAnswer={onAnswer} />, audioMap)
    await vi.waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled())
    await user.keyboard('{Enter}')
    vi.advanceTimersByTime(2000)
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('input disables autocorrect/autocapitalize/spellcheck', () => {
    HTMLAudioElement.prototype.play = vi.fn(() => Promise.resolve())
    const audioMap = new Map([['voice-1', new Map([['apa kabar?', 'tts/voice-1/apa-xyz.mp3']])]])
    wrap(<Dictation exerciseItem={baseExercise} userLanguage="nl" onAnswer={vi.fn()} />, audioMap)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveAttribute('autocapitalize', 'off')
    expect(input).toHaveAttribute('autocorrect', 'off')
    expect(input).toHaveAttribute('spellcheck', 'false')
  })
})
```

**Step 2: Run tests, confirm failure**

```bash
bun run test src/__tests__/dictationExercise.test.tsx
```

**Step 3: Implement Dictation.tsx**

```tsx
// src/components/exercises/Dictation.tsx
import { useState, useRef, useEffect } from 'react'
import { Box, Button, Stack, Text, Badge, ActionIcon, TextInput } from '@mantine/core'
import { IconVolume, IconPlayerPlay, IconArrowRight } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { checkAnswer } from '@/lib/answerNormalization'
import { translations } from '@/lib/i18n'
import { useAudio } from '@/contexts/AudioContext'
import { resolveAudioUrl } from '@/services/audioService'
import classes from './TypedRecall.module.css'

interface DictationProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function Dictation({ exerciseItem, userLanguage, onAnswer }: DictationProps) {
  const t = translations[userLanguage]
  const learningItem = exerciseItem.learningItem!
  const { audioMap, voiceId } = useAudio()
  const audioUrl = voiceId ? resolveAudioUrl(audioMap, learningItem.base_text, voiceId) : undefined

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [response, setResponse] = useState('')
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)

  const variants = (exerciseItem.answerVariants ?? []).map(v => v.variant_text)
  const result = checkAnswer(response, learningItem.base_text, variants)

  useEffect(() => {
    if (!audioUrl) return
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.play()
      .then(() => {
        setHasPlayedOnce(true)
        setTimeout(() => inputRef.current?.focus(), 0)
      })
      .catch(() => setAutoplayBlocked(true))
  }, [audioUrl])

  const tapToPlay = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.play().then(() => {
      setAutoplayBlocked(false)
      setHasPlayedOnce(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    }).catch(() => {})
  }

  const replay = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    audio.play().catch(() => {})
  }

  const handleSubmit = () => {
    if (isAnswered || !response.trim() || !hasPlayedOnce) return
    setIsAnswered(true)
    const FEEDBACK_DELAY_MS = result.isCorrect ? 1500 : 0
    setTimeout(() => {
      onAnswer(result.isCorrect, result.isFuzzy, Date.now() - startTime - FEEDBACK_DELAY_MS, response)
    }, FEEDBACK_DELAY_MS)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isAnswered) handleSubmit()
  }

  if (!audioUrl) {
    return (
      <Box className={classes.container}>
        <Stack gap="xl">
          <Text c="red">
            {userLanguage === 'nl' ? 'Audio niet beschikbaar voor deze oefening.' : 'Audio not available for this exercise.'}
          </Text>
          <Button onClick={() => onAnswer(false, false, Date.now() - startTime, '')}>
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
          <TextInput disabled value="" size="lg" placeholder={t.session.recall.placeholder} />
        </Stack>
      </Box>
    )
  }

  const isCorrect = result.isCorrect

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        <Box className={classes.promptSection}>
          <Text size="sm" c="dimmed" mb="xs">
            {userLanguage === 'nl' ? 'Luister en typ wat je hoort' : 'Listen and type what you hear'}
          </Text>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ActionIcon size="lg" onClick={replay} aria-label="Replay audio">
              <IconVolume size={24} />
            </ActionIcon>
            {isAnswered && (
              <Text size="xl" fw={700} c={isCorrect ? 'green' : 'red'}>
                {learningItem.base_text}
              </Text>
            )}
          </Box>
        </Box>

        <Box>
          <TextInput
            ref={inputRef}
            value={response}
            onChange={(e) => setResponse(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={isAnswered || !hasPlayedOnce}
            size="lg"
            placeholder={t.session.recall.placeholder}
            aria-label="Dictation answer input"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </Box>

        {!isAnswered && (
          <Button
            onClick={handleSubmit}
            disabled={!response.trim() || !hasPlayedOnce}
            size="lg"
            fullWidth
            rightSection={<IconArrowRight size={18} />}
          >
            {t.session.feedback.check}
          </Button>
        )}

        {isAnswered && (
          <Box style={{ textAlign: 'center', marginTop: '32px' }}>
            <Badge color={isCorrect ? 'green' : 'red'} size="xl">
              {isCorrect
                ? (result.isFuzzy ? t.session.feedback.almostCorrect : t.session.feedback.correct)
                : `✗ ${t.session.feedback.incorrect}`}
            </Badge>
            {/* Side-by-side reveal for fuzzy-corrects and wrong answers — prevents silent mis-teach per Spec 4 */}
            {(result.isFuzzy || !isCorrect) && (
              <Box mt="lg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Box>
                  <Text size="xs" c="dimmed">
                    {userLanguage === 'nl' ? 'Je typte' : 'You typed'}
                  </Text>
                  <Text size="lg" fw={600}>{response}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">
                    {userLanguage === 'nl' ? 'Doel' : 'Target'}
                  </Text>
                  <Text size="lg" fw={600} c="green">{learningItem.base_text}</Text>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  )
}
```

The side-by-side reveal on fuzzy-corrects and wrong answers is the Spec 4 "silent mis-teach" mitigation — see Spec 4 §Fuzzy-match concern specific to dictation.

**Step 4: Add ExerciseShell dispatch branch**

In `src/components/exercises/ExerciseShell.tsx`, add a case to the exerciseNode switch:

```tsx
case 'dictation':
  return (
    <Dictation
      key={exerciseKey}
      exerciseItem={exerciseItem}
      userLanguage={userLanguage}
      onAnswer={(wasCorrect, isFuzzy, latencyMs, rawResponse) => {
        handleAnswerFromExercise(wasCorrect, isFuzzy, latencyMs, rawResponse)
      }}
    />
  )
```

Import:
```tsx
import { Dictation } from './Dictation'
```

**Step 5: Run tests**

```bash
bun run test src/__tests__/dictationExercise.test.tsx
```

**Step 6: Commit**

```bash
git add src/components/exercises/Dictation.tsx src/components/exercises/ExerciseShell.tsx src/__tests__/dictationExercise.test.tsx
git commit -m "$(cat <<'EOF'
feat: Dictation component + ExerciseShell dispatch

Audio-only prompt with autoplay + autoplay-blocked fallback + replay.
Typed free-text input with input-mode attributes disabled for Indonesian
orthography fidelity (autocorrect/autocapitalize/spellcheck all off).
Grading via existing checkAnswer — insertion/deletion/transposition
fuzzy within 1 edit; substitutions rejected.

Fuzzy-correct and wrong-answer reveals use side-by-side "you typed / target"
layout to surface the silent-mis-teach case (e.g. heard "tahu" typed "tahun").

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Session-builder wiring

### Task D.1: Update selectExercises — stage-rotation carves + due-skill options[]

**Files:**
- Modify: `src/lib/sessionQueue.ts`
- Modify: `src/lib/reviewHandler.ts` (exercise-to-skill mapping — add `dictation → form_recall`)

**Prerequisites from Spec 3:** `audioMap`, `voiceId`, `listeningEnabled`, and `hasAudioFor` are already threaded through `selectExercises`. Dictation reuses all four.

**Step 1: Write the failing tests**

Add to `src/__tests__/sessionQueue.test.ts`:

```ts
describe('selectExercises — dictation gating', () => {
  it('dictation never scheduled at new or anchoring stage', () => {
    // Item at stage='anchoring' with audio + canListen; 20-run assertion.
  })

  it('dictation never scheduled for sentence-type items', () => {
    // Sentence at retrieving; assert no dictation.
  })

  it('dictation scheduled at retrieving when canListen and word-type', () => {
    // Word item at retrieving with audio + canListen; 100-run random sample,
    // assert dictation appears at least once in the typed_recall slice.
  })

  it('dictation not scheduled when listening_enabled=false', () => {
    // Same listening_enabled toggle disables dictation.
  })

  it('due form_recall skill yields dictation, cloze, or typed_recall uniformly when all 3 eligible', () => {
    // Item with: hasAnchorContext=true, audio available, listening_enabled=true.
    // 300-run sample on due form_recall routing; assert each of the 3
    // appears at least 60 times (rough uniform distribution 33/33/33).
  })

  it('due form_recall skill yields 50/50 dictation/typed_recall when canListen but no cloze context', () => {
    // Item with: hasAnchorContext=false, audio available, listening_enabled=true.
    // 100-run sample; assert ~50/50 dictation/typed_recall, no cloze.
  })
})
```

**Step 2: Implement the due-skill form_recall branch refactor**

Find the due-skill branch in `selectExercises` at `sessionQueue.ts:394` and rewrite using the uniform `options[]` pattern per Spec 4:

```ts
case 'form_recall': {
  const options: Array<() => ExerciseItem> = [
    () => makeTypedRecall(item, meanings, contexts, variants),
  ]
  if (hasAnchorContext) options.push(() => makeClozeExercise(item, meanings, contexts, variants))
  if (canListen) options.push(() => makeDictation(item, meanings, contexts, variants))
  return [options[Math.floor(Math.random() * options.length)]()]
}
```

This gives uniform distribution over eligible options:
- All 3 eligible: 33/33/33 cloze/dictation/typed
- Audio only: 50/50 dictation/typed
- Cloze only: 50/50 cloze/typed
- Neither: 100% typed

**Step 3: Implement retrieving-stage carve**

At `sessionQueue.ts:437–446`, the current retrieving-word branch ends with `else → typed_recall` (final ~18%, roll ≥ 0.82). Split 50/50 with dictation:

```ts
} else {  // roll >= 0.82, the typed_recall tail
  exercises.push(
    canListen && Math.random() < 0.5
      ? makeDictation(item, meanings, contexts, variants)
      : makeTypedRecall(item, meanings, contexts, variants)
  )
}
```

Net: ~9% dictation, ~9% typed_recall — preserves the 18% form-recall-via-typed slice.

**Step 4: Implement productive/maintenance carve**

At `sessionQueue.ts:467–469`, the current productive-word rotation leads with `roll < 0.35 → typed_recall`. Split 50/50 with dictation:

```ts
if (roll < 0.35) {
  exercises.push(
    canListen && Math.random() < 0.5
      ? makeDictation(item, meanings, contexts, variants)
      : makeTypedRecall(item, meanings, contexts, variants)
  )
}
```

Net: ~17% dictation, ~17% typed_recall — preserves the 35% form-recall-typed budget.

**Step 5: `canListen` scope — hoist if needed, then add `canDictate`**

Spec 3's `canListen` computation covers the gates dictation needs:
- feature flag (listening_mcq)
- listening_enabled user setting
- word/phrase item_type
- audio available

**Hoisting check**: Spec 3's D.2 embeds `canListen` inline within each stage-rotation branch (anchoring, productive/maintenance) rather than computing it once at the top of `selectExercises`. Spec 4's due-skill refactor (Step 2 above) runs **before** any stage-rotation branch fires, so it needs `canListen` at function scope.

**Action**: in this task, hoist `canListen` to function scope in `selectExercises` alongside `hasAnchorContext` (currently at `sessionQueue.ts:383`). The hoist is a pure refactor of Spec 3's computation — no behavior change — and should be its own commit-worthy step if you want clean revertibility, or combined with Step 6 below.

```ts
// Near line 383, alongside hasAnchorContext
const hasAnchorContext = contexts.some(c => c.context_type === 'cloze')
const canListen =
  isExerciseTypeEnabled('listening_mcq') &&
  (input.listeningEnabled !== false) &&
  (item.item_type === 'word' || item.item_type === 'phrase') &&
  stage !== 'new' &&
  hasAudioFor(item, audioMap ?? new Map(), voiceId ?? null)
```

Then replace all inline `canListen` computations in the stage-rotation branches with references to this single scope variable. The anchoring and productive branches introduced in Spec 3 D.2 change from inline computation to reading the hoisted variable — zero behavior change.

**Add `canDictate` for the dictation-specific gate**:

```ts
const canDictate = canListen && isExerciseTypeEnabled('dictation')
```

Use `canDictate` in the dictation-specific branches above (this task's Steps 2, 3, 4). Listening_mcq branches continue to use `canListen`.

**Step 6: Update reviewHandler.ts exercise-to-skill map**

`src/lib/reviewHandler.ts` maintains a mapping from `exerciseType` to the skill row that gets updated on review. Dictation advances the existing `form_recall` skill. Add `dictation` to whatever mapping structure reviewHandler uses:

```bash
grep -n "exerciseType\|exercise_type" src/lib/reviewHandler.ts
```

Find the map (likely a switch statement or object literal keyed on `exerciseType`) and add:

```ts
case 'dictation':
  return 'form_recall'
```

or equivalent assignment per the file's existing idiom.

**Step 7: Run tests**

```bash
bun run test src/__tests__/sessionQueue.test.ts src/__tests__/reviewHandler.test.ts
```

**Step 8: Run the full regression gate**

```bash
bun run test
```

**Step 9: Commit**

```bash
git add src/lib/sessionQueue.ts src/lib/reviewHandler.ts src/__tests__/sessionQueue.test.ts
git commit -m "$(cat <<'EOF'
feat: schedule dictation at retrieving and productive/maintenance

Three changes to selectExercises:

1. Due-skill form_recall branch becomes a uniform pick over eligible
   options (typed_recall always + cloze if hasAnchorContext + dictation
   if canListen). When all three eligible: 33/33/33.

2. Retrieving-word typed_recall tail (roll >= 0.82) splits 50/50 with
   dictation when canDictate. Net ~9% dictation, ~9% typed.

3. Productive/maintenance-word typed_recall lead (roll < 0.35) splits
   50/50 with dictation. Net ~17% dictation, ~17% typed.

canDictate = canListen && VITE_FEATURE_DICTATION.

Also hoists canListen from inline (introduced by Spec 3) to function scope
so the due-skill branch can share it, and adds 'dictation → form_recall'
to reviewHandler.ts's exercise-to-skill map.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase E — UI + health

### Task E.1: Update Profile toggle copy

**Files:**
- Modify: `src/pages/Profile.tsx`

**Step 1: Update the toggle label and description**

In the `listening_enabled` Switch (added in Spec 3 Task E.1), update the label and description so the shared-toggle semantics are explicit:

```tsx
<Switch
  checked={listeningEnabled}
  onChange={(e) => setListeningEnabled(e.currentTarget.checked)}
  label={userLanguage === 'nl' ? 'Luister- en dicteeoefeningen' : 'Listening and dictation exercises'}
  description={
    userLanguage === 'nl'
      ? 'Schakel uit als je geen audio kunt horen of alleen tekstgebaseerd wilt oefenen.'
      : 'Disable if you cannot hear audio or prefer text-only practice.'
  }
/>
```

Same setting (`listening_enabled`), same state; only the visible label shifts to include dictation.

**Step 2: Verify in dev server**

```bash
bun run dev
```

**Step 3: Commit**

```bash
git add src/pages/Profile.tsx
git commit -m "$(cat <<'EOF'
feat: profile toggle copy reflects shared listening+dictation semantics

The listening_enabled user setting now gates both listening_mcq and
dictation. Label and description updated to state this.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task E.2: Health-check additions

**Files:**
- Modify: `scripts/check-supabase-deep.ts`

**Step 1: Add dictation seed-row check**

Alongside the listening_mcq check from Spec 3 Task E.2:

```ts
// ── exercise_type_availability has dictation ──────────────────────────────
const { data: dictationRow } = await supabase.schema('indonesian')
  .from('exercise_type_availability')
  .select('exercise_type, session_enabled')
  .eq('exercise_type', 'dictation')
  .maybeSingle()

if (!dictationRow) fail('dictation row missing from exercise_type_availability')
else if (!dictationRow.session_enabled) fail('dictation is not session_enabled')
else pass('dictation registered and session_enabled')
```

The `audio_coverage_report` RPC check from Spec 3 covers dictation as well — no duplicate needed.

**Step 2: Run**

```bash
make check-supabase-deep
```

**Step 3: Commit**

```bash
git add scripts/check-supabase-deep.ts
git commit -m "$(cat <<'EOF'
feat: check-supabase-deep verifies dictation seed row

Audio coverage reporting from Spec 3 covers dictation as well — no new
RPC needed.

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
make check-supabase-deep     # both seed rows + audio coverage
```

Manual smoke test:
- Dev server: `bun run dev`
- Log in. Navigate to a session with retrieving-stage or productive items (the admin test user has these).
- Verify `dictation` surfaces: audio autoplays, text input is focused, typing the correct Indonesian form advances; typing a Levenshtein-1 typo is treated as fuzzy-correct with the side-by-side reveal; typing a distant wrong answer shows the wrong-answer reveal.
- Toggle `listening_enabled` off in Profile. Start a new session. Verify dictation (and listening_mcq) never surface.

---

## Summary

| Task | Phase | Description | Commit | Dependencies |
|---|---|---|---|---|
| A.1 | Types | exerciseType union | feat: add dictation to ExerciseItem.exerciseType union | None |
| A.2 | Flag | Feature flag | feat: add VITE_FEATURE_DICTATION feature flag | None |
| A.3 | Seed | Migration seed row | feat: seed exercise_type_availability row for dictation | None |
| B.1 | Builder | makeDictation | feat: add makeDictation builder | A.1 |
| C.1 | Component | Dictation.tsx + shell dispatch | feat: Dictation component + ExerciseShell dispatch | A.1, B.1 |
| D.1 | Selection | Stage carves + due-skill refactor | feat: schedule dictation at retrieving and productive/maintenance | B.1, Spec 3 D.1 |
| E.1 | UI | Profile toggle copy update | feat: profile toggle copy reflects shared listening+dictation semantics | Spec 3 E.1 |
| E.2 | Health | Dictation seed-row check | feat: check-supabase-deep verifies dictation seed row | A.3 |

### Ordering constraints

- Spec 3 must land **A.4** (listening_enabled context), **D.1** (audioMap plumbing), and the `canListen` computation before Spec 4 D.1 can compose with them. This is the only hard cross-spec dependency.
- Within Spec 4: A → B → C → D; E.1 after Spec 3 E.1; E.2 after A.3.

### Estimated session count

- Session 1: Phase A (types + flag + seed) + Phase B (builder)
- Session 2: Phase C (component) + Phase D (selection logic)
- Session 3: Phase E (UI copy + health check) + manual smoke test
