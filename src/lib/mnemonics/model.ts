// src/lib/mnemonics/model.ts
// Types for the stubborn-word mnemonic workshop (docs/plans/2026-07-05-stubborn-word-mnemonic-workshop.md).
// One free-text association note per (learner, source_ref) — word-level, shared
// across every capability of that word (§5 of the design).

/** A learner-authored memory hook for one word, keyed by its stable content identity. */
export interface Mnemonic {
  sourceRef: string
  note: string
  createdAt: string
  updatedAt: string
}

/**
 * What the feedback screen should show for the just-failed word, decided by
 * `resolveMnemonicAffordance` (§6 of the design — the one place this branches):
 *
 * - `resurface` — the word already has a note; show it below the correct answer.
 * - `offer`     — no note yet; invite the learner to make one. `tier: 'prominent'`
 *   is the full reframe card (word tipped stubborn); `tier: 'quiet'` is a small
 *   opt-in link (an earlier miss, 1-3 consecutive failures). `failureCount` is
 *   only carried on the prominent tier (it drives the "{n}x" copy).
 * - `none`      — nothing to show (correct answer, or a fresh/never-failed word).
 */
export type MnemonicAffordance =
  | { kind: 'resurface'; note: string }
  | { kind: 'offer'; tier: 'prominent' | 'quiet'; sourceRef: string; failureCount?: number }
  | { kind: 'none' }
