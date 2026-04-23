// src/components/exercises/primitives/context.ts
// Shared React contexts for the exercise primitive library.
// See docs/plans/2026-04-23-exercise-framework-design.md §6.13

import { createContext } from 'react'

// ─── FrameInstructionIdContext ────────────────────────────────────────────────
// <ExerciseInstruction> generates a stable id via useId() and writes it here.
// <ExerciseOptionGroup> reads it to set aria-labelledby, so screen readers
// announce the Instruction text as the group's accessible name.

export interface FrameInstructionIdContextValue {
  instructionId: string | null
  setInstructionId: (id: string | null) => void
}

export const FrameInstructionIdContext = createContext<FrameInstructionIdContextValue>({
  instructionId: null,
  setInstructionId: () => {},
})

// ─── FrameFooterContext (Symbol-tagged) ───────────────────────────────────────
// <ExerciseFrame> sets this to a private Symbol when wrapping the `footer`
// prop. <ExerciseSubmitButton> reads it and warns in dev if rendered outside
// the slot. Consumers can't spoof the Symbol from their own providers.

export const FOOTER_SLOT_SYMBOL: unique symbol = Symbol('FrameFooter')
export type FooterSlotSymbol = typeof FOOTER_SLOT_SYMBOL

export const FrameFooterContext = createContext<FooterSlotSymbol | null>(null)

// ─── FrameVariantContext ──────────────────────────────────────────────────────
// 'session' triggers <ExerciseInstruction> auto-focus. 'preview' leaves focus
// alone — critical for the design lab's inspector UX and StrictMode safety.

export type FrameVariant = 'session' | 'preview'

export const FrameVariantContext = createContext<FrameVariant>('preview')
