# Exercise Types

`src/types/learning.ts` — `ExerciseType`, `ExerciseItem`

---

## Two categories

Exercise types fall into two fundamentally different categories based on how they are created and stored.

| Category | Types | Origin | Answer key location |
|---|---|---|---|
| **Vocabulary** | `recognition_mcq`, `cued_recall`, `meaning_recall`, `typed_recall`, `cloze_mcq`, `cloze` | Generated on-the-fly by `selectExercises` | Derived from `item_meanings` / `item.base_text` at runtime |
| **Grammar** | `cloze_mcq` (authored), `contrast_pair`, `sentence_transformation`, `constrained_translation`, `speaking` | Loaded from `exercise_variants` table, published by content pipeline | Stored in `answer_key_json` column |

Note: `cloze_mcq` appears in both categories — it can be generated at runtime for vocabulary (distractors from same-level items) or authored as a grammar variant (distractors are confusable grammar forms).

---

## Vocabulary exercise types

These types are generated in `sessionEngine.ts` at session-build time. No pre-authored content rows are needed. Distractors for MCQ types are drawn from other items at the same CEFR level.

### `recognition_mcq`

**Skill:** `recognition`

**Direction:** Indonesian → choose translation

**Stage usage:** `new`, `anchoring` (primary), **only** option at `productive`/`maintenance` for sentence items (not a fallback — it is the sole exercise type for sentence items beyond retrieving).

**Structure:**
```ts
{
  exerciseType: 'recognition_mcq',
  skillType: 'recognition',
  distractors: string[]   // 3 wrong translations from same-level items
  // correct answer derived from item_meanings at render time
}
```

Distractors are Fisher-Yates shuffled and capped at 3. The correct answer is the primary meaning in `userLanguage`.

### `typed_recall`

**Skill:** `form_recall`

**Direction:** Translation → type the Indonesian word/phrase

**Stage usage:** `retrieving` (primary), `productive`/`maintenance` rotation.

**Structure:**
```ts
{
  exerciseType: 'typed_recall',
  skillType: 'form_recall',
  // expected answer = item.base_text; accepted variants from item_answer_variants
}
```

Graded by matching `item.base_text` or any `ItemAnswerVariant.variant_text`. Note: the `is_accepted` field is not filtered at grading time — all variants are passed to the answer checker regardless of their `is_accepted` value.

### `cued_recall`

**Skill:** `meaning_recall`

**Direction:** Translation → choose the Indonesian word from 4 options

**Stage usage:** ~35% of `anchoring` stage (mixed with `recognition_mcq`), `productive`/`maintenance` rotation.

**Structure:**
```ts
{
  exerciseType: 'cued_recall',
  skillType: 'meaning_recall',
  cuedRecallData: {
    promptMeaningText: string    // the translation shown as cue
    cueText?: string             // optional additional cue text
    options: string[]            // 4 Indonesian options (1 correct + 3 distractors)
    correctOptionId: string      // item.base_text
    explanationText?: string     // shown after answer
  }
}
```

Distractors are `base_text` values from other items at the same level, Fisher-Yates shuffled. This type can be disabled via `VITE_FEATURE_CUED_RECALL=false`.

### `meaning_recall`

**Skill:** `meaning_recall`

**Direction:** Indonesian word → type the translation

**Stage usage:** `anchoring` (25% of rotation), `retrieving` (alongside `cloze_mcq` and `typed_recall`), `productive`/`maintenance` rotation.

**Structure:**
```ts
{
  exerciseType: 'meaning_recall',
  skillType: 'meaning_recall',
  // correct answer = primary meaning in userLanguage; all meanings in that language accepted as variants
}
```

Graded against all `ItemMeaning` rows for the user's language. The primary meaning is canonical; others are accepted variants. Uses the same fuzzy matching as `typed_recall`.

---

### `cloze_mcq`

**Skill:** `recognition`

**Direction:** Sentence with blank → choose the correct Indonesian word from 4 options

**Stage usage:** `anchoring` (20% when a cloze context exists), `retrieving` (40% for words with context, 60% for sentence-type items), `productive`/`maintenance` rotation.

**Dual use:** Generated at runtime for vocabulary (same-level item distractors), or authored as a grammar variant targeting confusable forms (e.g. `bukan`/`tidak`, `sudah`/`belum`, `yang` usage). Grammar-authored `cloze_mcq` variants are published via the content pipeline and surface at `retrieving`+ via `makePublishedExercise`.

**Structure:**
```ts
{
  exerciseType: 'cloze_mcq',
  skillType: 'recognition',
  clozeMcqData: {
    sentence: string        // Indonesian sentence with ___ placeholder
    translation: string | null
    options: string[]       // 4 Indonesian options (1 correct + 3 distractors)
    correctOptionId: string // the correct Indonesian word
  }
}
```

---

### `cloze`

**Skill:** `form_recall`

**Direction:** Complete the sentence by filling in the blank (typed)

**Stage usage:** `retrieving` for sentence-type items (40%), words with a `cloze`-type context (~18% at retrieving stage), `recall_sprint` mode.

**Structure:**
```ts
{
  exerciseType: 'cloze',
  skillType: 'form_recall',
  clozeContext: {
    sentence: string       // the sentence with ___ placeholder
    targetWord: string     // item.base_text (the answer)
    translation: string | null
  }
}
```

A `cloze`-type `ItemContext` is required for `selectExercises` to attempt a cloze exercise (`hasAnchorContext` check). `lesson_snippet` contexts are excluded at the selection stage. Note: `makeClozeExercise` itself has a broader fallback — if no `cloze`-type context is found it falls back to any context with `is_anchor_context === true`. The selection-stage guard in `selectExercises` prevents this fallback from firing in practice.

---

## Grammar exercise types

These types come from the `exercise_variants` table. They are not generated on-the-fly; they are authored content published through the content pipeline. Each variant stores `payload_json` (display) and `answer_key_json` (correctness) separately. See [content-pipeline.md](content-pipeline.md) for how they are authored and published.

Grammar items bypass the meanings filter during session building because all display content is contained in `payload_json`.

### `contrast_pair`

**Skill:** `recognition`

**Purpose:** Distinguish between two confusable forms by picking the correct one for a given meaning.

**Structure:**
```ts
{
  exerciseType: 'contrast_pair',
  skillType: 'recognition',
  contrastPairData: {
    promptText: string           // context sentence or situation description
    targetMeaning: string        // what the learner needs to express
    options: [string, string]    // exactly 2 Indonesian options
    correctOptionId: string      // from answer_key_json.correctOptionId
    explanationText: string      // shown after answer
  }
}
```

Can be disabled via `VITE_FEATURE_CONTRAST_PAIR=false`.

### `sentence_transformation`

**Skill:** `form_recall`

**Purpose:** Rewrite or transform a sentence according to a grammar instruction.

**Structure:**
```ts
{
  exerciseType: 'sentence_transformation',
  skillType: 'form_recall',
  sentenceTransformationData: {
    sourceSentence: string             // the sentence to transform
    transformationInstruction: string  // what to do (e.g. "Make this negative")
    acceptableAnswers: string[]        // from answer_key_json.acceptableAnswers
    hintText?: string
    explanationText: string
  }
}
```

Can be disabled via `VITE_FEATURE_SENTENCE_TRANSFORMATION=false`.

### `constrained_translation`

**Skill:** `meaning_recall`

**Purpose:** Translate a sentence using a specific target pattern (tests a grammar structure, not just vocabulary).

**Structure:**
```ts
{
  exerciseType: 'constrained_translation',
  skillType: 'meaning_recall',
  constrainedTranslationData: {
    sourceLanguageSentence: string      // sentence in Dutch or English
    requiredTargetPattern: string       // the grammar pattern that must appear
    acceptableAnswers: string[]         // from answer_key_json.acceptableAnswers
    disallowedShortcutForms?: string[]  // from answer_key_json.disallowedShortcutForms
    explanationText: string
  }
}
```

Can be disabled via `VITE_FEATURE_CONSTRAINED_TRANSLATION=false`.

### `speaking` (disabled)

**Skill:** `spoken_production`

**Purpose:** Produce spoken Indonesian for a given prompt.

**Status:** Disabled via DB (`exercise_type_availability.session_enabled = false`). The env-var flag (`VITE_FEATURE_SPEAKING`) defaults to `true` in code like all other flags — the DB gate is what disables it in practice. No speech recognition is wired up.

```ts
{
  exerciseType: 'speaking',
  skillType: 'spoken_production',
  speakingData: {
    promptText: string
    targetPatternOrScenario?: string
    transcript?: string       // post-session transcript (future use)
    selfRating?: number       // learner self-assessment (future use)
    confidenceScore?: number  // ASR confidence (future use)
  }
}
```

---

## Feedback model

**There is no shared feedback component.** `ExerciseFeedback.tsx` is a complete, implemented component but is not imported anywhere — it is effectively dead code.

Wrong-answer feedback is handled by `ExerciseShell.tsx`, which renders a hardcoded inline panel (correct answer + continue button) when an exercise is answered incorrectly. Individual exercise components handle the post-answer correct-answer display for their own correct-answer state. There is no modal, overlay, or separate feedback screen.

---

## Feature flag summary

| Type | Flag | Hardcoded enabled? |
|---|---|---|
| `recognition_mcq` | — | Yes — cannot be disabled |
| `typed_recall` | — | Yes — cannot be disabled |
| `cloze` | — | Yes — cannot be disabled |
| `cloze_mcq` | — | Yes — cannot be disabled |
| `meaning_recall` | — | Yes — cannot be disabled |
| `cued_recall` | `VITE_FEATURE_CUED_RECALL` | No |
| `contrast_pair` | `VITE_FEATURE_CONTRAST_PAIR` | No |
| `sentence_transformation` | `VITE_FEATURE_SENTENCE_TRANSFORMATION` | No |
| `constrained_translation` | `VITE_FEATURE_CONSTRAINED_TRANSLATION` | No |
| `speaking` | `VITE_FEATURE_SPEAKING` | No |

See [feature-flags.md](feature-flags.md) for the full gating logic.
