# Exercise Preview Mode — Implementation Plan

Spec: `docs/plans/2026-04-12-exercise-preview-mode-spec.md`

## Task 1 — ContrastPairExercise: add previewMode

- Make `exerciseItem` optional in `ContrastPairExerciseProps`
- Add `previewMode?: boolean` and `previewPayload?: Record<string, any>` to props interface
- Add `Divider` to Mantine imports
- Before `const data = exerciseItem!.contrastPairData`, insert `if (previewMode && previewPayload)` early-return block rendering:
  - Question half: `<Box className={classes.wordSection}>` + promptText + 2 disabled option buttons
  - `<Divider label="Antwoord" labelPosition="center" my="lg" />`
  - Answer half: same buttons with correct getting `classes.showCorrect`, + targetMeaning + explanationText card if present
- Change `exerciseItem.contrastPairData` to `exerciseItem!.contrastPairData` in interactive path
- Verify: `bun run build` passes, no TypeScript errors

## Task 2 — ClozeMcq: add previewMode + fix classes.option

- Make `exerciseItem` optional in `ClozeMcqProps`
- Add `previewMode?: boolean` and `previewPayload?: Record<string, any>` to props interface
- Add `Button, Divider` to Mantine imports (Button needed for preview options + to fix interactive path)
- Before `const data = exerciseItem!.clozeMcqData`, insert `if (previewMode && previewPayload)` block:
  - Question half: chooseWord text + sentence-with-blank (transparent `_`) + 4 disabled `<Button className={classes.optionButton}>` buttons
  - `<Divider label="Antwoord" labelPosition="center" my="lg" />`
  - Answer half: sentence-with-blank filled with correctOptionId in `var(--success)` + translation italic + same 4 buttons with correct getting `classes.showCorrect`
- Fix interactive path: replace `<button className={classes.option}>` with `<Button className={classes.optionButton} variant={...} size="lg" fullWidth>` for all options
- Change `exerciseItem.clozeMcqData` to `exerciseItem!.clozeMcqData`
- Verify: `bun run build` passes

## Task 3 — SentenceTransformationExercise: add previewMode

- Make `exerciseItem` optional in `SentenceTransformationExerciseProps`
- Add `previewMode?: boolean` and `previewPayload?: Record<string, any>` to props interface
- Add `Divider` to Mantine imports
- After hooks (after `useEffect`), insert `if (previewMode && previewPayload)` block:
  - Question half: transformPrefix + transformationInstruction + `<Box className={classes.translation}>` + disabled empty TextInput
  - `<Divider label="Antwoord" labelPosition="center" my="lg" />`
  - Answer half: acceptableAnswers[0] in accent-primary + alternate answers if >1 + explanationText card if present
- Change `exerciseItem.sentenceTransformationData` to `exerciseItem!.sentenceTransformationData`
- Verify: `bun run build` passes

## Task 4 — ConstrainedTranslationExercise: add previewMode

- Make `exerciseItem` optional in `ConstrainedTranslationExerciseProps`
- Add `previewMode?: boolean` and `previewPayload?: Record<string, any>` to props interface
- Add `Divider` to Mantine imports
- After hooks (after `useEffect`), insert `if (previewMode && previewPayload)` block with isClozeMode detection:
  - Cloze mode question half: chooseWord + sentence-with-blank in `<Box className={classes.promptSection}>` (transparent `_`) + sourceLanguageSentence italic (no TextInput)
  - Cloze mode answer half: sentence with blank filled with blankAcceptableAnswers[0] in `var(--success)` + explanationText
  - Full-sentence question half: translateInstruction/translateWord + `<Box className={classes.translation}>` + disabled empty TextInput
  - Full-sentence answer half: acceptableAnswers[0] in accent-primary + alternates + explanationText
  - Divider between question and answer halves in both modes
- Change `exerciseItem.constrainedTranslationData` to `exerciseItem!.constrainedTranslationData`
- Verify: `bun run build` passes

## Task 5 — ContentReview: wire up renderExercisePreview

- Add `Badge, Divider` to Mantine imports (Divider used inside components, not here — but Badge needed)
- Import `ContrastPairExercise`, `ClozeMcq`, `SentenceTransformationExercise`, `ConstrainedTranslationExercise`
- Add `renderExercisePreview(variant)` local function inside the component (has access to `commentMap`)
- Replace `<ExerciseSummaryCard variant={current} comment={commentMap.get(current.id)} />` with `{renderExercisePreview(current)}`
- Update counter row: wrap left side in `<Group gap="xs">`, add conditional Badge for comment
- Verify: `bun run build` passes, `bun run test` passes
