/**
 * capability-stage/propagateDialogueTranslations.ts — deterministic copy
 * of dialogue-line translations from `lesson_sections.content.lines[]` to
 * the matching `learning_items` rows.
 *
 * Why this exists. Lesson-stage's enricher fills
 * `lesson_sections.content.lines[].translation` (the field the lesson
 * reader displays). Dialogue lines also appear as schedulable
 * `learning_items` with `item_type: 'dialogue_chunk'`, whose Dutch meaning
 * lives in `translation_nl` — a different field on a different table.
 *
 * The deferred-dialogue gate in `projectors/vocab.ts:selectPublishableItems`
 * defers any `dialogue_chunk` whose `translation_nl` is empty. Without
 * this propagation, the lesson-stage enrichment fills the reader-facing
 * translation but leaves the schedulable item half-wired — the chunk
 * displays correctly in the reader but never becomes a publishable
 * learning item.
 *
 * Algorithm: build a Map<line.text, translation> from `loaded.sections`
 * dialogue lines, then for each `dialogue_chunk` learning item with empty
 * `translation_nl`, look up by `base_text` and fill from the map.
 *
 * Pure / deterministic — no LLM, no network, no DB call. Mutates the
 * passed `learningItems` array in place. Returns the count filled.
 */

interface SectionLike {
  content?: Record<string, unknown>
}

interface DialogueChunkLike {
  base_text: string
  item_type: string
  translation_nl?: string | null
}

export function propagateDialogueTranslationsToLearningItems(input: {
  sections: SectionLike[]
  learningItems: DialogueChunkLike[]
}): number {
  const translationsByText = new Map<string, string>()
  for (const sec of input.sections) {
    if (sec.content?.type !== 'dialogue') continue
    const lines = sec.content?.lines
    if (!Array.isArray(lines)) continue
    for (const line of lines as Array<{ text?: unknown; translation?: unknown }>) {
      if (typeof line.text !== 'string') continue
      if (typeof line.translation !== 'string') continue
      const t = line.translation.trim()
      if (t.length === 0) continue
      translationsByText.set(line.text, t)
    }
  }
  if (translationsByText.size === 0) return 0

  let filled = 0
  for (const item of input.learningItems) {
    if (item.item_type !== 'dialogue_chunk') continue
    const current = (item.translation_nl ?? '').trim()
    if (current.length > 0) continue
    const newTrans = translationsByText.get(item.base_text)
    if (!newTrans) continue
    item.translation_nl = newTrans
    filled++
  }
  return filled
}
