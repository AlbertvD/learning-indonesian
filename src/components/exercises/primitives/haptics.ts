// src/components/exercises/primitives/haptics.ts
// Inline haptic helper. Swap to @capacitor/haptics when iOS wrapper exists.
// See docs/plans/2026-04-23-exercise-framework-design.md §7.4

export type HapticEvent = 'selection' | 'success' | 'warning' | 'error'

// Vibration patterns chosen to map to iOS's UISelectionFeedbackGenerator /
// UINotificationFeedbackGenerator taxonomy. `selection` is a sharp tick for
// discrete UI choices (picker scrolling, MCQ taps). `success` / `warning` are
// notification-style multi-beat patterns. `error` is longer.
const PATTERNS: Record<HapticEvent, number | number[]> = {
  selection: 5,
  success:   [15, 30, 15],
  warning:   [30, 50, 30, 50],
  error:     [50, 100, 50],
}

/**
 * Fire a haptic event. Safe on desktop (silently no-ops when `navigator.vibrate`
 * is unavailable). Tactile feedback is intentionally NOT gated by
 * `prefers-reduced-motion` — Apple HIG keeps haptics under Reduce Motion.
 */
export function triggerHaptic(event: HapticEvent): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  navigator.vibrate(PATTERNS[event])
}
