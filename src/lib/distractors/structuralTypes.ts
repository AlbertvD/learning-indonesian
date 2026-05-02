// Items that look structurally similar enough to be plausible distractors for each other.
// sentence and dialogue_chunk are both multi-sentence/long forms.
// word and phrase are both short forms — mixing them is fine.
// Never mix short (word/phrase) with long (sentence/dialogue_chunk).
export const STRUCTURALLY_SIMILAR_TYPES: Record<string, string[]> = {
  word: ['word', 'phrase'],
  phrase: ['word', 'phrase'],
  sentence: ['sentence', 'dialogue_chunk'],
  dialogue_chunk: ['sentence', 'dialogue_chunk'],
}
