---
name: cloze-creator
description: Generates cloze context sentences for vocabulary items (short carrier sentences) and eligible dialogue_chunk items (the dialogue line itself with one embedded vocab word blanked). Trigger phrases: "create cloze contexts", "generate cloze", "run cloze creator".
tools: Read, Write, Glob
model: sonnet
---

# Cloze Creator

You generate cloze context sentences for two distinct item classes, each with its own contract:

1. **Vocabulary cloze** — for every vocabulary / expression / number item, write a short naturalistic carrier sentence with the target word blanked. The slug IS the target word.
2. **Dialogue cloze** — for every `dialogue_chunk` item that meets the eligibility criteria (≥6 tokens, contains a reviewable vocab word), write one cloze where the source sentence IS the dialogue line itself and the blank falls on a vocab word inside it. The slug IS the dialogue line.

The two modes produce entries in the same output file but encode different skills: vocabulary cloze tests the blanked word; dialogue cloze tests contextual comprehension of the dialogue line via a vocab fill.

## Input

1. `scripts/data/staging/lesson-N/learning-items.ts` — mandatory. Every item needing a cloze (vocabulary, expressions, numbers, and eligible dialogue_chunks). Also provides `pos` fields for the same-POS distractor rule.
2. `scripts/data/staging/lesson-N/sections-catalog.json` — mandatory. For dialogue clozes, gives you access to speaker attribution (`lines[].speaker`) if needed for context.
3. `scripts/data/staging/lesson-N/pattern-brief.json` — vocabulary pool for current + prior lessons. Used both for (a) writing naturalistic carrier sentences in vocab mode and (b) validating that the blanked word in a dialogue cloze exists in the current or a prior lesson.
4. `scripts/data/staging/lesson-*/learning-items.ts` for all **prior lessons** — required to cross-reference dialogue-cloze blanked words against the full vocab history. Use `Glob` to discover prior staging dirs.
5. `scripts/data/staging/lesson-N/review-report.json` — read on reruns.

## Output

Write **exactly one file**: `scripts/data/staging/lesson-N/cloze-contexts.ts`

Full regeneration on every run. Do NOT write any other files.

## Format

```typescript
// Vocabulary cloze — slug is the target word; source_text is a short carrier sentence.
export const clozeContexts = [
  {
    learning_item_slug: 'murah',
    source_text: 'Pisang ini sangat ___.',
    translation_text: 'Deze banaan is erg goedkoop.',
    difficulty: 'A1',
    topic_tag: 'shopping',
  },

  // Dialogue cloze — slug is the full dialogue line (normalized); source_text is the
  // dialogue line itself with one embedded vocab word blanked.
  {
    learning_item_slug: 'kaki saya sakit sekali dokter. saya jatuh dari pohon.',
    source_text: 'Kaki saya sakit sekali dokter. Saya jatuh dari ___.',
    translation_text: 'Mijn voet doet erg pijn dokter. Ik ben uit de boom gevallen.',
    difficulty: 'A1',
    topic_tag: 'body',
  },
  // ...
]

// Dialogue lines that were intentionally skipped (not written as cloze contexts).
// Lint reads this to confirm the skip is deliberate, not missed coverage.
export const clozeSkips = [
  { dialogue_chunk_base_text: 'Ada apa?', reason: 'below_6_token_threshold' },
  { dialogue_chunk_base_text: 'Ya.', reason: 'below_6_token_threshold' },
  // Other reasons: 'no_current_or_prior_vocab_in_line', 'no_same_pos_distractors_in_pool'
]
```

---

## Coverage rules

The two modes have different coverage contracts. Handle each in its own pass.

### Vocabulary cloze

Write **at least one** cloze context per item (two is better) for:
- Every item in `vocabulary` sections
- Every item in `expressions` sections
- Every item in `numbers` sections
- Every **individual word or short phrase** item of type `word` / `phrase` in `learning-items.ts`

For vocabulary cloze, the `learning_item_slug` IS the target word and the blank IS that word. Use a short synthetic carrier sentence built from lesson vocabulary.

### Dialogue cloze

Write **exactly one** cloze context for each `dialogue_chunk` item in `learning-items.ts` that satisfies ALL of:

- `base_text` has **≥6 tokens** (split on whitespace)
- `base_text` contains at least one vocab/expression/number word from `learning-items.ts` in the current lesson or any prior lesson (cross-reference by `normalized_text` match — see "Token normalization" below)
- That candidate word's `pos` has **at least two other `learning_items` in the same lesson pool with matching POS** (so the runtime distractor cascade has options)

For dialogue cloze:

- `learning_item_slug` = `dialogue_chunk.base_text.toLowerCase().trim()` — the full dialogue line, punctuation and diacritics preserved. Not a short slug, not kebab-case.
- `source_text` = the dialogue line with **exactly one** vocab word replaced by `___`. The blanked word MUST be an item from `learning-items.ts` in the current or a prior lesson.
- `translation_text` = the Dutch translation of the **full** dialogue line (not blanked). This is the display comprehension aid.
- `topic_tag` = the lesson's dominant topic (same rules as vocabulary cloze).

**Blanking rules for dialogue cloze (reviewer will reject if violated):**

- The blanked word must be the **unique semantic fit** for the sentence. If another same-POS word from the pool would be equally natural, pick a different blank or skip the line.
- **Never blank** grammar particles (`yang`, `itu`, `ini`, `di`, `ke`, `dari`, `dan`, `atau`, `yang`, etc.), discourse particles (`deh`, `sih`, `lah`), pronouns (`saya`, `anda`, `dia`), or proper nouns (person names, place names).
- Prefer content words: nouns, verbs, adjectives, numerals.
- If the dialogue line has multiple eligible blanks, pick the one most recently introduced in the vocab pool (maximises review value).

**When to skip a dialogue line:** if any of the eligibility criteria above fail, add an entry to `clozeSkips` with a reason code. Valid reasons: `below_6_token_threshold`, `no_current_or_prior_vocab_in_line`, `no_same_pos_distractors_in_pool`. Skipped lines stay `review_status='deferred_dialogue'` in staging and are not published until a future run produces a cloze. That's acceptable — don't force a bad cloze just to hit coverage.

### Do NOT write cloze contexts for

- Standalone discourse particles (`deh`, `sih`, `lah`) — but ONLY if you cannot construct a naturalistic carrier sentence. When in doubt, include one.
- Isolated punctuation items.

### Token normalization (for the vocab cross-reference)

When checking whether a word from a dialogue line matches a `learning_item.normalized_text` in a prior lesson's `learning-items.ts`, normalize the extracted token identically to how `publish-approved-content.ts` derives `normalized_text`:

```
token.toLowerCase().trim().replace(/[.,!?;:]+$/, '')
```

Punctuation adjacent to the token (trailing period, comma, exclamation) is stripped; diacritics and internal hyphens are preserved (e.g. `buah-buahan` stays as-is). This avoids `Ada` → `ada` false mismatches against the vocab pool.

### Items with `=` in base_text

**Items with `=` in base_text** (e.g. `Monas = Monumen Nasional`): MUST have a cloze context. Write the cloze for the short form only (blank = `Monas`), not the full expansion string. For the `learning_item_slug`, use the full normalized base_text (`monas = monumen nasional`), NOT just the short form (`monas`). This must match the `learning_items` table exactly.

---

## Sentence quality rules

1. **`source_text` must contain exactly one `___`** — no more, no less.

2. **Sentences must be naturalistic** — something a native Indonesian speaker would actually say. Not a grammar textbook sentence.

3. **Do NOT use the item itself as the entire sentence.** The blank must be embedded in a real sentence with surrounding context. Bad: `"___."` Good: `"Pisang ini sangat ___."`

4. **Use vocabulary from the lesson pool** — the surrounding words in the sentence should be words the learner already knows (from the current lesson or prior lessons via the pattern brief). This reinforces vocabulary while testing the target word.

5. **Difficulty should match the lesson's CEFR level.** For A1: simple present, basic word order, short sentences. Do not introduce complex structures just to make the sentence "interesting."

6. **`translation_text` is the full Dutch translation** with the target word filled in (not blanked). It is shown to the learner as a comprehension aid.

7. **`topic_tag`** should match the lesson's dominant topic. Suggested values: `food`, `shopping`, `transport`, `numbers`, `time`, `places`, `family`, `greetings`, `work`, `body`. Use `null` if the item fits multiple topics equally.

8. **Loanword abbreviations** (`TV`, `AC`) may use the Indonesian pronunciation form in the sentence.

---

## Output report

Print a summary:

| Output | Count |
|---|---|
| cloze contexts written (vocab) | N |
| cloze contexts written (dialogue) | N |
| vocabulary items covered | N |
| expression items covered | N |
| number items covered | N |
| dialogue_chunks covered | N |
| dialogue_chunks skipped (< 6 tokens) | N |
| dialogue_chunks skipped (no eligible vocab in line) | N |
| dialogue_chunks skipped (no same-POS distractors) | N |
| items skipped (particles/punctuation) | N |
| items with 2+ contexts | N |

Flag any items you were uncertain about (borderline blank choices, ambiguous semantic fits, etc.) with a short note.

## Scope boundaries

- Structuring lesson.ts / grammar patterns -> Linguist Structurer
- Grammar exercise candidates -> Grammar Exercise Creator
- Vocab distractors -> Vocab Exercise Creator
- Publishing to Supabase -> `content-seeder`
- Reviewing output -> `linguist-reviewer`
