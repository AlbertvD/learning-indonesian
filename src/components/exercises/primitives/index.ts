// src/components/exercises/primitives/index.ts
// Barrel export for the exercise primitive library.
// Global CSS (.exerciseInput font-size rule) is imported here so any consumer
// that imports from the barrel gets the layered rule loaded.

import './global.css'

export { ExerciseFrame } from './ExerciseFrame'
export type { ExerciseFrameProps } from './ExerciseFrame'

export { ExerciseInstruction } from './ExerciseInstruction'
export type { ExerciseInstructionProps } from './ExerciseInstruction'

export { ExercisePromptCard } from './ExercisePromptCard'
export type { ExercisePromptCardProps, PromptCardVariant } from './ExercisePromptCard'

export { ExerciseOption } from './ExerciseOption'
export type { ExerciseOptionProps, OptionState, OptionVariant } from './ExerciseOption'

export { ExerciseOptionGroup } from './ExerciseOptionGroup'
export type { ExerciseOptionGroupProps } from './ExerciseOptionGroup'

export { ExerciseTextInput } from './ExerciseTextInput'
export type { ExerciseTextInputProps, InputState } from './ExerciseTextInput'

export { ExerciseSubmitButton } from './ExerciseSubmitButton'
export type { ExerciseSubmitButtonProps } from './ExerciseSubmitButton'

export { LanguagePill } from './LanguagePill'
export type { LanguagePillProps, PillLanguage } from './LanguagePill'

export { ExerciseFeedback } from './ExerciseFeedback'
export type {
  ExerciseFeedbackProps,
  FeedbackOutcome,
  FeedbackLayout,
  FeedbackDirection,
  FeedbackCopy,
} from './ExerciseFeedback'

export { ExerciseAudioButton } from './ExerciseAudioButton'
export type { ExerciseAudioButtonProps, AudioVariant } from './ExerciseAudioButton'

export { ExerciseHint } from './ExerciseHint'
export type { ExerciseHintProps } from './ExerciseHint'

export { FlagButton } from './FlagButton'
export type { FlagButtonProps } from './FlagButton'

export { triggerHaptic } from './haptics'
export type { HapticEvent } from './haptics'

export {
  FrameInstructionIdContext,
  FrameFooterContext,
  FOOTER_SLOT_SYMBOL,
  FrameVariantContext,
} from './context'
