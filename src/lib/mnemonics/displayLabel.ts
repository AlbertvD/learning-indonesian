// src/lib/mnemonics/displayLabel.ts
// A human-readable label for a word's content identity, stripping the source_ref's
// storage envelope. Shared by both mnemonic entry points — the feedback screen
// (ExperiencePlayer) and the Progress stubborn-words card — so they label the same
// word the same way. Lives here (not duplicated per consumer) precisely because
// both need it for the one word this module is about; pulling it into a shared
// neutral module also avoids an experience/ -> progress/ (or reverse) import edge.
export function labelForSourceRef(sourceRef: string): string {
  return sourceRef
    .replace(/^learning_items\//, '')
    .replace(/^lesson-\d+\/(?:pattern|section-\d+)\//, '')
}
