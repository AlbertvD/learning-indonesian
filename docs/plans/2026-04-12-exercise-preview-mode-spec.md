# Exercise Preview Mode — Spec

**Goal:** Replace the read-only summary card in the Content Review page with the actual exercise UI rendered in a non-interactive "preview" mode, showing both the question state and the answer state stacked in one card.

---

## Scope

Only the four grammar exercise types that exist in the DB today:

| Type | Component | CSS module |
|---|---|---|
| `contrast_pair` | `ContrastPairExercise` | `RecognitionMCQ.module.css` |
| `cloze_mcq` | `ClozeMcq` | `RecognitionMCQ.module.css` |
| `sentence_transformation` | `SentenceTransformationExercise` | `TypedRecall.module.css` |
| `constrained_translation` | `ConstrainedTranslationExercise` | `TypedRecall.module.css` |

Vocab types (`recognition_mcq`, `cued_recall`, `meaning_recall`, `typed_recall`, `cloze`, `speaking`) keep `ExerciseSummaryCard` as fallback. No schema changes.

---

## New props (all four components)

Each component's existing prop interface gets three changes:

```typescript
exerciseItem?: ExerciseItem   // was required — make optional (preview mode doesn't use it)
previewMode?: boolean
previewPayload?: Record<string, any>
```

Making `exerciseItem` optional is required so `renderExercisePreview` can call the components without supplying it. All existing call sites continue to pass `exerciseItem` — making it optional is backward-compatible.

When `previewMode={true}`, the component ignores `exerciseItem` entirely and renders the preview layout using `previewPayload` (which is `variant.payload_json` passed directly). The normal interactive code path is completely unchanged — it still reads from `exerciseItem` as before.

`onAnswer` remains required in the prop type but is never called in preview mode. All four components declare non-zero-argument signatures (recognition components: 2-arg `(wasCorrect, latencyMs) => void`; typed components: 4-arg `(wasCorrect, isFuzzy, latencyMs, rawResponse) => void`), so the caller must cast the no-op to avoid a TypeScript error in all cases:
```tsx
onAnswer={(() => {}) as any}
```
This cast is safe — `previewMode` guarantees the callback is never invoked.

---

## Preview layout (all four)

```
┌─────────────────────────────────────────┐
│  [Question half — disabled, non-interactive]  │
│                                               │
│  ──────────── Antwoord ────────────           │
│                                               │
│  [Answer half — correct state revealed]       │
└─────────────────────────────────────────┘
```

The divider uses Mantine `<Divider label="Antwoord" labelPosition="center" my="lg" />`.

The outer wrapper is the same `classes.container` box the component normally uses — same padding, same width. For `ContrastPairExercise` and `ClozeMcq` this comes from `RecognitionMCQ.module.css`; for `SentenceTransformationExercise` and `ConstrainedTranslationExercise` from `TypedRecall.module.css`.

---

## Per-component preview renders

### ContrastPairExercise

**Question half:**
- Wrap in `<Box className={classes.wordSection}>` — same wrapper as the live component (line 68 of `ContrastPairExercise.tsx`)
- Inside: `previewPayload.promptText` — `<Text size="sm" c="dimmed">`, same as normal prompt rendering
- 2 option buttons — `<Button className={classes.optionButton} variant="light" size="lg" fullWidth disabled>` for each option in `previewPayload.options`

**Answer half:**
- Same 2 buttons:
  - Correct option (`previewPayload.correctOptionId`): add `classes.showCorrect` (green, 0.7 opacity — identical to how the live component reveals the correct answer before advancing)
  - Incorrect option: `variant="light"` with no extra class (dimmed default)
- `previewPayload.targetMeaning` if present: `<Text size="sm" c="dimmed">{t.session.exercise.meaningLabel} {targetMeaning}</Text>`
- `previewPayload.explanationText` if present: `<Box style={{ padding: '16px', border: '1px solid var(--card-border)', borderRadius: 'var(--r-md)', background: 'var(--card-bg)' }}><Text size="sm">{explanationText}</Text></Box>`

---

### ClozeMcq

**Note on CSS:** `ClozeMcq` imports `RecognitionMCQ.module.css` and references `classes.option` (a native `<button>`) but that class does not exist in the module — the live component's option buttons currently render unstyled. In preview mode, use Mantine `<Button className={classes.optionButton} variant="light" size="lg" fullWidth disabled>` instead of native `<button>`, consistent with `ContrastPairExercise`. This also fixes the missing-class issue in the question half.

**Question half:**
- `<Text size="sm" c="dimmed">{t.session.exercise.chooseWord}</Text>`
- Sentence with blank — same inline rendering as the component already does (from `ClozeMcq.tsx` lines 70–87):
  ```tsx
  <Box className={classes.wordSection}>
    <Box className={classes.word} style={{ fontSize: '1.1rem', lineHeight: 1.6, fontWeight: 500 }}>
      {/* The inline style intentionally overrides classes.word's 4xl/bold defaults
          to match the cloze sentence rendering size — same as live component */}
      {parts[0]}
      <Box component="span" style={{ display: 'inline-block', minWidth: 80,
        borderBottom: '2px solid var(--accent-primary)', margin: '0 4px',
        verticalAlign: 'bottom', textAlign: 'center', color: 'transparent' }}>
        _
      </Box>
      {parts[1] ?? ''}
    </Box>
  </Box>
  ```
  The blank span shows `_` in `color: transparent` — visible as a blank underline, no text shown.
- 4 option buttons — `<Button className={classes.optionButton} variant="light" size="lg" fullWidth disabled>` (Mantine Button, not native `<button>`)

**Answer half:**
- Same sentence with blank, but blank span filled with `previewPayload.correctOptionId`, colour `var(--success)`
- `previewPayload.translation` if present — `<Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>`
- Same 4 buttons: correct one gets `classes.showCorrect` (green, 0.7 opacity — same class as ContrastPair answer half for visual consistency), others `variant="light"` with no extra class

---

### SentenceTransformationExercise

CSS module: `TypedRecall.module.css` — `classes.container`, `classes.promptSection`, `classes.translation`, `classes.input`.

**Question half:**
- `<Text size="sm" c="dimmed">{t.session.exercise.transformPrefix} {previewPayload.transformationInstruction}</Text>`
- `<Box className={classes.translation}>{previewPayload.sourceSentence}</Box>`
- `<TextInput placeholder={t.session.exercise.typeAnswer} size="lg" className={classes.input} disabled value="" />` — visual only, shows the empty input field the learner would see
- No submit button

**Answer half:**
- `<Text size="xl" fw={700} style={{ color: 'var(--accent-primary)' }}>{previewPayload.acceptableAnswers?.[0]}</Text>`
- If `acceptableAnswers.length > 1`: `<Text size="xs" c="dimmed">ook: {acceptableAnswers.slice(1).join(', ')}</Text>` — lists all alternate acceptable answers
- `previewPayload.explanationText` if present — same card block as ContrastPair

---

### ConstrainedTranslationExercise

CSS module: `TypedRecall.module.css` — `classes.container`, `classes.promptSection`, `classes.translation`, `classes.input`.

Mode detection (same logic as the normal component):
```typescript
const isClozeMode = !!previewPayload.targetSentenceWithBlank && !!previewPayload.blankAcceptableAnswers?.length
```

**Cloze mode — question half:**
- `<Text size="sm" c="dimmed">{t.session.exercise.chooseWord}</Text>`
- Indonesian sentence with blank — wrapped in `<Box className={classes.promptSection}>` (TypedRecall.module.css — do NOT use `classes.wordSection` here, that class belongs to RecognitionMCQ.module.css); blank rendering same as ClozeMcq blank above, blank left empty (transparent `_`)
- `<Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>{previewPayload.sourceLanguageSentence}</Text>` — Dutch translation shown immediately; in normal mode this only appears post-answer, but in preview showing it upfront lets the reviewer see question + context together
- **No `TextInput`** — in cloze mode the input drives the blank inline; showing a separate disabled input below an already-empty blank is redundant and looks broken

**Cloze mode — answer half:**
- Sentence with blank filled with `blankAcceptableAnswers[0]`, colour `var(--success)`
- `previewPayload.explanationText` if present — same card block

**Full-sentence mode — question half:**
- `<Text size="sm" c="dimmed">{sourceLanguageSentence.includes(' ') ? t.session.exercise.translateInstruction : t.session.exercise.translateWord}</Text>`
- `<Box className={classes.translation}>{previewPayload.sourceLanguageSentence}</Box>`
- `<TextInput placeholder={t.session.exercise.typeAnswer} size="lg" className={classes.input} disabled value="" />`
- No submit button

**Full-sentence mode — answer half:**
- `<Text size="xl" fw={700} style={{ color: 'var(--accent-primary)' }}>{previewPayload.acceptableAnswers?.[0]}</Text>`
- If `acceptableAnswers.length > 1`: alternate answers shown same as sentence_transformation
- `previewPayload.explanationText` if present — same card block

---

## ContentReview page changes

### Replace ExerciseSummaryCard

The current render:
```tsx
<ExerciseSummaryCard variant={current} comment={commentMap.get(current.id)} />
```

Becomes:
```tsx
{renderExercisePreview(current)}
```

Where `renderExercisePreview` is a local function:

```tsx
function renderExercisePreview(variant: ExerciseVariant) {
  const p = variant.payload_json as Record<string, any>
  switch (variant.exercise_type) {
    case 'contrast_pair':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <ContrastPairExercise previewMode previewPayload={p} userLanguage="nl" onAnswer={(() => {}) as any} />
    case 'cloze_mcq':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <ClozeMcq previewMode previewPayload={p} userLanguage="nl" onAnswer={(() => {}) as any} />
    case 'sentence_transformation':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <SentenceTransformationExercise previewMode previewPayload={p} userLanguage="nl" onAnswer={(() => {}) as any} />
    case 'constrained_translation':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <ConstrainedTranslationExercise previewMode previewPayload={p} userLanguage="nl" onAnswer={(() => {}) as any} />
    default:
      return <ExerciseSummaryCard variant={variant} comment={commentMap.get(variant.id)} />
  }
}
```

### Comment badge

The `💬 opmerking` badge currently lives inside `ExerciseSummaryCard`. Move it to the counter row in the ContentReview page — next to the `index + 1 / total` counter — so it's visible regardless of which renderer is used.

Add `Badge` to the Mantine import line in `ContentReview.tsx`.

```tsx
<Group justify="space-between">
  <Group gap="xs">
    <Text size="sm" c="dimmed">{index + 1} / {filteredVariants.length}</Text>
    {commentMap.has(current.id) && (
      <Badge variant="light" color="orange" size="sm">💬 opmerking</Badge>
    )}
  </Group>
  <Group gap="xs">
    {/* Vorige / Volgende buttons */}
  </Group>
</Group>
```

---

## Supabase Requirements

### Schema changes
- N/A — no new tables, columns, or RLS changes. All data already in `exercise_variants.payload_json`.

### homelab-configs changes
- [ ] PostgREST: N/A
- [ ] Kong: N/A
- [ ] GoTrue: N/A
- [ ] Storage: N/A

### Health check additions
- N/A — admin-only UI feature, no new DB access patterns.

---

## Files changed

| Action | File |
|---|---|
| Modified | `src/components/exercises/ContrastPairExercise.tsx` |
| Modified | `src/components/exercises/ClozeMcq.tsx` |
| Modified | `src/components/exercises/SentenceTransformationExercise.tsx` |
| Modified | `src/components/exercises/ConstrainedTranslationExercise.tsx` |
| Modified | `src/pages/ContentReview.tsx` |
